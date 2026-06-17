const express = require('express');
const prisma = require('../db');
const { asyncHandler, writeAudit } = require('../middleware/error');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, asyncHandler(async (req, res) => {
  const depts = await prisma.department.findMany({
    orderBy: { id: 'asc' },
    include: { _count: { select: { users: true } } },
  });
  res.json(depts.map((d) => ({ id: d.id, name: d.name, userCount: d._count.users })));
}));

module.exports = router;
