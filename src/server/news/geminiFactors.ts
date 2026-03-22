import pLimit from 'p-limit';
import type { Market, NewsItemRecord } from '../types.js';
import { runNovaChatCompletion } from '../nova/client.js';
import { fetchWithRetry } from '../utils/http.js';
import { logWarn } from '../utils/log.js';

type GeminiHeadlineFactor = {
  id: string;
  sentiment_score: number;
  relevance_score: number;
  event_type: string;
  impact_horizon: 'immediate' | 'near_term' | 'medium_term';
  thesis: string;
};

type GeminiBatchFactors = {
  provider: 'gemini' | 'heuristic';
  symbol: string;
  market: Market;
  generated_at: string;
  summary: string;
  sentiment_score: number;
  event_risk_score: number;
  macro_policy_score: number;
  earnings_impact_score: number;
  trading_bias: 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL';
  factor_tags: string[];
  items: GeminiHeadlineFactor[];
};

type JsonObject = Record<string, unknown>;

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_NEWS_CONCURRENCY = Math.max(1, Number(process.env.GEMINI_NEWS_CONCURRENCY || 3));
const GEMINI_NEWS_MIN_REQUEST_GAP_MS = Math.max(0, Number(process.env.GEMINI_NEWS_MIN_REQUEST_GAP_MS || 350));
const GEMINI_NEWS_MAX_HEADLINES = Math.max(3, Number(process.env.GEMINI_NEWS_MAX_HEADLINES || 5));
const geminiNewsFactorQueue = pLimit(GEMINI_NEWS_CONCURRENCY);
let nextGeminiNewsRequestAtMs = 0;

const positiveTokens = ['beat', 'surge', 'growth', 'record', 'bullish', 'upgrade', 'approval', 'partnership', 'launch', 'buyback', 'wins', 'expands'];
const negativeTokens = ['miss', 'drop', 'lawsuit', 'downgrade', 'risk', 'probe', 'ban', 'hack', 'fraud', 'delay', 'cuts', 'warning', 'recall'];

const eventTypeMap: Array<{ type: string; tags: string[] }> = [
  { type: 'earnings', tags: ['earnings', 'guidance', 'revenue', 'eps', 'outlook', 'forecast'] },
  { type: 'analyst_rating', tags: ['upgrade', 'downgrade', 'target', 'analyst'] },
  { type: 'product_launch', tags: ['launch', 'release', 'product', 'chip', 'iphone', 'platform'] },
  { type: 'partnership', tags: ['partnership', 'deal', 'agreement', 'collaboration'] },
  { type: 'merger_acquisition', tags: ['acquisition', 'merger', 'buyout', 'takeover'] },
  { type: 'regulation', tags: ['regulation', 'regulator', 'antitrust', 'ban', 'approval', 'sec', 'ftc'] },
  { type: 'legal', tags: ['lawsuit', 'court', 'settlement', 'probe', 'investigation'] },
  { type: 'cybersecurity', tags: ['hack', 'breach', 'cyber', 'security'] },
  { type: 'macro', tags: ['fed', 'rates', 'inflation', 'tariff', 'macro', 'policy'] },
  { type: 'adoption', tags: ['adoption', 'demand', 'sales', 'orders', 'customers'] }
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function firstJsonObject(text: string): JsonObject | null {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as JsonObject;
  } catch {
    return null;
  }
}

function extractGeminiText(payload: unknown): string {
  const data = payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => String(part.text || ''))
      .filter(Boolean)
      .join('') || ''
  );
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => String(item || '').trim().toLowerCase().replace(/[^a-z0-9_:-]+/g, '_'))
        .filter(Boolean)
        .slice(0, 8)
    : [];
}

function normalizeBias(value: unknown): GeminiBatchFactors['trading_bias'] {
  const upper = String(value || '').trim().toUpperCase();
  if (upper === 'BULLISH' || upper === 'BEARISH' || upper === 'MIXED') return upper;
  return 'NEUTRAL';
}

function normalizeHorizon(value: unknown): GeminiHeadlineFactor['impact_horizon'] {
  const lower = String(value || '').trim().toLowerCase();
  if (lower === 'immediate' || lower === 'near_term' || lower === 'medium_term') return lower;
  return 'near_term';
}

function structuredFactorsEnabled() {
  return String(process.env.NOVA_NEWS_HEURISTIC_FACTORS_ENABLED || '1').trim().toLowerCase() !== '0';
}

function scoreHeadlineSentiment(text: string, baseLabel: NewsItemRecord['sentiment_label']) {
  const lower = text.toLowerCase();
  const pos = positiveTokens.filter((token) => lower.includes(token)).length;
  const neg = negativeTokens.filter((token) => lower.includes(token)).length;
  const labelBase =
    baseLabel === 'POSITIVE' ? 0.28 : baseLabel === 'NEGATIVE' ? -0.28 : baseLabel === 'MIXED' ? 0.04 : 0;
  return round(clamp(labelBase + pos * 0.12 - neg * 0.14, -1, 1));
}

function detectEventType(text: string) {
  const lower = text.toLowerCase();
  for (const rule of eventTypeMap) {
    if (rule.tags.some((tag) => lower.includes(tag))) {
      return rule.type;
    }
  }
  return 'other';
}

function eventTypeToHorizon(eventType: string): GeminiHeadlineFactor['impact_horizon'] {
  if (eventType === 'earnings' || eventType === 'analyst_rating' || eventType === 'legal' || eventType === 'regulation') {
    return 'immediate';
  }
  if (eventType === 'product_launch' || eventType === 'partnership' || eventType === 'adoption') {
    return 'medium_term';
  }
  return 'near_term';
}

function buildHeuristicNewsBatchFactors(args: {
  market: Market;
  symbol: string;
  rows: NewsItemRecord[];
}): GeminiBatchFactors | null {
  const items = args.rows.slice(0, GEMINI_NEWS_MAX_HEADLINES).map((row) => {
    const payload = parsePayload(row.payload_json);
    const summary = typeof payload.summary === 'string' ? payload.summary : '';
    const text = `${row.headline} ${summary}`.trim();
    const eventType = detectEventType(text);
    const sentimentScore = scoreHeadlineSentiment(text, row.sentiment_label);
    const relevanceScore = round(clamp(Math.max(Number(row.relevance_score || 0), eventType === 'other' ? 0.35 : 0.48), 0, 1));
    return {
      id: row.id,
      sentiment_score: sentimentScore,
      relevance_score: relevanceScore,
      event_type: eventType,
      impact_horizon: eventTypeToHorizon(eventType),
      thesis: (summary || row.headline).trim().slice(0, 180)
    } satisfies GeminiHeadlineFactor;
  });
  if (!items.length) return null;

  const avgSentiment = items.reduce((sum, row) => sum + row.sentiment_score, 0) / items.length;
  const riskEventTypes = new Set(['legal', 'regulation', 'cybersecurity', 'macro', 'merger_acquisition']);
  const macroTypes = new Set(['macro', 'regulation']);
  const earningsTypes = new Set(['earnings', 'analyst_rating']);
  const eventRiskScore = round(
    clamp(
      Math.max(...items.map((row) => (riskEventTypes.has(row.event_type) ? row.relevance_score : row.relevance_score * 0.55))),
      0,
      1
    )
  );
  const macroPolicyScore = round(
    clamp(
      items.filter((row) => macroTypes.has(row.event_type)).reduce((sum, row) => sum + row.relevance_score, 0) /
        Math.max(1, items.filter((row) => macroTypes.has(row.event_type)).length),
      0,
      1
    )
  );
  const earningsImpactScore = round(
    clamp(
      items.filter((row) => earningsTypes.has(row.event_type)).reduce((sum, row) => sum + row.relevance_score, 0) /
        Math.max(1, items.filter((row) => earningsTypes.has(row.event_type)).length),
      0,
      1
    )
  );
  const factorTags = Array.from(new Set(items.map((row) => row.event_type).filter((row) => row !== 'other'))).slice(0, 8);
  const positiveCount = items.filter((row) => row.sentiment_score >= 0.18).length;
  const negativeCount = items.filter((row) => row.sentiment_score <= -0.18).length;
  const tradingBias =
    avgSentiment >= 0.16 ? 'BULLISH' : avgSentiment <= -0.16 ? 'BEARISH' : positiveCount && negativeCount ? 'MIXED' : 'NEUTRAL';
  const biasLabel =
    tradingBias === 'BULLISH'
      ? 'headline flow is constructive'
      : tradingBias === 'BEARISH'
        ? 'headline flow is deteriorating'
        : tradingBias === 'MIXED'
          ? 'headline flow is mixed'
          : 'headline flow is balanced';

  return {
    provider: 'heuristic',
    symbol: args.symbol,
    market: args.market,
    generated_at: new Date().toISOString(),
    summary: `${args.symbol} ${biasLabel}; dominant drivers: ${factorTags.length ? factorTags.join(', ') : 'general news flow'}.`,
    sentiment_score: round(avgSentiment),
    event_risk_score: eventRiskScore,
    macro_policy_score: macroPolicyScore,
    earnings_impact_score: earningsImpactScore,
    trading_bias: tradingBias,
    factor_tags: factorTags,
    items
  };
}

function normalizeFactors(raw: JsonObject, market: Market, symbol: string): GeminiBatchFactors {
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  return {
    provider: 'gemini',
    symbol,
    market,
    generated_at: new Date().toISOString(),
    summary: String(raw.summary || '').trim().slice(0, 280),
    sentiment_score: round(clamp(toNumber(raw.sentiment_score, 0), -1, 1)),
    event_risk_score: round(clamp(toNumber(raw.event_risk_score, 0.2), 0, 1)),
    macro_policy_score: round(clamp(toNumber(raw.macro_policy_score, 0), 0, 1)),
    earnings_impact_score: round(clamp(toNumber(raw.earnings_impact_score, 0), 0, 1)),
    trading_bias: normalizeBias(raw.trading_bias),
    factor_tags: toStringArray(raw.factor_tags),
    items: itemsRaw
      .map((item) => {
        const row = item && typeof item === 'object' ? (item as JsonObject) : {};
        return {
          id: String(row.id || '').trim(),
          sentiment_score: round(clamp(toNumber(row.sentiment_score, 0), -1, 1)),
          relevance_score: round(clamp(toNumber(row.relevance_score, 0.35), 0, 1)),
          event_type: String(row.event_type || 'other').trim().toLowerCase().slice(0, 48) || 'other',
          impact_horizon: normalizeHorizon(row.impact_horizon),
          thesis: String(row.thesis || '').trim().slice(0, 180)
        } satisfies GeminiHeadlineFactor;
      })
      .filter((row) => row.id)
      .slice(0, 8)
  };
}

function sentimentLabelFromScore(score: number): NewsItemRecord['sentiment_label'] {
  if (score >= 0.2) return 'POSITIVE';
  if (score <= -0.2) return 'NEGATIVE';
  if (Math.abs(score) <= 0.08) return 'NEUTRAL';
  return 'MIXED';
}

function parsePayload(text: string | null | undefined): JsonObject {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as JsonObject;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function sanitizeGeminiFactorsText(args: {
  market: Market;
  symbol: string;
  rawText: string;
}): Promise<GeminiBatchFactors | null> {
  const rawText = String(args.rawText || '').trim();
  if (!rawText) return null;

  const completion = await runNovaChatCompletion({
    task: 'assistant_grounded_answer',
    systemPrompt: [
      'Convert the provided news-analysis text into exactly one strict JSON object.',
      'Return JSON only.',
      'Allowed keys: summary, sentiment_score, event_risk_score, macro_policy_score, earnings_impact_score, trading_bias, factor_tags, items.',
      'Each item must contain: id, sentiment_score, relevance_score, event_type, impact_horizon, thesis.'
    ].join(' '),
    userPrompt: JSON.stringify({
      market: args.market,
      symbol: args.symbol,
      raw_text: rawText
    }),
    temperature: 0,
    maxTokens: 900
  });

  const parsed = firstJsonObject(completion.text);
  return parsed ? normalizeFactors(parsed, args.market, args.symbol) : null;
}

export async function analyzeNewsBatchWithGemini(args: {
  market: Market;
  symbol: string;
  rows: NewsItemRecord[];
}): Promise<GeminiBatchFactors | null> {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || !args.rows.length) return null;

  const model = String(process.env.GEMINI_MODEL || '').trim() || 'gemini-2.5-flash';
  const endpoint = `${GEMINI_API_BASE_URL}/${model}:generateContent?key=${apiKey}`;
  const items = args.rows.slice(0, 4).map((row) => {
    const payload = parsePayload(row.payload_json);
    return {
      id: row.id,
      headline: row.headline,
      source: row.source,
      published_at: new Date(row.published_at_ms).toISOString(),
      summary: typeof payload.summary === 'string' ? payload.summary : null
    };
  });

  const prompt = [
    'You are a quant news factor extraction engine for Marvix.',
    'Convert the supplied market headlines into compact JSON for a lightweight trading model.',
    'Return strict JSON only with keys:',
    'summary, sentiment_score, event_risk_score, macro_policy_score, earnings_impact_score, trading_bias, factor_tags, items.',
    'items must be an array of objects with keys:',
    'id, sentiment_score, relevance_score, event_type, impact_horizon, thesis.',
    'Use sentiment_score in [-1,1]. Use the risk/impact/relevance fields in [0,1].',
    'Keep factor_tags short snake_case strings.',
    'If evidence is mixed or weak, stay neutral instead of forcing conviction.',
    JSON.stringify({
      market: args.market,
      symbol: args.symbol,
      headlines: items
    })
  ].join('\n');
  let lastUnparsedText = '';

  try {
    const completion = await runNovaChatCompletion({
      task: 'assistant_grounded_answer',
      systemPrompt: [
        'You are a quant news factor extraction engine for Marvix.',
        'Return exactly one JSON object and nothing else.',
        'Valid top-level keys: summary, sentiment_score, event_risk_score, macro_policy_score, earnings_impact_score, trading_bias, factor_tags, items.',
        'items must contain objects with keys: id, sentiment_score, relevance_score, event_type, impact_horizon, thesis.'
      ].join(' '),
      userPrompt: prompt,
      temperature: 0.1,
      maxTokens: 900
    });
    const parsed = firstJsonObject(completion.text);
    if (parsed) {
      return normalizeFactors(parsed, args.market, args.symbol);
    }
    lastUnparsedText = String(completion.text || '').trim();
    const sanitized = await sanitizeGeminiFactorsText({
      market: args.market,
      symbol: args.symbol,
      rawText: lastUnparsedText
    }).catch(() => null);
    if (sanitized) {
      return sanitized;
    }
  } catch {
    // fall back to the direct Gemini request below
  }

  const waitMs = Math.max(0, nextGeminiNewsRequestAtMs - Date.now());
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  nextGeminiNewsRequestAtMs = Date.now() + GEMINI_NEWS_MIN_REQUEST_GAP_MS;

  const requestPayloads = [
    {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 900,
        responseMimeType: 'application/json'
      }
    },
    {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${prompt}\nReturn only a single JSON object. Do not wrap it in markdown.`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 900
      }
    }
  ];

  for (const body of requestPayloads) {
    const response = await fetchWithRetry(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      },
      { attempts: 3, baseDelayMs: 1_500 },
      20_000
    );

    if (!response.ok) {
      continue;
    }

    const json = (await response.json()) as unknown;
    const text = extractGeminiText(json);
    const parsed =
      firstJsonObject(text) ||
      ((json && typeof json === 'object' && !Array.isArray(json) && 'summary' in (json as JsonObject) ? (json as JsonObject) : null));
    if (parsed) {
      return normalizeFactors(parsed, args.market, args.symbol);
    }
    if (text.trim()) {
      lastUnparsedText = text.trim();
      const sanitized = await sanitizeGeminiFactorsText({
        market: args.market,
        symbol: args.symbol,
        rawText: lastUnparsedText
      }).catch(() => null);
      if (sanitized) {
        return sanitized;
      }
    }
  }

  if (lastUnparsedText) {
    logWarn('Gemini factor parser could not coerce response into structured JSON', {
      market: args.market,
      symbol: args.symbol,
      sample: lastUnparsedText.slice(0, 180)
    });
  }

  return null;
}

export async function enrichNewsRowsWithGeminiFactors(args: {
  market: Market;
  symbol: string;
  rows: NewsItemRecord[];
}): Promise<NewsItemRecord[]> {
  return geminiNewsFactorQueue(async () => {
    const analysis =
      (await analyzeNewsBatchWithGemini(args).catch(() => null)) ||
      (structuredFactorsEnabled() ? buildHeuristicNewsBatchFactors(args) : null);
    if (!analysis) return args.rows;

    const itemById = new Map(analysis.items.map((row) => [row.id, row] as const));
    const now = Date.now();
    return args.rows.map((row) => {
      const payload = parsePayload(row.payload_json);
      const headlineFactor = itemById.get(row.id) || null;
      const nextPayload = {
        ...payload,
        gemini_analysis: {
          batch: analysis,
          headline: headlineFactor
        }
      };
      return {
        ...row,
        sentiment_label: headlineFactor ? sentimentLabelFromScore(headlineFactor.sentiment_score) : row.sentiment_label,
        relevance_score: headlineFactor ? headlineFactor.relevance_score : row.relevance_score,
        payload_json: JSON.stringify(nextPayload),
        updated_at_ms: now
      };
    });
  });
}

export type { GeminiBatchFactors, GeminiHeadlineFactor };
