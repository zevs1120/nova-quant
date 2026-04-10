import type { MarketRepository } from '../../db/repository.js';
import type { AssetClass, Market } from '../../types.js';
import {
  RUNTIME_STATUS,
  normalizeRuntimeStatus,
  withComponentStatus,
} from '../../runtimeStatus.js';

export function buildPerformanceSummaryFromRows(args: {
  rows: ReturnType<MarketRepository['listPerformanceSnapshots']>;
  asofIso: string;
  sourceStatus: string;
}) {
  const grouped = args.rows.reduce<Record<string, Record<string, unknown>>>((acc, row) => {
    const key = `${row.market}:${row.range}`;
    if (!acc[key]) {
      acc[key] = {
        market: row.market,
        range: row.range,
        overall: null,
        by_strategy: [],
        by_regime: [],
        deviation: null,
      };
    }
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    if (row.segment_type === 'OVERALL') acc[key].overall = payload;
    if (row.segment_type === 'STRATEGY')
      (acc[key].by_strategy as Record<string, unknown>[]).push(payload);
    if (row.segment_type === 'REGIME')
      (acc[key].by_regime as Record<string, unknown>[]).push(payload);
    if (row.segment_type === 'DEVIATION') acc[key].deviation = payload;
    return acc;
  }, {});

  return {
    asof: args.asofIso,
    source_status: normalizeRuntimeStatus(args.sourceStatus, RUNTIME_STATUS.INSUFFICIENT_DATA),
    records: Object.values(grouped),
  };
}

export function buildPerformanceSummaryFromRowsOrEmpty(args: {
  rows?: ReturnType<MarketRepository['listPerformanceSnapshots']> | null;
  asofIso: string;
  sourceStatus: string;
}) {
  return buildPerformanceSummaryFromRows({
    rows: args.rows || [],
    asofIso: args.asofIso,
    sourceStatus: args.sourceStatus,
  });
}

export function buildMarketModulesFromRows(
  rows: ReturnType<MarketRepository['listMarketState']>,
  args?: { market?: Market; assetClass?: AssetClass },
) {
  const scoped = rows.filter((row) => {
    if (args?.market && row.market !== args.market) return false;
    if (!args?.assetClass) return true;
    if (args.assetClass === 'CRYPTO') return row.market === 'CRYPTO';
    return row.market === 'US';
  });

  const bySymbol = new Map<string, (typeof scoped)[number]>();
  for (const row of scoped) {
    const existing = bySymbol.get(row.symbol);
    if (!existing || row.updated_at_ms > existing.updated_at_ms) bySymbol.set(row.symbol, row);
  }

  return Array.from(bySymbol.values())
    .slice(0, 36)
    .map((row, index) => {
      const event = row.event_stats_json
        ? (JSON.parse(row.event_stats_json) as Record<string, unknown>)
        : {};
      const moduleStatus = withComponentStatus({
        overallDataStatus: normalizeRuntimeStatus(event.data_status, RUNTIME_STATUS.MODEL_DERIVED),
        componentSourceStatus: normalizeRuntimeStatus(
          event.source_status,
          RUNTIME_STATUS.DB_BACKED,
        ),
      });
      return {
        id: `module-${row.market}-${row.symbol}-${index + 1}`,
        market: row.market,
        asset_class: row.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK',
        title: `${row.symbol} ${row.regime_id}`,
        summary: row.stance,
        metric: `Trend ${Number(row.trend_strength || 0).toFixed(2)} · Vol ${Number(row.volatility_percentile || 0).toFixed(1)}p`,
        source_status: moduleStatus.source_status,
        data_status: moduleStatus.data_status,
        source_label: moduleStatus.source_label,
        as_of: new Date(row.updated_at_ms).toISOString(),
      };
    });
}
