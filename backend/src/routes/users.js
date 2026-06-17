const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { asyncHandler, writeAudit } = require('../middleware/error');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();

const ROLES = ['TEACHER', 'DEAN', 'ACADEMIC', 'PRESIDENT', 'ADMIN'];

router.get('/', authRequired, asyncHandler(async (req, res) => {
  const where = req.user.role === 'ADMIN' ? {} : { departmentId: req.user.departmentId };
  const users = await prisma.user.findMany({
    where,
    orderBy: { id: 'asc' },
    include: { department: true },
  });
  res.json(users.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    status: u.status,
    department: u.department ? { id: u.department.id, name: u.department.name } : null,
    createdAt: u.createdAt,
  })));
}));

router.post('/', authRequired, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { username, password, name, role, departmentId } = req.body || {};
  if (!username || !password || !name || !role) {
    return res.status(400).json({ message: '参数不完整' });
  }
  if (!ROLES.includes(role)) return res.status(400).json({ message: '角色不合法' });
  if (await prisma.user.findUnique({ where: { username } })) {
    return res.status(400).json({ message: '账号已存在' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, passwordHash, name, role, departmentId: departmentId || null },
  });
  await writeAudit(req, 'USER_CREATE', 'User', user.id);
  res.json({ id: user.id });
}));

router.put('/:id/status', authRequired, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!['ACTIVE', 'DISABLED'].includes(status)) {
    return res.status(400).json({ message: '状态不合法' });
  }
  await prisma.user.update({ where: { id: parseInt(req.params.id) }, data: { status } });
  await writeAudit(req, 'USER_STATUS', 'User', parseInt(req.params.id));
  res.json({ ok: true });
}));

module.exports = router;
