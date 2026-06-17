# 方案生命周期时间轴 — 设计文档

> 版本: v1.0 · 日期: 2026-06-16 · 范围: PlanDetail 页面"审批轨迹"卡片升级

## 1. 背景与目标

**现状：** PlanDetail 页面有"审批轨迹"卡片（`el-timeline`），仅展示 `ApprovalTask` 表中该方案的所有任务。视角单一、事件类型少（仅审批通过/驳回/待办），无法满足以下场景：

- 校长/教务回顾方案完整流转（什么时候提交、什么时候 AI 审核完成、为什么被驳回又重新提交）
- 发起人/审批人追溯某次驳回的具体原因
- 管理员评估节点耗时与驳回率

**目标：** 在 PlanDetail 内将"审批轨迹"卡片升级为**方案生命周期时间轴**，覆盖从创建到当前/发布状态的全部关键事件。

## 2. 范围

**包含：**
- 新增后端事件聚合端点 `GET /api/plans/:id/events`
- 新增前端组件 `PlanLifecycleTimeline.vue`
- PlanDetail 替换原"审批轨迹"卡片
- 事件类型扩展为 11 种（见第 3 节）
- 顶部统计行（总耗时、节点数、驳回次数）
- 事件类型过滤
- 驳回事件高亮

**不包含（YAGNI）：**
- 全站审批事件流（多方案聚合视图）
- 我的审批历史（个人维度）
- 事件导出/分享
- 事件评论/回复

## 3. 事件类型（11 种，3 表聚合）

数据来源：`AuditLog` + `AIReport` + `ApprovalTask` + `Plan`（推断）。

| type 常量 | 中文标签 | 数据源 | 触发动作 | 图标 | 颜色 |
|---|---|---|---|---|---|
| `PLAN_CREATED` | 方案创建 | `AuditLog: PLAN_CREATE` | POST /plans | 📝 | 灰 |
| `PLAN_UPDATED` | 方案编辑 | `AuditLog: PLAN_UPDATE` | PUT /plans/:id | ✏️ | 灰 |
| `FILE_UPLOADED` | 文件上传 | `AuditLog: PLAN_UPLOAD` | POST /plans/:id/file | 📤 | 蓝 |
| `AI_COMPLIANCE_SUCCESS` | AI 合规性审核完成 | `AIReport: COMPLIANCE+SUCCESS`（最新） | runComplianceAudit | 🤖 | 紫 |
| `AI_COMPLIANCE_FAILED` | AI 合规性审核失败 | `AIReport: COMPLIANCE+FAILED`（最新） | 同上 | 🤖⚠️ | 红 |
| `AI_GANGLUO_SUCCESS` | 岗课赛证分析完成 | `AIReport: GANGLUO+SUCCESS`（最新） | runGangluoAudit | 🧬 | 紫 |
| `AI_GANGLUO_FAILED` | 岗课赛证分析失败 | `AIReport: GANGLUO+FAILED`（最新） | 同上 | 🧬⚠️ | 红 |
| `PLAN_SUBMITTED` | 提交审批 | `AuditLog: PLAN_SUBMIT` | POST /plans/:id/submit | ⬆ | 黄 |
| `TASK_APPROVED` | 节点同意 | `AuditLog: TASK_APPROVE` + `ApprovalTask` | POST /tasks/:id/approve | ✓ | 绿 |
| `TASK_REJECTED` | 节点驳回 | `AuditLog: TASK_REJECT` + `ApprovalTask` | POST /tasks/:id/reject | ✗ | **红（高亮）** |
| `PLAN_PUBLISHED` | 方案发布 | `Plan.publishedAt`（推断） | 到达 END 节点时由引擎写入 | 🎉 | 绿 |

**去重规则：**
- 同维度 AI 报告若有多条（重试）→ 只取 `finishedAt` 最新的一条
- AuditLog 同 action + 同一秒 → 取最新一条
- `PLAN_PUBLISHED` 仅在 `Plan.publishedAt` 非空时生成

## 4. 数据模型

**不新增数据库表。** 仅在后端服务层做查询聚合。

事件结构（API 响应）：
```typescript
interface PlanEvent {
  id: string;                      // `${type}-${refId}`，用于 v-for key
  type: string;                    // 见上表 type 常量
  timestamp: string;               // ISO 8601
  actor: {                        // 操作人（可空：AI 事件、计划事件）
    id: number;
    name: string;
    role: string;                  // TEACHER | DEAN | ACADEMIC | PRESIDENT | ADMIN
  } | null;
  summary: string;                // 一句话描述
  details: {                      // 类型相关详情
    nodeName?: string;            // TASK_*
    comment?: string;
    duration?: string;            // 处理耗时（自然语言）
    score?: number;               // AI_*
    summary?: string;             // AI 摘要
    fileName?: string;            // FILE_UPLOADED
    fileSize?: number;
  } | null;
  refType: 'plan' | 'task' | 'ai_report' | 'file';
  refId: number;
}
```

**统计字段：**
```typescript
interface EventStats {
  totalDuration: string;          // 创建到最新事件的时长，例 "3天5小时"
  nodeDurations: Array<{          // 节点处理耗时明细
    nodeName: string;
    approver: string;
    duration: string;
  }>;
  rejectedCount: number;
  approvedCount: number;
  publishedAt: string | null;
}
```

## 5. API 设计

**新增端点：** `GET /api/plans/:id/events`

**权限：** `authRequired` + `planVisibilityWhere(user)`（与详情接口同级别）。

**响应：**
```json
{
  "events": [ ... ],
  "stats": { ... }
}
```

**实现：** 在 `backend/src/services/planEvents.js`（新文件）实现 `aggregatePlanEvents(planId)` 同步函数，3 次 Prisma 查询（AuditLog + AIReport + ApprovalTask）后内存合并排序。

**错误码：**
- 404：方案不存在或无权限
- 401：未登录

## 6. 前端设计

### 6.1 组件：`PlanLifecycleTimeline.vue`

**位置：** `frontend/src/components/PlanLifecycleTimeline.vue`

**Props：**
```javascript
defineProps({
  planId: { type: Number, required: true },
});
```

**内部状态：**
- `events: PlanEvent[]`
- `stats: EventStats`
- `loading: boolean`
- `filterType: string`（默认 `''` = 全部）

**布局：**
```
┌────────────────────────────────────────────────────┐
│ 📅 方案生命周期          [全部 ▼]                  │
│ 总耗时 3天5小时 · 通过 4 节点 · 驳回 0 次          │
├────────────────────────────────────────────────────┤
│ ● 2026-06-16 18:30:45   ✓ 李院长 · DEAN         │  ← 绿
│ │ 院长审核 通过                                    │
│ │ 💬 "材料齐全，同意进入下一节点"                  │
│ │ ⏱ 耗时 2小时                                    │
│ │                                                  │
│ ● 2026-06-16 16:00:00   ⬆ 张老师 · TEACHER      │  ← 黄
│ │ 提交审批                                         │
│ │                                                  │
│ ● 2026-06-16 15:45:12   🤖 AI 合规性审核完成     │  ← 紫
│ │ 得分 85 · "整体合规，建议加强 AI 课程"          │
│ │                                                  │
│ ... (倒序)                                          │
└────────────────────────────────────────────────────┘
```

**驳回高亮样式：** 整行背景 `#fef0f0`，左侧色条 3px 红。

**过滤下拉选项：**
- 全部
- 审批事件（APPROVED + REJECTED）
- AI 事件（4 种 AI_*）
- 提交/创建（SUBMITTED + CREATED）
- 文件事件
- 驳回事件（仅驳回）

### 6.2 PlanDetail 集成

替换 `PlanDetail.vue` 中"审批轨迹"卡片（约第 297-331 行）：
```vue
<el-card class="box-card" style="margin-top: 12px">
  <template #header>
    <span style="font-weight: 600">📅 方案生命周期</span>
  </template>
  <PlanLifecycleTimeline :plan-id="plan.id" />
</el-card>
```

**保留：** 原审批操作栏（同意/驳回按钮 + 评论输入）下移到时间轴下方同一卡片内。

## 7. 实施步骤

| # | 任务 | 文件 | 估时 |
|---|---|---|---|
| 1 | 编写 `aggregatePlanEvents()` 聚合函数 | `backend/src/services/planEvents.js`（新） | 30min |
| 2 | 新增 `GET /api/plans/:id/events` 路由 | `backend/src/routes/plans.js` | 15min |
| 3 | 编写 API 封装 | `frontend/src/api/planEvents.js`（新） | 10min |
| 4 | 实现 `PlanLifecycleTimeline.vue` | `frontend/src/components/PlanLifecycleTimeline.vue`（新） | 1.5h |
| 5 | 集成到 PlanDetail.vue，移除旧审批轨迹卡片 | `frontend/src/views/PlanDetail.vue` | 20min |
| 6 | 样式调优（驳回高亮、过滤下拉、stats 行） | 同上 | 20min |
| 7 | E2E：3 角色 × 完整生命周期（创建→提交→AI→同意→发布→驳回再提交） | - | 30min |

总计 ~3.5 小时。

## 8. 风险与边界

| 风险 | 缓解 |
|---|---|
| AI 同维度多报告（重试）→ 事件重复 | `findFirst` 按 finishedAt desc 取最新 |
| AuditLog `userId` 为空（系统动作） | `actor` 字段允许 `null`，UI 显示"系统" |
| 老方案无 `workflowSnapshot` | 走内置 4 步流程的 ApprovalTask，事件仍正确 |
| 节点耗时计算跨天 | 用 `dayjs` 库，输出 "3天5小时" / "5小时" / "30分钟" |
| 大量事件导致页面卡顿 | 一次性返回，前端分页显示（如 > 50 条分页） |

## 9. 验收标准

**E2E 路径（按顺序）：**
1. `teacher_zhang` 创建方案 → 时间轴出现 `PLAN_CREATED`
2. 上传 docx → 出现 `FILE_UPLOADED`，文件大小正确
3. 触发 AI 审核 → 出现 `AI_COMPLIANCE_SUCCESS`，得分正确
4. 提交审批 → 出现 `PLAN_SUBMITTED`
5. `dean_li` 同意 → 出现 `TASK_APPROVED`，actor = 李院长
6. `academic_wang` 同意 → 出现 `TASK_APPROVED`
7. `president_zhao` 同意 → 出现 `TASK_APPROVED` + `PLAN_PUBLISHED`
8. 验证总耗时统计正确
9. 验证驳回场景：方案回到 DRAFT 后，新一轮提交产生 `PLAN_SUBMITTED`（非重复）

**UI 验收：**
- 事件按时间倒序
- 驳回事件视觉高亮
- 过滤下拉切换正常
- 点击事件可滚动到对应区块（如 AI 事件 → AI 报告卡片）

## 10. 不在本次范围

- 全站审批事件流
- 我的审批历史
- 事件导出/分享
- 事件评论/回复
- 移动端专属布局
