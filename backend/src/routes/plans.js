const express = require('express');
const path = require('path');
const fs = require('fs');
const prisma = require('../db');
const config = require('../config');
const upload = require('../middleware/upload');
const { asyncHandler, writeAudit } = require('../middleware/error');
const { authRequired } = require('../middleware/auth');
const { planVisibilityWhere, submit } = require('../services/workflow');
const { aggregatePlanEvents } = require('../services/planEvents');
const { extractText } = require('../services/docxParser');
const { runComplianceAudit, runGangluoAudit } = require('../services/aiAudit');

const router = express.Router();

const PLAN_INCLUDE = {
  department: true,
  createdBy: { select: { id: true, name: true, username: true } },
  aiReports: { orderBy: { id: 'desc' }, take: 1 },
  tasks: { orderBy: { id: 'asc' }, include: { approver: { select: { id: true, name: true } } } },
};

/**
 * 列表
 */
router.get('/', authRequired, asyncHandler(async (req, res) => {
  const where = planVisibilityWhere(req.user);
  const { status, keyword } = req.query;
  if (status) where.status = status;
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { major: { contains: keyword } },
      { code: { contains: keyword } },
    ];
  }
  const plans = await prisma.plan.findMany({
    where,
    orderBy: { id: 'desc' },
    include: {
      department: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
  res.json(plans);
}));

/**
 * 详情
 */
router.get('/:id', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const where = planVisibilityWhere(req.user);
  const plan = await prisma.plan.findFirst({
    where: { AND: [where, { id }] },
    include: PLAN_INCLUDE,
  });
  if (!plan) return res.status(404).json({ message: '方案不存在或无权限' });
  res.json(plan);
}));

/**
 * 创建（草稿）
 */
router.post('/', authRequired, asyncHandler(async (req, res) => {
  const { name, code, major, duration, studentType, versionYear, departmentId, workflowId } = req.body || {};
  if (!name || !code || !major || !duration || !studentType || !versionYear || !departmentId) {
    return res.status(400).json({ message: '请填写完整方案信息' });
  }

  // 解析 workflowSnapshot（如有 workflowId）
  let workflowSnapshot = null;
  let resolvedWorkflowId = null;
  if (workflowId) {
    const wf = await prisma.workflow.findUnique({
      where: { id: parseInt(workflowId) },
      include: { nodes: true, edges: true },
    });
    if (!wf) return res.status(400).json({ message: '工作流不存在' });
    if (wf.status !== 'ACTIVE') return res.status(400).json({ message: '工作流已归档' });
    workflowSnapshot = JSON.stringify({
      name: wf.name,
      nodes: wf.nodes.map((n) => ({
        code: n.code, name: n.name, role: n.role,
        approverScope: n.approverScope,
        approverUserIds: n.approverUserIds,
        notifyUserIds: n.notifyUserIds,
      })),
      edges: wf.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
    });
    resolvedWorkflowId = wf.id;
  }

  const plan = await prisma.plan.create({
    data: {
      name, code, major, duration, studentType,
      versionYear: parseInt(versionYear),
      departmentId: parseInt(departmentId),
      createdById: req.user.id,
      workflowId: resolvedWorkflowId,
      workflowSnapshot,
    },
  });
  await writeAudit(req, 'PLAN_CREATE', 'Plan', plan.id);
  res.json(plan);
}));

/**
 * 更新（仅 DRAFT 且创建者本人）
 */
router.put('/:id', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) return res.status(404).json({ message: '方案不存在' });
  if (plan.createdById !== req.user.id) return res.status(403).json({ message: '无修改权限' });
  if (plan.status !== 'DRAFT') return res.status(400).json({ message: '草稿状态才能修改' });

  const allowed = ['name', 'code', 'major', 'duration', 'studentType', 'versionYear', 'departmentId'];
  const data = {};
  for (const k of allowed) if (k in req.body) data[k] = req.body[k];
  if (data.versionYear) data.versionYear = parseInt(data.versionYear);
  if (data.departmentId) data.departmentId = parseInt(data.departmentId);
  await prisma.plan.update({ where: { id }, data });
  await writeAudit(req, 'PLAN_UPDATE', 'Plan', id);
  res.json({ ok: true });
}));

/**
 * 上传方案文档（docx/pdf） + 异步触发 AI 审核
 */
router.post('/:id/file', authRequired, upload.single('file'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) return res.status(404).json({ message: '方案不存在' });
  if (plan.createdById !== req.user.id) return res.status(403).json({ message: '无上传权限' });
  if (!req.file) return res.status(400).json({ message: '请上传文件' });

  // 删除旧文件
  if (plan.filePath && fs.existsSync(plan.filePath)) {
    try { fs.unlinkSync(plan.filePath); } catch (_) {}
  }

  await prisma.plan.update({
    where: { id },
    data: {
      filePath: req.file.path,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileText: null,
    },
  });
  await writeAudit(req, 'PLAN_UPLOAD', 'Plan', id);

  // 触发 AI 审核（异步，不阻塞响应）
  setImmediate(() => {
    runComplianceAudit(id).catch((e) => console.error('AI 审核异常', e));
  });

  res.json({ ok: true, fileName: req.file.originalname, size: req.file.size });
}));

/**
 * 下载/获取文件
 */
router.get('/:id/file', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const where = planVisibilityWhere(req.user);
  const plan = await prisma.plan.findFirst({ where: { AND: [where, { id }] } });
  if (!plan || !plan.filePath || !fs.existsSync(plan.filePath)) {
    return res.status(404).json({ message: '文件不存在' });
  }
  res.sendFile(plan.filePath);
}));

/**
 * 查询 AI 报告（轮询）
 */
router.get('/:id/ai-report', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const where = planVisibilityWhere(req.user);
  const plan = await prisma.plan.findFirst({ where: { AND: [where, { id }] } });
  if (!plan) return res.status(404).json({ message: '方案不存在' });

  const report = await prisma.aIReport.findFirst({
    where: { planId: id, dimension: 'COMPLIANCE' },
    orderBy: { id: 'desc' },
  });
  if (!report) return res.json({ status: 'NONE' });

  let result = null;
  if (report.resultJson) {
    try { result = JSON.parse(report.resultJson); } catch (_) { result = null; }
  }
  res.json({
    id: report.id,
    status: report.status,
    score: report.score,
    summary: report.summary,
    errorMessage: report.errorMessage,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    result,
  });
}));

/**
 * 手动重试 AI
 */
router.post('/:id/ai-retry', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) return res.status(404).json({ message: '方案不存在' });
  if (plan.createdById !== req.user.id) return res.status(403).json({ message: '无操作权限' });
  setImmediate(() => runComplianceAudit(id).catch((e) => console.error(e)));
  res.json({ ok: true });
}));

/**
 * 触发岗课赛证 AI 分析
 */
router.post('/:id/ai-gangluo', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const where = planVisibilityWhere(req.user);
  const plan = await prisma.plan.findFirst({ where: { AND: [where, { id }] } });
  if (!plan) return res.status(404).json({ message: '方案不存在' });
  if (!plan.filePath) return res.status(400).json({ message: '请先上传方案文档' });
  setImmediate(() => runGangluoAudit(id).catch((e) => console.error(e)));
  res.json({ ok: true });
}));

/**
 * 查询岗课赛证 AI 报告
 */
router.get('/:id/ai-gangluo-report', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const where = planVisibilityWhere(req.user);
  const plan = await prisma.plan.findFirst({ where: { AND: [where, { id }] } });
  if (!plan) return res.status(404).json({ message: '方案不存在' });

  const report = await prisma.aIReport.findFirst({
    where: { planId: id, dimension: 'GANGLUO' },
    orderBy: { id: 'desc' },
  });
  if (!report) return res.json({ status: 'NONE' });

  let result = null;
  if (report.resultJson) {
    try { result = JSON.parse(report.resultJson); } catch (_) { result = null; }
  }
  res.json({
    id: report.id,
    status: report.status,
    score: report.score,
    summary: report.summary,
    errorMessage: report.errorMessage,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    result,
  });
}));

/**
 * 重试岗课赛证 AI
 */
router.post('/:id/ai-gangluo-retry', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) return res.status(404).json({ message: '方案不存在' });
  if (plan.createdById !== req.user.id) return res.status(403).json({ message: '无操作权限' });
  setImmediate(() => runGangluoAudit(id).catch((e) => console.error(e)));
  res.json({ ok: true });
}));

/**
 * 提交审批
 */
router.post('/:id/submit', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const updated = await submit(id, req.user);
  await writeAudit(req, 'PLAN_SUBMIT', 'Plan', id);
  res.json(updated);
}));

/**
 * 进度（el-steps 数据）
 */
router.get('/:id/progress', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const where = planVisibilityWhere(req.user);
  const plan = await prisma.plan.findFirst({ where: { AND: [where, { id }] } });
  if (!plan) return res.status(404).json({ message: '方案不存在或无权限' });

  const { loadPlanWorkflow } = require('../services/workflowEngine');
  const workflow = loadPlanWorkflow(plan);

  // 已驳回直接标记 error
  if (plan.status === 'DRAFT' && plan.currentNode === '已驳回，待修改') {
    const steps = workflow.nodes
      .filter((n) => n.code !== 'START')
      .map((n) => ({
        code: n.code,
        name: n.name,
        status: n.code === plan.currentNodeCode ? 'error' : 'wait',
      }));
    return res.json({ steps, currentNodeCode: plan.currentNodeCode, rejected: true });
  }

  // 取已处理任务中最早到达当前节点的记录 → 标记 finish
  const tasks = await prisma.approvalTask.findMany({
    where: { planId: id, action: { in: ['APPROVED', 'REJECTED'] } },
    orderBy: { processedAt: 'asc' },
  });

  const finishedCodes = new Set(tasks.map((t) => t.nodeName).filter(Boolean));
  // 注：nodeName 是名字不是 code；这里我们简化用 currentNodeCode 之前的节点都视为 finish

  const startIdx = workflow.nodes.findIndex((n) => n.code === plan.currentNodeCode);
  const steps = workflow.nodes
    .filter((n) => n.code !== 'START')
    .map((n) => {
      const idx = workflow.nodes.findIndex((x) => x.code === n.code);
      if (plan.status === 'PUBLISHED') {
        return { code: n.code, name: n.name, status: 'finish' };
      }
      if (idx < startIdx) {
        return { code: n.code, name: n.name, status: 'finish' };
      }
      if (idx === startIdx) {
        return { code: n.code, name: n.name, status: 'process' };
      }
      return { code: n.code, name: n.name, status: 'wait' };
    });

  res.json({ steps, currentNodeCode: plan.currentNodeCode, rejected: false });
}));

/**
 * 生命周期事件（时间轴）
 * 从 AuditLog + AIReport + ApprovalTask + Plan 聚合
 */
router.get('/:id/events', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const where = planVisibilityWhere(req.user);
  const plan = await prisma.plan.findFirst({ where: { AND: [where, { id }] } });
  if (!plan) return res.status(404).json({ message: '方案不存在或无权限' });
  const data = await aggregatePlanEvents(id);
  res.json(data);
}));

module.exports = router;
