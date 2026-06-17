const prisma = require('../db');

/**
 * 通知中心 service
 * 7 个类型：PLAN_REJECTED | PLAN_ADVANCED | PLAN_PUBLISHED |
 *         AI_REPORT_DONE | NEW_TASK | DEPT_PLAN_SUBMITTED | ANNOUNCEMENT
 */

const TYPE_META = {
  PLAN_REJECTED:        { icon: '✗', color: 'danger',  label: '驳回' },
  PLAN_ADVANCED:        { icon: '✓', color: 'success', label: '已通过' },
  PLAN_PUBLISHED:       { icon: '★', color: 'success', label: '已发布' },
  AI_REPORT_DONE:       { icon: '🤖', color: 'warning', label: 'AI 审核' },
  NEW_TASK:             { icon: '📋', color: 'primary', label: '新待办' },
  DEPT_PLAN_SUBMITTED:  { icon: '📥', color: 'info',    label: '同部门' },
  ANNOUNCEMENT:         { icon: '📢', color: 'info',    label: '公告' },
};

/**
 * 通用：批量创建通知（去重 + 跳过不存在用户）
 */
async function createMany(items) {
  if (!items || !items.length) return 0;
  // Prisma SQLite 支持 createMany
  const result = await prisma.notification.createMany({ data: items });
  return result.count;
}

async function createOne(userId, type, title, body, targetType, targetId) {
  return prisma.notification.create({
    data: { userId, type, title, body: body || null, targetType: targetType || null, targetId: targetId || null },
  });
}

// ========== 7 个业务触发器 ==========

/**
 * 教师提交方案时：通知同部门所有 DEAN（待办）+ 同部门其他教师/院长（知会）
 */
async function onPlanSubmitted(plan) {
  const items = [];
  const targets = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      departmentId: plan.departmentId,
      OR: [{ role: 'DEAN' }, { role: 'TEACHER' }],
      NOT: { id: plan.createdById },
    },
    select: { id: true, role: true },
  });

  for (const u of targets) {
    if (u.role === 'DEAN') {
      items.push({
        userId: u.id,
        type: 'NEW_TASK',
        title: `新待办：${plan.name}`,
        body: `${plan.createdBy?.name || '某教师'}提交了培养方案，请审批`,
        targetType: 'Plan',
        targetId: plan.id,
      });
    } else {
      items.push({
        userId: u.id,
        type: 'DEPT_PLAN_SUBMITTED',
        title: `同部门有新方案：${plan.name}`,
        body: `${plan.createdBy?.name || '某教师'}提交了培养方案`,
        targetType: 'Plan',
        targetId: plan.id,
      });
    }
  }
  await createMany(items);
}

/**
 * 方案通过当前节点（非终态）→ 通知发起人
 * 方案进入 PUBLISHED（终态）→ 通知发起人（不同文案）
 */
async function onPlanApproved(plan, nextNodeName, isFinal) {
  const type = isFinal ? 'PLAN_PUBLISHED' : 'PLAN_ADVANCED';
  const title = isFinal ? `🎉 您的方案已正式发布` : `方案已通过：${nextNodeName}`;
  const body = isFinal
    ? `《${plan.name}》已通过全部审批，正式发布`
    : `《${plan.name}》已流转至【${nextNodeName}】`;
  await createOne(plan.createdById, type, title, body, 'Plan', plan.id);
}

/**
 * 方案被驳回 → 通知发起人
 */
async function onPlanRejected(plan, comment, approverName) {
  await createOne(
    plan.createdById,
    'PLAN_REJECTED',
    `方案被驳回：${plan.name}`,
    `${approverName || '审批人'}驳回了您的方案：${comment || '请查看详情'}`,
    'Plan',
    plan.id
  );
}

/**
 * 方案被回退到上一节点 → 通知发起人
 */
async function onPlanRollback(plan, comment, approverName, targetNodeName) {
  await createOne(
    plan.createdById,
    'PLAN_REJECTED',
    `方案被退回：${plan.name}`,
    `${approverName || '审批人'}将方案退回至【${targetNodeName || '上一节点'}】：${comment || '请查看详情'}`,
    'Plan',
    plan.id
  );
}

/**
 * AI 审核完成（SUCCESS）→ 通知发起人
 */
async function onAIReportDone(plan, dimension, score) {
  const label = dimension === 'GANGLUO' ? '岗课赛证' : '政策合规性';
  const body = score != null
    ? `《${plan.name}》${label}审核完成，综合得分 ${score}`
    : `《${plan.name}》${label}审核完成`;
  await createOne(plan.createdById, 'AI_REPORT_DONE', `AI 审核完成：${label}`, body, 'Plan', plan.id);
}

/**
 * 系统公告 → 通知全体 ACTIVE 用户（跳过发布人）
 */
async function onAnnouncementPublished(announcement) {
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE', NOT: { id: announcement.publishedById } },
    select: { id: true },
  });
  const items = users.map((u) => ({
    userId: u.id,
    type: 'ANNOUNCEMENT',
    title: `📢 ${announcement.title}`,
    body: (announcement.body || '').slice(0, 100),
    targetType: 'Announcement',
    targetId: announcement.id,
  }));
  await createMany(items);
}

module.exports = {
  TYPE_META,
  createOne,
  createMany,
  onPlanSubmitted,
  onPlanApproved,
  onPlanRejected,
  onPlanRollback,
  onAIReportDone,
  onAnnouncementPublished,
};
