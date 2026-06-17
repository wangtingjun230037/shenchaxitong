const express = require('express');
const prisma = require('../db');
const { asyncHandler } = require('../middleware/error');
const { authRequired } = require('../middleware/auth');
const { planVisibilityWhere } = require('../services/workflow');

const router = express.Router();

/**
 * 时间范围 → 桶参数
 */
const RANGE_CONFIG = {
  '7d':   { days: 7,   granularity: 'day' },
  '30d':  { days: 30,  granularity: 'day' },
  '90d':  { days: 90,  granularity: 'week' },
  '180d': { days: 180, granularity: 'week' },
  '1y':   { days: 365, granularity: 'month' },
};

function parseRange(range) {
  return RANGE_CONFIG[range] || RANGE_CONFIG['30d'];
}

/**
 * 取本地日期的 YYYY-MM-DD 字符串
 */
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 取周 key（YYYY-Www）
 */
function weekKey(d) {
  const tmp = new Date(d);
  tmp.setHours(0, 0, 0, 0);
  const day = (tmp.getDay() + 6) % 7; // 周一=0
  tmp.setDate(tmp.getDate() - day);
  const y = tmp.getFullYear();
  const m = String(tmp.getMonth() + 1).padStart(2, '0');
  const day2 = String(tmp.getDate()).padStart(2, '0');
  return `${y}-${m}-${day2}`;
}

/**
 * 取月 key（YYYY-MM）
 */
function monthKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function bucketKey(d, granularity) {
  if (granularity === 'day') return dateKey(d);
  if (granularity === 'week') return weekKey(d);
  return monthKey(d);
}

/**
 * 生成空桶骨架（保证 X 轴连续）
 */
function buildEmptyBuckets(range, granularity) {
  const cfg = parseRange(range);
  const buckets = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (granularity === 'day') {
    for (let i = cfg.days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      buckets.push({ key: dateKey(d), submitted: 0, published: 0 });
    }
  } else if (granularity === 'week') {
    const weeks = Math.ceil(cfg.days / 7);
    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      buckets.push({ key: weekKey(d), submitted: 0, published: 0 });
    }
  } else {
    // month
    const months = 12;
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i, 1);
      buckets.push({ key: monthKey(d), submitted: 0, published: 0 });
    }
  }
  return buckets;
}

/**
 * 1) 顶部 4 个数字
 */
router.get('/summary', authRequired, asyncHandler(async (req, res) => {
  const where = planVisibilityWhere(req.user);

  const [total, inReview, published, myTasks] = await Promise.all([
    prisma.plan.count({ where }),
    prisma.plan.count({
      where: {
        ...where,
        status: { in: ['DEPT_REVIEW', 'ACADEMIC_REVIEW', 'PRESIDENT_REVIEW'] },
      },
    }),
    prisma.plan.count({ where: { ...where, status: 'PUBLISHED' } }),
    req.user.role === 'TEACHER'
      ? Promise.resolve(0) // 教师没有 funnel/待办
      : prisma.approvalTask.count({
          where: { action: 'PENDING', roleRequired: req.user.role },
        }),
  ]);

  res.json({ total, inReview, published, myTasks });
}));

/**
 * 2) 折线图：近 N 天提交/发布趋势
 *    GET /api/dashboard/trend?range=30d
 */
router.get('/trend', authRequired, asyncHandler(async (req, res) => {
  const range = parseRange(req.query.range);
  const cfg = parseRange(req.query.range);
  const granularity = cfg.granularity;
  const days = cfg.days;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - days + 1);

  const where = planVisibilityWhere(req.user);

  const [plans, published] = await Promise.all([
    prisma.plan.findMany({
      where: { ...where, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.plan.findMany({
      where: {
        ...where,
        status: 'PUBLISHED',
        publishedAt: { gte: since, not: null },
      },
      select: { publishedAt: true },
    }),
  ]);

  const buckets = buildEmptyBuckets(req.query.range, granularity);
  const map = new Map(buckets.map((b) => [b.key, b]));

  for (const p of plans) {
    const k = bucketKey(new Date(p.createdAt), granularity);
    if (map.has(k)) map.get(k).submitted += 1;
  }
  for (const p of published) {
    if (!p.publishedAt) continue;
    const k = bucketKey(new Date(p.publishedAt), granularity);
    if (map.has(k)) map.get(k).published += 1;
  }

  res.json({ range: req.query.range || '30d', granularity, buckets });
}));

/**
 * 3) 柱状图：各院系方案数量（TOP 10）
 */
router.get('/by-department', authRequired, asyncHandler(async (req, res) => {
  const where = planVisibilityWhere(req.user);
  const groups = await prisma.plan.groupBy({
    by: ['departmentId'],
    where,
    _count: { _all: true },
  });
  const deptIds = groups.map((g) => g.departmentId);
  const depts = await prisma.department.findMany({
    where: { id: { in: deptIds } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(depts.map((d) => [d.id, d.name]));
  const list = groups
    .map((g) => ({
      departmentId: g.departmentId,
      departmentName: nameMap.get(g.departmentId) || `#${g.departmentId}`,
      count: g._count._all,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  res.json(list);
}));

/**
 * 4) 饼图：状态分布
 */
router.get('/by-status', authRequired, asyncHandler(async (req, res) => {
  const where = planVisibilityWhere(req.user);
  const groups = await prisma.plan.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
  });
  const dist = {};
  for (const g of groups) {
    dist[g.status] = g._count._all;
  }
  res.json(dist);
}));

/**
 * 5) 漏斗图：按角色待办积压
 *    GET /api/dashboard/funnel
 *    返回 3 角色（DEAN/ACADEMIC/PRESIDENT）每个节点的 PENDING 数
 */
router.get('/funnel', authRequired, asyncHandler(async (req, res) => {
  // 教师无审批节点
  if (req.user.role === 'TEACHER') {
    return res.json({ stages: [], hasPermission: false });
  }
  // 仅看"我作为审批人"的那个节点
  // 但漏斗图目标是显示各节点的积压量 → 用 plan.status 直接统计
  const where = planVisibilityWhere(req.user);
  const inReview = await prisma.plan.groupBy({
    by: ['status'],
    where: {
      ...where,
      status: { in: ['DEPT_REVIEW', 'ACADEMIC_REVIEW', 'PRESIDENT_REVIEW'] },
    },
    _count: { _all: true },
  });
  const countMap = Object.fromEntries(inReview.map((g) => [g.status, g._count._all]));
  const stages = [
    { name: '院长待办', value: countMap['DEPT_REVIEW'] || 0 },
    { name: '教务待办', value: countMap['ACADEMIC_REVIEW'] || 0 },
    { name: '校长待办', value: countMap['PRESIDENT_REVIEW'] || 0 },
  ];
  res.json({ stages, hasPermission: true });
}));

module.exports = router;
