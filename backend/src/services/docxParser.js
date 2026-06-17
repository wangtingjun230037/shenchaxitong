const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

/**
 * 提取 docx 纯文本
 */
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.docx') {
    const { value } = await mammoth.extractRawText({ path: filePath });
    return value;
  }
  if (ext === '.pdf') {
    // MVP 不解析 PDF 内容，AI 审核仅在 docx 触发
    return '';
  }
  return '';
}

/**
 * 章节切分：基于"X、Y、Z"等中文标题模式
 */
function splitSections(text) {
  if (!text) return {};
  // 匹配形如"一、培养目标" / "（一）培养目标" / "1. 培养目标" / "培养目标"
  const headingRegex = /[\n\r]([一二三四五六七八九十]+[、．]|[（(][一二三四五六七八九十]+[）)]|\d+[.．、])\s*([^\n\r]{2,30})/g;
  const sections = {};
  let m;
  const matches = [];
  while ((m = headingRegex.exec(text)) !== null) {
    matches.push({ index: m.index, title: m[2].trim(), prefix: m[1] });
  }
  if (matches.length === 0) return { _raw: text.slice(0, 8000) };

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const content = text.slice(start, end).trim();
    sections[matches[i].title] = content.slice(0, 4000);
  }
  return sections;
}

/**
 * 截断文本到最大 token 等价字符数
 */
function truncate(text, max = 8000) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n...(已截断)';
}

module.exports = { extractText, splitSections, truncate };
