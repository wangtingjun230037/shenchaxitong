const express = require('express');
const prisma = require('../db');
const { asyncHandler, writeAudit } = require('../middleware/error');
const { authRequired, requireRole } = require('../middleware/auth');
const { validateWorkflow, loadPlanWorkflow } = require('../services/workflowEngine');

const router = express.Router();

/**
 * 序列化 Workflow 节点为可存储的 JSON 格式
 * 把数据库字段（x/y/width/height/role/approverScope 等）压成 snapshot JSON
 */
function buildWorkflowJSON(workflow) {
  return {
    name: workflow.name,
    nodes: (workflow.nodes || []).map((n) => ({
      code: n.code,
      name: n.name,
      role: n.role,
      approverScope: n.approverScope,
      approverUserIds: n.approverUserIds,
      notifyUserIds: n.notifyUserIds,
    })),
    edges: (workflow.edges || []).map((e) => ({
      source: e.sourceId,
      target: e.targetId,
    })),
  };
}

/**
 * 列表
 * ADMIN 全部；其他角色仅 ACTIVE
 */
router.get('/', authRequired, asyncHandler(async (req, res) => {
  const where = req.user.role === 'ADMIN' ? {} : { status: 'ACTIVE' };
  const list = await prisma.workflow.findMany({
    where,
    orderBy: { id: 'desc' },
    include: {
      _count: { select: { nodes: true, edges: true, plans: true } },
    },
  });
  res.json(list.map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
    status: w.status,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    nodeCount: w._count.nodes,
    edgeCount: w._count.edges,
    planCount: w._count.plans,
  })));
}));

/**
 * 详情
 */
router.get('/:id', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const w = await prisma.workflow.findUnique({
    where: { id },
    include: { nodes: true, edges: true },
  });
  if (!w) return res.status(404).json({ message: '工作流不存在' });
  if (w.status !== 'ACTIVE' && req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: '无权查看已归档工作流' });
  }
  res.json({
    id: w.id,
    name: w.name,
    description: w.description,
    status: w.status,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    nodes: w.nodes,
    edges: w.edges,
  });
}));

/**
 * 新建
 */
router.post('/', authRequired, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { name, description, nodes, edges } = req.body || {};
  const definition = { name, nodes: nodes || [], edges: edges || [] };
  const errors = validateWorkflow(definition);
  if (errors.length > 0) {
    return res.status(400).json({ message: '工作流定义不合法', errors });
  }
  const w = await prisma.workflow.create({
    data: {
      name,
      description: description || null,
      createdById: req.user.id,
      nodes: {
        create: nodes.map((n) => ({
          code: n.code,
          name: n.name,
          role: n.role || null,
          approverScope: n.approverScope || null,
          approverUserIds: n.approverUserIds ? JSON.stringify(n.approverUserIds) : null,
          notifyUserIds: n.notifyUserIds ? JSON.stringify(n.notifyUserIds) : null,
          x: n.x ?? 100,
          y: n.y ?? 100,
          width: n.width ?? (n.code === 'START' || n.code === 'END' ? 100 : 120),
          height: n.height ?? (n.code === 'START' || n.code === 'END' ? 50 : 60),
        })),
      },
      edges: {
        create: edges.map((e) => ({ sourceId: e.source, targetId: e.target })),
      },
    },
    include: { nodes: true, edges: true },
  });
  await writeAudit(req, 'WORKFLOW_CREATE', 'Workflow', w.id);
  res.json(w);
}));

/**
 * 更新
 */
router.put('/:id', authRequired, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, description, nodes, edges } = req.body || {};
  const definition = { name, nodes: nodes || [], edges: edges || [] };
  const errors = validateWorkflow(definition);
  if (errors.length > 0) {
    return res.status(400).json({ message: '工作流定义不合法', errors });
  }
  // 替换 nodes/edges（先删后建）
  await prisma.$transaction([
    prisma.workflowEdge.deleteMany({ where: { workflowId: id } }),
    prisma.workflowNode.deleteMany({ where: { workflowId: id } }),
    prisma.workflow.update({
      where: { id },
      data: {
        name,
        description: description || null,
        nodes: {
          create: nodes.map((n) => ({
            code: n.code,
            name: n.name,
            role: n.role || null,
            approverScope: n.approverScope || null,
            approverUserIds: n.approverUserIds ? JSON.stringify(n.approverUserIds) : null,
            notifyUserIds: n.notifyUserIds ? JSON.stringify(n.notifyUserIds) : null,
            x: n.x ?? 100,
            y: n.y ?? 100,
            width: n.width ?? (n.code === 'START' || n.code === 'END' ? 100 : 120),
            height: n.height ?? (n.code === 'START' || n.code === 'END' ? 50 : 60),
          })),
        },
        edges: {
          create: edges.map((e) => ({ sourceId: e.source, targetId: e.target })),
        },
      },
    }),
  ]);
  const w = await prisma.workflow.findUnique({
    where: { id },
    include: { nodes: true, edges: true },
  });
  await writeAudit(req, 'WORKFLOW_UPDATE', 'Workflow', id);
  res.json(w);
}));

/**
 * 归档（软删）
 */
router.delete('/:id', authRequired, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  await prisma.workflow.update({ where: { id }, data: { status: 'ARCHIVED' } });
  await writeAudit(req, 'WORKFLOW_ARCHIVE', 'Workflow', id);
  res.json({ ok: true });
}));

/**
 * 校验工作流定义（无需保存）
 */
router.post('/validate', authRequired, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { nodes, edges } = req.body || {};
  const errors = validateWorkflow({ name: 'tmp', nodes: nodes || [], edges: edges || [] });
  res.json({ valid: errors.length === 0, errors });
}));

module.exports = router;
