import { getConfig } from '../config.js';
import { MarketRepository } from '../db/repository.js';
import type { NormalizedBar, Timeframe } from '../types.js';
import { fetchWithRetry } from '../utils/http.js';
import { logInfo } from '../utils/log.js';
import { normalizeBars } from './normalize.js';

type NasdaqHistoricalResponse = {
  data?: {
    totalRecords?: number;
    tradesTable?: {
      rows?: NasdaqHistoricalRow[];
    };
  } | null;
};

type NasdaqHistoricalRow = {
  date?: string;
  close?: string;
  volume?: string;
  open?: string;
  high?: string;
  low?: string;
};

function parseDateToMs(value: string): number {
  const clean = String(value || '').trim();
  const match = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return Number.NaN;
  const [, mm, dd, yyyy] = match;
  return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), 0, 0, 0);
}

function cleanNumberString(value: string | undefined): string {
  return String(value || '')
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .trim();
}

function assetClassForSymbol(symbol: string): 'stocks' | 'etf' {
  return ['SPY', 'QQQ'].includes(symbol.toUpperCase()) ? 'etf' : 'stocks';
}

async function fetchNasdaqBars(symbol: string, timeframe: Timeframe): Promise<NormalizedBar[]> {
  if (timeframe !== '1d') {
    throw new Error(`Nasdaq historical fallback only supports 1d, received ${timeframe}`);
  }
  const config = getConfig();
  const rows: NasdaqHistoricalRow[] = [];
  const fromdate = '2015-01-01';
  let offset = 0;
  let totalRecords = Number.POSITIVE_INFINITY;

  while (offset < totalRecords) {
    const url = new URL(`${config.nasdaq.baseUrl}/quote/${encodeURIComponent(symbol)}/historical`);
    url.searchParams.set('assetclass', assetClassForSymbol(symbol));
    url.searchParams.set('fromdate', fromdate);
    url.searchParams.set('limit', String(config.nasdaq.limit));
    url.searchParams.set('offset', String(offset));

    const response = await fetchWithRetry(
      url.toString(),
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 NovaQuant/1.0',
          Accept: 'application/json',
          Referer: 'https://www.nasdaq.com/'
        }
      },
      { attempts: 3, baseDelayMs: 1200 },
      config.nasdaq.timeoutMs
    );
    if (!response.ok) {
      throw new Error(`Nasdaq historical failed (${response.status}) for ${symbol}`);
    }
    const json = (await response.json()) as NasdaqHistoricalResponse;
    const pageRows = (json.data?.tradesTable?.rows || []) as NasdaqHistoricalRow[];
    totalRecords = Number(json.data?.totalRecords || pageRows.length || 0);
    if (!pageRows.length) break;
    rows.push(...pageRows);
    offset += pageRows.length;
    if (pageRows.length < config.nasdaq.limit) break;
  }

  return normalizeBars(
    rows
      .map((row: NasdaqHistoricalRow) => {
        const ts_open = parseDateToMs(String(row?.date || ''));
        const open = cleanNumberString(row?.open);
        const high = cleanNumberString(row?.high);
        const low = cleanNumberString(row?.low);
        const close = cleanNumberString(row?.close);
        const volume = cleanNumberString(row?.volume);
        if (!Number.isFinite(ts_open) || !open || !high || !low || !close) return null;
        return {
          ts_open,
          open,
          high,
          low,
          close,
          volume: volume || '0'
        };
      })
      .filter((row: NormalizedBar | null): row is NormalizedBar => Boolean(row))
  );
}

export async function backfillNasdaqHistorical(params: {
  timeframe: Timeframe;
  repo: MarketRepository;
  symbols: string[];
  source?: string;
}): Promise<void> {
  const source = params.source || 'NASDAQ_API';
  const venue = 'STOOQ';

  for (const symbolRaw of params.symbols) {
    const symbol = String(symbolRaw || '').trim().toUpperCase();
    if (!symbol) continue;
    const asset = params.repo.upsertAsset({
      market: 'US',
      symbol,
      venue,
      quote: 'USD',
      status: 'ACTIVE'
    });
    const bars = await fetchNasdaqBars(symbol, params.timeframe);
    params.repo.upsertOhlcvBars(asset.asset_id, params.timeframe, bars, source);
    if (bars.length) {
      params.repo.setCursor(asset.asset_id, params.timeframe, bars[bars.length - 1].ts_open, source);
    }
    logInfo('Nasdaq historical backfill completed', {
      symbol,
      timeframe: params.timeframe,
      inserted: bars.length
    });
  }
}
