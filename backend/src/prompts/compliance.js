const { retrieveRelevantPolicy } = require('../services/policyRag');

/** 截断文本到最大字符数 */
function truncate(text, max = 8000) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n...(已截断)';
}

/**
 * 构建政策合规性审核的 Prompt
 */
function buildCompliancePrompt({ planName, sections, rawText }) {
  const policy = retrieveRelevantPolicy('学时 学分 实践 公共基础 选修 岗课赛证');

  const systemPrompt = `你是一名资深的高职教育审核专家，擅长依据教育部《职业院校专业人才培养方案制订与实施工作的指导意见》对培养方案进行政策合规性审核。

你的输出必须是一个严格合法的 JSON 对象，不要包含任何额外文字、注释或 Markdown 标记。结构如下：
{
  "score": 0-100 之间的整数,
  "summary": "整体评价，1-2 句话",
  "compliance_items": [
    {
      "name": "检查项名称",
      "status": "PASS" | "WARN" | "FAIL",
      "actual": "方案中的实际情况（若无法判断填'未提及'）",
      "required": "政策要求的数值或条件",
      "suggestion": "修改建议（PASS 时可空字符串）"
    }
  ],
  "highlights": ["亮点 1", "亮点 2"],
  "risks": ["风险点 1", "风险点 2"]
}

合规性检查项至少包括：
1. 总学时是否在 2500-3000 之间
2. 总学分是否不超过 170
3. 公共基础课学时占比是否 ≥ 25%
4. 实践教学学时占比是否 ≥ 50%
5. 选修课学时比例是否 ≥ 10%
6. 是否包含思想政治、体育、心理健康等公共基础必修课
7. 是否设置顶岗实习环节
8. 是否体现"岗课赛证"融通思想
9. 是否引入 AI/大数据/云计算等新一代信息技术相关课程
10. 课程体系是否能覆盖产业最新需求`;

  const userPrompt = `# 培养方案名称
${planName}

# 已识别的关键章节
${JSON.stringify(sections, null, 2)}

# 政策依据（节选）
${policy}

# 培养方案全文（已截断）
${truncate(rawText, 6000)}

请按系统要求输出 JSON。`;

  return { system: systemPrompt, user: userPrompt };
}

module.exports = { buildCompliancePrompt };
