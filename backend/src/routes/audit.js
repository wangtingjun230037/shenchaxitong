const express = require('express');
const prisma = require('../db');
const { asyncHandler } = require('../middleware/error');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { id: 'desc' },
    take: 200,
    include: { user: { select: { id: true, name: true, username: true } } },
  });
  res.json(logs);
}));

module.exports = router;
