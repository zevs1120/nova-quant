import { Readable } from 'node:stream';
import { parse } from 'csv-parse';
import unzipper from 'unzipper';
import type { Entry } from 'unzipper';
import { getConfig } from '../config.js';
import { MarketRepository } from '../db/repository.js';
import type { NormalizedBar, Timeframe } from '../types.js';
import { fetchWithRetry } from '../utils/http.js';
import { logInfo, logWarn } from '../utils/log.js';
import { ingestProviderBars } from './providerGate.js';

function stooqPackUrl(timeframe: Timeframe): string | null {
  const config = getConfig();
  const code = config.stooq.bulkPackCodes[timeframe];
  if (!code) return null;
  return `${config.stooq.baseUrl}/db/d/?b=${code}`;
}

function inferSymbolFromPath(pathName: string): string {
  const name = pathName.split('/').pop() || pathName;
  const stripped = name.replace(/\.(txt|csv)$/i, '');
  const normalized = stripped.toUpperCase();
  return normalized.replace(/\.US$/i, '').replace(/\.$/, '');
}

function parseDateTimeToMs(dateLike: string, timeLike?: string): number {
  const date = String(dateLike).trim();
  if (!date) return Number.NaN;

  let yyyy = '';
  let mm = '';
  let dd = '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    [yyyy, mm, dd] = date.split('-');
  } else if (/^\d{8}$/.test(date)) {
    yyyy = date.slice(0, 4);
    mm = date.slice(4, 6);
    dd = date.slice(6, 8);
  } else {
    return Number.NaN;
  }

  let hh = '00';
  let mi = '00';
  let ss = '00';
  if (timeLike) {
    const clean = String(timeLike).replace(/[^\d]/g, '');
    if (clean.length >= 2) hh = clean.slice(0, 2);
    if (clean.length >= 4) mi = clean.slice(2, 4);
    if (clean.length >= 6) ss = clean.slice(4, 6);
  }

  return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
}

export function parseStooqRecord(record: Record<string, string> | string[]): NormalizedBar | null {
  const arr = Array.isArray(record) ? record : [];
  const get = (key: string): string => {
    if (Array.isArray(record)) return '';
    return record[key] ?? record[key.toLowerCase()] ?? record[key.toUpperCase()] ?? '';
  };

  if (!Array.isArray(record)) {
    const date = get('date');
    const time = get('time') || undefined;
    const ts = parseDateTimeToMs(date, time);
    if (!Number.isFinite(ts)) return null;

    const open = get('open');
    const high = get('high');
    const low = get('low');
    const close = get('close');
    const volume = get('volume') || get('vol');
    if (!open || !high || !low || !close) return null;

    return {
      ts_open: ts,
      open,
      high,
      low,
      close,
      volume: volume || '0',
    };
  }

  const values = arr.map((item) => String(item ?? '').trim());
  const dateIndex = values.findIndex(
    (item) => /^\d{8}$/.test(item) || /^\d{4}-\d{2}-\d{2}$/.test(item),
  );
  if (dateIndex < 0) return null;

  const timeCandidate = values[dateIndex + 1] || '';
  const hasTime = /^\d{4,6}$/.test(timeCandidate);
  const ts = parseDateTimeToMs(values[dateIndex], hasTime ? timeCandidate : undefined);
  if (!Number.isFinite(ts)) return null;

  const openIdx = dateIndex + (hasTime ? 2 : 1);
  const open = values[openIdx];
  const high = values[openIdx + 1];
  const low = values[openIdx + 2];
  const close = values[openIdx + 3];
  const volume = values[openIdx + 4] || '0';
  if (!open || !high || !low || !close) return null;

  return {
    ts_open: ts,
    open,
    high,
    low,
    close,
    volume,
  };
}

async function ingestEntry(
  entry: Entry,
  timeframe: Timeframe,
  repo: MarketRepository,
  batchSize: number,
  source: string,
  allowedSymbols?: Set<string>,
): Promise<void> {
  const symbol = inferSymbolFromPath(entry.path);
  if (!symbol) {
    entry.autodrain();
    return;
  }
  if (allowedSymbols && allowedSymbols.size > 0 && !allowedSymbols.has(symbol.toUpperCase())) {
    entry.autodrain();
    return;
  }

  const asset = repo.upsertAsset({
    market: 'US',
    symbol,
    venue: 'STOOQ',
    quote: 'USD',
    status: 'ACTIVE',
  });

  const parser = parse({
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
    columns: false,
    delimiter: [',', ';', '\t'],
  });

  const stream = entry.pipe(parser);
  const batch: NormalizedBar[] = [];

  for await (const record of stream as AsyncIterable<Record<string, string> | string[]>) {
    const bar = parseStooqRecord(record);
    if (!bar) continue;
    batch.push(bar);

    if (batch.length >= batchSize) {
      ingestProviderBars({
        repo,
        assetId: asset.asset_id,
        timeframe,
        rows: batch,
        source,
        symbol,
      });
      batch.length = 0;
    }
  }

  if (batch.length) {
    ingestProviderBars({
      repo,
      assetId: asset.asset_id,
      timeframe,
      rows: batch,
      source,
      symbol,
    });
  }
}

export async function backfillStooqBulk(params: {
  timeframe: Timeframe;
  repo: MarketRepository;
  source?: string;
  symbols?: string[];
}): Promise<void> {
  const { timeframe, repo } = params;
  const source = params.source || 'STOOQ_BULK';
  const config = getConfig();
  const allowedSymbols =
    Array.isArray(params.symbols) && params.symbols.length
      ? new Set(params.symbols.map((symbol) => String(symbol).toUpperCase()))
      : undefined;
  const url = stooqPackUrl(timeframe);

  if (!url) {
    throw new Error(`No Stooq pack mapping configured for timeframe ${timeframe}`);
  }

  logInfo('Downloading Stooq bulk pack', { timeframe, url });
  const response = await fetchWithRetry(
    url,
    {},
    { attempts: 2, baseDelayMs: 1000 },
    config.stooq.timeoutMs,
  );
  if (!response.ok || !response.body) {
    throw new Error(`Stooq download failed (${response.status}) for ${url}`);
  }

  if ((response.headers.get('content-disposition') || '').toLowerCase().includes('error.txt')) {
    const bodyText = await response.text();
    throw new Error(`Stooq bulk denied for ${url}: ${bodyText.trim()}`);
  }

  const unzipStream = Readable.fromWeb(response.body as never).pipe(
    unzipper.Parse({ forceStream: true }),
  );

  let fileCount = 0;
  for await (const entry of unzipStream as AsyncIterable<Entry>) {
    if (entry.type !== 'File') {
      entry.autodrain();
      continue;
    }
    if (!/\.(txt|csv)$/i.test(entry.path)) {
      entry.autodrain();
      continue;
    }

    fileCount += 1;
    try {
      await ingestEntry(entry, timeframe, repo, config.stooq.batchSize, source, allowedSymbols);
    } catch (error) {
      logWarn('Failed to ingest Stooq file entry', {
        entry: entry.path,
        error: error instanceof Error ? error.message : String(error),
      });
      entry.autodrain();
    }
  }

  logInfo('Stooq bulk ingestion finished', { timeframe, processedFiles: fileCount });
}
