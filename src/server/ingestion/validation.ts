import { MarketRepository } from '../db/repository.js';
import type { Timeframe } from '../types.js';
import { logInfo, logWarn } from '../utils/log.js';
import { timeframeToMs } from '../utils/time.js';
import { detectGaps, inspectBarQuality } from './normalize.js';
import { fetchBinanceKlines, isBinanceAccessBlockedError } from './binanceIncremental.js';
import { ingestProviderBars } from './providerGate.js';

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
      const tsList = params.repo.listBarsRange(asset.asset_id, tf, start, latest);
      const gaps = detectGaps(tsList, tf);
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
        } else {
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
