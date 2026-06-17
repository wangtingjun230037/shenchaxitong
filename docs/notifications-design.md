# 通知中心 — 设计文档

> 版本: v0.1 · 日期: 2026-06-15 · 范围: 站内信/系统通知模块
>
> 落地在第一阶段 MVP 之后的"小幅迭代"中，定位为高价值低实现成本的业务增益。

## 1. 目标与价值

让审批流中的关键节点（提交/驳回/通过/发布/AI 完成）以及"有新待办/同部门有新方案/系统公告"等运营信息，主动推达到相关人员的工作台入口，避免靠"刷页面"发现。

**核心收益**：
- 审批人即时看到自己的待办（避免教师打电话问"方案看了没"）
- 教师即时看到自己方案的进度变化（提升体验）
- 公告、运营信息有正式传达渠道
- 数据权限严格隔离，零泄漏风险

## 2. 数据模型

### 2.1 Notification（通知表）

```
id              Int       主键
userId          Int       接收人（FK: users.id）
type            String    通知类型枚举
title           String    标题（一行）
body            String?   详情（1-2 句话，可含跳转提示）
targetType      String?   目标类型：Plan | Announcement | null
targetId        Int?      目标 id（用于点击跳转）
readAt          DateTime? 已读时间；null = 未读
createdAt       DateTime  @default(now())

@@index([userId, readAt, createdAt])  // 未读数 + 列表查询性能
```

**type 枚举**：

| type | 含义 | 触发位置 |
|---|---|---|
| `PLAN_REJECTED` | 方案被驳回 | tasks.js reject 路由 |
| `PLAN_ADVANCED` | 方案通过当前节点 | tasks.js approve 路由（非终态） |
| `PLAN_PUBLISHED` | 方案正式发布 | tasks.js approve 路由（终态：进入 PUBLISHED） |
| `AI_REPORT_DONE` | AI 审核完成 | aiAudit.js 写 SUCCESS 时 |
| `NEW_TASK` | 收到新待办 | workflow.submit() |
| `DEPT_PLAN_SUBMITTED` | 同部门有新方案 | workflow.submit() |
| `ANNOUNCEMENT` | 系统公告 | 公告发布时 |

### 2.2 Announcement（公告表）

```
id              Int       主键
title           String    标题
body            String    正文
publishedById   Int       发布人（FK: users.id）
publishedAt     DateTime  @default(now())
expiresAt       DateTime? 过期后不再展示（可空 = 永久）
status          String    ACTIVE | WITHDRAWN
```

## 3. 触发点矩阵

| 事件 | 触发位置 | 通知类型 | 接收人 |
|---|---|---|---|
| 教师提交方案 | `workflow.submit()` | `NEW_TASK` | 节点对应角色所有用户（如 DEAN） |
| 教师提交方案 | `workflow.submit()` | `DEPT_PLAN_SUBMITTED` | 同部门所有 DEAN + 同部门其他 TEACHER |
| 审批通过（非终态） | `tasks.approve()` | `PLAN_ADVANCED` | plan.createdById |
| 审批通过（终态 → PUBLISHED） | `tasks.approve()` | `PLAN_PUBLISHED` | plan.createdById |
| 审批驳回 | `tasks.reject()` | `PLAN_REJECTED` | plan.createdById |
| AI 报告完成 | `aiAudit.runAudit()` SUCCESS | `AI_REPORT_DONE` | plan.createdById |
| 公告发布 | `announcements` POST | `ANNOUNCEMENT` | 所有 `status=ACTIVE` 的用户 |

**注意**：
- 终态判定：`plan.status` 进入 `PUBLISHED` 时为终态
- AI 报告触发：仅 `SUCCESS` 状态触发；`FAILED` 不发（避免噪音）
- 公告通知批量插入：每用户一条；管理员本人不给自己发

## 4. API 列表

### 4.1 通知

```
GET    /api/notifications              我的通知列表
                                        查询参数：
                                        - type: 通知类型（可选，逗号分隔多选）
                                        - read: true | false（可选）
                                        - page: 默认 1
                                        - size: 默认 20，最大 50
                                        响应：{ total, unread, items: [...] }

GET    /api/notifications/unread-count 未读数（红点用）
                                        响应：{ count }

POST   /api/notifications/:id/read     单条标已读（幂等）

POST   /api/notifications/read-all     全部标已读
                                        响应：{ updated }

DELETE /api/notifications/:id          单条删除
DELETE /api/notifications              批量删除已读（query: ?read=true）
```

### 4.2 公告

```
GET    /api/announcements              公告列表（分页、状态过滤）
                                        仅返回 status=ACTIVE 且 (expiresAt IS NULL OR expiresAt > now)

GET    /api/announcements/all          管理列表（ADMIN 专用，含 WITHDRAWN）

POST   /api/announcements              发布（ADMIN）
                                        body: { title, body, expiresAt? }

PUT    /api/announcements/:id          编辑（ADMIN；只能编辑 ACTIVE 的）

DELETE /api/announcements/:id          撤回（ADMIN；软删，status=WITHDRAWN）
```

## 5. 前端设计

### 5.1 文件清单

| 文件 | 作用 |
|---|---|
| `stores/notification.js` | Pinia：未读数、列表、轮询 |
| `api/notifications.js` | axios 封装 |
| `api/announcements.js` | axios 封装 |
| `components/NotificationBell.vue` | 顶部铃铛 + 红点 + Drawer（最近 10 条） |
| `views/Notifications.vue` | `/messages` 独立消息中心 |
| `views/AdminAnnouncements.vue` | `/admin/announcements` 公告管理 |
| `router/index.js` | 新增 2 条路由 |
| `layouts/MainLayout.vue` | 集成 NotificationBell |

### 5.2 状态管理

```js
// stores/notification.js
state: {
  unread: 0,                // 红点数字
  recent: [],               // Drawer 显示最近 10 条
  list: [],                 // 独立页全量
  total: 0,
  page: 1,
  loading: false,
  pollHandle: null,
}

actions: {
  startPolling() { setInterval(fetchUnread, 30000) },
  fetchUnread() { GET /api/notifications/unread-count }
  fetchRecent() { GET /api/notifications?size=10 }
  fetchList({ type, read, page, size })
  markRead(id)  { POST /:id/read }
  markAllRead() { POST /read-all }
  remove(id)    { DELETE /:id }
  clearRead()   { DELETE /api/notifications?read=true }
}
```

**轮询策略**：
- App 挂载时启动 30s 轮询
- 路由切换时（router.afterEach）立即 fetchUnread
- 抽屉打开时 fetchRecent
- 独立页进入时 fetchList
- 组件卸载时清理 interval

### 5.3 NotificationBell.vue

```
┌────────────────────────────────────┐
│  顶部右侧：🔔 [3]  ← 红点徽章     │
│                                    │
│  点击 Drawer 弹出（400px 宽）：     │
│  ┌──────────────────────────────┐  │
│  │ 消息中心       全部已读 · 查看全部 │  │
│  ├──────────────────────────────┤  │
│  │ [审批] 张老师的方案被驳回     [•] │  │
│  │       2 分钟前                │  │
│  │ [AI ] AI 审核完成，得分 80   [ ] │  │
│  │       5 分钟前                │  │
│  │ ...                          │  │
│  └──────────────────────────────┘  │
└────────────────────────────────────┘
```

- 未读项加蓝色背景
- 整行可点击 → 跳转目标 + 自动标已读
- 空状态：「暂无新消息」

### 5.4 Notifications.vue 独立页

```
┌──────────────────────────────────────────────┐
│ 消息中心                          [全部标已读]│
├──────────────────────────────────────────────┤
│ [全部 12] [未读 3] [AI 报告 1] [审批 4] [公告 2]│
├──────────────────────────────────────────────┤
│ 类型 │ 标题        │ 内容   │ 时间   │ 操作  │
│ ...  │ ...         │ ...    │ ...    │ 已读/删除 │
├──────────────────────────────────────────────┤
│              < 1 2 3 >                       │
└──────────────────────────────────────────────┘
```

### 5.5 AdminAnnouncements.vue

```
┌──────────────────────────────────────────────┐
│ 系统公告管理              [+ 发布新公告]      │
├──────────────────────────────────────────────┤
│ 标题 │ 发布人 │ 发布时间 │ 过期 │ 状态 │ 操作 │
│ ...  │ ...    │ ...      │ ...  │ ...  │ 编辑/撤回 │
└──────────────────────────────────────────────┘
```

弹窗表单：title（必填，≤ 100 字）、body（必填，textarea）、expiresAt（可选 datetime-local）。

## 6. 端到端流程示例

### 6.1 提交方案触发的两条通知

```
[张老师登录] 创建方案 → 上传 docx → 提交审批
  ↓
POST /api/plans/:id/submit
  ↓
workflow.submit() 内：
  1. 写入 ApprovalTask (node=院长审批, role=DEAN)
  2. 查所有 role=DEAN, status=ACTIVE, departmentId=plan.departmentId
     → 给每人插一条 Notification(type=NEW_TASK)
  3. 查同部门所有 DEAN + TEACHER, status=ACTIVE
     → 给每人插一条 Notification(type=DEPT_PLAN_SUBMITTED)
  4. plan.createdById 排除
```

### 6.2 审批流转的连锁通知

```
[dean_li 登录] 我的待办：点击同意
  ↓
POST /api/tasks/:id/approve
  ↓
tasks.approve() 内：
  1. task.action = APPROVED
  2. workflow.advance(plan)
     ├─ 若未到终态：创建下个节点 ApprovalTask
     │   → 给对应角色发 NEW_TASK
     └─ 若到终态：plan.status = PUBLISHED
  3. 通知 plan.createdById：
     ├─ 终态 → PLAN_PUBLISHED
     └─ 非终态 → PLAN_ADVANCED（含下一节点名称）

[张老师 30s 内] 铃铛红点 +1
  → 点击铃铛，看到"您的方案已通过院长审批"
  → 跳转到详情页（已自动标已读）
```

### 6.3 AI 报告完成

```
[aiAudit.runAudit] LLM 返回 → 写 SUCCESS
  ↓
通知 plan.createdById: type=AI_REPORT_DONE
  body: "AI 审核完成，综合得分 80"（按 dimension 显示）
```

## 7. 数据隔离与权限

- **API 层**：所有通知 API 从 JWT 取 userId，禁止前端传 userId 参数覆盖
- **SQL 层**：所有查询默认带 `where: { userId: req.user.id }`
- **公告 API**：`/api/announcements` GET 公开给所有已登录用户；`/api/announcements/all` + POST/PUT/DELETE 仅 ADMIN
- **教师/院长/教务/校长** 在通知中心看到的通知完全相同（按 userId 隔离，与角色无关）
- 唯一角色相关：**DEPT_PLAN_SUBMITTED** 通知范围按"同部门"过滤，部门隔离在 SQL 中执行

## 8. 性能与扩展

- **未读数缓存**：首版每次实时 COUNT(*)；500 万行以下够用。后续可加 `users.unreadCount` 反范式字段
- **批量插入公告通知**：使用 `prisma.notification.createMany({ data: [...] })` 一次写入
- **历史清理**：通知保留 90 天后可定期清理（运营脚本，不在本期范围）
- **国际化**：title/body 当前用中文硬编码；如需多语言，扩展为 i18n key

## 9. 验收路径

1. `teacher_zhang` 登录 → 提交方案 → 30s 内 `dean_li` 顶部铃铛出现 1
2. `dean_li` 同意 → 30s 内 `teacher_zhang` 铃铛出现 1
3. `academic_wang` 驳回 → `teacher_zhang` 收到 PLAN_REJECTED
4. 上传 docx → AI 审核完成 → `teacher_zhang` 收到 AI_REPORT_DONE
5. `admin` 登录 → 进入 `/admin/announcements` → 发布公告 → 全体用户铃铛出现
6. `/messages` 独立页筛选/分页/批量已读/批量删除已读
7. 点击通知项 → 跳转目标 + 自动标已读 + 红点 -1

## 10. 风险与限制

- 30s 轮询的延迟在用户感知边缘；如需更低延迟再升级 SSE
- SQLite `createMany` 已支持（Prisma 5+），但事务需显式开启
- 公告批量通知可能瞬时 N 条写：100 人量级无压力，1000+ 应分批（本期不考虑）
- 已读/未读状态没有实时跨设备同步（重新拉取即可，本期一致）
