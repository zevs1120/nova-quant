import { getConfig } from '../config.js';
import { MarketRepository } from '../db/repository.js';
import type { NormalizedBar, Timeframe } from '../types.js';
import { fetchWithRetry } from '../utils/http.js';
import { logInfo } from '../utils/log.js';
import { ingestProviderBars } from './providerGate.js';

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
};

function intervalForTimeframe(timeframe: Timeframe): string | null {
  const config = getConfig();
  return config.yahoo.intervals[timeframe] || null;
}

function toBarSeries(payload: YahooChartResponse): NormalizedBar[] {
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];
  const open = quote?.open || [];
  const high = quote?.high || [];
  const low = quote?.low || [];
  const close = quote?.close || [];
  const volume = quote?.volume || [];

  const out: NormalizedBar[] = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const tsSeconds = Number(timestamps[index]);
    const o = open[index];
    const h = high[index];
    const l = low[index];
    const c = close[index];
    const v = volume[index];
    if (![tsSeconds, o, h, l, c].every((value) => Number.isFinite(Number(value)))) continue;
    out.push({
      ts_open: tsSeconds * 1000,
      open: String(o),
      high: String(h),
      low: String(l),
      close: String(c),
      volume: Number.isFinite(Number(v)) ? String(v) : '0',
    });
  }
  return out;
}

async function fetchYahooBars(symbol: string, timeframe: Timeframe): Promise<NormalizedBar[]> {
  const config = getConfig();
  const interval = intervalForTimeframe(timeframe);
  if (!interval) {
    throw new Error(`Yahoo chart does not support timeframe ${timeframe}`);
  }

  const url = new URL(`${config.yahoo.baseUrl}/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set('interval', interval);
  url.searchParams.set('range', config.yahoo.range);
  url.searchParams.set('includePrePost', 'false');
  url.searchParams.set('events', 'div,splits');

  const response = await fetchWithRetry(
    url.toString(),
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 NovaQuant/1.0',
        Accept: 'application/json',
      },
    },
    { attempts: 3, baseDelayMs: 1200 },
    config.yahoo.timeoutMs,
  );
  if (!response.ok) {
    throw new Error(`Yahoo chart failed (${response.status}) for ${symbol}`);
  }
  const json = (await response.json()) as YahooChartResponse;
  if (json.chart?.error) {
    throw new Error(
      `Yahoo chart error for ${symbol}: ${json.chart.error.code || 'UNKNOWN'} ${json.chart.error.description || ''}`.trim(),
    );
  }
  return toBarSeries(json);
}

export async function backfillYahooChart(params: {
  timeframe: Timeframe;
  repo: MarketRepository;
  symbols: string[];
  source?: string;
}): Promise<void> {
  const source = params.source || 'YAHOO_CHART';
  const venue = 'STOOQ';

  for (const symbolRaw of params.symbols) {
    const symbol = String(symbolRaw || '')
      .trim()
      .toUpperCase();
    if (!symbol) continue;
    const asset = params.repo.upsertAsset({
      market: 'US',
      symbol,
      venue,
      quote: 'USD',
      status: 'ACTIVE',
    });
    const bars = await fetchYahooBars(symbol, params.timeframe);
    const summary = ingestProviderBars({
      repo: params.repo,
      assetId: asset.asset_id,
      timeframe: params.timeframe,
      rows: bars,
      source,
      symbol,
    });
    if (bars.length) {
      const latestTs = params.repo.getLatestTsOpen(asset.asset_id, params.timeframe);
      params.repo.setCursor(
        asset.asset_id,
        params.timeframe,
        latestTs ?? bars[bars.length - 1].ts_open,
        source,
      );
    }
    logInfo('Yahoo chart backfill completed', {
      symbol,
      timeframe: params.timeframe,
      inserted: summary.insertedCount,
    });
  }
}
