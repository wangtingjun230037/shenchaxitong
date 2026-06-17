# 人才培养方案智能审核系统 — 第一阶段 MVP

> 基于 Vue 3 + Node.js + Prisma + SQLite + 大语言模型（Anthropic 兼容协议）

## ✨ 第一阶段功能

- ✅ 表单填报 + Word 文档上传
- ✅ 固定四步审批：发起 → 院长 → 教务 → 校长
- ✅ AI 政策合规性智能审核（异步触发，3 秒轮询）
- ✅ 用户/部门管理（管理员）
- ✅ JWT 鉴权 + 数据权限隔离
- ✅ 完整的审计日志

## 🏗️ 架构

```
[Vue 3 SPA] ──HTTP/JSON──> [Node.js + Express API]
                                    │
                                    ├── SQLite (Prisma)
                                    ├── 本地磁盘 (uploads/)
                                    └── AI 客户端 ──> mimo-2.5 (Anthropic 兼容)
```

## 🚀 快速启动

### 1. 安装依赖

```bash
# 后端
cd backend
npm install
npx prisma generate

# 前端
cd ../frontend
npm install
```

### 2. 初始化数据库与预置数据

```bash
cd backend
npx prisma db push        # 创建 SQLite 表
node prisma/seed.js        # 创建 5 个账号、3 个部门、政策知识库
```

### 3. 启动后端（端口 3001）

```bash
npm run dev
```

### 4. 启动前端（端口 5173）

```bash
cd ../frontend
npm run dev
```

打开 http://localhost:5173 即可。

## 👤 预置账号（密码统一 `123456`）

| 账号 | 角色 | 用途 |
|---|---|---|
| `teacher_zhang` | 专业带头人 | 创建方案、上传文档、提交 |
| `dean_li` | 院长 | 院系初审 |
| `academic_wang` | 教务处 | 校级审核 |
| `president_zhao` | 校长 | 签发公布 |
| `admin` | 系统管理员 | 用户/部门管理 |

## ✅ 验收路径

1. `teacher_zhang` 登录 → 「培养方案」→ 「+ 新建方案」→ 填写表单 → 保存并上传 docx
2. 文档上传后，系统**异步**触发 AI 政策合规性审核（详情页可见报告状态轮询）
3. 提交审批 → 状态变为「院长审批」
4. 切换到 `dean_li` → 「我的待办」→ 进入方案详情 → 查看 AI 报告 → 同意
5. 切换到 `academic_wang` → 同意
6. 切换到 `president_zhao` → 同意并签发，状态变为「已发布」

## 🔧 配置说明

后端配置位于 `backend/.env`：

```env
PORT=3001
JWT_SECRET=...
ANTHROPIC_BASE_URL=https://token-plan-cn.xiaomimimo.com/anthropic
ANTHROPIC_API_KEY=tp-xxxxx
ANTHROPIC_MODEL=mimo-2.5
```

如需更换 LLM 提供商，修改 `ANTHROPIC_*` 三个变量即可，代码支持任意 Anthropic 兼容协议。

## 📁 目录结构

```
审核系统/
├── backend/            Node.js + Express + Prisma
│   ├── prisma/         schema + 预置数据
│   ├── src/
│   │   ├── routes/     API 路由
│   │   ├── services/   工作流、AI 审核、文档解析
│   │   ├── prompts/    LLM Prompt 模板
│   │   └── policies/   内置政策知识库
│   └── uploads/        上传的 Word 文件
├── frontend/           Vue 3 + Vite + Element Plus
│   ├── src/
│   │   ├── views/      7 个核心页面
│   │   ├── components/ 状态标签等
│   │   └── stores/     Pinia
└── docs/design.md      详细设计文档
```

## 📌 第二/三阶段（未实现）

- 岗课赛证逻辑支撑图分析
- 产业契合度分析
- 可视化审批流程配置引擎
- 与学校统一身份认证对接
- 与教务系统排课数据互通
- 向量数据库 + RAG 完整实现
