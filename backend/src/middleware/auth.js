const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../db');

/**
 * 鉴权中间件：校验 Authorization 头，注入 req.user
 */
async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: '未登录' });

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: { department: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ message: '账号已停用或不存在' });
    }
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ message: '登录已过期，请重新登录' });
  }
}

/**
 * 角色守卫：要求 req.user.role 命中白名单之一
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: '未登录' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: '无权限' });
    }
    next();
  };
}

module.exports = { authRequired, requireRole };
