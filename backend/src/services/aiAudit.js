const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const prisma = require('../db');
const { extractText, splitSections } = require('./docxParser');
const { buildCompliancePrompt } = require('../prompts/compliance');
const { buildGangluoPrompt } = require('../prompts/gangluo');
const notify = require('./notification');

const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
  baseURL: config.anthropic.baseURL,
});

// 维度配置：定义每个维度的 Prompt 构建器、tokens 限制、文件文本最小长度
const DIMENSION_CONFIG = {
  COMPLIANCE: {
    buildPrompt: ({ planName, sections, rawText }) => buildCompliancePrompt({ planName, sections, rawText }),
    maxTokens: 2048,
  },
  GANGLUO: {
    buildPrompt: ({ planName, sections, rawText }) => buildGangluoPrompt({ planName, rawText }),
    maxTokens: 4096,
  },
};

/**
 * 调用 LLM 并解析 JSON 结果
 */
async function callLLM({ system, user, maxTokens = 2048, maxRetries = 3 }) {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await anthropic.messages.create({
        model: config.anthropic.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const text = (response.content || []).map((b) => b.text || '').join('');
      return extractJson(text);
    } catch (e) {
      lastErr = e;
      console.warn(`[AI] 第 ${i + 1} 次调用失败: ${e.message}`);
      await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
    }
  }
  throw lastErr;
}

function extractJson(text) {
  // 去除可能的 Markdown 代码块
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('LLM 返回非 JSON');
  try {
    return JSON.parse(m[0]);
  } catch (e) {
    throw new Error('LLM 返回 JSON 解析失败: ' + e.message);
  }
}

/**
 * 通用 AI 审核入口（按维度区分）
 * 流程：读取文件 → 提取文本 → Prompt 构建 → LLM → 写库
 */
async function runAudit(planId, dimension) {
  const cfg = DIMENSION_CONFIG[dimension];
  if (!cfg) throw new Error(`不支持的审核维度: ${dimension}`);

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) return;
  if (!plan.filePath) {
    await markFailed(planId, dimension, '方案未上传文档，无法进行 AI 审核');
    return;
  }

  // 找到/创建本维度的最新报告
  let report = await prisma.aIReport.findFirst({
    where: { planId, dimension },
    orderBy: { id: 'desc' },
  });
  if (report && report.status === 'RUNNING') {
    console.log(`[AI] 方案 ${planId} ${dimension} 审核已在进行中`);
    return;
  }
  if (!report) {
    report = await prisma.aIReport.create({
      data: { planId, dimension, status: 'PENDING' },
    });
  }

  try {
    await prisma.aIReport.update({
      where: { id: report.id },
      data: { status: 'RUNNING', startedAt: new Date(), errorMessage: null },
    });

    const text = plan.fileText || (await extractText(plan.filePath));
    if (!text || text.length < 50) {
      throw new Error('文档文本提取失败或内容过少（< 50 字符），可能非标准 Word 模板');
    }
    // 缓存文本
    if (!plan.fileText) {
      await prisma.plan.update({ where: { id: planId }, data: { fileText: text } });
    }
    const sections = splitSections(text);
    const { system, user } = cfg.buildPrompt({
      planName: plan.name,
      sections,
      rawText: text,
    });
    const result = await callLLM({ system, user, maxTokens: cfg.maxTokens });

    await prisma.aIReport.update({
      where: { id: report.id },
      data: {
        status: 'SUCCESS',
        resultJson: JSON.stringify(result),
        summary: result.summary,
        score: result.score,
        finishedAt: new Date(),
      },
    });
    console.log(`[AI] 方案 ${planId} ${dimension} 审核完成，得分 ${result.score}`);

    // 通知发起人：AI 审核完成
    const fullPlan = await prisma.plan.findUnique({ where: { id: planId } });
    if (fullPlan) {
      try {
        await notify.onAIReportDone(fullPlan, dimension, result.score);
      } catch (e) {
        console.warn('[AI] 通知创建失败（不影响审核）:', e.message);
      }
    }
  } catch (e) {
    console.error(`[AI] 方案 ${planId} ${dimension} 审核失败:`, e.message);
    await markFailed(planId, dimension, e.message, report.id);
  }
}

async function markFailed(planId, dimension, msg, reportId) {
  const data = { status: 'FAILED', errorMessage: msg, finishedAt: new Date() };
  if (reportId) {
    await prisma.aIReport.update({ where: { id: reportId }, data });
  } else {
    await prisma.aIReport.updateMany({ where: { planId, dimension }, data });
  }
}

// 兼容旧 API
const runComplianceAudit = (planId) => runAudit(planId, 'COMPLIANCE');
const runGangluoAudit    = (planId) => runAudit(planId, 'GANGLUO');

module.exports = { runAudit, runComplianceAudit, runGangluoAudit };
