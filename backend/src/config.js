require('dotenv').config();

const path = require('path');

module.exports = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  anthropic: {
    baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
  },
  upload: {
    dir: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads'),
    maxSize: (parseInt(process.env.MAX_FILE_SIZE_MB || '20', 10)) * 1024 * 1024,
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },
};
