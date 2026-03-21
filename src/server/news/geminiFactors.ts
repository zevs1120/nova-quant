import type { Market, NewsItemRecord } from '../types.js';

type GeminiHeadlineFactor = {
  id: string;
  sentiment_score: number;
  relevance_score: number;
  event_type: string;
  impact_horizon: 'immediate' | 'near_term' | 'medium_term';
  thesis: string;
};

type GeminiBatchFactors = {
  provider: 'gemini';
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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 900
      }
    })
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as unknown;
  const text = extractGeminiText(json);
  const parsed = firstJsonObject(text);
  if (!parsed) return null;
  return normalizeFactors(parsed, args.market, args.symbol);
}

export async function enrichNewsRowsWithGeminiFactors(args: {
  market: Market;
  symbol: string;
  rows: NewsItemRecord[];
}): Promise<NewsItemRecord[]> {
  const analysis = await analyzeNewsBatchWithGemini(args).catch(() => null);
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
}

export type { GeminiBatchFactors, GeminiHeadlineFactor };
