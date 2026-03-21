import { getConfig } from '../config.js';
import { MarketRepository } from '../db/repository.js';
import type { NormalizedBar, Timeframe } from '../types.js';
import { fetchWithRetry } from '../utils/http.js';
import { logInfo, logWarn } from '../utils/log.js';
import { sleep, timeframeToMs } from '../utils/time.js';
import { normalizeBars } from './normalize.js';

const BINANCE_BLOCK_COOLDOWN_MS = 1000 * 60 * 60 * 6;
let binanceRestBlockedUntilMs = 0;

class BinanceRestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string
  ) {
    super(message);
    this.name = 'BinanceRestError';
  }
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

function parseKlinesPayload(payload: unknown): NormalizedBar[] {
  if (!Array.isArray(payload)) return [];
  const rows: NormalizedBar[] = [];

  for (const item of payload) {
    if (!Array.isArray(item) || item.length < 6) continue;
    const ts = Number(item[0]);
    if (!Number.isFinite(ts)) continue;

    rows.push({
      ts_open: ts,
      open: String(item[1]),
      high: String(item[2]),
      low: String(item[3]),
      close: String(item[4]),
      volume: String(item[5])
    });
  }

  return normalizeBars(rows);
}

function buildKlineUrl(symbol: string, timeframe: Timeframe, limit: number, startTime?: number, endTime?: number): string {
  const cfg = getConfig();
  const query = new URLSearchParams({
    symbol,
    interval: timeframe,
    limit: String(limit)
  });

  if (startTime !== undefined) query.set('startTime', String(startTime));
  if (endTime !== undefined) query.set('endTime', String(endTime));

  return `${cfg.binanceRest.baseUrl}/fapi/v1/klines?${query.toString()}`;
}

export async function fetchBinanceKlines(params: {
  symbol: string;
  timeframe: Timeframe;
  limit: number;
  startTime?: number;
  endTime?: number;
}): Promise<NormalizedBar[]> {
  const cfg = getConfig();
  const url = buildKlineUrl(params.symbol, params.timeframe, params.limit, params.startTime, params.endTime);
  const res = await fetchWithRetry(url, {}, cfg.binanceRest.retry);
  if (!res.ok) {
    throw new BinanceRestError(`Binance REST failed: ${res.status} (${url})`, res.status, url);
  }

  const payload = await res.json();
  return parseKlinesPayload(payload);
}

export function isBinanceAccessBlockedError(error: unknown): boolean {
  if (error instanceof BinanceRestError) return error.status === 451;
  return /Binance REST failed:\s*451\b/.test(String(error instanceof Error ? error.message : error || ''));
}

export function resetBinanceAccessBlockForTests() {
  binanceRestBlockedUntilMs = 0;
}

export async function updateBinanceIncremental(params: {
  symbols: string[];
  timeframes: Timeframe[];
  repo: MarketRepository;
  limit?: number;
}): Promise<void> {
  const cfg = getConfig();
  const limit = params.limit ?? cfg.binanceRest.limit;
  if (Date.now() < binanceRestBlockedUntilMs) {
    return;
  }

  for (const symbol of params.symbols) {
    const { base, quote } = inferBaseQuote(symbol);
    const asset = params.repo.upsertAsset({
      symbol,
      market: 'CRYPTO',
      venue: 'BINANCE_UM',
      base,
      quote,
      status: 'ACTIVE'
    });

    for (const timeframe of params.timeframes) {
      const tfMs = timeframeToMs(timeframe);
      const cursor = params.repo.getCursor(asset.asset_id, timeframe);
      const latest = params.repo.getLatestTsOpen(asset.asset_id, timeframe);
      const startTime = Math.max(0, (cursor ?? latest ?? 0) - tfMs * 3);

      try {
        const bars = await fetchBinanceKlines({
          symbol,
          timeframe,
          limit,
          startTime
        });

        if (bars.length) {
          params.repo.upsertOhlcvBars(asset.asset_id, timeframe, bars, 'BINANCE_REST_INCREMENTAL');
          params.repo.setCursor(asset.asset_id, timeframe, bars[bars.length - 1].ts_open, 'BINANCE_REST_INCREMENTAL');
        }

        logInfo('Incremental updated', {
          symbol,
          timeframe,
          fetched: bars.length,
          latestTs: bars.length ? bars[bars.length - 1].ts_open : latest
        });
      } catch (error) {
        if (isBinanceAccessBlockedError(error)) {
          binanceRestBlockedUntilMs = Date.now() + BINANCE_BLOCK_COOLDOWN_MS;
          logWarn('Binance futures REST is region-blocked; skipping incremental crypto worker for a cooldown window', {
            symbol,
            timeframe,
            cooldown_hours: BINANCE_BLOCK_COOLDOWN_MS / (1000 * 60 * 60),
            error: error instanceof Error ? error.message : String(error)
          });
          return;
        }
        logWarn('Incremental update failed', {
          symbol,
          timeframe,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      await sleep(cfg.binanceRest.requestDelayMs);
    }
  }
}
