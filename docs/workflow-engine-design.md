# 可视化流程配置引擎 Spec

> 日期：2026-06-15
> 状态：待用户 review
> 范围：Phase A（数据模型 + 引擎）+ Phase B（@antv/x6 可视化设计器）
> 阶段目标：让 ADMIN 能用拖拽方式定义审批流程，方案创建时选择流程，详情页展示当前进度

## 1. 目标

把当前硬编码的 4 步审批（DEPT_REVIEW → ACADEMIC_REVIEW → PRESIDENT_REVIEW → PUBLISHED）替换为**可配置的、ADMIN 通过拖拽设计的工作流引擎**。

本版本不实现条件分支/并行/复杂表达式，但要让数据模型和引擎具备后续扩展这些能力的基础。

## 2. 范围

### In Scope

- 4 种节点：开始 / 审批 / 抄送 / 结束
- @antv/x6 可视化设计器（拖拽节点、连线、属性面板、JSON 导出校验）
- 3 套审批人解析（OWN_DEPT_DEAN / ALL_DEAN / ALL_SIGN_DEAN / CUSTOM_USERS）
- Plan 关联 workflowId + 冻结 workflowSnapshot
- 引擎：基于快照的动态执行
- 旧 plan（workflowId=null）继续走硬编码 4 步，无回归
- 详情页 el-steps 进度展示
- 通知中心已对接 4 个通知类型继续可用

### Out of Scope（V2 再做）

- 条件分支节点、并行节点、会签节点、子流程
- 模板的复制/导入/导出
- 连线上的条件表达式
- 模板版本号管理（V1 用快照隔离足够）
- 节点拖拽时的自动布局算法（V1 简单坐标存储）

## 3. 数据模型

新增 3 个表：

```prisma
model Workflow {
  id          Int      @id @default(autoincrement())
  name        String
  description String?
  status      String   @default("ACTIVE")  // ACTIVE | ARCHIVED
  createdById Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  nodes WorkflowNode[]
  edges WorkflowEdge[]

  @@index([status, createdAt])
}

model WorkflowNode {
  id              Int      @id @default(autoincrement())
  workflowId      Int
  workflow        Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  code            String   // START | APPROVAL | NOTIFY | END
  name            String
  role            String?  // DEAN | ACADEMIC | PRESIDENT | ADMIN
  approverScope   String?  // OWN_DEPT_DEAN | ALL_DEAN | ALL_SIGN_DEAN | CUSTOM_USERS
  approverUserIds String?  // JSON 数组
  notifyUserIds   String?  // JSON 数组（NOTIFY 节点用）

  x               Float    // 画布坐标
  y               Float
  width           Float    @default(120)
  height          Float    @default(60)
}

model WorkflowEdge {
  id         Int      @id @default(autoincrement())
  workflowId Int
  workflow   Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  sourceId   String   // 源节点 code 或唯一标识
  targetId   String
}
```

Plan 表新增 3 字段：

```prisma
model Plan {
  // ... existing fields
  workflowId       Int?     // nullable，旧 plan 保持 null
  currentNodeCode  String?  // 当前节点 code
  workflowSnapshot String?  // JSON 字符串：创建时冻结的完整定义

  @@index([workflowId])
}
```

`workflowSnapshot` JSON 结构：

```json
{
  "name": "标准 4 步流程",
  "nodes": [
    { "code": "START", "name": "开始" },
    { "code": "DEPT_REVIEW", "name": "院长审核", "role": "DEAN", "approverScope": "OWN_DEPT_DEAN" },
    { "code": "ACADEMIC_REVIEW", "name": "教务审核", "role": "ACADEMIC", "approverScope": "CUSTOM_USERS", "approverUserIds": [] },
    { "code": "PRESIDENT_REVIEW", "name": "校长审核", "role": "PRESIDENT", "approverScope": "CUSTOM_USERS", "approverUserIds": [] },
    { "code": "END", "name": "已发布" }
  ],
  "edges": [
    { "source": "START", "target": "DEPT_REVIEW" },
    { "source": "DEPT_REVIEW", "target": "ACADEMIC_REVIEW" },
    { "source": "ACADEMIC_REVIEW", "target": "PRESIDENT_REVIEW" },
    { "source": "PRESIDENT_REVIEW", "target": "END" }
  ]
}
```

## 4. 引擎设计

新建 `backend/src/services/workflowEngine.js`，导出 3 个核心函数：

### 4.1 `loadPlanWorkflow(plan)`

```js
function loadPlanWorkflow(plan) {
  if (plan.workflowSnapshot) {
    return JSON.parse(plan.workflowSnapshot);
  }
  // fallback：内置默认 4 步
  return BUILTIN_DEFAULT;
}
```

### 4.2 `createPlanTasks(plan, workflow)`

`submit()` 时调用：根据当前节点（START 后第一个）创建 ApprovalTask / 通知。

```js
async function createPlanTasks(plan, workflow) {
  const firstNode = findStartSuccessor(workflow); // START 之后第一个节点
  plan.currentNodeCode = firstNode.code;
  await prisma.plan.update({ where: { id: plan.id }, data: { currentNodeCode: firstNode.code } });
  if (firstNode.code === 'APPROVAL') {
    const userIds = await resolveApprovers(firstNode, plan);
    for (const userId of userIds) {
      await prisma.approvalTask.create({ data: {
        planId: plan.id, currentNode: firstNode.code, roleRequired: firstNode.role,
        action: 'PENDING', assignedTo: userId,
      }});
    }
  } else if (firstNode.code === 'NOTIFY') {
    await notifyUsers(firstNode.notifyUserIds, plan, 'FLOW_NOTIFY');
    // 抄送不阻塞，继续推进
    return advanceToNext(plan, workflow, firstNode);
  }
}
```

### 4.3 `advanceToNext(plan, workflow, currentNode)`

`approve()` 时调用：从 workflow.edges 找到 currentNode 的下一个节点，按节点类型分发处理。

### 4.4 `resolveApprovers(node, plan)`

```js
async function resolveApprovers(node, plan) {
  switch (node.approverScope) {
    case 'OWN_DEPT_DEAN':
      return prisma.user.findMany({ where: { role: 'DEAN', departmentId: plan.departmentId }, select: { id: true } }).then(r => r.map(u => u.id));
    case 'ALL_DEAN':
      return prisma.user.findMany({ where: { role: 'DEAN' }, select: { id: true } }).then(r => r.map(u => u.id));
    case 'ALL_SIGN_DEAN':
      // 会签：所有 DEAN 都要通过，引擎在 approve 时检查"是否所有会签任务都已通过"
      return 同 ALL_DEAN;
    case 'CUSTOM_USERS':
      return JSON.parse(node.approverUserIds || '[]');
    default:
      return [];
  }
}
```

## 5. 引擎与现有 workflow.js 的关系

现有 `services/workflow.js` 维护硬编码 4 步。本版本做最小改动：

- `submit()` 改为：调用 `loadPlanWorkflow(plan)` + `createPlanTasks(plan, workflow)`
- `approve()` 改为：调用 `advanceToNext(plan, workflow, currentNode)` 处理后续流转
- `reject()` 保持现状（驳回到 DRAFT，逻辑不变）
- 旧的 `WORKFLOW_NODES` 数组保留作为 fallback + admin seed

## 6. Admin 设计器 UI

### 6.1 列表页 `/admin/workflows`

- 卡片式布局，每卡片显示：名称、状态、节点数、创建时间、操作（编辑/归档/复制）
- 顶部"新建工作流"按钮
- 状态筛选：ACTIVE / ARCHIVED

### 6.2 设计器 `/admin/workflows/:id?edit=1`

布局（3 列）：

```
┌────────────────────────────────────────────────┐
│ 顶部工具条：名称 | 保存 | 校验 | JSON预览 | 返回 │
├──────────┬─────────────────────────┬───────────┤
│ 节点面板  │    x6 画布               │ 属性面板  │
│          │                         │           │
│ □ 开始   │  ┌──┐                   │ 节点名称  │
│ □ 审批   │  │  │→ ┌──┐ → ┌──┐     │ 角色      │
│ □ 抄送   │  └──┘   │  │   │  │     │ 范围      │
│ □ 结束   │         └──┘   └──┘     │ 通知人    │
│          │                         │           │
│          │                         │ 坐标      │
└──────────┴─────────────────────────┴───────────┘
```

- 节点从左侧拖到画布生成节点
- 节点之间通过 x6 的连线功能连边
- 选中节点后右侧显示属性面板
- 点击保存：把画布序列化为 `{ nodes: [...], edges: [...] }` + 顶层 `name`
- 顶部"校验"按钮调用 `/api/workflows/:id/validate` 服务端校验

### 6.3 校验规则（前端 + 后端双重）

- 必须有且仅有 1 个 START 节点
- 必须有 ≥ 1 个 END 节点
- 所有节点必须连通（无孤立节点）
- 不能有环（基本有向无环图）
- APPROVAL 节点必须有 role 字段
- 边必须连接有效节点

## 7. 教师端集成

### 7.1 创建方案页

现有 PlanCreate.vue 提交前多一个步骤"选择工作流"：

- 下拉框显示所有 ACTIVE 工作流
- 选中后右侧显示该工作流的节点预览（el-descriptions）
- 默认选中"内置 4 步"

### 7.2 方案详情页

在 PlanDetail.vue 顶部"基本信息"前加一个 `<PlanProgress>` 组件：

- el-steps 横排
- 每个 step 显示节点名称
- 当前节点高亮（active 状态）
- 已完成节点显示 ✓
- 失败/驳回显示 ✗ 红色

数据来源：新增 `GET /api/plans/:id/progress` 返回：

```json
{
  "steps": [
    { "code": "START", "name": "开始", "status": "finish" },
    { "code": "DEPT_REVIEW", "name": "院长审核", "status": "process" },
    { "code": "ACADEMIC_REVIEW", "name": "教务审核", "status": "wait" }
  ],
  "currentNodeCode": "DEPT_REVIEW"
}
```

status 映射：已完成=finish, 当前=process, 未到=wait, 被驳回=error

## 8. 后端 API

### 8.1 工作流管理

| Method | Path | 角色 | 说明 |
|--------|------|------|------|
| GET | /api/workflows | 全部 | 列表（ADMIN 全部，DEAN+ACADEMIC+PRESIDENT 仅 ACTIVE） |
| GET | /api/workflows/:id | 全部 | 详情 |
| POST | /api/workflows | ADMIN | 新建 |
| PUT | /api/workflows/:id | ADMIN | 更新 |
| DELETE | /api/workflows/:id | ADMIN | 软删（status=ARCHIVED） |
| POST | /api/workflows/:id/validate | ADMIN | 校验定义合法性 |

### 8.2 Plan 侧调整

| Method | Path | 调整 |
|--------|------|------|
| POST | /api/plans | 请求体加 `workflowId`；提交时冻结 snapshot |
| GET | /api/plans/:id | 响应加 `workflowSnapshot`（已解析）、`currentNodeCode` |
| GET | /api/plans/:id/progress | 新增 |

## 9. 数据迁移

启动时 seed（`prisma/seed.js` 扩展）：

- 检查 Workflow 表是否为空
- 如果为空，创建 1 个"内置标准 4 步"工作流：
  ```json
  {
    "name": "标准 4 步流程",
    "description": "系统内置流程：发起 → 院长 → 教务 → 校长",
    "nodes": [
      { "code": "START", "name": "开始" },
      { "code": "DEPT_REVIEW", "name": "院长审核", "role": "DEAN", "approverScope": "OWN_DEPT_DEAN" },
      { "code": "ACADEMIC_REVIEW", "name": "教务审核", "role": "ACADEMIC", "approverScope": "CUSTOM_USERS", "approverUserIds": [] },
      { "code": "PRESIDENT_REVIEW", "name": "校长审核", "role": "PRESIDENT", "approverScope": "CUSTOM_USERS", "approverUserIds": [] },
      { "code": "END", "name": "已发布" }
    ],
    "edges": [...]
  }
  ```
- 现有 plan（workflowId=null）保持原状，引擎走 fallback

## 10. 错误处理

- 校验失败：返回 400 + 错误列表 `{ code: 'NO_START', message: '缺少开始节点' }`
- 推进时无下一节点：返回 500 + log（不应该发生）
- 节点已被删除（admin 误操作老 plan 不会发生，因有 snapshot 隔离）
- 抄送通知发送失败：log warn，流程不阻塞

## 11. 验收用例

| 场景 | 步骤 | 预期 |
|------|------|------|
| 设计器建流程 | ADMIN 登录 → /admin/workflows/new → 拖 4 个节点连 3 条边 → 保存 | 返回 200，跳详情 |
| 校验失败 | 缺 START 节点点保存 | 提示"必须包含开始节点" |
| 创建方案选流程 | TEACHER 登录 → 创建方案 → 选"标准 4 步" → 提交 | 方案创建成功，currentNodeCode=DEPT_REVIEW |
| 完整流程 | TEACHER 提交 → DEAN 看到待办 → DEAN 通过 → ACADEMIC 看到 → ... → PUBLISHED | 4 步全部流转正确，详情页 el-steps 依次推进 |
| 老 plan 兼容 | 已存在的 plan1（无 workflowId）走原流程 | DEAN/ACADEMIC/PRESIDENT 仍能正常处理 |
| 抄送节点 | ADMIN 拖出"教务处-知会"抄送节点 → 提交 | 通知发到该节点配置的 userIds，流程不阻塞直接到下一审批节点 |
| 归档模板 | ADMIN 归档某模板 | 状态变 ARCHIVED，新建方案下拉不再显示；老方案不受影响 |

## 12. 风险与缓解

| 风险 | 缓解 |
|------|------|
| @antv/x6 与 Vue 3 集成有版本问题 | 锁定 @antv/x6@^2.x + @antv/x6-vue 官方包 |
| 引擎改动影响现有 4 步流程 | 保留旧 WORKFLOW_NODES 作为 fallback；E2E 走老 plan 验证 |
| 节点坐标存数据库（如改版要重画） | 接受损失；后续可改前端 localStorage 缓存 |
| 抄送节点死循环 | 抄送节点不允许有入边后立即又是抄送（校验规则） |
| 节点被删导致进行中方案卡住 | 走 snapshot 隔离，不会发生 |

## 13. 实施任务

1. Prisma schema 增加 3 张表 + Plan 3 字段；`npx prisma migrate dev`
2. seed.js 写入"内置标准 4 步"工作流
3. `services/workflowEngine.js` 实现 3 个核心函数
4. `services/workflow.js` 的 `submit/approve` 切到新引擎
5. `routes/workflows.js` 6 个端点 + 权限中间件
6. `routes/plans.js` POST 加 workflowId；GET 加 progress 端点
7. 前端 `npm i @antv/x6@^2`
8. `frontend/src/api/workflows.js` 6 个 API 封装
9. `frontend/src/views/admin/WorkflowList.vue` 列表页
10. `frontend/src/views/admin/WorkflowDesigner.vue` 设计器（x6 画布 + 拖拽 + 属性面板）
11. `frontend/src/views/PlanCreate.vue` 加"选择工作流"步骤
12. `frontend/src/views/PlanDetail.vue` 顶部加 `<PlanProgress>` 组件
13. 后端 E2E：6 个工作流 API + 完整流程跑通
14. 前端 E2E：3 角色验证 + 截图归档
