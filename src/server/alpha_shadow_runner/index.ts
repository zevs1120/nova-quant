import { randomUUID } from 'node:crypto';
import type {
  AlphaCandidateRecord,
  AlphaShadowObservationRecord,
  ExecutionRecord,
  Market,
  SignalContract,
  Timeframe,
} from '../types.js';
import type { MarketRepository } from '../db/repository.js';
import { decodeSignalContract } from '../quant/service.js';
import { parseAlphaCandidateRecord } from '../alpha_registry/index.js';

type RuntimeOverlay = {
  block: boolean;
  confidence_multiplier: number;
  weight_multiplier: number;
  notes: string[];
  applied_candidates: Array<{
    alpha_id: string;
    status: AlphaCandidateRecord['status'];
    action: 'APPROVE' | 'BLOCK' | 'BOOST' | 'CUT' | 'WATCH';
    alignment_score: number;
  }>;
};

type ShadowDecision = {
  action: AlphaShadowObservationRecord['shadow_action'];
  alignment: number;
  adjustedConfidence: number;
  suggestedWeightMultiplier: number;
  notes: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function latestExecutionForSignal(executions: ExecutionRecord[], signalId: string) {
  return (
    executions.find(
      (row) => row.signal_id === signalId && (row.action === 'DONE' || row.action === 'CLOSE'),
    ) || null
  );
}

function timeframeToMs(timeframe: string): number {
  const raw = String(timeframe || '')
    .trim()
    .toLowerCase();
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return 86_400_000;
  if (raw.endsWith('m')) return value * 60_000;
  if (raw.endsWith('h')) return value * 3_600_000;
  if (raw.endsWith('d')) return value * 86_400_000;
  return 86_400_000;
}

function normalizeTimeframe(timeframe: string): Timeframe | null {
  const normalized = String(timeframe || '').trim();
  if (
    normalized === '1m' ||
    normalized === '5m' ||
    normalized === '15m' ||
    normalized === '1h' ||
    normalized === '1d'
  ) {
    return normalized;
  }
  return null;
}

function replayHorizonBars(
  candidate: ReturnType<typeof parseAlphaCandidateRecord>,
  signal: SignalContract,
): number {
  const matches = String(candidate.intended_holding_period || '')
    .match(/\d+/g)
    ?.map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item) && item > 0);
  if (matches?.length) return Math.max(...matches);
  const tf = String(signal.timeframe || '').toLowerCase();
  if (tf.endsWith('d')) return 6;
  if (tf.endsWith('h')) return 12;
  if (tf.endsWith('m')) return 24;
  return 8;
}

function deriveReplayPnlPct(args: {
  repo: MarketRepository;
  candidate: ReturnType<typeof parseAlphaCandidateRecord>;
  signal: SignalContract;
}): number | null {
  const asset = args.repo.getAssetBySymbol(args.signal.market, args.signal.symbol);
  if (!asset) return null;

  const createdAtMs = Date.parse(args.signal.created_at);
  if (!Number.isFinite(createdAtMs)) return null;

  const timeframeMs = timeframeToMs(args.signal.timeframe);
  const normalizedTimeframe = normalizeTimeframe(args.signal.timeframe);
  if (!normalizedTimeframe) return null;
  const horizonBars = replayHorizonBars(args.candidate, args.signal);
  const lookbackStart = Math.max(0, createdAtMs - timeframeMs);
  const bars = args.repo
    .getOhlcv({
      assetId: asset.asset_id,
      timeframe: normalizedTimeframe,
      start: lookbackStart,
      limit: Math.max(horizonBars + 8, 24),
    })
    .map((row) => ({
      ts_open: row.ts_open,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
    }))
    .filter((row) => Number.isFinite(row.close) && row.close > 0);

  if (!bars.length) return null;

  const bounds = {
    low: Math.min(args.signal.entry_zone.low, args.signal.entry_zone.high),
    high: Math.max(args.signal.entry_zone.low, args.signal.entry_zone.high),
  };
  const isShort = String(args.signal.direction).toUpperCase() === 'SHORT';
  const stop = Number(args.signal.stop_loss.price);
  const takeProfit = Number(args.signal.take_profit_levels?.[0]?.price ?? NaN);

  const firstEligibleIndex = bars.findIndex((bar) => bar.ts_open + timeframeMs >= createdAtMs);
  if (firstEligibleIndex < 0) return null;

  let entryIndex = -1;
  let entryPrice = 0;
  for (let index = firstEligibleIndex; index < bars.length; index += 1) {
    const bar = bars[index];
    const marketEntry = String(args.signal.entry_zone.method).toUpperCase() === 'MARKET';
    const touched = bar.low <= bounds.high && bar.high >= bounds.low;
    if (!marketEntry && !touched) continue;
    entryIndex = index;
    entryPrice = marketEntry ? Number(bar.open || bar.close) : (bounds.low + bounds.high) / 2;
    break;
  }

  if (entryIndex < 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) return null;

  const lastResolvableIndex = Math.min(entryIndex + horizonBars, bars.length - 1);
  const isMature =
    bars.length - 1 >= entryIndex + horizonBars ||
    (Date.parse(args.signal.expires_at) || 0) <= Date.now() ||
    !['NEW', 'TRIGGERED'].includes(String(args.signal.status || '').toUpperCase());

  if (!isMature) return null;

  let exitPrice: number | null = null;
  for (let index = entryIndex; index <= lastResolvableIndex; index += 1) {
    const bar = bars[index];
    const stopHit = Number.isFinite(stop) ? (isShort ? bar.high >= stop : bar.low <= stop) : false;
    const takeProfitHit = Number.isFinite(takeProfit)
      ? isShort
        ? bar.low <= takeProfit
        : bar.high >= takeProfit
      : false;
    if (stopHit && takeProfitHit) {
      exitPrice = stop;
      break;
    }
    if (stopHit) {
      exitPrice = stop;
      break;
    }
    if (takeProfitHit) {
      exitPrice = takeProfit;
      break;
    }
  }

  if (!Number.isFinite(exitPrice)) {
    exitPrice = bars[lastResolvableIndex]?.close ?? null;
  }
  if (!Number.isFinite(exitPrice) || !exitPrice || !entryPrice) return null;

  const pnlPct = isShort
    ? ((entryPrice - exitPrice) / entryPrice) * 100
    : ((exitPrice - entryPrice) / entryPrice) * 100;
  return round(pnlPct, 4);
}

function featureResonance(candidateFeatures: string[], signal: SignalContract) {
  const tags = new Set((signal.tags || []).map((item) => String(item).toLowerCase()));
  const newsTags = new Set(
    (signal.news_context?.factor_tags || []).map((item) => String(item).toLowerCase()),
  );
  const features = candidateFeatures.map((item) => String(item).toLowerCase());
  let score = 0;
  if (features.some((item) => item.includes('trend')) && String(signal.regime_id).includes('TREND'))
    score += 0.18;
  if (features.some((item) => item.includes('vol')) && signal.volatility_percentile >= 65)
    score += 0.16;
  if (
    features.some((item) => item.includes('liquidity') || item.includes('spread')) &&
    signal.cost_model.spread_bps <= 18
  )
    score += 0.14;
  if (
    features.some((item) => item.includes('funding') || item.includes('basis')) &&
    signal.market === 'CRYPTO'
  )
    score += 0.2;
  if (features.some((item) => tags.has(item))) score += 0.14;
  if (features.some((item) => newsTags.has(item))) score += 0.12;
  return clamp(score, 0, 1);
}

function regimeResonance(candidateRegimes: string[], signal: SignalContract) {
  if (!candidateRegimes.length) return 0.55;
  const regime = String(signal.regime_id || '').toLowerCase();
  const match = candidateRegimes.some((item) => regime.includes(String(item).toLowerCase()));
  return match ? 0.9 : 0.28;
}

function familyResonance(candidateFamily: string, signal: SignalContract) {
  const family = String(candidateFamily || '').toLowerCase();
  const signalFamily = String(signal.strategy_family || '').toLowerCase();
  if (family && signalFamily.includes(family)) return 0.92;
  if (family.includes('trend') && signal.regime_id === 'TREND') return 0.72;
  if (family.includes('mean') && signal.regime_id === 'RANGE') return 0.68;
  if (family.includes('volatility') && signal.volatility_percentile >= 70) return 0.7;
  if (family.includes('funding') && signal.market === 'CRYPTO') return 0.74;
  return 0.45;
}

function decideShadowAction(
  candidate: ReturnType<typeof parseAlphaCandidateRecord>,
  signal: SignalContract,
): ShadowDecision {
  const compatible = candidate.compatible_markets.includes(signal.market);
  if (!compatible) {
    return {
      action: 'WATCH' as const,
      alignment: 0,
      adjustedConfidence: signal.confidence,
      suggestedWeightMultiplier: 1,
      notes: ['market_not_compatible'],
    };
  }

  const family = familyResonance(candidate.family, signal);
  const regime = regimeResonance(candidate.regime_constraints, signal);
  const features = featureResonance(candidate.feature_dependencies, signal);
  const base = clamp(family * 0.36 + regime * 0.34 + features * 0.3, 0, 1);

  if (candidate.integration_path === 'confidence_modifier') {
    if (base >= 0.74) {
      return {
        action: 'BOOST' as const,
        alignment: base,
        adjustedConfidence: round(clamp(signal.confidence * 1.08, 0.05, 0.99), 4),
        suggestedWeightMultiplier: 1.06,
        notes: ['confidence_overlay_positive'],
      };
    }
    if (base <= 0.4) {
      return {
        action: 'CUT' as const,
        alignment: base,
        adjustedConfidence: round(clamp(signal.confidence * 0.88, 0.05, 0.99), 4),
        suggestedWeightMultiplier: 0.9,
        notes: ['confidence_overlay_negative'],
      };
    }
  }

  if (candidate.integration_path === 'regime_activation_hint') {
    return {
      action: base >= 0.62 ? 'APPROVE' : 'BLOCK',
      alignment: base,
      adjustedConfidence: signal.confidence,
      suggestedWeightMultiplier: base >= 0.62 ? 1.02 : 0.82,
      notes: [base >= 0.62 ? 'regime_hint_aligned' : 'regime_hint_block'],
    };
  }

  if (candidate.integration_path === 'portfolio_weight_suggestion') {
    return {
      action: base >= 0.68 ? 'BOOST' : base <= 0.38 ? 'CUT' : 'WATCH',
      alignment: base,
      adjustedConfidence: signal.confidence,
      suggestedWeightMultiplier: base >= 0.68 ? 1.08 : base <= 0.38 ? 0.82 : 1,
      notes: ['weight_overlay'],
    };
  }

  return {
    action: base >= 0.58 ? 'APPROVE' : 'BLOCK',
    alignment: base,
    adjustedConfidence: signal.confidence,
    suggestedWeightMultiplier: base >= 0.58 ? 1 : 0,
    notes: [base >= 0.58 ? 'signal_input_aligned' : 'signal_input_rejected'],
  };
}

function overlayStrengthForStatus(status: AlphaCandidateRecord['status']) {
  if (status === 'PROD') return 1;
  if (status === 'CANARY') return 0.35;
  return 0;
}

function shouldTrackShadowObservation(decision: ShadowDecision) {
  return decision.alignment >= 0.42;
}

function shouldCountRealizedShadowPnl(action: AlphaShadowObservationRecord['shadow_action']) {
  return action === 'APPROVE' || action === 'BOOST';
}

export function applyAlphaRuntimeOverlays(args: {
  repo: MarketRepository;
  signal: SignalContract;
}): RuntimeOverlay {
  const active = args.repo
    .listAlphaCandidates({ limit: 80 })
    .filter((row) => row.status === 'CANARY' || row.status === 'PROD');

  let confidenceMultiplier = 1;
  let weightMultiplier = 1;
  let block = false;
  const notes: string[] = [];
  const appliedCandidates: RuntimeOverlay['applied_candidates'] = [];

  for (const row of active) {
    const candidate = parseAlphaCandidateRecord(row);
    const decision = decideShadowAction(candidate, args.signal);
    const strength = overlayStrengthForStatus(row.status);
    if (strength <= 0) continue;

    if (decision.action === 'BLOCK' && row.status === 'PROD') {
      block = true;
    }
    if (decision.action === 'BOOST') {
      confidenceMultiplier *=
        1 +
        (Math.max(decision.adjustedConfidence - args.signal.confidence, 0) /
          Math.max(args.signal.confidence, 0.01)) *
          strength;
      weightMultiplier *= 1 + (decision.suggestedWeightMultiplier - 1) * strength;
    }
    if (decision.action === 'CUT') {
      confidenceMultiplier *=
        1 -
        clamp(
          (args.signal.confidence - (decision.adjustedConfidence || args.signal.confidence)) /
            Math.max(args.signal.confidence, 0.01),
          0,
          0.35,
        ) *
          strength;
      weightMultiplier *=
        1 - clamp(1 - (decision.suggestedWeightMultiplier || 1), 0, 0.4) * strength;
    }
    notes.push(...decision.notes.map((item) => `${row.id}:${item}`));
    appliedCandidates.push({
      alpha_id: row.id,
      status: row.status,
      action: decision.action,
      alignment_score: decision.alignment,
    });
  }

  return {
    block,
    confidence_multiplier: round(clamp(confidenceMultiplier, 0.7, 1.15), 4),
    weight_multiplier: round(clamp(weightMultiplier, 0.65, 1.15), 4),
    notes: [...new Set(notes)],
    applied_candidates: appliedCandidates,
  };
}

export function summarizeAlphaShadowPerformance(repo: MarketRepository, alphaCandidateId: string) {
  const rows = repo.listAlphaShadowObservations({ alphaCandidateId, limit: 400 });
  const realized = rows.filter(
    (row) =>
      shouldCountRealizedShadowPnl(row.shadow_action) && Number.isFinite(row.realized_pnl_pct),
  );
  const series = realized.map((row) => Number(row.realized_pnl_pct || 0));
  const expectancy = series.length
    ? series.reduce((sum, value) => sum + value, 0) / series.length
    : null;
  let equity = 1;
  let peak = 1;
  let drawdown = 0;
  for (const value of series) {
    equity *= 1 + value / 100;
    peak = Math.max(peak, equity);
    drawdown = Math.min(drawdown, (equity - peak) / peak);
  }
  const mean = series.length ? series.reduce((sum, value) => sum + value, 0) / series.length : 0;
  const variance =
    series.length > 1
      ? series.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (series.length - 1)
      : 0;
  const sigma = Math.sqrt(Math.max(variance, 0));
  const sharpe =
    series.length > 1 && sigma > 0
      ? round((mean / sigma) * Math.sqrt(Math.min(series.length, 252)), 4)
      : null;
  return {
    sample_size: realized.length,
    expectancy: expectancy === null ? null : round(expectancy, 4),
    max_drawdown: realized.length ? round(Math.abs(drawdown), 4) : null,
    sharpe,
    approval_rate: rows.length
      ? round(
          rows.filter((row) => row.shadow_action === 'APPROVE' || row.shadow_action === 'BOOST')
            .length / rows.length,
          4,
        )
      : 0,
  };
}

export function runAlphaShadowCycle(args: {
  repo: MarketRepository;
  workflowRunId: string;
  userId: string;
}) {
  const shadowCandidates = args.repo.listAlphaCandidates({ status: 'SHADOW', limit: 120 });
  const signalRows = args.repo
    .listSignals({ status: 'ALL', limit: 180 })
    .filter((row) => row.created_at_ms >= Date.now() - 21 * 86_400_000);
  const signals = signalRows
    .map((row) => decodeSignalContract(row))
    .filter((row): row is SignalContract => Boolean(row));
  const executions = args.repo.listExecutions({ userId: args.userId, limit: 400 });
  const observations: AlphaShadowObservationRecord[] = [];

  for (const row of shadowCandidates) {
    const candidate = parseAlphaCandidateRecord(row);
    for (const signal of signals) {
      if (!candidate.compatible_markets.includes(signal.market)) continue;
      const decision = decideShadowAction(candidate, signal);
      if (!shouldTrackShadowObservation(decision)) continue;
      const execution = latestExecutionForSignal(executions, signal.id);
      const replayPnlPct = shouldCountRealizedShadowPnl(decision.action)
        ? execution?.pnl_pct ?? deriveReplayPnlPct({ repo: args.repo, candidate, signal })
        : null;
      observations.push({
        id: `alpha-shadow-${randomUUID()}`,
        alpha_candidate_id: row.id,
        workflow_run_id: args.workflowRunId,
        signal_id: signal.id,
        market: signal.market,
        symbol: signal.symbol,
        shadow_action: decision.action,
        alignment_score: round(decision.alignment, 4),
        adjusted_confidence: decision.adjustedConfidence ?? null,
        suggested_weight_multiplier: decision.suggestedWeightMultiplier ?? null,
        realized_pnl_pct: replayPnlPct,
        realized_source: execution?.mode ?? (replayPnlPct !== null ? 'ohlcv_replay' : null),
        payload_json: JSON.stringify({
          alpha_family: candidate.family,
          integration_path: candidate.integration_path,
          notes: decision.notes,
          signal_strategy_id: signal.strategy_id,
          signal_regime_id: signal.regime_id,
          signal_confidence: signal.confidence,
        }),
        created_at_ms: Date.now(),
        updated_at_ms: Date.now(),
      });
    }
  }

  args.repo.upsertAlphaShadowObservations(observations);

  const summary = shadowCandidates.map((row) => ({
    alpha_id: row.id,
    status: row.status,
    shadow: summarizeAlphaShadowPerformance(args.repo, row.id),
  }));

  return {
    candidates_processed: shadowCandidates.length,
    signals_evaluated: observations.length,
    summary,
  };
}
