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
 *
 * @param {object} req  - express req
 * @param {string} action
 * @param {string} targetType
 * @param {number} targetId
 * @param {object} [meta] - 附加信息（写入 userAgent 字段，SQLite 不支持 JSON 列；保持可读）
 */
async function writeAudit(req, action, targetType, targetId, meta) {
  try {
    const suffix = meta ? ` | ${JSON.stringify(meta)}` : '';
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id || null,
        action,
        targetType,
        targetId,
        ip: req.ip,
        userAgent: (req.headers['user-agent'] || '') + suffix,
      },
    });
  } catch (e) {
    console.error('审计日志写入失败', e.message);
  }
}

module.exports = { errorHandler, asyncHandler, writeAudit };
