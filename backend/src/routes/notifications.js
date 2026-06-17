const express = require('express');
const prisma = require('../db');
const { asyncHandler } = require('../middleware/error');
const { authRequired } = require('../middleware/auth');
const { TYPE_META } = require('../services/notification');

const router = express.Router();

/**
 * GET /api/notifications
 * 查询参数: type, read, page, size
 */
router.get('/', authRequired, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const size = Math.min(50, Math.max(1, parseInt(req.query.size) || 20));
  const where = { userId };

  if (req.query.type) {
    const types = String(req.query.type).split(',').filter(Boolean);
    if (types.length) where.type = { in: types };
  }
  if (req.query.read === 'true') where.readAt = { not: null };
  if (req.query.read === 'false') where.readAt = null;

  const [total, items, unread] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  const decorated = items.map((n) => ({
    ...n,
    meta: TYPE_META[n.type] || { icon: '·', color: 'info', label: n.type },
  }));

  res.json({ total, unread, page, size, items: decorated });
}));

/**
 * GET /api/notifications/unread-count
 * 红点徽章用
 */
router.get('/unread-count', authRequired, asyncHandler(async (req, res) => {
  const count = await prisma.notification.count({
    where: { userId: req.user.id, readAt: null },
  });
  res.json({ count });
}));

/**
 * POST /api/notifications/:id/read
 * 单条标已读
 */
router.post('/:id/read', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  // 强制按 userId 过滤，避免越权
  await prisma.notification.updateMany({
    where: { id, userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
}));

/**
 * POST /api/notifications/read-all
 * 全部标已读（可选按 type）
 */
router.post('/read-all', authRequired, asyncHandler(async (req, res) => {
  const where = { userId: req.user.id, readAt: null };
  if (req.body?.type) where.type = req.body.type;
  const result = await prisma.notification.updateMany({
    where,
    data: { readAt: new Date() },
  });
  res.json({ updated: result.count });
}));

/**
 * DELETE /api/notifications/:id
 * 单条删除
 */
router.delete('/:id', authRequired, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  await prisma.notification.deleteMany({ where: { id, userId: req.user.id } });
  res.json({ ok: true });
}));

/**
 * DELETE /api/notifications
 * 批量删除已读（query: read=true）
 */
router.delete('/', authRequired, asyncHandler(async (req, res) => {
  if (req.query.read === 'true') {
    const result = await prisma.notification.deleteMany({
      where: { userId: req.user.id, readAt: { not: null } },
    });
    return res.json({ deleted: result.count });
  }
  res.status(400).json({ message: '请指定 ?read=true' });
}));

module.exports = router;
