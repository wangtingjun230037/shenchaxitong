const fs = require('fs');
const path = require('path');

const POLICY_FILE = path.join(__dirname, '..', 'policies', 'teaching-standards.txt');

let cachedPolicy = null;
function getPolicyText() {
  if (cachedPolicy !== null) return cachedPolicy;
  try {
    cachedPolicy = fs.readFileSync(POLICY_FILE, 'utf-8');
  } catch (e) {
    cachedPolicy = '';
  }
  return cachedPolicy;
}

/**
 * 简易 RAG：基于关键词的段落检索
 */
function retrieveRelevantPolicy(query, maxChars = 2000) {
  const text = getPolicyText();
  if (!text) return '';
  const keywords = ['学时', '学分', '公共基础', '实践', '选修', '实习', '产教', '岗课赛证', '评价'];
  const sentences = text.split(/[。\n]/).filter(Boolean);
  const scored = sentences.map((s) => {
    let score = 0;
    for (const k of keywords) if (s.includes(k)) score += 1;
    if (query) {
      for (const word of query.split(/\s+/).filter((w) => w.length > 1)) {
        if (s.includes(word)) score += 2;
      }
    }
    return { s: s.trim(), score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

  const picked = scored.slice(0, 8).map((x) => x.s).join('。');
  return (picked + '。').slice(0, maxChars);
}

module.exports = { getPolicyText, retrieveRelevantPolicy };
