import { getConfig } from '../config.js';
import { MarketRepository } from '../db/repository.js';
import type { NormalizedBar, Timeframe } from '../types.js';
import { fetchWithRetry } from '../utils/http.js';
import { logInfo, logWarn } from '../utils/log.js';
import { sleep, timeframeToMs } from '../utils/time.js';
import { normalizeBars } from './normalize.js';

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
    throw new Error(`Binance REST failed: ${res.status} (${url})`);
  }

  const payload = await res.json();
  return parseKlinesPayload(payload);
}

export async function updateBinanceIncremental(params: {
  symbols: string[];
  timeframes: Timeframe[];
  repo: MarketRepository;
  limit?: number;
}): Promise<void> {
  const cfg = getConfig();
  const limit = params.limit ?? cfg.binanceRest.limit;

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
