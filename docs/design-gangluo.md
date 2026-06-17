# 岗课赛证 AI 分析 — 设计文档

> 版本: v0.1 · 日期: 2026-06-15 · 范围: 业务核心亮点模块

## 1. 目标

在 MVP 现有"政策合规性审核"基础上，新增"岗课赛证逻辑分析"维度，自动从 Word 文档抽取岗位/课程/赛项/证书 4 个列表，并交叉推理生成支撑矩阵，标识逻辑断裂与薄弱环节。

## 2. 数据流

```
[详情页] 点击"生成岗课赛证报告"
   ↓
POST /api/plans/:id/ai-gangluo (异步触发)
   ↓
aiAudit.runGangluoAudit(planId)
   ├─ 读取 plan.fileText 缓存（与合规性共享）
   ├─ 调用 prompts/gangluo.js 组装 Prompt
   ├─ 调用 mimo-v2.5-pro (max_tokens=4096)
   ├─ 解析强约束 JSON
   └─ 写入 ai_reports (dimension='GANGLUO')
   ↓
GET /api/plans/:id/ai-gangluo-report (前端 3s 轮询)
```

## 3. LLM 输出规范

### 3.1 JSON Schema

```json
{
  "score": 0-100 整数,
  "summary": "整体评价，1-2 句话",
  "dimensions": {
    "positions":  [{"name": "岗位名", "skills": ["技能点1", "技能点2"]}],
    "courses":    [{"name": "课程名", "category": "公共基础|专业基础|专业核心|专业拓展|实践教学"}],
    "certificates":[{"name": "证书名", "skills": ["考核技能点"]}],
    "competitions":[{"name": "赛项名", "topics": ["赛项主题"]}]
  },
  "score_breakdown": {
    "position_course":     0-100,
    "position_certificate":0-100,
    "position_competition":0-100,
    "internal_consistency": 0-100
  },
  "matrix": {
    "position_course":     [{"position": "...", "matches": [{"course":"...", "strength":"STRONG|MEDIUM|WEAK", "evidence": "..."}]}],
    "position_certificate":[{"position": "...", "matches": [{"certificate":"...", "strength":"...", "evidence": "..."}]}],
    "position_competition":[{"position": "...", "matches": [{"competition":"...", "strength":"...", "evidence": "..."}]}]
  },
  "gaps": [
    {"type": "MISSING_COURSE|MISSING_CERTIFICATE|MISSING_COMPETITION|WEAK_SUPPORT|INTERNAL_INCONSISTENCY",
     "target": "具体岗位/技能点",
     "severity": "HIGH|MEDIUM|LOW",
     "description": "详细说明"}
  ],
  "highlights": ["亮点 1", "亮点 2"]
}
```

### 3.2 强约束

- 输出必须严格 JSON，禁止 Markdown 代码块
- 每个维度 1-10 项，避免空数组
- 找不到的内容填 `[]`，禁止捏造
- 评分必须基于矩阵实际匹配情况

## 4. API

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/plans/:id/ai-gangluo` | 创建者本人 | 触发，3s 内返回 |
| GET  | `/api/plans/:id/ai-gangluo-report` | 全部可见者 | 查询，最新一份 |
| POST | `/api/plans/:id/ai-gangluo-retry` | 创建者本人 | 失败后重试 |

## 5. 前端 UI

### 5.1 触发
- 方案详情页新增独立卡片，位于「AI 政策合规性报告」下方
- 标题：`🤖 岗课赛证 AI 分析报告`
- 状态未生成时：显示大按钮 `🧬 生成岗课赛证报告`
- 状态进行中：进度提示 + 自动轮询
- 状态完成：进入报告视图
- 状态失败：显示错误 + 重试按钮

### 5.2 报告视图

**头部**：4 维支撑度雷达图 (SVG) + 总体得分 + 总评

**中部**：支撑矩阵（Tab 切换）
- 岗位×课程
- 岗位×证书
- 岗位×赛项

每行：岗位名 | 匹配项 | 严重度色标
- `STRONG` → 绿色 ✓
- `MEDIUM` → 黄色 ⚠
- `WEAK`  → 红色 ✗
- 整行 WEAK：浅红背景

**下部**：逻辑断裂与薄弱环节列表
- 严重度 HIGH：红色左边框
- 严重度 MEDIUM：黄色左边框
- 严重度 LOW：蓝色左边框

**最下**：亮点列表

## 6. 异常处理

- 3 次重试（间隔 5/10/15s）
- 仍失败 → 标记 FAILED，写入 errorMessage
- 不阻塞审批流
- 重新上传文件后需用户主动重新生成岗课赛证报告

## 7. 性能

- AI 推理：60-120s（受 LLM 影响）
- 输入：复用 plan.fileText 缓存，零额外解析
- 输出：限制 max_tokens=4096 防止过度消耗

## 8. 文件变更

### 新增
- `backend/src/prompts/gangluo.js`

### 修改
- `backend/src/services/aiAudit.js` — 新增 `runGangluoAudit()`
- `backend/src/routes/plans.js` — 新增 3 个端点
- `frontend/src/views/PlanDetail.vue` — 新增完整报告卡片
