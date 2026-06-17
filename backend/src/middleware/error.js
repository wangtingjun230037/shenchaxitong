const prisma = require('../db');

/**
 * 统一错误处理
 */
function errorHandler(err, req, res, next) {
  console.error('[Error]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: '文件大小超过限制' });
  }
  const status = err.status || 500;
  res.status(status).json({ message: err.message || '服务器内部错误' });
}

/**
 * 简易 async 包装，避免每个路由 try/catch
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/**
 * 写入审计日志
 */
async function writeAudit(req, action, targetType, targetId) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id || null,
        action,
        targetType,
        targetId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });
  } catch (e) {
    console.error('审计日志写入失败', e.message);
  }
}

module.exports = { errorHandler, asyncHandler, writeAudit };
