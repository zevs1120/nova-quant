import { Readable } from 'node:stream';
import { parse } from 'csv-parse';
import unzipper from 'unzipper';
import pLimit from 'p-limit';
import { getConfig } from '../config.js';
import { MarketRepository } from '../db/repository.js';
import type { NormalizedBar, Timeframe } from '../types.js';
import { fetchWithRetry } from '../utils/http.js';
import { dayRange, monthRange } from '../utils/time.js';
import { logInfo, logWarn } from '../utils/log.js';
import { normalizeBars } from './normalize.js';

export function parseBinanceKlineRow(row: string[]): NormalizedBar | null {
  if (row.length < 6) return null;

  const tsOpen = Number(row[0]);
  if (!Number.isFinite(tsOpen)) return null;

  return {
    ts_open: tsOpen,
    open: row[1],
    high: row[2],
    low: row[3],
    close: row[4],
    volume: row[5],
  };
}

function inferBaseQuote(symbol: string): { base: string; quote: string } {
  const quoteCandidates = ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH'];
  for (const quote of quoteCandidates) {
    if (symbol.endsWith(quote)) {
      return { base: symbol.slice(0, -quote.length), quote };
    }
  }
  return { base: symbol, quote: 'USDT' };
}

function monthlyUrl(symbol: string, tf: Timeframe, month: string): string {
  const cfg = getConfig();
  return `${cfg.binancePublic.baseUrl}/${cfg.binancePublic.pathPrefix}/monthly/klines/${symbol}/${tf}/${symbol}-${tf}-${month}.zip`;
}

function dailyUrl(symbol: string, tf: Timeframe, day: string): string {
  const cfg = getConfig();
  return `${cfg.binancePublic.baseUrl}/${cfg.binancePublic.pathPrefix}/daily/klines/${symbol}/${tf}/${symbol}-${tf}-${day}.zip`;
}

async function ingestZipFileFromResponse(
  response: Response,
  repo: MarketRepository,
  assetId: number,
  timeframe: Timeframe,
  source: string,
): Promise<number> {
  if (!response.body) return 0;

  const entries = Readable.fromWeb(response.body as never).pipe(
    unzipper.Parse({ forceStream: true }),
  );
  let inserted = 0;

  for await (const entry of entries as AsyncIterable<unzipper.Entry>) {
    if (entry.type !== 'File' || !entry.path.endsWith('.csv')) {
      entry.autodrain();
      continue;
    }

    const parser = parse({ relax_column_count: true, skip_empty_lines: true, trim: true });
    const stream = entry.pipe(parser);
    const batch: NormalizedBar[] = [];

    for await (const row of stream as AsyncIterable<string[]>) {
      const bar = parseBinanceKlineRow(row);
      if (!bar) continue;
      batch.push(bar);

      if (batch.length >= 2000) {
        inserted += repo.upsertOhlcvBars(assetId, timeframe, normalizeBars(batch), source);
        batch.length = 0;
      }
    }

    if (batch.length) {
      inserted += repo.upsertOhlcvBars(assetId, timeframe, normalizeBars(batch), source);
    }
  }

  return inserted;
}

async function downloadAndIngest(
  url: string,
  repo: MarketRepository,
  assetId: number,
  timeframe: Timeframe,
  source: string,
): Promise<number> {
  const response = await fetchWithRetry(url, {}, { attempts: 3, baseDelayMs: 600 });
  if (response.status === 404) return 0;
  if (!response.ok) throw new Error(`Binance public download failed: ${response.status} ${url}`);

  return ingestZipFileFromResponse(response, repo, assetId, timeframe, source);
}

export async function backfillBinancePublic(params: {
  symbols: string[];
  timeframes: Timeframe[];
  repo: MarketRepository;
}): Promise<void> {
  const config = getConfig();
  const limit = pLimit(config.binancePublic.concurrency);
  const end = new Date();
  const months = monthRange(config.binancePublic.startDate, end);
  const lastDays = dayRange(config.binancePublic.lookbackDailyDays, end);

  const tasks: Array<Promise<void>> = [];

  for (const symbol of params.symbols) {
    for (const timeframe of params.timeframes) {
      tasks.push(
        limit(async () => {
          const { base, quote } = inferBaseQuote(symbol);
          const asset = params.repo.upsertAsset({
            symbol,
            market: 'CRYPTO',
            venue: 'BINANCE_UM',
            base,
            quote,
            status: 'ACTIVE',
          });

          let inserted = 0;
          for (const month of months) {
            const url = monthlyUrl(symbol, timeframe, month);
            try {
              inserted += await downloadAndIngest(
                url,
                params.repo,
                asset.asset_id,
                timeframe,
                'BINANCE_PUBLIC_MONTHLY',
              );
            } catch (error) {
              logWarn('Monthly Binance file failed', {
                symbol,
                timeframe,
                month,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          for (const day of lastDays) {
            const url = dailyUrl(symbol, timeframe, day);
            try {
              inserted += await downloadAndIngest(
                url,
                params.repo,
                asset.asset_id,
                timeframe,
                'BINANCE_PUBLIC_DAILY',
              );
            } catch (error) {
              logWarn('Daily Binance file failed', {
                symbol,
                timeframe,
                day,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          const latest = params.repo.getLatestTsOpen(asset.asset_id, timeframe);
          if (latest) {
            params.repo.setCursor(asset.asset_id, timeframe, latest, 'BINANCE_PUBLIC');
          }

          logInfo('Binance public backfill completed', { symbol, timeframe, inserted });
        }),
      );
    }
  }

  await Promise.all(tasks);
}
