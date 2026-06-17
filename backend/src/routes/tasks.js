const express = require('express');
const prisma = require('../db');
const { asyncHandler, writeAudit } = require('../middleware/error');
const { authRequired } = require('../middleware/auth');
const { myTasks, approve, reject, planVisibilityWhere } = require('../services/workflow');

const router = express.Router();

/**
 * 我的待办
 */
router.get('/my', authRequired, asyncHandler(async (req, res) => {
  const items = await myTasks(req.user);
  res.json(items.map(({ plan, nodeName }) => ({
    taskId: null, // 由前端通过其他方式找到对应 task（按 node 取 PENDING）
    nodeName,
    plan,
  })));
}));

/**
 * 我的待办（带 taskId，方便前端直接操作）
 */
router.get('/my-detailed', authRequired, asyncHandler(async (req, res) => {
  const role = req.user.role;
  if (!['DEAN', 'ACADEMIC', 'PRESIDENT'].includes(role)) return res.json([]);

  const tasks = await prisma.approvalTask.findMany({
    where: {
      roleRequired: role,
      action: 'PENDING',
    },
    orderBy: { arrivedAt: 'asc' },
    include: {
      plan: {
        include: {
          department: true,
          createdBy: { select: { id: true, name: true } },
        },
      },
    },
  });
  res.json(tasks);
}));

/**
 * 某方案的全部审批轨迹
 */
router.get('/by-plan/:planId', authRequired, asyncHandler(async (req, res) => {
  const planId = parseInt(req.params.planId);
  const where = planVisibilityWhere(req.user);
  const plan = await prisma.plan.findFirst({ where: { AND: [where, { id: planId }] } });
  if (!plan) return res.status(404).json({ message: '方案不存在' });

  const tasks = await prisma.approvalTask.findMany({
    where: { planId },
    orderBy: { id: 'asc' },
    include: { approver: { select: { id: true, name: true, role: true } } },
  });
  res.json(tasks);
}));

/**
 * 同意
 */
router.post('/:id/approve', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const { comment } = req.body || {};
  const result = await approve(id, req.user, comment);
  await writeAudit(req, 'TASK_APPROVE', 'ApprovalTask', id);
  res.json(result);
}));

/**
 * 驳回（支持选择驳回目标：CREATOR 退回给发起人 / PREV_NODE 退回至上一节点）
 */
router.post('/:id/reject', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const { comment, rejectTarget } = req.body || {};
  const result = await reject(id, req.user, comment, rejectTarget);
  await writeAudit(req, 'TASK_REJECT', 'ApprovalTask', id, { rejectTarget });
  res.json(result);
}));

module.exports = router;
