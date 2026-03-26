import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { ensureSchema } from '../db/schema.js';
import { getDb } from '../db/database.js';
import { MarketRepository } from '../db/repository.js';
import type { AssetClass, Market, SignalContract, SignalPayload } from '../types.js';

type ModelSignalSide = 'LONG' | 'SHORT';

type ModelSignalIngress = {
  market: Market;
  symbol: string;
  side: ModelSignalSide;
  entry: number;
  stop: number;
  take1: number;
  take2?: number | null;
  risk: number;
  strategy: string;
  time: string;
  timeframe?: string;
  asset_class?: AssetClass;
  confidence?: number | null;
};

function requireModelToken(req: Request, res: Response): boolean {
  const expected = String(process.env.NOVA_MODEL_INGEST_TOKEN || '').trim();
  if (!expected) {
    res.status(503).json({ error: 'MODEL_INGEST_NOT_CONFIGURED' });
    return false;
  }

  const authHeader = String(req.header('authorization') || '').trim();
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerToken = String(req.header('x-model-token') || '').trim();
  const token = bearer || headerToken;
  if (!token || token !== expected) {
    res.status(401).json({ error: 'MODEL_UNAUTHORIZED' });
    return false;
  }
  return true;
}

function toMarket(value: unknown): Market | null {
  const market = String(value || '')
    .trim()
    .toUpperCase();
  if (market === 'US' || market === 'CRYPTO') return market;
  return null;
}

function toDirection(value: unknown): ModelSignalSide | null {
  const side = String(value || '')
    .trim()
    .toUpperCase();
  if (side === 'LONG' || side === 'SHORT') return side;
  return null;
}

function toAssetClass(market: Market, value?: unknown, symbol?: string): AssetClass {
  const next = String(value || '')
    .trim()
    .toUpperCase();
  if (next === 'US_STOCK' || next === 'CRYPTO' || next === 'OPTIONS') return next as AssetClass;
  // Infer OPTIONS from OCC symbol format: ROOT(1-6 alpha) + YYMMDD + C/P + 8-digit strike
  // Matches all strike prices including high-strike (e.g., SPX260619C01200000)
  if (
    market === 'US' &&
    symbol &&
    /^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(String(symbol).toUpperCase())
  ) {
    return 'OPTIONS';
  }
  return market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK';
}

function toTimeframe(value: unknown, market: Market) {
  const timeframe = String(value || '').trim();
  if (
    timeframe === '1m' ||
    timeframe === '5m' ||
    timeframe === '15m' ||
    timeframe === '1h' ||
    timeframe === '1d'
  ) {
    return timeframe;
  }
  return market === 'CRYPTO' ? '1h' : '1d';
}

function toFiniteNumber(value: unknown): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function toIso(value: unknown): string | null {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function normalizeStrategyKey(value: string) {
  return (
    String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'MODEL_PUSH'
  );
}

function inferPayload(market: Market): SignalPayload {
  if (market === 'CRYPTO') {
    return {
      kind: 'CRYPTO',
      data: {
        venue: 'BINANCE',
        instrument_type: 'PERP',
        perp_metrics: {
          funding_rate_current: 0,
          funding_rate_8h: 0,
          funding_rate_24h: 0,
          basis_bps: 0,
          basis_percentile: 50,
        },
        flow_state: {
          spot_led_breakout: false,
          perp_led_breakout: false,
          funding_state: 'NEUTRAL',
        },
        leverage_suggestion: {
          suggested_leverage: 1,
          capped_by_profile: true,
        },
      },
    };
  }
  return {
    kind: 'STOCK_SWING',
    data: {
      horizon: 'MEDIUM',
      catalysts: ['model_push'],
    },
  };
}

function buildSignalId(payload: ModelSignalIngress) {
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        payload.market,
        payload.symbol,
        payload.side,
        payload.entry,
        payload.stop,
        payload.take1,
        payload.take2 ?? null,
        payload.risk,
        payload.strategy,
        payload.time,
        payload.timeframe ?? null,
      ]),
    )
    .digest('hex')
    .slice(0, 20);
  return `mdl-${digest}`;
}

function mapIngressToSignal(payload: ModelSignalIngress): SignalContract {
  const createdAt = payload.time;
  const createdAtMs = Date.parse(createdAt);
  const timeframe = toTimeframe(payload.timeframe, payload.market);
  const expiresAtMs =
    createdAtMs + (timeframe === '1d' ? 1000 * 60 * 60 * 24 * 3 : 1000 * 60 * 60 * 12);
  const confidence = Math.min(0.95, Math.max(0.35, Number(payload.confidence ?? 0.62)));
  const direction = payload.side;
  const riskPct = Math.min(0.25, Math.max(0.0025, payload.risk));
  const strategyId = normalizeStrategyKey(payload.strategy);
  const takeProfitLevels = [
    {
      price: payload.take1,
      size_pct: payload.take2 ? 0.6 : 1,
      rationale: 'model_take1',
    },
  ];
  if (payload.take2) {
    takeProfitLevels.push({
      price: payload.take2,
      size_pct: 0.4,
      rationale: 'model_take2',
    });
  }

  const reward = Math.max(0.01, Math.abs(payload.take1 - payload.entry));
  const risk = Math.max(0.01, Math.abs(payload.entry - payload.stop));

  return {
    id: buildSignalId(payload),
    created_at: createdAt,
    expires_at: new Date(expiresAtMs).toISOString(),
    asset_class: toAssetClass(payload.market, payload.asset_class, payload.symbol),
    market: payload.market,
    symbol: payload.symbol,
    timeframe,
    strategy_id: strategyId,
    strategy_family: 'MODEL_PUSH',
    strategy_version: 'model-ingest.v1',
    regime_id: 'MODEL_PUSH',
    temperature_percentile: 50,
    volatility_percentile: 50,
    direction,
    strength: Math.round(confidence * 100),
    confidence,
    entry_zone: {
      low: payload.entry,
      high: payload.entry,
      method: 'LIMIT',
      notes: 'ingested_from_model_service',
    },
    invalidation_level: payload.stop,
    stop_loss: {
      type: 'STRUCTURE',
      price: payload.stop,
      rationale: 'model_stop',
    },
    take_profit_levels: takeProfitLevels,
    trailing_rule: {
      type: 'NONE',
      params: {},
    },
    position_advice: {
      position_pct: Number((riskPct * 100).toFixed(2)),
      leverage_cap: 1,
      risk_bucket_applied: 'MODEL_PUSH',
      rationale: 'model_service_push',
    },
    cost_model: {
      fee_bps: 2,
      spread_bps: payload.market === 'CRYPTO' ? 4 : 2,
      slippage_bps: payload.market === 'CRYPTO' ? 6 : 3,
      funding_est_bps: payload.market === 'CRYPTO' ? 0 : undefined,
    },
    expected_metrics: {
      expected_R: Number((reward / risk).toFixed(2)),
      hit_rate_est: Number(confidence.toFixed(2)),
      sample_size: 1,
    },
    explain_bullets: [
      `${payload.symbol} ${direction} signal from model service.`,
      `Entry ${payload.entry}, stop ${payload.stop}, take-profit ${payload.take1}${payload.take2 ? ` / ${payload.take2}` : ''}.`,
      `Risk budget ${Number((riskPct * 100).toFixed(2))}% of capital.`,
    ],
    execution_checklist: [
      'Confirm market is open.',
      'Respect stop-loss immediately.',
      'Do not bypass server risk controls.',
    ],
    tags: ['source:model_service', `strategy:${strategyId}`, `market:${payload.market}`],
    lineage: {
      market_data_mode: 'LIVE',
      performance_mode: 'UNAVAILABLE',
      validation_mode: 'LIVE',
      display_mode: 'LIVE',
      source_status: 'MODEL_PUSH',
      data_status: 'MODEL_PUSH',
      demo: false,
    },
    status: 'NEW',
    payload: inferPayload(payload.market),
    score: Math.round(confidence * 100),
    payload_version: 'model-signal.v1',
  };
}

function normalizeIngressBody(body: unknown): ModelSignalIngress[] {
  const rows = Array.isArray(body)
    ? body
    : Array.isArray((body as { signals?: unknown[] } | null | undefined)?.signals)
      ? (body as { signals: unknown[] }).signals || []
      : body
        ? [body]
        : [];

  return rows.map((item) => {
    const market = toMarket((item as { market?: unknown } | null | undefined)?.market);
    const direction = toDirection((item as { side?: unknown } | null | undefined)?.side);
    const entry = toFiniteNumber((item as { entry?: unknown } | null | undefined)?.entry);
    const stop = toFiniteNumber((item as { stop?: unknown } | null | undefined)?.stop);
    const take1 = toFiniteNumber((item as { take1?: unknown } | null | undefined)?.take1);
    const risk = toFiniteNumber((item as { risk?: unknown } | null | undefined)?.risk);
    const time = toIso((item as { time?: unknown } | null | undefined)?.time);
    const symbol = String((item as { symbol?: unknown } | null | undefined)?.symbol || '')
      .trim()
      .toUpperCase();
    const strategy = String(
      (item as { strategy?: unknown } | null | undefined)?.strategy || '',
    ).trim();

    if (
      !market ||
      !direction ||
      !entry ||
      !stop ||
      !take1 ||
      !risk ||
      !time ||
      !symbol ||
      !strategy
    ) {
      throw new Error('MODEL_SIGNAL_INVALID');
    }

    return {
      market,
      symbol,
      side: direction,
      entry,
      stop,
      take1,
      take2: toFiniteNumber((item as { take2?: unknown } | null | undefined)?.take2),
      risk,
      strategy,
      time,
      timeframe:
        String((item as { timeframe?: unknown } | null | undefined)?.timeframe || '').trim() ||
        undefined,
      asset_class: toAssetClass(
        market,
        (item as { asset_class?: unknown } | null | undefined)?.asset_class,
        symbol,
      ),
      confidence: toFiniteNumber((item as { confidence?: unknown } | null | undefined)?.confidence),
    };
  });
}

export async function handleModelSignalIngest(req: Request, res: Response) {
  if (!requireModelToken(req, res)) return;

  try {
    const rows = normalizeIngressBody(req.body);
    if (!rows.length) {
      res.status(400).json({ error: 'MODEL_SIGNAL_EMPTY' });
      return;
    }

    const db = getDb();
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const signals = rows.map(mapIngressToSignal);
    repo.upsertSignals(signals);

    res.status(200).json({
      ok: true,
      ingested: signals.length,
      signal_ids: signals.map((row) => row.id),
      received_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MODEL_SIGNAL_INGEST_FAILED';
    res.status(message === 'MODEL_SIGNAL_INVALID' ? 400 : 500).json({ error: message });
  }
}

export async function handleModelHeartbeat(req: Request, res: Response) {
  if (!requireModelToken(req, res)) return;
  res.status(200).json({
    ok: true,
    role: 'server',
    accepted_at: new Date().toISOString(),
  });
}
