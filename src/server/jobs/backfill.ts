import { getConfig } from '../config.js';
import { getDb } from '../db/database.js';
import { MarketRepository } from '../db/repository.js';
import { ensureSchema } from '../db/schema.js';
import { backfillBinancePublic } from '../ingestion/binancePublic.js';
import { backfillAlphaVantageDaily } from '../ingestion/hostedData.js';
import { backfillNasdaqHistorical } from '../ingestion/nasdaq.js';
import { backfillStooqBulk } from '../ingestion/stooq.js';
import { backfillYahooChart } from '../ingestion/yahoo.js';
import type { Market, Timeframe } from '../types.js';
import { logInfo, logWarn } from '../utils/log.js';
import { parseArgs } from './args.js';

function parseTimeframes(input: string | undefined, fallback: Timeframe[]): Timeframe[] {
  if (!input) return fallback;
  return input.split(',').map((x) => x.trim() as Timeframe);
}

export async function runBackfillCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const cfg = getConfig();
  const market = (args.market || 'ALL').toUpperCase() as Market | 'ALL';
  const tfArg = args.tf;

  const db = getDb();
  ensureSchema(db);
  const repo = new MarketRepository(db);

  if (market === 'US' || market === 'ALL') {
    const usTfs = parseTimeframes(tfArg, ['1d', '1h', '5m']);
    for (const tf of usTfs) {
      try {
        await backfillStooqBulk({
          timeframe: tf,
          repo,
          symbols: cfg.markets.US.symbols,
        });
      } catch (error) {
        if (tf === '1d') {
          logWarn('US bulk backfill failed; switching to Yahoo fallback', {
            timeframe: tf,
            error: error instanceof Error ? error.message : String(error),
          });
          try {
            await backfillYahooChart({
              timeframe: tf,
              repo,
              symbols: cfg.markets.US.symbols,
            });
          } catch (fallbackError) {
            logWarn('Yahoo fallback failed; switching to Nasdaq fallback', {
              timeframe: tf,
              error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            });
            try {
              await backfillNasdaqHistorical({
                timeframe: tf,
                repo,
                symbols: cfg.markets.US.symbols,
              });
            } catch (nasdaqError) {
              if (tf === '1d' && String(process.env.ALPHA_VANTAGE_API_KEY || '').trim()) {
                logWarn('Nasdaq fallback failed; switching to Alpha Vantage daily fallback', {
                  timeframe: tf,
                  error: nasdaqError instanceof Error ? nasdaqError.message : String(nasdaqError),
                });
                await backfillAlphaVantageDaily({
                  timeframe: tf,
                  repo,
                  symbols: cfg.markets.US.symbols,
                });
              } else {
                throw nasdaqError;
              }
            }
          }
        } else {
          logWarn('US backfill failed for timeframe; continuing without fallback', {
            timeframe: tf,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  if (market === 'CRYPTO' || market === 'ALL') {
    const cryptoTfs = parseTimeframes(tfArg, cfg.timeframes);
    await backfillBinancePublic({
      symbols: cfg.markets.CRYPTO.symbols,
      timeframes: cryptoTfs,
      repo,
    });
  }

  logInfo('Backfill finished', { market, tf: tfArg ?? 'default' });
}
