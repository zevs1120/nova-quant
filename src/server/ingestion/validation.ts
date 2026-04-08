import { MarketRepository } from '../db/repository.js';
import type { Timeframe } from '../types.js';
import { logInfo, logWarn } from '../utils/log.js';
import { timeframeToMs } from '../utils/time.js';
import { detectGaps, inspectBarQuality, inspectBarSequenceQuality } from './normalize.js';
import { fetchBinanceKlines, isBinanceAccessBlockedError } from './binanceIncremental.js';
import { fetchAlphaVantageDailyBars } from './hostedData.js';
import { ingestProviderBars } from './providerGate.js';
import { fetchYahooChartBars } from './yahoo.js';

function parseMetricsJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  return {};
}

function upsertRepairQualityState(args: {
  repo: MarketRepository;
  assetId: number;
  timeframe: Timeframe;
  status: 'SUSPECT' | 'REPAIRED';
  reason: string;
  patch: Record<string, unknown>;
}): void {
  const existing = args.repo.getOhlcvQualityState({
    assetId: args.assetId,
    timeframe: args.timeframe,
  });
  const baseMetrics = parseMetricsJson(existing?.metrics_json);
  args.repo.upsertOhlcvQualityState({
    assetId: args.assetId,
    timeframe: args.timeframe,
    status: args.status,
    reason: args.reason,
    metricsJson: JSON.stringify({
      ...baseMetrics,
      ...args.patch,
      last_repair_updated_at: Date.now(),
    }),
  });
}

function detectAssetGaps(args: {
  repo: MarketRepository;
  assetId: number;
  market: string;
  timeframe: Timeframe;
  start: number;
  end: number;
}) {
  const tsList = args.repo.listBarsRange(args.assetId, args.timeframe, args.start, args.end);
  return detectGaps(tsList, args.timeframe, { market: args.market });
}

function buildRepairWindow(args: { from: number; to: number; step: number }) {
  return {
    start: args.from - args.step * 2,
    end: args.to + args.step * 2,
  };
}

function filterBarsForWindow<T extends { ts_open: number }>(rows: T[], start: number, end: number): T[] {
  return rows.filter((row) => row.ts_open >= start && row.ts_open <= end);
}

async function repairUsDailyGap(args: {
  repo: MarketRepository;
  assetId: number;
  symbol: string;
  timeframe: Timeframe;
  gap: { from: number; to: number; missingBars: number };
  step: number;
}): Promise<{ source: string | null; inserted: number }> {
  if (args.timeframe !== '1d') return { source: null, inserted: 0 };

  const window = buildRepairWindow({
    from: args.gap.from,
    to: args.gap.to,
    step: args.step,
  });

  try {
    const yahooBars = filterBarsForWindow(
      await fetchYahooChartBars(args.symbol, args.timeframe),
      window.start,
      window.end,
    );
    if (yahooBars.length) {
      const summary = ingestProviderBars({
        repo: args.repo,
        assetId: args.assetId,
        timeframe: args.timeframe,
        rows: yahooBars,
        source: 'YAHOO_REPAIR',
        symbol: args.symbol,
      });
      if (summary.insertedCount > 0) {
        return { source: 'YAHOO_REPAIR', inserted: summary.insertedCount };
      }
    }
  } catch (error) {
    logWarn('Failed Yahoo gap repair attempt', {
      symbol: args.symbol,
      timeframe: args.timeframe,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const alphaBars = filterBarsForWindow(
      await fetchAlphaVantageDailyBars(args.symbol),
      window.start,
      window.end,
    );
    if (alphaBars.length) {
      const summary = ingestProviderBars({
        repo: args.repo,
        assetId: args.assetId,
        timeframe: args.timeframe,
        rows: alphaBars,
        source: 'ALPHA_VANTAGE_REPAIR',
        symbol: args.symbol,
      });
      if (summary.insertedCount > 0) {
        return { source: 'ALPHA_VANTAGE_REPAIR', inserted: summary.insertedCount };
      }
    }
  } catch (error) {
    logWarn('Failed Alpha Vantage gap repair attempt', {
      symbol: args.symbol,
      timeframe: args.timeframe,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { source: null, inserted: 0 };
}

export async function validateAndRepair(params: {
  repo: MarketRepository;
  timeframes: Timeframe[];
  lookbackBars: number;
}): Promise<void> {
  const assets = params.repo.listAssetIdsByMarket();
  let binanceRepairBlocked = false;

  for (const asset of assets) {
    for (const tf of params.timeframes) {
      const latest = params.repo.getLatestTsOpen(asset.asset_id, tf);
      if (!latest) continue;

      const step = timeframeToMs(tf);
      const start = latest - params.lookbackBars * step;
      const gaps = detectAssetGaps({
        repo: params.repo,
        assetId: asset.asset_id,
        market: asset.market,
        timeframe: tf,
        start,
        end: latest,
      });
      const rows = params.repo.getOhlcv({
        assetId: asset.asset_id,
        timeframe: tf,
        start,
        end: latest,
      });

      for (const row of rows) {
        const quality = inspectBarQuality(row);
        if (quality.invalidPrice) {
          params.repo.logAnomaly({
            assetId: asset.asset_id,
            timeframe: tf,
            tsOpen: row.ts_open,
            anomalyType: 'PRICE_ANOMALY',
            detail: `Invalid OHLC price for ${asset.symbol} ${tf} at ${row.ts_open}`,
          });
        }
        if (quality.envelopeAdjusted) {
          params.repo.logAnomaly({
            assetId: asset.asset_id,
            timeframe: tf,
            tsOpen: row.ts_open,
            anomalyType: 'OHLC_ENVELOPE_ANOMALY',
            detail: `OHLC envelope mismatch for ${asset.symbol} ${tf} at ${row.ts_open}`,
          });
        }
        if (quality.zeroVolume) {
          params.repo.logAnomaly({
            assetId: asset.asset_id,
            timeframe: tf,
            tsOpen: row.ts_open,
            anomalyType: 'ZERO_VOLUME_ANOMALY',
            detail: `Zero volume bar for ${asset.symbol} ${tf} at ${row.ts_open}`,
          });
        }
      }

      const sanitizedRows = rows
        .map((row) => inspectBarQuality(row).sanitized)
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
      const sequence = inspectBarSequenceQuality({
        rows: sanitizedRows,
        timeframe: tf,
        source: asset.venue,
        symbol: asset.symbol,
      });
      for (const anomaly of sequence.anomalies) {
        params.repo.logAnomaly({
          assetId: asset.asset_id,
          timeframe: tf,
          tsOpen: anomaly.tsOpen,
          anomalyType: anomaly.anomalyType,
          detail: anomaly.detail,
        });
      }

      if (!gaps.length) continue;

      for (const gap of gaps) {
        const detail = `Gap ${asset.symbol} ${tf}: from=${gap.from} to=${gap.to} missing=${gap.missingBars}`;
        params.repo.logAnomaly({
          assetId: asset.asset_id,
          timeframe: tf,
          tsOpen: gap.from,
          anomalyType: 'MISSING_BARS',
          detail,
        });

        if (asset.market === 'CRYPTO' && asset.venue === 'BINANCE_UM') {
          if (binanceRepairBlocked) continue;
          let repairInserted = 0;
          try {
            const bars = await fetchBinanceKlines({
              symbol: asset.symbol,
              timeframe: tf,
              startTime: gap.from - step,
              endTime: gap.to + step,
              limit: Math.max(100, gap.missingBars + 10),
            });
            if (bars.length) {
              ingestProviderBars({
                repo: params.repo,
                assetId: asset.asset_id,
                timeframe: tf,
                rows: bars,
                source: 'BINANCE_REPAIR',
                symbol: asset.symbol,
              });
              repairInserted = bars.length;
              logInfo('Gap repaired from Binance REST', {
                symbol: asset.symbol,
                timeframe: tf,
                inserted: bars.length,
              });
            }
          } catch (error) {
            if (isBinanceAccessBlockedError(error)) {
              binanceRepairBlocked = true;
              logWarn(
                'Binance futures REST is region-blocked; skipping automatic crypto gap repair for this run',
                {
                  symbol: asset.symbol,
                  timeframe: tf,
                  error: error instanceof Error ? error.message : String(error),
                },
              );
              continue;
            }
            logWarn('Failed gap repair from Binance REST', {
              symbol: asset.symbol,
              timeframe: tf,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          const repairWindow = buildRepairWindow({
            from: gap.from,
            to: gap.to,
            step,
          });
          const remainingGaps = detectAssetGaps({
            repo: params.repo,
            assetId: asset.asset_id,
            market: asset.market,
            timeframe: tf,
            start: repairWindow.start,
            end: repairWindow.end,
          });
          const repaired = remainingGaps.every(
            (candidate) => candidate.to < gap.from || candidate.from > gap.to,
          );
          if (repairInserted > 0 && repaired) {
            upsertRepairQualityState({
              repo: params.repo,
              assetId: asset.asset_id,
              timeframe: tf,
              status: 'REPAIRED',
              reason: 'GAP_REPAIRED_BINANCE',
              patch: {
                last_repair: {
                  source: 'BINANCE_REPAIR',
                  from: gap.from,
                  to: gap.to,
                  missing_bars: gap.missingBars,
                  inserted_bars: repairInserted,
                },
              },
            });
          } else {
            upsertRepairQualityState({
              repo: params.repo,
              assetId: asset.asset_id,
              timeframe: tf,
              status: 'SUSPECT',
              reason: 'MISSING_BARS_UNRESOLVED',
              patch: {
                unresolved_gap: {
                  from: gap.from,
                  to: gap.to,
                  missing_bars: gap.missingBars,
                  attempted_source: 'BINANCE_REPAIR',
                },
              },
            });
          }
        } else if (asset.market === 'US') {
          const repair = await repairUsDailyGap({
            repo: params.repo,
            assetId: asset.asset_id,
            symbol: asset.symbol,
            timeframe: tf,
            gap,
            step,
          });
          const repairWindow = buildRepairWindow({
            from: gap.from,
            to: gap.to,
            step,
          });
          const remainingGaps = detectAssetGaps({
            repo: params.repo,
            assetId: asset.asset_id,
            market: asset.market,
            timeframe: tf,
            start: repairWindow.start,
            end: repairWindow.end,
          });
          const repaired = remainingGaps.every(
            (candidate) => candidate.to < gap.from || candidate.from > gap.to,
          );
          if (repair.source && repaired) {
            upsertRepairQualityState({
              repo: params.repo,
              assetId: asset.asset_id,
              timeframe: tf,
              status: 'REPAIRED',
              reason: `GAP_REPAIRED_${repair.source}`,
              patch: {
                last_repair: {
                  source: repair.source,
                  from: gap.from,
                  to: gap.to,
                  missing_bars: gap.missingBars,
                  inserted_bars: repair.inserted,
                },
              },
            });
            logInfo('Gap repaired from US fallback provider', {
              symbol: asset.symbol,
              timeframe: tf,
              source: repair.source,
              inserted: repair.inserted,
            });
          } else {
            upsertRepairQualityState({
              repo: params.repo,
              assetId: asset.asset_id,
              timeframe: tf,
              status: 'SUSPECT',
              reason: 'MISSING_BARS_UNRESOLVED',
              patch: {
                unresolved_gap: {
                  from: gap.from,
                  to: gap.to,
                  missing_bars: gap.missingBars,
                  attempted_source: repair.source,
                },
              },
            });
            logWarn('Gap detected but repair remains unresolved', {
              symbol: asset.symbol,
              market: asset.market,
              timeframe: tf,
              missingBars: gap.missingBars,
              attemptedSource: repair.source,
            });
          }
        } else {
          upsertRepairQualityState({
            repo: params.repo,
            assetId: asset.asset_id,
            timeframe: tf,
            status: 'SUSPECT',
            reason: 'MISSING_BARS_UNRESOLVED',
            patch: {
              unresolved_gap: {
                from: gap.from,
                to: gap.to,
                missing_bars: gap.missingBars,
              },
            },
          });
          logWarn('Gap detected (no automatic repair for this market yet)', {
            symbol: asset.symbol,
            market: asset.market,
            timeframe: tf,
            missingBars: gap.missingBars,
          });
        }
      }
    }
  }
}
