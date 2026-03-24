import type {
  AssetClass,
  ExecutionRecord,
  Market,
  MarketStateRecord,
  SignalContract,
  UserHoldingInput,
  UserRiskProfileRecord,
} from '../types.js';
import { RUNTIME_STATUS, normalizeRuntimeStatus } from '../runtimeStatus.js';
import { getConfig } from '../config.js';
import {
  getDailyStanceCopy,
  getPortfolioActionLabel,
  getTodayRiskCopy,
} from '../../copy/novaCopySystem.js';
import { buildEvidenceLineage } from '../evidence/lineage.js';
import { evaluateRiskGovernor, type RiskGovernorOutcome } from '../risk/governor.js';

type UiSignal = Record<string, unknown>;
type EvidenceSignal = Record<string, unknown>;
type ActionCard = {
  action_id: string;
  signal_id: string | null;
  symbol: string | null;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  action: string;
  action_label: string;
  portfolio_intent: string;
  confidence: number;
  calibrated_confidence?: number;
  conviction_label: string;
  time_horizon: string;
  time_horizon_days: number | null;
  brief_why_now: string;
  brief_caution: string;
  risk_note: string;
  eligible: boolean;
  ranking_score: number;
  recommended_position_pct?: number | null;
  confidence_details?: Record<string, unknown> | null;
  governor?: RiskGovernorOutcome;
  evidence_lineage?: Record<string, unknown>;
  entry_zone: unknown;
  stop_loss: unknown;
  take_profit: unknown;
  strategy_source: string;
  strategy_backed: boolean;
  risk_bucket: RiskGovernorOutcome['governor_mode'];
  publication_status: 'ACTIONABLE' | 'WATCH' | 'REJECTED';
  publication_reason: string | null;
  source_status: string;
  data_status: string;
  source_label: string;
  signal_payload: UiSignal | null;
  evidence_bundle: Record<string, unknown>;
};

type DecisionEngineInput = {
  userId: string;
  market: Market;
  assetClass?: AssetClass;
  asOf: string;
  locale?: string;
  runtimeSourceStatus: string;
  performanceSourceStatus?: string;
  demoMode?: boolean;
  riskProfile: UserRiskProfileRecord | null;
  signals: UiSignal[];
  evidenceSignals: EvidenceSignal[];
  marketState: MarketStateRecord[];
  executions?: ExecutionRecord[];
  holdings?: UserHoldingInput[];
  previousDecision?: Record<string, unknown> | null;
};

function toNumber(value: unknown, fallback: number | null = null): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseDateMs(value: unknown): number | null {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : null;
}

function inferHoldingMarket(assetClass?: string | null): Market {
  return String(assetClass || '').toUpperCase() === 'CRYPTO' ? 'CRYPTO' : 'US';
}

function alignTransparency(args: {
  overallStatus: string;
  componentSourceStatus?: unknown;
  componentDataStatus?: unknown;
}) {
  const overall = normalizeRuntimeStatus(args.overallStatus, RUNTIME_STATUS.INSUFFICIENT_DATA);
  const sourceStatus = normalizeRuntimeStatus(args.componentSourceStatus, RUNTIME_STATUS.DB_BACKED);
  const hint = normalizeRuntimeStatus(args.componentDataStatus, sourceStatus);
  const dataStatus = overall === RUNTIME_STATUS.DB_BACKED ? hint : overall;
  return {
    source_status: sourceStatus,
    data_status: dataStatus,
    source_label: dataStatus,
  };
}

function normalizeHolding(row: UserHoldingInput, index: number) {
  const symbol = String(row.symbol || '')
    .trim()
    .toUpperCase();
  const assetClass =
    (String(row.asset_class || '').toUpperCase() as AssetClass) ||
    (symbol.includes('USDT') ? 'CRYPTO' : 'US_STOCK');
  return {
    id: row.id || `holding-${index + 1}`,
    symbol,
    asset_class: assetClass,
    market: row.market || inferHoldingMarket(assetClass),
    weight_pct: toNumber(row.weight_pct, null),
    quantity: toNumber(row.quantity, null),
    cost_basis: toNumber(row.cost_basis, null),
    current_price: toNumber(row.current_price, null),
    sector: String(row.sector || '').trim() || (assetClass === 'CRYPTO' ? 'Crypto' : 'Unknown'),
    note: String(row.note || '').trim() || null,
  };
}

function dataPenalty(status: string): number {
  const normalized = normalizeRuntimeStatus(status, RUNTIME_STATUS.INSUFFICIENT_DATA);
  if (normalized === RUNTIME_STATUS.DB_BACKED) return 0;
  if (normalized === RUNTIME_STATUS.MODEL_DERIVED) return 6;
  if (normalized === RUNTIME_STATUS.PAPER_ONLY) return 12;
  if (normalized === RUNTIME_STATUS.BACKTEST_ONLY) return 14;
  if (normalized === RUNTIME_STATUS.EXPERIMENTAL) return 20;
  if (normalized === RUNTIME_STATUS.DEMO_ONLY) return 24;
  if (normalized === RUNTIME_STATUS.WITHHELD) return 36;
  return 42;
}

function factoryPromotionBoost(signal: UiSignal): number {
  const tags = asArray<string>(signal.tags).map((row) => String(row));
  const isFactory = tags.includes('source:nova_factory');
  if (!isFactory) return 0;

  const metadata =
    signal.factory_metadata && typeof signal.factory_metadata === 'object'
      ? (signal.factory_metadata as Record<string, unknown>)
      : {};
  const qualityFromMeta = toNumber(metadata.quality_score_pct, null);
  const qualityFromTag = tags
    .map((tag) => tag.match(/^factory_quality:(\d+(?:\.\d+)?)$/i))
    .find(Boolean);
  const quality = qualityFromMeta ?? (qualityFromTag ? Number(qualityFromTag[1]) : 0) ?? 0;
  const refsFromMeta = asArray(metadata.public_reference_ids).length;
  const refsFromTag = tags.map((tag) => tag.match(/^factory_refs:(\d+)$/i)).find(Boolean);
  const refs = refsFromMeta || (refsFromTag ? Number(refsFromTag[1]) : 0) || 0;
  const stage = String(
    metadata.next_stage ||
      tags.find((tag) => tag.startsWith('factory_stage:'))?.split(':')[1] ||
      '',
  ).toLowerCase();
  const regimeFit = tags.includes('factory_regime_fit:matched');

  return Math.min(
    18,
    quality * 0.07 + refs * 1.5 + (stage === 'shadow' ? 3.5 : 1.5) + (regimeFit ? 4 : 0),
  );
}

function strategySourceForSignal(signal: UiSignal): string {
  const raw = String(signal.strategy_id || signal.strategy_family || '').trim();
  return raw || 'unknown';
}

function isStrategyBackedSource(source: string): boolean {
  const normalized = String(source || '')
    .trim()
    .toLowerCase();
  if (!normalized || normalized === 'unknown') return false;
  if (normalized.startsWith('decision_engine.')) return false;
  if (normalized.includes('demo')) return false;
  if (normalized.includes('fallback')) return false;
  return true;
}

function isPublicationReadyStatus(status: string, sourceStatus?: string): boolean {
  const normalized = normalizeRuntimeStatus(status, RUNTIME_STATUS.INSUFFICIENT_DATA);
  const normalizedSource = normalizeRuntimeStatus(sourceStatus, RUNTIME_STATUS.INSUFFICIENT_DATA);
  return (
    normalized === RUNTIME_STATUS.DB_BACKED ||
    normalized === RUNTIME_STATUS.MODEL_DERIVED ||
    normalized === RUNTIME_STATUS.PAPER_ONLY ||
    (normalized === RUNTIME_STATUS.EXPERIMENTAL && normalizedSource === RUNTIME_STATUS.DB_BACKED)
  );
}

function evaluatePublicationGate(args: {
  signal: UiSignal;
  intent: ReturnType<typeof buildActionIntent>;
  governor: RiskGovernorOutcome;
  strategySource: string;
}) {
  const strategyBacked = isStrategyBackedSource(args.strategySource);
  if (!strategyBacked) {
    return {
      strategyBacked: false,
      publishable: false,
      status: 'REJECTED' as const,
      reason: 'Signal is not linked to a registered strategy family.',
    };
  }

  const dataStatus = String(
    args.signal.data_status || args.signal.source_label || args.signal.source_status || '',
  );
  const sourceStatus = String(
    args.signal.source_status || args.signal.source_label || args.signal.data_status || '',
  );
  if (!isPublicationReadyStatus(dataStatus, sourceStatus)) {
    return {
      strategyBacked: true,
      publishable: false,
      status: 'REJECTED' as const,
      reason: `Signal data status ${normalizeRuntimeStatus(dataStatus, RUNTIME_STATUS.INSUFFICIENT_DATA)} is not publishable.`,
    };
  }

  const confidence =
    toNumber(
      (args.signal.confidence_details as Record<string, unknown> | undefined)
        ?.calibrated_confidence,
      null,
    ) ??
    toNumber(args.signal.confidence, 0) ??
    0;
  if (confidence < 0.55) {
    return {
      strategyBacked: true,
      publishable: false,
      status: 'WATCH' as const,
      reason: 'Calibrated confidence is below the deploy threshold.',
    };
  }

  const sampleSize = toNumber(
    (args.signal.expected_metrics as Record<string, unknown> | undefined)?.sample_size,
    null,
  );
  if (sampleSize !== null && sampleSize < 12) {
    return {
      strategyBacked: true,
      publishable: false,
      status: 'WATCH' as const,
      reason: 'Historical sample is still too thin for a production action card.',
    };
  }

  if (!args.intent.eligible) {
    return {
      strategyBacked: true,
      publishable: false,
      status: 'WATCH' as const,
      reason: args.intent.rationale,
    };
  }

  if (!args.governor.allowed) {
    return {
      strategyBacked: true,
      publishable: false,
      status: 'WATCH' as const,
      reason: args.governor.block_reason || 'Risk governor blocked the action.',
    };
  }

  return {
    strategyBacked: true,
    publishable: true,
    status: 'ACTIONABLE' as const,
    reason: null,
  };
}

function directionText(value: unknown): 'LONG' | 'SHORT' | 'WAIT' {
  const upper = String(value || '').toUpperCase();
  if (upper === 'LONG') return 'LONG';
  if (upper === 'SHORT') return 'SHORT';
  return 'WAIT';
}

function inferHorizon(signal: UiSignal): { label: string; days: number | null } {
  const timeframe = String(signal.timeframe || '').toLowerCase();
  if (timeframe === '1d') return { label: 'days to weeks', days: 5 };
  if (timeframe === '1h' || timeframe === '15m') return { label: 'intraday to swing', days: 2 };
  const payload = signal.payload as Record<string, unknown> | undefined;
  const horizon = String(
    (payload?.data as Record<string, unknown> | undefined)?.horizon || '',
  ).toUpperCase();
  if (horizon === 'SHORT') return { label: '1 to 3 days', days: 3 };
  if (horizon === 'MEDIUM') return { label: 'several days', days: 5 };
  if (horizon === 'LONG') return { label: '1 to 3 weeks', days: 10 };
  return { label: 'watch closely', days: null };
}

function buildEventContext(row?: MarketStateRecord | null) {
  if (!row) {
    return {
      availability: 'INSUFFICIENT_DATA',
      note: 'No market-state event context is available yet.',
      tags: [] as string[],
    };
  }
  const stats = (() => {
    try {
      return JSON.parse(row.event_stats_json || '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  const tags: string[] = [];
  if (toNumber(row.temperature_percentile, 0)! >= 82) tags.push('stretched_conditions');
  if (toNumber(row.volatility_percentile, 0)! >= 78) tags.push('elevated_volatility');
  if (toNumber(row.risk_off_score, 0)! >= 0.72) tags.push('risk_off_pressure');
  if (Array.isArray(stats.catalysts)) {
    tags.push(...stats.catalysts.map((item) => String(item)));
  } else if (stats.signal_candidate) {
    tags.push(`derived_candidate:${String(stats.signal_candidate)}`);
  }
  return {
    availability: normalizeRuntimeStatus(
      stats.source_status ||
        (row.updated_at_ms ? RUNTIME_STATUS.DB_BACKED : RUNTIME_STATUS.INSUFFICIENT_DATA),
      RUNTIME_STATUS.INSUFFICIENT_DATA,
    ),
    note: 'Current event intelligence is derived from runtime state and signal context. Macro and earnings calendars are not yet fully connected in this runtime path.',
    tags: [...new Set(tags)].slice(0, 4),
  };
}

function mergeSignals(
  signals: UiSignal[],
  evidenceSignals: EvidenceSignal[],
  overallStatus: string,
): UiSignal[] {
  const byId = new Map(signals.map((row) => [String(row.signal_id || row.id || ''), row]));
  const merged = evidenceSignals.map((row) => {
    const signalId = String(row.signal_id || '');
    const base = byId.get(signalId) || {};
    const transparency = (row.source_transparency as Record<string, unknown> | undefined) || {};
    const status = alignTransparency({
      overallStatus,
      componentSourceStatus:
        transparency.source_status || base.source_status || RUNTIME_STATUS.DB_BACKED,
      componentDataStatus:
        transparency.data_status ||
        row.evidence_status ||
        base.data_status ||
        RUNTIME_STATUS.MODEL_DERIVED,
    });
    return {
      ...base,
      signal_id: signalId || base.signal_id,
      symbol: row.symbol || base.symbol,
      market: row.market || base.market,
      asset_class: row.asset_class || base.asset_class,
      direction: row.direction || base.direction,
      confidence: toNumber(row.conviction, toNumber(base.confidence, 0)) || 0,
      conviction: toNumber(row.conviction, toNumber(base.confidence, 0)) || 0,
      regime_id: row.regime_id || base.regime_id,
      created_at: base.created_at || row.created_at || null,
      entry_zone: row.entry_zone || base.entry_zone || null,
      invalidation_level: toNumber(base.invalidation_level, toNumber(row.invalidation, null)),
      stop_loss:
        base.stop_loss ||
        (toNumber(row.invalidation, null) !== null
          ? {
              type: 'EVIDENCE',
              price: Number(row.invalidation),
              rationale: 'Evidence-derived invalidation',
            }
          : null),
      take_profit_levels: base.take_profit_levels || [],
      position_advice: base.position_advice || null,
      explain_bullets: base.explain_bullets || (row.thesis ? [row.thesis] : []),
      status: base.status || (row.actionable ? 'NEW' : 'WITHHELD'),
      score: toNumber(base.score, toNumber(row.conviction, 0)! * 100) || 0,
      source_transparency: {
        ...(base.source_transparency as Record<string, unknown> | undefined),
        ...transparency,
        ...status,
      },
      source_status: status.source_status,
      data_status: status.data_status,
      source_label: status.source_label,
      evidence_status: row.evidence_status || base.evidence_status || null,
      freshness_label: row.freshness_label || null,
      actionable: Boolean(row.actionable),
      supporting_run_id: row.supporting_run_id || null,
      replay_paper_evidence_available: Boolean(row.replay_paper_evidence_available),
    };
  });

  const untouched = signals
    .filter(
      (row) =>
        !merged.some(
          (item) => String(item.signal_id || '') === String(row.signal_id || row.id || ''),
        ),
    )
    .map((row) => {
      const status = alignTransparency({
        overallStatus,
        componentSourceStatus: row.source_status || row.source_label || overallStatus,
        componentDataStatus:
          row.data_status || row.source_label || row.source_status || overallStatus,
      });
      return {
        ...row,
        source_status: status.source_status,
        data_status: status.data_status,
        source_label: status.source_label,
        source_transparency: {
          ...((row.source_transparency as Record<string, unknown> | undefined) || {}),
          ...status,
        },
      };
    });
  return [...merged, ...untouched];
}

function isActionable(row: UiSignal): boolean {
  const status = String(row.status || '').toUpperCase();
  const dataStatus = normalizeRuntimeStatus(
    String(row.data_status || row.source_label || row.source_status || ''),
  );
  return (
    (status === 'NEW' || status === 'TRIGGERED') &&
    dataStatus !== RUNTIME_STATUS.WITHHELD &&
    dataStatus !== RUNTIME_STATUS.INSUFFICIENT_DATA
  );
}

function buildPortfolioContext(args: {
  holdings?: UserHoldingInput[];
  topActionSymbol?: string | null;
  riskPosture: 'ATTACK' | 'PROBE' | 'DEFEND' | 'WAIT';
}) {
  const rows = (args.holdings || []).map(normalizeHolding).filter((row) => row.symbol);
  if (!rows.length) {
    return {
      availability: 'UNPERSONALIZED',
      holdings_count: 0,
      total_weight_pct: 0,
      top1_pct: 0,
      unsupported_weight_pct: 0,
      exposure_posture: 'empty',
      recommendation: 'No positions provided. Actions are universal, not personalized.',
      focus_symbol: args.topActionSymbol || null,
      same_symbol_weight_pct: 0,
      concentration_note: 'No current positions provided.',
      sector_concentration: [],
    };
  }

  const sorted = [...rows].sort((a, b) => (b.weight_pct || 0) - (a.weight_pct || 0));
  const totalWeight = rows.reduce((sum, row) => sum + (row.weight_pct || 0), 0);
  const top1 = sorted[0]?.weight_pct || 0;
  const focusWeight = args.topActionSymbol
    ? rows.find((row) => row.symbol === String(args.topActionSymbol || '').toUpperCase())
        ?.weight_pct || 0
    : 0;
  const sectorMap = new Map<string, { sector: string; weight_pct: number; count: number }>();
  for (const row of rows) {
    const sector = row.sector || 'Unknown';
    const existing = sectorMap.get(sector) || { sector, weight_pct: 0, count: 0 };
    existing.weight_pct += row.weight_pct || 0;
    existing.count += 1;
    sectorMap.set(sector, existing);
  }
  const sectorConcentration = [...sectorMap.values()]
    .map((row) => ({ ...row, weight_pct: Number(row.weight_pct.toFixed(2)) }))
    .sort((a, b) => b.weight_pct - a.weight_pct)
    .slice(0, 3);

  const exposurePosture =
    totalWeight >= 85
      ? 'heavy'
      : totalWeight >= 55
        ? 'moderate'
        : totalWeight > 0
          ? 'light'
          : 'empty';
  const recommendation =
    args.riskPosture === 'DEFEND'
      ? 'Portfolio is in defensive mode. Prioritize reducing unsupported or crowded exposure.'
      : exposurePosture === 'heavy'
        ? 'You already carry meaningful risk. Prefer trims, rotations, or only the clearest adds.'
        : exposurePosture === 'moderate'
          ? 'Portfolio risk is active but manageable. New exposure should be selective.'
          : 'Portfolio is light enough for selective new risk.';

  return {
    availability: 'PERSONALIZED',
    holdings_count: rows.length,
    total_weight_pct: Number(totalWeight.toFixed(2)),
    top1_pct: Number(top1.toFixed(2)),
    unsupported_weight_pct: 0,
    exposure_posture: exposurePosture,
    recommendation,
    focus_symbol: args.topActionSymbol || null,
    same_symbol_weight_pct: Number(focusWeight.toFixed(2)),
    concentration_note:
      top1 >= 30
        ? `Largest position already accounts for ${top1.toFixed(1)}% of stated exposure.`
        : 'No single position dominates the provided portfolio.',
    sector_concentration: sectorConcentration,
  };
}

function deriveRiskState(args: {
  marketState: MarketStateRecord[];
  runtimeSourceStatus: string;
  riskProfile: UserRiskProfileRecord | null;
  executions?: ExecutionRecord[];
  locale?: string;
}) {
  const rows = args.marketState || [];
  const avg = (field: keyof MarketStateRecord, fallback: number | null = null) => {
    if (!rows.length) return fallback;
    const values = rows
      .map((row) => toNumber(row[field], null))
      .filter((v): v is number => v !== null);
    if (!values.length) return fallback;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const avgVol = avg('volatility_percentile', null);
  const avgTemp = avg('temperature_percentile', null);
  const avgRiskOff = avg('risk_off_score', null);
  const breadth = rows.length
    ? rows.filter((row) => toNumber(row.trend_strength, 0)! >= 0.55).length / rows.length
    : null;

  const latestExecutionLosses = (args.executions || [])
    .slice(0, 10)
    .map((row) => toNumber(row.pnl_pct, null))
    .filter((v): v is number => v !== null && v < 0);
  const lossPressure = latestExecutionLosses.length >= 3;

  let posture: 'ATTACK' | 'PROBE' | 'DEFEND' | 'WAIT' = 'PROBE';
  if (
    normalizeRuntimeStatus(args.runtimeSourceStatus, RUNTIME_STATUS.INSUFFICIENT_DATA) !==
    RUNTIME_STATUS.DB_BACKED
  ) {
    posture = 'WAIT';
  } else if ((avgRiskOff ?? 0) >= 0.72 || (avgVol ?? 0) >= 82 || lossPressure) {
    posture = 'DEFEND';
  } else if ((avgRiskOff ?? 0) >= 0.56 || (avgVol ?? 0) >= 68 || (avgTemp ?? 0) >= 80) {
    posture = 'PROBE';
  } else {
    posture = 'ATTACK';
  }

  const summary = getDailyStanceCopy({
    posture,
    locale: args.locale,
    variant: posture === 'DEFEND' || posture === 'WAIT' ? 'restrained' : 'standard',
    seed: `${posture}:${avgVol ?? 'na'}:${avgRiskOff ?? 'na'}`,
  });
  const riskCopy = getTodayRiskCopy({
    posture,
    locale: args.locale,
    changed: false,
    seed: `${posture}:${avgVol ?? 'na'}:${avgRiskOff ?? 'na'}`,
  });

  return {
    source_status: normalizeRuntimeStatus(
      args.runtimeSourceStatus,
      RUNTIME_STATUS.INSUFFICIENT_DATA,
    ),
    data_status: normalizeRuntimeStatus(args.runtimeSourceStatus, RUNTIME_STATUS.INSUFFICIENT_DATA),
    posture,
    summary,
    simple_label: riskCopy.label,
    user_message: riskCopy.explanation,
    drivers: [
      avgVol === null
        ? 'Volatility regime unavailable.'
        : `Average volatility percentile ${avgVol.toFixed(1)}.`,
      avgRiskOff === null
        ? 'Risk-off regime unavailable.'
        : `Average risk-off score ${avgRiskOff.toFixed(2)}.`,
      breadth === null ? 'Breadth unavailable.' : `Trend breadth ${(breadth * 100).toFixed(0)}%.`,
      lossPressure
        ? 'Recent realized paper losses are elevated.'
        : 'Recent execution pressure is not elevated.',
    ],
    machine: {
      volatility_regime:
        avgVol === null
          ? 'INSUFFICIENT_DATA'
          : avgVol >= 82
            ? 'HIGH'
            : avgVol >= 65
              ? 'MODERATE'
              : 'CALM',
      liquidity_regime: 'UNAVAILABLE',
      risk_on_off:
        avgRiskOff === null
          ? 'INSUFFICIENT_DATA'
          : avgRiskOff >= 0.72
            ? 'RISK_OFF'
            : avgRiskOff >= 0.56
              ? 'NEUTRAL'
              : 'RISK_ON',
      macro_event_risk: 'UNAVAILABLE',
      style_rotation_climate:
        breadth === null
          ? 'INSUFFICIENT_DATA'
          : breadth >= 0.65
            ? 'trend_favored'
            : breadth <= 0.35
              ? 'choppy'
              : 'mixed',
      trend_suitability: breadth === null ? null : Number(clamp(breadth, 0, 1).toFixed(3)),
      mean_reversion_suitability:
        breadth === null ? null : Number((1 - clamp(breadth, 0, 1)).toFixed(3)),
      abnormal_correlation_context:
        avgRiskOff !== null && avgRiskOff >= 0.72 ? 'elevated' : 'normal',
      avg_volatility_percentile: avgVol,
      avg_temperature_percentile: avgTemp,
      avg_risk_off_score: avgRiskOff,
      risk_profile_key: args.riskProfile?.profile_key || 'balanced',
    },
  };
}

function buildActionIntent(args: {
  signal: UiSignal;
  riskPosture: 'ATTACK' | 'PROBE' | 'DEFEND' | 'WAIT';
  portfolioContext: ReturnType<typeof buildPortfolioContext>;
  holdingWeight: number;
  governor: RiskGovernorOutcome;
  locale?: string;
}) {
  const direction = directionText(args.signal.direction);
  const actionable = isActionable(args.signal);
  if (!actionable) {
    return {
      action: 'watch_only',
      action_label: getPortfolioActionLabel('watch_only', args.locale),
      eligible: false,
      rationale: 'Evidence exists, but the setup is not executable right now.',
    };
  }
  if (!args.governor.allowed) {
    return {
      action: 'no_action',
      action_label: getPortfolioActionLabel('no_action', args.locale),
      eligible: false,
      rationale: args.governor.block_reason || 'Portfolio risk governor blocked the action.',
    };
  }
  if (direction === 'SHORT' && args.holdingWeight > 0) {
    return {
      action: 'reduce_risk',
      action_label: getPortfolioActionLabel('reduce_risk', args.locale),
      eligible: true,
      rationale: 'You already hold this exposure and the system is now leaning against it.',
    };
  }
  if (args.riskPosture === 'DEFEND') {
    return {
      action: args.holdingWeight > 0 ? 'defensive_hold' : 'no_action',
      action_label: getPortfolioActionLabel(
        args.holdingWeight > 0 ? 'defensive_hold' : 'no_action',
        args.locale,
      ),
      eligible: args.holdingWeight > 0,
      rationale: 'Risk posture is defensive, so new directional risk should be limited.',
    };
  }
  if (args.holdingWeight > 0) {
    if (args.holdingWeight >= 18) {
      return {
        action: 'defensive_hold',
        action_label: getPortfolioActionLabel('defensive_hold', args.locale),
        eligible: true,
        rationale:
          'You already carry a meaningful position here. Protect the existing exposure first.',
      };
    }
    return {
      action: 'add_on_strength',
      action_label: getPortfolioActionLabel('add_on_strength', args.locale),
      eligible: true,
      rationale:
        'The setup is aligned with an existing position and portfolio exposure is still manageable.',
    };
  }
  if (direction === 'SHORT' && args.portfolioContext.total_weight_pct > 30) {
    return {
      action: 'hedge',
      action_label: getPortfolioActionLabel('hedge', args.locale),
      eligible: true,
      rationale: 'The short setup can be used as a portfolio hedge against existing long exposure.',
    };
  }
  if (args.riskPosture === 'PROBE') {
    return {
      action: 'open_new_risk',
      action_label: getPortfolioActionLabel('open_new_risk', args.locale),
      eligible: true,
      rationale: 'Conditions allow only selective new exposure. Keep size small.',
    };
  }
  return {
    action: 'open_new_risk',
    action_label: getPortfolioActionLabel('open_new_risk', args.locale),
    eligible: true,
    rationale: 'Risk posture allows a fresh position if the setup remains valid.',
  };
}

function buildWhyNow(signal: UiSignal, riskState: ReturnType<typeof deriveRiskState>) {
  const bullets = asArray<string>(signal.explain_bullets).filter(Boolean);
  if (bullets.length) return bullets[0];
  if (riskState.posture === 'DEFEND')
    return 'The setup exists, but it ranks mainly because existing exposure needs attention.';
  return `Setup aligns with ${String(signal.strategy_family || signal.strategy_id || 'the current strategy')} under ${String(signal.regime_id || 'current regime')}.`;
}

function buildEvidenceBundle(args: {
  signal: UiSignal;
  regimeRow?: MarketStateRecord | null;
  portfolioContext: ReturnType<typeof buildPortfolioContext>;
  riskState: ReturnType<typeof deriveRiskState>;
  previousDecision?: Record<string, unknown> | null;
  actionIntent: ReturnType<typeof buildActionIntent>;
  governor: RiskGovernorOutcome;
  performanceSourceStatus?: string;
  demoMode?: boolean;
}) {
  const regimeRow = args.regimeRow;
  const eventContext = buildEventContext(regimeRow);
  const supportingFactors = [
    ...asArray<string>(
      (() => {
        try {
          return JSON.parse(regimeRow?.event_stats_json || '{}');
        } catch {
          return {};
        }
      })()?.panda?.top_factors,
    ),
    ...asArray<string>(args.signal.explain_bullets),
  ]
    .map((item) => String(item))
    .filter(Boolean)
    .slice(0, 4);

  const opposingFactors: string[] = [];
  if ((args.riskState.machine.avg_volatility_percentile || 0) >= 75)
    opposingFactors.push('Elevated realized volatility.');
  if ((args.riskState.machine.avg_risk_off_score || 0) >= 0.65)
    opposingFactors.push('Risk-off posture is elevated.');
  if ((args.portfolioContext.top1_pct || 0) >= 30)
    opposingFactors.push('Portfolio concentration is already high.');
  if (
    Number(
      (args.signal.expected_metrics as Record<string, unknown> | undefined)?.sample_size || 0,
    ) < 12
  ) {
    opposingFactors.push('Historical sample size is still limited.');
  }

  const previousSummary =
    (args.previousDecision?.summary as Record<string, unknown> | undefined) || {};
  const previousTopActionSymbol = String(previousSummary.top_action_symbol || '');
  const currentSymbol = String(args.signal.symbol || '');
  const whatChanged =
    previousTopActionSymbol && previousTopActionSymbol !== currentSymbol
      ? `Top action changed from ${previousTopActionSymbol} to ${currentSymbol}.`
      : previousTopActionSymbol === currentSymbol
        ? `Top action remains ${currentSymbol}, but the risk posture is now ${args.riskState.posture.toLowerCase()}.`
        : 'No prior personalized decision snapshot is available for comparison.';

  const horizon = inferHorizon(args.signal);
  const confidenceDetails =
    (args.signal.confidence_details as Record<string, unknown> | undefined) || {};
  const newsContext = (args.signal.news_context as Record<string, unknown> | undefined) || {};
  const lineage = buildEvidenceLineage({
    runtimeStatus:
      args.signal.source_status || args.signal.data_status || RUNTIME_STATUS.INSUFFICIENT_DATA,
    performanceStatus: args.performanceSourceStatus || RUNTIME_STATUS.INSUFFICIENT_DATA,
    replayEvidenceAvailable: args.signal.replay_paper_evidence_available,
    paperEvidenceAvailable: false,
    sourceStatus: args.signal.source_status,
    dataStatus: args.signal.data_status,
    demo: args.demoMode,
  });
  return {
    thesis: buildWhyNow(args.signal, args.riskState),
    supporting_factors: supportingFactors,
    opposing_factors: opposingFactors,
    regime_context: {
      regime_id: regimeRow?.regime_id || args.signal.regime_id || '--',
      stance: regimeRow?.stance || '--',
      volatility_percentile:
        regimeRow?.volatility_percentile ?? args.signal.volatility_percentile ?? null,
      temperature_percentile:
        regimeRow?.temperature_percentile ?? args.signal.temperature_percentile ?? null,
      risk_off_score: regimeRow?.risk_off_score ?? null,
    },
    event_context: eventContext,
    data_quality: {
      source_status: String(args.signal.source_status || RUNTIME_STATUS.INSUFFICIENT_DATA),
      data_status: String(args.signal.data_status || RUNTIME_STATUS.INSUFFICIENT_DATA),
      evidence_status: String(args.signal.evidence_status || 'UNKNOWN'),
    },
    confidence: {
      conviction: Number(toNumber(args.signal.confidence, 0) || 0),
      uncertainty:
        opposingFactors.length >= 3 ? 'HIGH' : opposingFactors.length >= 2 ? 'MEDIUM' : 'LOW',
      calibration: confidenceDetails,
    },
    evidence_lineage: lineage,
    news_context: newsContext,
    governor: args.governor,
    implementation_caveats: [
      `Entry only if price remains inside ${String((args.signal.entry_zone as Record<string, unknown> | undefined)?.low ?? '--')} - ${String((args.signal.entry_zone as Record<string, unknown> | undefined)?.high ?? '--')}.`,
      `Stop / invalidation sits near ${String((args.signal.stop_loss as Record<string, unknown> | undefined)?.price ?? args.signal.invalidation_level ?? '--')}.`,
      `Expected horizon: ${horizon.label}.`,
      args.actionIntent.rationale,
      ...args.governor.reasons,
    ].slice(0, 4),
    next_action: args.actionIntent.action,
    what_changed: whatChanged,
    generated_at: new Date().toISOString(),
  };
}

function rankCard(args: {
  signal: UiSignal;
  riskState: ReturnType<typeof deriveRiskState>;
  intent: ReturnType<typeof buildActionIntent>;
  holdingWeight: number;
  governor: RiskGovernorOutcome;
  publicationGate: ReturnType<typeof evaluatePublicationGate>;
}) {
  const score = Number(toNumber(args.signal.score, 0) || 0);
  const confidence = Number(toNumber(args.signal.confidence, 0) || 0);
  const createdAtMs =
    parseDateMs(args.signal.created_at) ||
    parseDateMs(args.signal.generated_at) ||
    Date.now() - 72 * 3600_000;
  const ageHours = Math.max(0, (Date.now() - createdAtMs) / 3600_000);
  const freshnessPenalty = Math.min(24, ageHours * 1.1);
  const posturePenalty =
    args.riskState.posture === 'DEFEND' ? 18 : args.riskState.posture === 'PROBE' ? 8 : 0;
  const intentBonus =
    args.intent.action === 'reduce_risk'
      ? 16
      : args.intent.action === 'hedge'
        ? 12
        : args.intent.action === 'add_on_strength'
          ? 10
          : args.intent.action === 'open_new_risk'
            ? 8
            : args.intent.action === 'defensive_hold'
              ? 6
              : -8;
  const holdingBonus = args.holdingWeight > 0 && args.intent.action === 'reduce_risk' ? 10 : 0;
  const governorPenalty = !args.governor.allowed
    ? 45
    : args.governor.governor_mode === 'DERISK'
      ? 14
      : args.governor.governor_mode === 'CAUTION'
        ? 8
        : 0;
  const governorBoost = args.governor.allowed ? args.governor.size_multiplier * 6 : 0;
  const strategyPenalty = args.publicationGate.strategyBacked ? 0 : 120;
  const publicationPenalty = args.publicationGate.publishable
    ? 0
    : args.publicationGate.status === 'WATCH'
      ? 18
      : 64;
  const publicationBoost = args.publicationGate.publishable ? 12 : 0;
  const factoryBoost = factoryPromotionBoost(args.signal);
  return (
    score +
    confidence * 35 +
    intentBonus +
    holdingBonus +
    governorBoost +
    publicationBoost -
    governorPenalty -
    strategyPenalty -
    publicationPenalty -
    posturePenalty -
    freshnessPenalty -
    dataPenalty(String(args.signal.data_status || '')) +
    factoryBoost
  );
}

function buildNoActionCard(args: {
  asOf: string;
  riskState: ReturnType<typeof deriveRiskState>;
  portfolioContext: ReturnType<typeof buildPortfolioContext>;
  overallStatus: string;
  performanceSourceStatus?: string;
  demoMode?: boolean;
  locale?: string;
  reasonCode?: string;
  reasonText?: string;
}): ActionCard {
  const status = alignTransparency({
    overallStatus: args.overallStatus,
    componentSourceStatus: args.overallStatus,
    componentDataStatus: args.overallStatus,
  });
  const reasonText = args.reasonText || 'No action ranks above the current opportunity set.';
  return {
    action_id: 'action-wait',
    signal_id: null,
    symbol: null,
    market: 'ALL' as const,
    asset_class: 'ALL' as const,
    action: 'no_action',
    action_label: getPortfolioActionLabel('no_action', args.locale),
    portfolio_intent: 'no_action',
    confidence: 0,
    conviction_label: 'Low',
    time_horizon: 'today only',
    time_horizon_days: 0,
    brief_why_now: args.riskState.summary,
    brief_caution: args.portfolioContext.recommendation,
    risk_note: args.riskState.user_message,
    eligible: false,
    ranking_score: -999,
    recommended_position_pct: 0,
    confidence_details: null,
    governor: {
      governor_mode: 'BLOCKED',
      allowed: false,
      size_multiplier: 0,
      risk_budget_remaining: Number(args.portfolioContext.total_weight_pct || 0),
      block_reason: reasonText,
      reasons: [reasonText],
      overlays: [String(args.reasonCode || 'no_action_default').toLowerCase()],
    },
    evidence_lineage: buildEvidenceLineage({
      runtimeStatus: args.overallStatus,
      performanceStatus: args.performanceSourceStatus,
      sourceStatus: args.overallStatus,
      dataStatus: args.overallStatus,
      demo: args.demoMode,
    }),
    entry_zone: null,
    stop_loss: null,
    take_profit: null,
    strategy_source: 'decision_engine.no_action',
    strategy_backed: false,
    risk_bucket: 'BLOCKED',
    publication_status: 'REJECTED',
    publication_reason: reasonText,
    source_status: status.source_status,
    data_status: status.data_status,
    source_label: status.source_label,
    signal_payload: null,
    evidence_bundle: {
      thesis: reasonText,
      supporting_factors: [],
      opposing_factors: [...args.riskState.drivers],
      regime_context: args.riskState.machine,
      event_context: {
        availability: normalizeRuntimeStatus(args.overallStatus, RUNTIME_STATUS.INSUFFICIENT_DATA),
        note: 'No trade-worthy event context is available.',
        tags: [],
      },
      data_quality: status,
      confidence: {
        conviction: 0,
        uncertainty: 'HIGH',
      },
      implementation_caveats: [
        reasonText,
        'Wait for cleaner evidence or lower-risk conditions.',
      ].filter(Boolean),
      next_action: 'wait',
      what_changed: reasonText,
      generated_at: args.asOf,
    },
  };
}

function determineActionCardLimit(riskProfile?: UserRiskProfileRecord | null) {
  const config = getConfig();
  const target = config.serviceEnvelope?.targetDailyActionCards || {};
  const key = String(riskProfile?.profile_key || 'balanced').toLowerCase();
  const conservative = Math.max(
    6,
    Math.min(
      20,
      Number(
        process.env.NOVA_ACTION_CARD_LIMIT_CONSERVATIVE || target.conservative || target.min || 10,
      ),
    ),
  );
  const balanced = Math.max(
    conservative,
    Math.min(20, Number(process.env.NOVA_ACTION_CARD_LIMIT_BALANCED || target.balanced || 12)),
  );
  const aggressive = Math.max(
    balanced,
    Math.min(
      24,
      Number(
        process.env.NOVA_ACTION_CARD_LIMIT_AGGRESSIVE || target.aggressive || target.max || 15,
      ),
    ),
  );
  if (key === 'aggressive') return aggressive;
  if (key === 'conservative') return conservative;
  return balanced;
}

function countBy<T>(rows: T[], getKey: (row: T) => string) {
  return rows.reduce<Map<string, number>>((acc, row) => {
    const key = getKey(row);
    if (!key) return acc;
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map());
}

function adjustedCardScore(card: ActionCard, selected: ActionCard[]) {
  const selectedSymbols = countBy(selected, (row) => String(row.symbol || ''));
  const selectedStrategies = countBy(selected, (row) => String(row.strategy_source || ''));
  const selectedMarkets = countBy(selected, (row) => String(row.market || ''));
  const selectedActions = countBy(selected, (row) => String(row.action || ''));
  const selectedDirections = countBy(selected, (row) =>
    String((row.signal_payload as Record<string, unknown> | null)?.direction || '').toUpperCase(),
  );
  const sameSymbolCount = selectedSymbols.get(String(card.symbol || '')) || 0;
  const sameStrategyCount = selectedStrategies.get(String(card.strategy_source || '')) || 0;
  const sameMarketCount = selectedMarkets.get(String(card.market || '')) || 0;
  const sameActionCount = selectedActions.get(String(card.action || '')) || 0;
  const directionKey = String(
    (card.signal_payload as Record<string, unknown> | null)?.direction || '',
  ).toUpperCase();
  const sameDirectionCount = selectedDirections.get(directionKey) || 0;

  let adjusted = card.ranking_score;
  if (sameSymbolCount > 0) adjusted -= 220;
  adjusted -= sameStrategyCount * 22;
  adjusted -= sameMarketCount * 4;
  adjusted -= sameActionCount * 5;
  adjusted -= sameDirectionCount >= 2 ? (sameDirectionCount - 1) * 4 : 0;

  if (!sameStrategyCount) adjusted += 8;
  if (!sameMarketCount) adjusted += 6;
  if (!sameActionCount) adjusted += 4;
  if (directionKey && !sameDirectionCount) adjusted += 4;

  return adjusted;
}

function selectDiversifiedActionCards(ranked: ActionCard[], maxCards: number) {
  const selected: ActionCard[] = [];
  const strategyBacked = ranked.filter((row) => row.strategy_backed && row.signal_payload);
  const pools = [
    strategyBacked.filter((row) => row.eligible),
    strategyBacked.filter((row) => !row.eligible),
  ];

  for (const pool of pools) {
    const remaining = [...pool];
    while (remaining.length && selected.length < maxCards) {
      const seenSymbols = new Set(selected.map((row) => String(row.symbol || '')).filter(Boolean));
      const unseenSymbolPool = remaining.filter(
        (row) => !seenSymbols.has(String(row.symbol || '')),
      );
      const candidatePool = unseenSymbolPool.length ? unseenSymbolPool : remaining;
      let bestIndex = 0;
      let bestScore = -Infinity;
      candidatePool.forEach((candidate) => {
        const index = remaining.findIndex((row) => row.action_id === candidate.action_id);
        const score = adjustedCardScore(candidate, selected);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });
      selected.push(remaining.splice(bestIndex, 1)[0]);
    }
    if (selected.length >= maxCards) break;
  }

  return selected;
}

export function buildDecisionSnapshot(input: DecisionEngineInput) {
  const overallStatus = normalizeRuntimeStatus(
    input.runtimeSourceStatus,
    RUNTIME_STATUS.INSUFFICIENT_DATA,
  );
  const mergedSignals = mergeSignals(
    input.signals || [],
    input.evidenceSignals || [],
    overallStatus,
  );
  const actionableSignals = mergedSignals.filter(isActionable);
  const riskState = deriveRiskState({
    marketState: input.marketState || [],
    runtimeSourceStatus: overallStatus,
    riskProfile: input.riskProfile,
    executions: input.executions,
    locale: input.locale,
  });

  const portfolioContextBase = buildPortfolioContext({
    holdings: input.holdings,
    topActionSymbol: null,
    riskPosture: riskState.posture,
  });

  const regimeBySymbol = new Map(
    (input.marketState || []).map((row) => [String(row.symbol || '').toUpperCase(), row]),
  );
  const holdingsBySymbol = new Map(
    (input.holdings || []).map((row, index) => {
      const normalized = normalizeHolding(row, index);
      return [normalized.symbol, normalized];
    }),
  );

  const ranked: ActionCard[] = mergedSignals
    .map((signal) => {
      const symbol = String(signal.symbol || '').toUpperCase();
      const holdingWeight = Number(holdingsBySymbol.get(symbol)?.weight_pct || 0);
      const governor = evaluateRiskGovernor({
        signal: signal as unknown as SignalContract & Record<string, unknown>,
        marketState: input.marketState || [],
        executions: input.executions,
        holdings: input.holdings,
        riskProfile: input.riskProfile,
        calibratedConfidence: toNumber(
          (signal.confidence_details as Record<string, unknown> | undefined)?.calibrated_confidence,
          null,
        ),
      });
      const intent = buildActionIntent({
        signal,
        riskPosture: riskState.posture,
        portfolioContext: portfolioContextBase,
        holdingWeight,
        governor,
        locale: input.locale,
      });
      const strategySource = strategySourceForSignal(signal);
      const publicationGate = evaluatePublicationGate({
        signal,
        intent,
        governor,
        strategySource,
      });
      const evidenceBundle = buildEvidenceBundle({
        signal,
        regimeRow: regimeBySymbol.get(symbol) || null,
        portfolioContext: portfolioContextBase,
        riskState,
        previousDecision: input.previousDecision,
        actionIntent: intent,
        governor,
        performanceSourceStatus: input.performanceSourceStatus,
        demoMode: input.demoMode,
      });
      const horizon = inferHorizon(signal);
      const rankingScore = rankCard({
        signal,
        riskState,
        intent,
        holdingWeight,
        governor,
        publicationGate,
      });
      const basePositionPct = toNumber(
        (signal.position_advice as Record<string, unknown> | undefined)?.position_pct,
        null,
      );
      const finalPositionPct =
        basePositionPct === null
          ? null
          : Number((basePositionPct * governor.size_multiplier).toFixed(2));
      const evidenceLineage = buildEvidenceLineage({
        runtimeStatus: input.runtimeSourceStatus,
        performanceStatus: input.performanceSourceStatus,
        replayEvidenceAvailable: signal.replay_paper_evidence_available,
        paperEvidenceAvailable: false,
        sourceStatus: signal.source_status,
        dataStatus: signal.data_status,
        demo: input.demoMode,
      });
      return {
        action_id: `action-${String(signal.signal_id || symbol || Math.random()).replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        signal_id: String(signal.signal_id || ''),
        symbol,
        market: (String(signal.market || input.market).toUpperCase() === 'CRYPTO'
          ? 'CRYPTO'
          : 'US') as Market | 'ALL',
        asset_class: (String(signal.asset_class || input.assetClass || 'US_STOCK').toUpperCase() ===
        'CRYPTO'
          ? 'CRYPTO'
          : String(signal.asset_class || input.assetClass || 'US_STOCK').toUpperCase() === 'OPTIONS'
            ? 'OPTIONS'
            : 'US_STOCK') as AssetClass | 'ALL',
        action: intent.action,
        action_label: intent.action_label,
        portfolio_intent: intent.action,
        confidence: Number(toNumber(signal.confidence, 0) || 0),
        calibrated_confidence:
          toNumber(
            (signal.confidence_details as Record<string, unknown> | undefined)
              ?.calibrated_confidence,
            null,
          ) || Number(toNumber(signal.confidence, 0) || 0),
        conviction_label:
          (toNumber(signal.confidence, 0) || 0) >= 0.75
            ? 'High'
            : (toNumber(signal.confidence, 0) || 0) >= 0.58
              ? 'Medium'
              : 'Low',
        time_horizon: horizon.label,
        time_horizon_days: horizon.days,
        brief_why_now: evidenceBundle.thesis,
        brief_caution:
          publicationGate.reason ||
          governor.block_reason ||
          evidenceBundle.implementation_caveats[0] ||
          intent.rationale,
        risk_note: riskState.user_message,
        eligible: publicationGate.publishable,
        ranking_score: Number(rankingScore.toFixed(2)),
        recommended_position_pct: finalPositionPct,
        confidence_details:
          (signal.confidence_details as Record<string, unknown> | undefined) || null,
        governor,
        evidence_lineage: evidenceLineage,
        entry_zone: signal.entry_zone || null,
        stop_loss: signal.stop_loss || null,
        take_profit: asArray<Record<string, unknown>>(signal.take_profit_levels)[0] || null,
        strategy_source: strategySource,
        strategy_backed: publicationGate.strategyBacked,
        risk_bucket: governor.governor_mode,
        publication_status: publicationGate.status,
        publication_reason: publicationGate.reason,
        source_status: String(signal.source_status || overallStatus),
        data_status: String(signal.data_status || overallStatus),
        source_label: String(signal.source_label || signal.data_status || overallStatus),
        signal_payload: signal,
        evidence_bundle: evidenceBundle,
      };
    })
    .sort((a, b) => b.ranking_score - a.ranking_score);

  const rankedActionCards = selectDiversifiedActionCards(
    ranked,
    determineActionCardLimit(input.riskProfile),
  );
  if (!rankedActionCards.length || !rankedActionCards[0]?.eligible) {
    const noActionReasonCode =
      overallStatus !== RUNTIME_STATUS.DB_BACKED
        ? 'SYSTEM_UNAVAILABLE'
        : mergedSignals.length === 0
          ? 'NO_SIGNAL_POOL'
          : actionableSignals.length === 0
            ? 'NO_ELIGIBLE_SIGNALS'
            : 'RISK_FILTERED';
    const noActionReasonText =
      noActionReasonCode === 'SYSTEM_UNAVAILABLE'
        ? 'Runtime data is not DB-backed yet, so the system cannot publish a trade card.'
        : noActionReasonCode === 'NO_SIGNAL_POOL'
          ? 'Runtime completed, but the signal pool is empty.'
          : noActionReasonCode === 'NO_ELIGIBLE_SIGNALS'
            ? 'Signals exist, but none cleared the execution filter.'
            : 'Higher-risk candidates were blocked by the risk governor.';
    rankedActionCards.unshift(
      buildNoActionCard({
        asOf: input.asOf,
        riskState,
        portfolioContext: portfolioContextBase,
        overallStatus,
        performanceSourceStatus: input.performanceSourceStatus,
        demoMode: input.demoMode,
        locale: input.locale,
        reasonCode: noActionReasonCode,
        reasonText: noActionReasonText,
      }),
    );
  }

  const topAction = rankedActionCards[0];
  const portfolioContext = buildPortfolioContext({
    holdings: input.holdings,
    topActionSymbol: topAction?.symbol || null,
    riskPosture: riskState.posture,
  });
  const todayCall =
    topAction.action === 'no_action' && overallStatus !== RUNTIME_STATUS.DB_BACKED
      ? {
          code: 'UNAVAILABLE',
          headline: input.locale === 'zh' ? '系统还没跑起来' : 'System unavailable',
          subtitle:
            topAction.governor?.block_reason ||
            (input.locale === 'zh'
              ? '运行时还不是 DB-backed，当前不能给出可执行动作卡。'
              : 'Runtime is not DB-backed yet, so no executable action card can be published.'),
        }
      : topAction.action === 'no_action' && mergedSignals.length === 0
        ? {
            code: 'WAIT',
            headline: input.locale === 'zh' ? '今天没有候选信号' : 'No signals today',
            subtitle:
              topAction.governor?.block_reason ||
              (input.locale === 'zh'
                ? '运行时已执行，但当前信号池为空。'
                : 'Runtime completed, but the signal pool is empty.'),
          }
        : topAction.action === 'no_action'
          ? {
              code: 'WAIT',
              headline: input.locale === 'zh' ? '今天先等等' : 'Wait today',
              subtitle: topAction.governor?.block_reason || riskState.user_message,
            }
          : {
              code:
                riskState.posture === 'ATTACK'
                  ? 'TRADE'
                  : riskState.posture === 'PROBE'
                    ? 'PROBE'
                    : 'DEFENSE',
              headline: riskState.summary,
              subtitle: topAction.brief_why_now,
            };

  const decisionState =
    todayCall.code === 'UNAVAILABLE'
      ? 'SYSTEM_UNAVAILABLE'
      : topAction.action === 'no_action' && mergedSignals.length === 0
        ? 'NO_SIGNAL_POOL'
        : topAction.action === 'no_action'
          ? 'WAIT'
          : 'ACTIONABLE';

  const summary = {
    today_call: todayCall,
    top_action_id: topAction.action_id,
    top_action_symbol: topAction.symbol,
    top_action_label: topAction.action_label,
    risk_posture: riskState.posture,
    risk_summary: riskState.summary,
    user_message: riskState.user_message,
    evidence_mode: String(
      (topAction.evidence_lineage as Record<string, unknown> | undefined)?.display_mode ||
        'UNAVAILABLE',
    ),
    performance_mode: String(
      (topAction.evidence_lineage as Record<string, unknown> | undefined)?.performance_mode ||
        'UNAVAILABLE',
    ),
    decision_state: decisionState,
    source_status: overallStatus,
    data_status: overallStatus,
  };

  return {
    as_of: input.asOf,
    source_status: overallStatus,
    data_status: overallStatus,
    evidence_mode: summary.evidence_mode,
    performance_mode: summary.performance_mode,
    today_call: todayCall,
    risk_state: riskState,
    portfolio_context: portfolioContext,
    ranked_action_cards: rankedActionCards,
    top_action_id: topAction.action_id,
    evidence_summary: {
      top_action_thesis: topAction.evidence_bundle?.thesis || null,
      main_risk_driver: riskState.drivers[0] || null,
      personalized: portfolioContext.availability === 'PERSONALIZED',
    },
    audit: {
      candidate_count: mergedSignals.length,
      actionable_count: actionableSignals.length,
      strategy_backed_count: ranked.filter((row) => row.strategy_backed).length,
      publishable_count: ranked.filter((row) => row.publication_status === 'ACTIONABLE').length,
      rejected_due_to_risk: actionableSignals.length - ranked.filter((row) => row.eligible).length,
      previous_top_action_symbol: String(
        ((input.previousDecision?.summary as Record<string, unknown> | undefined) || {})
          .top_action_symbol || '',
      ),
      created_for_user: input.userId,
    },
    summary,
  };
}
