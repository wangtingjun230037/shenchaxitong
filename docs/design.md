# 人才培养方案审核系统 — 第一阶段 MVP 设计文档

> 版本: v0.1 · 日期: 2026-06-15 · 范围: 落地路径第一阶段

## 1. 范围与目标

**第一阶段交付（MVP）：**

1. 表单填报 + Word 文档上传
2. 固定四步审批流：发起 → 院长 → 教务 → 校长
3. AI 政策合规性智能审核（异步）
4. 基础的用户/部门管理

**第二/三阶段（本版本不实现）：** 岗课赛证逻辑分析、可视化流程配置引擎、统一身份认证对接。

## 2. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | Vue 3 + Vite + Element Plus + Pinia + Vue Router | 中后台主流 |
| 后端 | Node.js 20+ / Express 4 | 文档推荐 |
| ORM | Prisma | 类型安全、迁移工具完善 |
| 数据库 | SQLite | 零配置，文件位于 `backend/data.db` |
| 鉴权 | jsonwebtoken (JWT) | 预置账号 + Bearer Token |
| 文件上传 | multer | 本地磁盘存储 `backend/uploads/` |
| Word 解析 | mammoth | 提取纯文本与原始 HTML |
| Word 预览 | docx-preview | 浏览器端渲染 |
| AI 客户端 | @anthropic-ai/sdk | Anthropic 协议兼容 |
| 大模型 | mimo-2.5 | 接入地址 `https://token-plan-cn.xiaomimimo.com/anthropic` |

## 3. 目录结构

```
审核系统/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── src/
│   │   ├── index.js              # 入口
│   │   ├── config.js             # 配置（环境变量）
│   │   ├── db.js                 # Prisma Client
│   │   ├── middleware/
│   │   │   ├── auth.js           # JWT 校验
│   │   │   ├── error.js
│   │   │   └── upload.js         # multer
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── departments.js
│   │   │   ├── users.js
│   │   │   ├── plans.js
│   │   │   ├── tasks.js
│   │   │   └── ai.js
│   │   ├── controllers/          # 路由处理
│   │   ├── services/
│   │   │   ├── workflow.js       # 状态机
│   │   │   ├── docxParser.js     # mammoth 封装
│   │   │   └── aiAudit.js        # LLM 客户端
│   │   ├── prompts/
│   │   │   └── compliance.js     # 合规性 Prompt 模板
│   │   └── policies/
│   │       └── teaching-standards.txt  # 内置政策知识库
│   ├── uploads/                  # 上传的 Word 文件
│   ├── .env
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.js
│   │   ├── App.vue
│   │   ├── router/
│   │   ├── stores/
│   │   │   ├── user.js
│   │   │   └── plan.js
│   │   ├── api/
│   │   │   └── request.js        # axios 封装
│   │   ├── layouts/
│   │   │   └── MainLayout.vue
│   │   ├── views/
│   │   │   ├── Login.vue
│   │   │   ├── Dashboard.vue
│   │   │   ├── PlanList.vue
│   │   │   ├── PlanCreate.vue
│   │   │   ├── PlanDetail.vue
│   │   │   ├── MyTasks.vue
│   │   │   └── AdminUsers.vue
│   │   └── components/
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── docs/
│   └── design.md
├── README.md
└── .gitignore
```

## 4. 数据模型（Prisma Schema 摘要）

### users
```
id, username(unique), password_hash, name, role[TEACHER|DEAN|ACADEMIC|PRESIDENT|ADMIN],
department_id(FK), status[ACTIVE|DISABLED], created_at
```

### departments
```
id, name, parent_id(nullable, 自引用)
```

### plans
```
id, name, code, major, duration, student_type, version_year, department_id(FK),
file_path, file_name, status[DRAFT|DEPT_REVIEW|ACADEMIC_REVIEW|PRESIDENT_REVIEW|PUBLISHED|REJECTED],
current_node, created_by(FK), created_at, updated_at, submitted_at, published_at
```

### approval_tasks
```
id, plan_id(FK), node_name, approver_id(FK,nullable 表示待领取), role_required,
action[PENDING|APPROVED|REJECTED], comment, arrived_at, processed_at
```

### ai_reports
```
id, plan_id(FK), dimension[COMPLIANCE|INDUSTRY|GANGLUO], status[PENDING|RUNNING|SUCCESS|FAILED],
result_json(text), summary, score, error_message, started_at, finished_at
```

### audit_logs
```
id, user_id(FK,nullable), action, target_type, target_id, ip, user_agent, created_at
```

## 5. 状态机

```
       创建
        │
        ▼
    [DRAFT]  ──提交──>  [DEPT_REVIEW]
                            │ 同意
                            ▼
                    [ACADEMIC_REVIEW]
                            │ 同意
                            ▼
                    [PRESIDENT_REVIEW]
                            │ 同意
                            ▼
                       [PUBLISHED]

任意节点可驳回：
  驳回 → [DRAFT]   （回到发起人修改）
  驳回 → [REJECTED]（终止，本版本回到 DRAFT）
```

**审批人匹配规则：**
- DEPT_REVIEW：plan.department 的 role=DEAN
- ACADEMIC_REVIEW：任一 role=ACADEMIC
- PRESIDENT_REVIEW：任一 role=PRESIDENT

**权限数据隔离：**
- TEACHER：仅可见本部门、自己创建的方案
- DEAN：本部门全部方案
- ACADEMIC / PRESIDENT / ADMIN：全校

## 6. AI 集成规范

**触发：** `POST /api/plans/:id/file` 上传成功后，**立即**异步启动审核任务；前端通过 `GET /api/plans/:id/ai-report` 轮询（间隔 3 秒）。

**流程：**
1. 读取上传的 .docx → mammoth 提取纯文本
2. 章节切分（正则识别"培养目标"、"课程体系"、"实践教学"等标题）
3. Prompt 组装：拼接政策知识库（`policies/teaching-standards.txt`）的相关片段
4. 调用 Anthropic Messages API（`mimo-2.5`）
5. 解析返回的 JSON，写入 ai_reports 表

**Prompt 模板（摘要）：**
```
你是一名资深的高职教育审核专家。请基于以下【人才培养方案】与【政策标准】，审核方案的合规性。
要求：
1. 总学时是否 ≥ 2500 / ≤ 3000
2. 公共基础课学时占比是否 ≥ 25%
3. 实践教学学时占比是否 ≥ 50%
4. 是否包含 AI/人工智能相关课程
5. 课程体系是否覆盖"岗课赛证"逻辑
输出严格 JSON：{ score, compliance_items:[{name, status, actual, required, suggestion}], summary }
```

**降级策略：**
- 3 次重试，间隔 5s
- 仍失败 → `status=FAILED`，错误信息写入表，**不阻塞**审批
- Token 超限：截断文本到 8000 字后重试

## 7. API 列表

```
POST   /api/auth/login                   # 登录
GET    /api/auth/me                      # 当前用户

GET    /api/departments                  # 部门树
GET    /api/users                        # 用户列表（管理员）

GET    /api/plans                        # 方案列表（按权限过滤）
POST   /api/plans                        # 创建
GET    /api/plans/:id                    # 详情
PUT    /api/plans/:id                    # 更新（仅 DRAFT）
POST   /api/plans/:id/file               # 上传 docx + 触发 AI
GET    /api/plans/:id/file               # 下载
GET    /api/plans/:id/ai-report          # 查询 AI 报告
POST   /api/plans/:id/ai-retry           # 手动重试
POST   /api/plans/:id/submit             # 提交审批

GET    /api/tasks/my                     # 我的待办
GET    /api/tasks/by-plan/:planId        # 某方案的全部审批轨迹
POST   /api/tasks/:id/approve            # 同意
POST   /api/tasks/:id/reject             # 驳回

GET    /api/audit-logs                   # 审计日志（管理员）
```

## 8. 前端页面

| 页面 | 路径 | 角色 |
|---|---|---|
| 登录 | /login | 全部 |
| 工作台 | / | 全部 |
| 方案列表 | /plans | 全部 |
| 方案填报 | /plans/new, /plans/:id/edit | 教师（仅自己的草稿） |
| 方案详情 | /plans/:id | 全部 |
| 我的待办 | /tasks | 院长/教务/校长 |
| 用户管理 | /admin/users | 管理员 |

**方案详情三栏布局：**
- 左 40%：docx-preview 渲染
- 右 60% 上：AI 报告（状态徽章 + 得分 + JSON 渲染的问题清单）
- 右 60% 下：审批轨迹 Timeline + 同意/驳回按钮（按当前状态与角色显示）

## 9. 预置数据

### 用户（密码统一 `123456`，bcrypt 哈希后存储）
| username | name | role | department |
|---|---|---|---|
| teacher_zhang | 张老师 | TEACHER | 计算机学院 |
| dean_li | 李院长 | DEAN | 计算机学院 |
| academic_wang | 王主任 | ACADEMIC | 教务处 |
| president_zhao | 赵校长 | PRESIDENT | 校领导 |
| admin | 系统管理员 | ADMIN | 校领导 |

### 部门
- 计算机学院
- 教务处
- 校领导

### 政策知识库
内置 1 份《教育部关于职业院校专业人才培养方案制订与实施工作的指导意见》精简版（文本 ~3000 字），用于 RAG 检索与 Prompt 注入。

## 10. 验收路径

1. `teacher_zhang` 登录 → 创建方案 → 上传 docx → 提交
2. 后台异步触发 AI 审核（同时方案进入 DEPT_REVIEW）
3. `dean_li` 登录 → 看到待办 → 查看 AI 报告 → 同意
4. `academic_wang` 登录 → 同意
5. `president_zhao` 登录 → 公布
6. 方案状态变为 `PUBLISHED`，可在列表中查看

## 11. 启动方式

```bash
# 后端
cd backend
npm install
npx prisma migrate dev --name init
node prisma/seed.js
npm run dev          # http://localhost:3001

# 前端
cd frontend
npm install
npm run dev          # http://localhost:5173
```

## 12. 风险与限制

- AI 调用受第三方服务稳定性影响，已实现 3 次重试 + 失败降级
- SQLite 不支持高并发写，Phase 2 切 MySQL 即可
- 本地文件系统存储上传文件，多实例部署时需替换为 MinIO
- JWT 未实现刷新令牌（短期 token 1 天）
