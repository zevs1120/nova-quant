import type { UserHoldingInput } from '../../types.js';

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function signalPayloadsFromDecision(decision: Record<string, unknown> | null | undefined) {
  return asArray(asObject(decision).ranked_action_cards)
    .map((row) => asObject(row).signal_payload)
    .filter((row) => row && typeof row === 'object');
}

export function buildRuntimeHydrationPlan(args: {
  signalCount: number;
  includedSignals: number;
  connectivityIncluded?: boolean;
}) {
  const signalCount = Math.max(0, Number(args.signalCount || 0));
  const includedSignals = Math.max(0, Number(args.includedSignals || 0));
  return {
    primary_snapshot_version: 'today-runtime-v2',
    evidence_included: true,
    signals_included: includedSignals,
    signal_count: signalCount,
    signals_truncated: signalCount > includedSignals,
    connectivity_included: Boolean(args.connectivityIncluded),
  };
}

export function shouldUsePublicDecisionFallback(args: {
  forceFallback?: boolean;
  sourceStatus?: string | null;
  signalCount?: number;
  decision?: Record<string, unknown> | null;
  holdings?: UserHoldingInput[];
  dbBackedStatus?: string;
}) {
  const forceFallback =
    args.forceFallback ?? String(process.env.NOVA_FORCE_PUBLIC_RUNTIME_FALLBACK || '') === '1';
  if (forceFallback) {
    return true;
  }
  if (Array.isArray(args.holdings) && args.holdings.length) return false;

  const dbBackedStatus = String(args.dbBackedStatus || 'DB_BACKED');
  const runtimeStatus = String(args.sourceStatus || 'INSUFFICIENT_DATA').toUpperCase();
  const signalCount = Number(args.signalCount || 0);
  const decisionSignalCount = signalPayloadsFromDecision(args.decision).length;
  const todayCall = asObject(asObject(args.decision).today_call);
  const decisionCode = String(todayCall.code || '').toUpperCase();
  const noDisplayableSignalCards = signalCount === 0 && decisionSignalCount === 0;

  if (
    runtimeStatus !== dbBackedStatus &&
    noDisplayableSignalCards &&
    (decisionCode === 'UNAVAILABLE' || !decisionCode)
  ) {
    return true;
  }
  if (noDisplayableSignalCards) {
    return true;
  }
  return runtimeStatus !== dbBackedStatus && signalCount === 0;
}

export function buildRuntimeStateSnapshot(args: {
  core: Record<string, any>;
  decision: unknown;
  evidence: unknown;
  apiChecks: Record<string, unknown>;
  trades: Array<Record<string, any>>;
  componentStatus: Record<string, unknown>;
  membership?: unknown;
  manual?: unknown;
  connectivityIncluded?: boolean;
}): any {
  const { core } = args;
  return {
    asof: core.runtimeTransparency.as_of,
    source_status: core.runtimeTransparency.source_status,
    data_status: core.runtimeTransparency.data_status,
    data_transparency: core.runtimeTransparency,
    data: {
      signals: core.signals,
      evidence: args.evidence,
      performance: core.performance,
      decision: args.decision,
      trades: args.trades.map((row) => ({
        ...row,
        time_in: new Date(row.created_at_ms).toISOString(),
        time_out: new Date(row.created_at_ms).toISOString(),
        entry: row.entry_price,
        exit: row.tp_price ?? row.entry_price,
      })),
      velocity: {
        as_of: core.runtimeTransparency.as_of,
        market: core.market,
        volatility_percentile: core.avgVol,
        temperature_percentile: core.avgTemp,
        risk_off_score: core.avgRiskOff,
        ...args.componentStatus,
      },
      config: {
        last_updated: core.runtimeTransparency.as_of,
        ...args.componentStatus,
        risk_rules: {
          per_trade_risk_pct: core.risk?.max_loss_per_trade ?? null,
          daily_loss_pct: core.risk?.max_daily_loss ?? null,
          max_dd_pct: core.risk?.max_drawdown ?? null,
          exposure_cap_pct: core.risk?.exposure_cap ?? null,
          vol_switch: true,
        },
        risk_status: {
          current_risk_bucket: core.mode.toUpperCase(),
          bucket_state: core.mode.toUpperCase(),
          diagnostics: {
            daily_pnl_pct: null,
            max_dd_pct: null,
          },
        },
        runtime: {
          ...core.runtimeTransparency,
          api_checks: args.apiChecks,
          hydration: buildRuntimeHydrationPlan({
            signalCount: Number(args.apiChecks.signal_count || 0),
            includedSignals: Array.isArray(core.signals) ? core.signals.length : 0,
            connectivityIncluded: args.connectivityIncluded,
          }),
        },
      },
      market_modules: core.modules,
      analytics: {
        source_status: core.runtimeTransparency.source_status,
        runtime: core.runtimeTransparency,
        status_flags: {
          runtime_source: core.runtimeTransparency.source_status,
          performance_source: core.performanceSource,
          has_performance_sample: core.hasPerformanceSample,
        },
      },
      research: {
        ...args.componentStatus,
        notes: [
          core.runtimeTransparency.data_status === 'DB_BACKED'
            ? 'Runtime app state is DB-backed; advanced research modules remain experimental in this API path.'
            : 'Runtime app state is currently insufficient for high-confidence research overlays.',
        ],
      },
      today: core.today,
      safety: core.safety,
      insights: core.insights,
      membership: args.membership ?? null,
      manual: args.manual ?? null,
      ai: {
        source_transparency: core.runtimeTransparency,
      },
      layers: {
        data_layer: {
          instruments: core.marketState.map((row: Record<string, any>) => ({
            ticker: row.symbol,
            market: row.market,
            latest_close: null,
            sector: row.market === 'CRYPTO' ? 'Crypto' : 'US',
          })),
        },
        portfolio_layer: {
          candidates: core.active.slice(0, 12).map((row: Record<string, any>) => ({
            ticker: row.symbol,
            direction: row.direction,
            grade: row.grade,
            confidence: row.confidence,
            risk_score: row.volatility_percentile,
            entry_plan: {
              entry_zone: row.entry_zone,
            },
          })),
          filtered_out: core.signals
            .filter(
              (row: Record<string, any>) => !['NEW', 'TRIGGERED'].includes(String(row.status)),
            )
            .slice(0, 12)
            .map((row: Record<string, any>) => ({ ticker: row.symbol, reason: row.status })),
        },
      },
    },
  };
}

export function applyPublicDecisionToRuntime(args: {
  runtime: Record<string, any>;
  publicDecision: Record<string, unknown>;
  modelDerivedStatus: string;
  buildRuntimeEvidencePreview: (args: {
    signals: Array<Record<string, unknown>>;
    sourceStatus: string;
  }) => unknown;
}): any {
  const publicSignals = signalPayloadsFromDecision(args.publicDecision);
  const nextSignals = publicSignals.length ? publicSignals : args.runtime.data.signals;
  return {
    ...args.runtime,
    data: {
      ...args.runtime.data,
      signals: nextSignals,
      evidence: publicSignals.length
        ? args.buildRuntimeEvidencePreview({
            signals: publicSignals as Array<Record<string, unknown>>,
            sourceStatus: String(
              args.publicDecision.source_status ||
                args.runtime.source_status ||
                args.modelDerivedStatus,
            ),
          })
        : args.runtime.data.evidence,
      decision: args.publicDecision,
      config: {
        ...(args.runtime.data.config || {}),
        runtime: {
          ...(args.runtime.data.config?.runtime || {}),
          api_checks: {
            ...(args.runtime.data.config?.runtime?.api_checks || {}),
            signal_count: nextSignals.length,
          },
          hydration: buildRuntimeHydrationPlan({
            signalCount: nextSignals.length,
            includedSignals: nextSignals.length,
            connectivityIncluded: Boolean(
              args.runtime.data.config?.runtime?.hydration?.connectivity_included,
            ),
          }),
        },
      },
    },
  };
}
