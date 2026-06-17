/**
 * 方案生命周期事件聚合服务
 *
 * 数据源：AuditLog + AIReport + ApprovalTask + Plan（推断）
 * 不新增表，纯查询聚合。
 */

const prisma = require('../db');

/**
 * 自然语言时长（毫秒 → "3天5小时" / "5小时" / "30分钟"）
 */
function formatDuration(ms) {
  if (ms == null || ms < 0) return '-';
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const days = Math.floor(ms / day);
  const hours = Math.floor((ms % day) / hour);
  const minutes = Math.floor((ms % hour) / minute);
  const parts = [];
  if (days) parts.push(`${days}天`);
  if (hours) parts.push(`${hours}小时`);
  if (!days && minutes) parts.push(`${minutes}分钟`);
  return parts.join('') || '刚刚';
}

/**
 * 聚合方案的所有生命周期事件
 * @param {number} planId
 * @returns {Promise<{events: Array, stats: Object}>}
 */
async function aggregatePlanEvents(planId) {
  // 1) 先查方案存在性与 taskIds
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error('方案不存在');

  const tasks = await prisma.approvalTask.findMany({
    where: { planId },
    orderBy: { id: 'asc' },
    include: { approver: { select: { id: true, name: true, role: true } } },
  });
  const taskIds = tasks.map((t) => t.id);
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  // 2) 查相关 AuditLog（方案级 + 任务级）
  const [planLogs, taskLogs, aiReports] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        targetType: 'Plan',
        targetId: planId,
        action: { in: ['PLAN_CREATE', 'PLAN_UPDATE', 'PLAN_UPLOAD', 'PLAN_SUBMIT'] },
      },
      orderBy: { createdAt: 'asc' },
    }),
    taskIds.length
      ? prisma.auditLog.findMany({
          where: {
            targetType: 'ApprovalTask',
            targetId: { in: taskIds },
            action: { in: ['TASK_APPROVE', 'TASK_REJECT'] },
          },
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true, role: true } } },
        })
      : Promise.resolve([]),
    prisma.aIReport.findMany({
      where: { planId },
      orderBy: { id: 'desc' },
    }),
  ]);

  // 3) 查 planLogs 涉及的 user
  const planUserIds = [...new Set(planLogs.map((l) => l.userId).filter(Boolean))];
  const users = planUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: planUserIds } },
        select: { id: true, name: true, role: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  // ============ 1. 方案级事件 ============
  const planEventMap = {
    PLAN_CREATE: { type: 'PLAN_CREATED', summary: '创建了方案', refType: 'plan' },
    PLAN_UPDATE: { type: 'PLAN_UPDATED', summary: '编辑了方案基础信息', refType: 'plan' },
    PLAN_UPLOAD: { type: 'FILE_UPLOADED', summary: '上传了方案文档', refType: 'file' },
    PLAN_SUBMIT: { type: 'PLAN_SUBMITTED', summary: '提交审批', refType: 'plan' },
  };
  const planEvents = planLogs.map((log) => {
    const meta = planEventMap[log.action] || { type: log.action, summary: log.action, refType: 'plan' };
    const u = log.userId ? userMap.get(log.userId) : null;
    return {
      id: `${meta.type}-${log.id}`,
      type: meta.type,
      timestamp: log.createdAt,
      actor: u ? { id: u.id, name: u.name, role: u.role } : null,
      summary: meta.summary,
      details: null,
      refType: meta.refType,
      refId: log.targetId,
    };
  });

  // ============ 2. 任务级事件 ============
  const taskEvents = taskLogs.map((log) => {
    const task = taskById.get(log.targetId);
    const isApprove = log.action === 'TASK_APPROVE';
    const eventType = isApprove ? 'TASK_APPROVED' : 'TASK_REJECTED';
    let duration = null;
    if (task?.arrivedAt && task?.processedAt) {
      duration = formatDuration(new Date(task.processedAt) - new Date(task.arrivedAt));
    }
    return {
      id: `${eventType}-${log.id}`,
      type: eventType,
      timestamp: log.createdAt,
      actor: log.user ? { id: log.user.id, name: log.user.name, role: log.user.role } : null,
      summary: isApprove
        ? `${task?.nodeName || '审批节点'} 通过`
        : `${task?.nodeName || '审批节点'} 驳回`,
      details: {
        nodeName: task?.nodeName,
        comment: task?.comment || '',
        duration,
      },
      refType: 'task',
      refId: log.targetId,
    };
  });

  // ============ 3. AI 报告事件（按 dimension+status 取最新） ============
  const aiMetaMap = {
    COMPLIANCE_SUCCESS: { type: 'AI_COMPLIANCE_SUCCESS', summary: 'AI 政策合规性审核完成' },
    COMPLIANCE_FAILED: { type: 'AI_COMPLIANCE_FAILED', summary: 'AI 政策合规性审核失败' },
    GANGLUO_SUCCESS: { type: 'AI_GANGLUO_SUCCESS', summary: 'AI 岗课赛证分析完成' },
    GANGLUO_FAILED: { type: 'AI_GANGLUO_FAILED', summary: 'AI 岗课赛证分析失败' },
  };
  const latestByKey = new Map();
  for (const r of aiReports) {
    if (!r.finishedAt) continue;
    const key = `${r.dimension}_${r.status}`;
    const existing = latestByKey.get(key);
    if (!existing || new Date(r.finishedAt) > new Date(existing.finishedAt)) {
      latestByKey.set(key, r);
    }
  }
  const aiEvents = Array.from(latestByKey.values()).map((r) => {
    const key = `${r.dimension}_${r.status}`;
    const meta = aiMetaMap[key] || { type: `AI_${key}`, summary: key };
    return {
      id: `${meta.type}-${r.id}`,
      type: meta.type,
      timestamp: r.finishedAt,
      actor: null,
      summary: meta.summary,
      details: {
        score: r.score,
        summary: r.summary,
        errorMessage: r.errorMessage,
      },
      refType: 'ai_report',
      refId: r.id,
    };
  });

  // ============ 4. 发布事件 ============
  const publishEvents = plan.publishedAt
    ? [{
        id: `PLAN_PUBLISHED-${plan.id}`,
        type: 'PLAN_PUBLISHED',
        timestamp: plan.publishedAt,
        actor: null,
        summary: '方案已发布',
        details: null,
        refType: 'plan',
        refId: plan.id,
      }]
    : [];

  // ============ 合并 + 倒序 ============
  const events = [...planEvents, ...taskEvents, ...aiEvents, ...publishEvents]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // ============ 统计 ============
  const firstTs = plan.createdAt;
  const latestTs = plan.publishedAt
    || (events[0]?.timestamp ? new Date(events[0].timestamp) : firstTs);
  const totalDuration = formatDuration(new Date(latestTs) - new Date(firstTs));

  const nodeDurations = taskEvents
    .filter((e) => e.type === 'TASK_APPROVED' && e.details?.duration)
    .map((e) => ({
      nodeName: e.details.nodeName,
      approver: e.actor?.name || '系统',
      duration: e.details.duration,
    }));

  return {
    events,
    stats: {
      totalDuration,
      nodeDurations,
      rejectedCount: taskEvents.filter((e) => e.type === 'TASK_REJECTED').length,
      approvedCount: taskEvents.filter((e) => e.type === 'TASK_APPROVED').length,
      publishedAt: plan.publishedAt,
    },
  };
}

module.exports = { aggregatePlanEvents, formatDuration };
