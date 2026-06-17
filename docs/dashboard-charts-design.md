# Dashboard 数据图表设计 Spec

> 日期：2026-06-15
> 状态：待用户 review
> 模块：Dashboard 数据图表

## 1. 目标

为 `Dashboard.vue` 在保留现有 4 个数字卡片的基础上，新增 **5 个 ECharts 可视化**，让教务、校长、院长、教师四类角色在首屏即可掌握方案运营情况：提交/发布趋势、各院系分布、状态构成、审批瓶颈。

## 2. 范围

### In Scope

- 后端：5 个新的聚合 API（见 §6）
- 前端：Dashboard.vue 改造，引入 echarts + vue-echarts
- 4 个数字卡片语义保持不变（方案总数/审批中/已发布/我的待办）
- 数据隔离：复用现有 `planVisibilityWhere(req.user)` 规则

### Out of Scope

- 不改 Prisma schema（所有数据可从 Plan / Task / Department / User 现有字段聚合）
- 不做图表导出（PNG/PDF）
- 不做实时刷新（首屏加载 + 30 秒轮询已通过通知中心实现）
- 不做图表下钻（点击柱状图进入方案列表）—— 后续迭代再加

## 3. 图表清单

| # | 图表 | 类型 | 数据源 | 维度 |
|---|------|------|--------|------|
| 1 | 折线图 | line | Plan.createdAt | 提交 + 发布 双线 |
| 2 | 柱状图 | bar | Plan.groupBy(department) | 各院系方案数（TOP 10） |
| 3 | 饼图 | pie | Plan.groupBy(status) | 状态分布 |
| 4 | 漏斗图 | funnel | Task.groupBy(currentNode) | 院长/教务/校长 待办积压 |
| 5 | 数字卡片 | text | Plan + Task | 4 个数（保留） |

## 4. 布局

第一行：4 个数字卡片（el-col span=6，保留现有样式）

第二行：2×2 网格（el-col span=12 × 4）
- 左上：折线图（提交+发布趋势）
- 右上：柱状图（院系分布）
- 左下：饼图（状态分布）
- 右下：漏斗图（角色待办积压）

第三行：原结构保留
- 左 14 列：最近方案表格
- 右 10 列：我的待办 / 系统说明

## 5. 折线图时间粒度

时间切换器：**7 天 / 30 天 / 90 天 / 180 天 / 1 年**（默认 30 天）

| range | 跨度 | 聚合粒度 | 预计点数 |
|-------|------|----------|----------|
| 7d | 7 天 | day | 7 |
| 30d | 30 天 | day | 30 |
| 90d | 90 天 | week | ~13 |
| 180d | 180 天 | week | ~26 |
| 1y | 365 天 | month | 12 |

后端响应附加 `granularity` 字段，前端按粒度渲染 X 轴。

## 6. 后端 API 设计

### 6.1 GET /api/dashboard/summary

返回 4 个数字（替代现有前端在 plans 数组上手动过滤的方式）

```json
{
  "total": 42,
  "inReview": 15,
  "published": 20,
  "myTasks": 3
}
```

权限：通过 `planVisibilityWhere` 过滤后统计；`myTasks` 走 `req.user.id`。

### 6.2 GET /api/dashboard/trend?range=7d|30d|90d|180d|1y

按时间桶聚合每天/周/月的提交与发布数。

```json
{
  "range": "30d",
  "granularity": "day",
  "buckets": [
    { "key": "2026-05-16", "submitted": 1, "published": 0 },
    { "key": "2026-05-17", "submitted": 0, "published": 2 }
  ]
}
```

实现：用 `prisma.plan.groupBy` 按 `createdAt`/`publishedAt` 的日期截断做聚合；用 JS 在 Node 侧做补 0（保证 X 轴连续）。

### 6.3 GET /api/dashboard/by-department

按院系统计方案数（TOP 10）。

```json
[
  { "departmentId": 1, "departmentName": "智能制造学院", "count": 12 },
  { "departmentId": 2, "departmentName": "信息技术学院", "count": 9 }
]
```

实现：`prisma.plan.groupBy({ by: ['departmentId'], where, _count: true })` + JOIN 院系名。

### 6.4 GET /api/dashboard/by-status

按状态统计。

```json
{
  "DRAFT": 5,
  "DEPT_REVIEW": 4,
  "ACADEMIC_REVIEW": 3,
  "PRESIDENT_REVIEW": 2,
  "PUBLISHED": 20,
  "REJECTED": 8
}
```

### 6.5 GET /api/dashboard/funnel

按当前审批角色统计待办积压量。

```json
{
  "stages": [
    { "name": "院长待办", "value": 4 },
    { "name": "教务待办", "value": 3 },
    { "name": "校长待办", "value": 2 }
  ]
}
```

实现：根据 `Task` 表的 `currentNode`（DEAN/ACADEMIC/PRESIDENT）+ `status=ACTIVE` 过滤后按节点 groupBy。

## 7. 数据隔离规则

继承 `planVisibilityWhere(req.user)`：

| 角色 | 数据范围 |
|------|----------|
| TEACHER | 自己 createdById=req.user.id 的方案 |
| DEAN | 本院系 departmentId=req.user.departmentId 的方案 |
| ACADEMIC | 全平台方案 |
| PRESIDENT | 全平台方案 |

我的待办 / 角色漏斗：直接按 `req.user.role` 过滤自己节点的 task，不受部门限制（教师无 funnel 数据，返回 0）。

## 8. 前端实现

### 8.1 新增依赖

```bash
cd frontend
npm i echarts@^5.5 vue-echarts@^7.0
```

按需引入（减小 bundle）：

```js
// main.js
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, PieChart, FunnelChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent,
  TitleComponent, DatasetComponent
} from 'echarts/components'
use([CanvasRenderer, LineChart, BarChart, PieChart, FunnelChart,
     GridComponent, TooltipComponent, LegendComponent, TitleComponent, DatasetComponent])
```

### 8.2 组件拆分

```
views/Dashboard.vue
├── components/charts/SummaryCards.vue       (4 数字)
├── components/charts/TrendChart.vue         (折线)
├── components/charts/DepartmentChart.vue    (柱状)
├── components/charts/StatusChart.vue        (饼图)
├── components/charts/FunnelChart.vue        (漏斗)
└── (原) 最近方案 / 我的待办 / 系统说明
```

每个 chart 组件 props: `loading: boolean`，内部 useECharts() ref。

### 8.3 状态管理

不需要新建 store，5 个接口在 Dashboard.vue `onMounted` 并行请求：

```js
const [summary, trend, dept, status, funnel] = await Promise.all([
  request.get('/dashboard/summary'),
  request.get('/dashboard/trend?range=30d'),
  request.get('/dashboard/by-department'),
  request.get('/dashboard/by-status'),
  request.get('/dashboard/funnel'),
])
```

TrendChart 的时间切换：本地 ref + 重新请求 `/trend?range=xxx`。

## 9. 错误处理

- 5 个接口全部 try/catch，单个失败不影响其他图表渲染
- 任一失败 → 对应 ChartCard 显示"加载失败，点击重试"
- 全局 loading 状态：所有 5 个接口都完成才隐藏骨架屏

## 10. 测试 / 验收

### 后端

```bash
# 1. 启动服务 + seed
cd backend && npm run dev

# 2. 登录获取 token
curl -X POST localhost:3001/api/auth/login -H "Content-Type: application/json" \
  -d '{"username":"academic_wang","password":"123456"}'

# 3. 验证 5 个端点（每个 200 + 字段齐全）
curl -H "Authorization: Bearer <token>" localhost:3001/api/dashboard/summary
curl -H "Authorization: Bearer <token>" "localhost:3001/api/dashboard/trend?range=30d"
curl -H "Authorization: Bearer <token>" localhost:3001/api/dashboard/by-department
curl -H "Authorization: Bearer <token>" localhost:3001/api/dashboard/by-status
curl -H "Authorization: Bearer <token>" localhost:3001/api/dashboard/funnel
```

### 前端 E2E（agent-browser）

1. 登录 academic_wang
2. 访问 /dashboard
3. 截图：4 数字 + 2×2 图表 + 下方表格/待办
4. 切换 trend range 到 1y，截图
5. 登出，登录 teacher_zhang
6. 验证 funnel 显示"暂无数据"，趋势图只显示自己提交的方案

### 角色隔离验证

| 角色 | 方案总数 | by-department | funnel |
|------|----------|---------------|--------|
| academic_wang | ≥ 全部 | 全部院系 | 3 角色 |
| dean_li | 1 院系 | 1 院系 | 仅"院长待办" |
| teacher_zhang | 自己的 | 仅自己院系 | 0 / 提示"无审批权限" |

## 11. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 测试数据稀疏，图表看起来空 | 趋势图 5 档范围切换 + 数值"0"也展示 |
| 5 个接口首屏慢 | 并行 Promise.all + 骨架屏 |
| ECharts 全量引入 bundle 太大 | 按需 import（4 chart + 5 component） |
| 时间桶补 0 逻辑出错 | 单独抽 `bucketize(records, range, granularity)` 纯函数 + 单元测试 |
| Funnel 对教师无意义 | 组件内部判断 role，返回 0 时显示"您无审批权限" |

## 12. 实施任务

1. 后端新建 `backend/src/routes/dashboard.js`，5 个端点 + 权限中间件
2. 在 `backend/src/index.js` 注册路由
3. 前端 `npm i echarts vue-echarts`，main.js 按需注册
4. 新建 `frontend/src/components/charts/` 5 个子组件
5. 重写 `frontend/src/views/Dashboard.vue` 使用新组件
6. agent-browser E2E 验证 4 个角色
7. 截图归档
