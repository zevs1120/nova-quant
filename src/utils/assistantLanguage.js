const ZH_CHAR_RE = /[\u3400-\u9fff]/;

const SECTION_LABELS = {
  en: {
    VERDICT: 'VERDICT',
    PLAN: 'PLAN',
    WHY: 'WHY',
    RISK: 'RISK',
    EVIDENCE: 'EVIDENCE',
  },
  zh: {
    VERDICT: '结论',
    PLAN: '行动',
    WHY: '原因',
    RISK: '风险',
    EVIDENCE: '证据',
  },
};

const SECTION_ALIASES = {
  VERDICT: ['VERDICT', '结论', '判断', '结论建议', '今日判断'],
  PLAN: ['PLAN', '行动', '计划', '怎么做', '操作', '建议动作'],
  WHY: ['WHY', '原因', '为什么', '依据'],
  RISK: ['RISK', '风险', '风险提示'],
  EVIDENCE: ['EVIDENCE', '证据', '事实', '来源'],
};

const DISCLAIMERS = {
  en: 'educational, not financial advice',
  zh: '仅供教育参考，不构成投资建议',
};

function normalizeLanguage(value = 'en') {
  return String(value || '')
    .toLowerCase()
    .startsWith('zh')
    ? 'zh'
    : 'en';
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isChineseText(value) {
  return ZH_CHAR_RE.test(String(value || ''));
}

export function detectMessageLanguage(message, fallback = 'en') {
  if (isChineseText(message)) return 'zh';
  return normalizeLanguage(fallback);
}

export function getAssistantSectionLabels(language = 'en') {
  return SECTION_LABELS[normalizeLanguage(language)] || SECTION_LABELS.en;
}

export function getAssistantDisclaimer(language = 'en') {
  return DISCLAIMERS[normalizeLanguage(language)] || DISCLAIMERS.en;
}

export function appendAssistantDisclaimer(text, language = 'en') {
  const trimmed = String(text || '')
    .trim()
    .replace(/\n*\s*(educational, not financial advice|仅供教育参考，不构成投资建议)\s*$/i, '')
    .trim();
  if (!trimmed) return getAssistantDisclaimer(language);
  const disclaimer = getAssistantDisclaimer(language);
  return `${trimmed}\n\n${disclaimer}`;
}

export function formatStructuredAssistantReply({
  language = 'en',
  verdict = '',
  plan = [],
  why = [],
  risk = [],
  evidence = [],
  includeDisclaimer = true,
} = {}) {
  const labels = getAssistantSectionLabels(language);
  const body = [
    `${labels.VERDICT}: ${String(verdict || '').trim()}`.trim(),
    '',
    `${labels.PLAN}:`,
    ...plan.filter(Boolean).map((item) => `- ${item}`),
    '',
    `${labels.WHY}:`,
    ...why.filter(Boolean).map((item) => `- ${item}`),
    '',
    `${labels.RISK}:`,
    ...risk.filter(Boolean).map((item) => `- ${item}`),
    '',
    `${labels.EVIDENCE}:`,
    ...evidence.filter(Boolean).map((item) => `- ${item}`),
  ]
    .join('\n')
    .trim();

  return includeDisclaimer ? appendAssistantDisclaimer(body, language) : body;
}

export function parseAssistantSectionHeading(line) {
  const cleaned = String(line || '')
    .trim()
    .replace(/^#{1,3}\s*/, '');
  if (!cleaned) return null;

  for (const [key, aliases] of Object.entries(SECTION_ALIASES)) {
    for (const alias of aliases) {
      const match = cleaned.match(new RegExp(`^${escapeRegExp(alias)}\\s*[:：-]?\\s*(.*)$`, 'i'));
      if (match) {
        return {
          key,
          rest: String(match[1] || '').trim(),
        };
      }
    }
  }

  return null;
}
