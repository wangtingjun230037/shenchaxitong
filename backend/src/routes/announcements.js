const express = require('express');
const prisma = require('../db');
const { asyncHandler } = require('../middleware/error');
const { authRequired, requireRole } = require('../middleware/auth');
const notify = require('../services/notification');

const router = express.Router();

/**
 * GET /api/announcements
 * 公开列表：仅 ACTIVE 且未过期
 */
router.get('/', authRequired, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const size = Math.min(50, Math.max(1, parseInt(req.query.size) || 20));
  const now = new Date();
  const where = {
    status: 'ACTIVE',
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
  const [total, items] = await Promise.all([
    prisma.announcement.count({ where }),
    prisma.announcement.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
      include: { publishedBy: { select: { id: true, name: true } } },
    }),
  ]);
  res.json({ total, page, size, items });
}));

/**
 * GET /api/announcements/all
 * 管理列表：含 WITHDRAWN（ADMIN）
 */
router.get('/all', authRequired, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const size = Math.min(50, Math.max(1, parseInt(req.query.size) || 20));
  const where = {};
  if (req.query.status) where.status = req.query.status;
  const [total, items] = await Promise.all([
    prisma.announcement.count({ where }),
    prisma.announcement.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (page - 1) * size,
      take: size,
      include: { publishedBy: { select: { id: true, name: true } } },
    }),
  ]);
  res.json({ total, page, size, items });
}));

/**
 * POST /api/announcements
 * 发布（ADMIN）→ 通知全体
 */
router.post('/', authRequired, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { title, body, expiresAt } = req.body || {};
  if (!title || !body) return res.status(400).json({ message: '标题和正文必填' });
  if (title.length > 100) return res.status(400).json({ message: '标题不超过 100 字' });

  const announcement = await prisma.announcement.create({
    data: {
      title,
      body,
      publishedById: req.user.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  // 通知全体
  await notify.onAnnouncementPublished(announcement);

  res.json(announcement);
}));

/**
 * PUT /api/announcements/:id
 * 编辑（ADMIN；仅 ACTIVE）
 */
router.put('/:id', authRequired, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const { title, body, expiresAt } = req.body || {};
  const exist = await prisma.announcement.findUnique({ where: { id } });
  if (!exist) return res.status(404).json({ message: '公告不存在' });
  if (exist.status !== 'ACTIVE') return res.status(400).json({ message: '已撤回的公告不能编辑' });

  const data = {};
  if (title) data.title = title;
  if (body) data.body = body;
  if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;

  const updated = await prisma.announcement.update({ where: { id }, data });
  res.json(updated);
}));

/**
 * DELETE /api/announcements/:id
 * 撤回（ADMIN；软删）
 */
router.delete('/:id', authRequired, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const updated = await prisma.announcement.update({
    where: { id },
    data: { status: 'WITHDRAWN' },
  });
  res.json(updated);
}));

module.exports = router;
