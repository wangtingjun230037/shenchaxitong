const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const config = require('../config');
const { asyncHandler } = require('../middleware/error');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: '请输入账号和密码' });

  const user = await prisma.user.findUnique({
    where: { username },
    include: { department: true },
  });
  if (!user || user.status !== 'ACTIVE') {
    return res.status(401).json({ message: '账号或密码错误' });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: '账号或密码错误' });

  const token = jwt.sign({ id: user.id, role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      department: user.department ? { id: user.department.id, name: user.department.name } : null,
    },
  });
}));

router.get('/me', authRequired, asyncHandler(async (req, res) => {
  const { id, username, name, role, department } = req.user;
  res.json({
    id, username, name, role,
    department: department ? { id: department.id, name: department.name } : null,
  });
}));

module.exports = router;
