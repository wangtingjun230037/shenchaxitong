/**
 * workflow 服务（薄封装层）
 * 实际逻辑在 services/workflowEngine.js
 * 保留本文件以便老调用方不改动（向后兼容）
 */
const engine = require('./workflowEngine');
const prisma = require('../db');

const ROLE_TO_NODE = {
  DEAN: 'DEPT_REVIEW',
  ACADEMIC: 'ACADEMIC_REVIEW',
  PRESIDENT: 'PRESIDENT_REVIEW',
};

const NODES = {
  DRAFT: null,
  DEPT_REVIEW: { next: 'ACADEMIC_REVIEW', nodeName: '院长审批', role: 'DEAN' },
  ACADEMIC_REVIEW: { next: 'PRESIDENT_REVIEW', nodeName: '教务处审核', role: 'ACADEMIC' },
  PRESIDENT_REVIEW: { next: 'PUBLISHED', nodeName: '校长签发', role: 'PRESIDENT' },
  PUBLISHED: null,
};

async function myTasks(user) {
  const nodeKey = ROLE_TO_NODE[user.role];
  if (!nodeKey) return [];
  const plans = await prisma.plan.findMany({
    where: { status: nodeKey },
    orderBy: { submittedAt: 'desc' },
    include: { department: true, createdBy: true },
  });
  return plans.map((p) => ({
    plan: p,
    nodeName: NODES[nodeKey].nodeName,
  }));
}

module.exports = {
  NODES,
  submit: engine.submit,
  approve: engine.approve,
  reject: engine.reject,
  planVisibilityWhere: engine.planVisibilityWhere,
  validateWorkflow: engine.validateWorkflow,
  loadPlanWorkflow: engine.loadPlanWorkflow,
  myTasks,
};
