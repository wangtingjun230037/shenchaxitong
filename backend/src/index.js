require('dotenv').config();
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { errorHandler } = require('./middleware/error');

const app = express();

app.use(cors({ origin: config.cors.origin, credentials: true }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/users', require('./routes/users'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/audit-logs', require('./routes/audit'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/workflows', require('./routes/workflows'));

app.use((req, res) => res.status(404).json({ message: '接口不存在' }));
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`\n🎓 人才培养方案审核系统 - 后端服务已启动`);
  console.log(`   地址: http://localhost:${config.port}`);
  console.log(`   健康检查: http://localhost:${config.port}/api/health\n`);
});
