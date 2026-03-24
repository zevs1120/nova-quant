import { parse as parseCsvSync } from 'csv-parse/sync';
import { applyMarketValueWeights } from '../../utils/holdingsSource.js';

type ParsedHolding = {
  id?: string;
  symbol: string;
  asset_class?: 'US_STOCK' | 'CRYPTO' | 'OPTIONS' | null;
  market?: 'US' | 'CRYPTO' | null;
  weight_pct?: number | null;
  quantity?: number | null;
  cost_basis?: number | null;
  current_price?: number | null;
  market_value?: number | null;
  note?: string | null;
  source_kind?: string | null;
  source_label?: string | null;
  import_confidence?: number | null;
};

type ImportSummary = {
  source: 'CSV' | 'SCREENSHOT';
  imported_count: number;
  skipped_count: number;
  warnings: string[];
  source_label: string;
  columns?: string[];
};

const COMMON_CRYPTO_SYMBOLS = new Set(['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'TRX', 'LINK', 'LTC', 'TON']);

function asText(value: unknown) {
  return String(value || '').trim();
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).replace(/[$,%\s,]/g, '');
  const next = Number(normalized);
  return Number.isFinite(next) ? next : null;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeHeader(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[%()[\]\/\\.-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeSymbol(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^\$/, '');
}

function inferAssetClass(symbol: string, rawAssetClass?: unknown) {
  const explicit = asText(rawAssetClass).toUpperCase();
  if (explicit === 'US_STOCK' || explicit === 'CRYPTO' || explicit === 'OPTIONS') return explicit as ParsedHolding['asset_class'];
  if (explicit === 'STOCK' || explicit === 'EQUITY' || explicit === 'ETF') return 'US_STOCK';
  if (explicit === 'COIN' || explicit === 'TOKEN') return 'CRYPTO';
  if (COMMON_CRYPTO_SYMBOLS.has(symbol)) return 'CRYPTO';
  if (symbol.includes('-') || symbol.endsWith('USDT') || symbol.endsWith('USD')) return 'CRYPTO';
  return 'US_STOCK';
}

function inferMarket(assetClass: ParsedHolding['asset_class'], rawMarket?: unknown) {
  const explicit = asText(rawMarket).toUpperCase();
  if (explicit === 'US' || explicit === 'CRYPTO') return explicit as ParsedHolding['market'];
  return assetClass === 'CRYPTO' ? 'CRYPTO' : 'US';
}

function normalizeWeight(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value);
  const numeric = toNumber(value);
  if (numeric === null) return null;
  if (raw.includes('%')) return numeric;
  if (Math.abs(numeric) <= 1.5) return numeric * 100;
  return numeric;
}

function detectDelimiter(input: string) {
  const firstLine = String(input || '')
    .split(/\r?\n/)
    .find((line) => String(line || '').trim());
  if (!firstLine) return ',';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  if (semicolonCount > commaCount) return ';';
  return ',';
}

function resolveField(record: Record<string, unknown>, aliases: string[]) {
  const entries = Object.entries(record);
  for (const alias of aliases) {
    const match = entries.find(([key]) => normalizeHeader(key) === alias);
    if (match) return match[1];
  }
  return undefined;
}

function extractJsonObject(raw: string) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function buildIdentityKey(row: ParsedHolding) {
  return `${row.market || 'US'}:${row.asset_class || 'US_STOCK'}:${normalizeSymbol(row.symbol)}`;
}

function mergeParsedHoldings(previous: ParsedHolding | undefined, next: ParsedHolding) {
  if (!previous) return next;
  const prevQuantity = toNumber(previous.quantity);
  const nextQuantity = toNumber(next.quantity);
  const mergedQuantity =
    prevQuantity !== null && nextQuantity !== null ? prevQuantity + nextQuantity : nextQuantity ?? prevQuantity ?? null;
  const prevMarketValue = toNumber(previous.market_value);
  const nextMarketValue = toNumber(next.market_value);
  const mergedMarketValue =
    prevMarketValue !== null && nextMarketValue !== null ? prevMarketValue + nextMarketValue : nextMarketValue ?? prevMarketValue ?? null;

  let mergedCostBasis = next.cost_basis ?? previous.cost_basis ?? null;
  if (prevQuantity !== null && nextQuantity !== null && mergedQuantity && previous.cost_basis !== null && next.cost_basis !== null) {
    mergedCostBasis = round(
      ((prevQuantity * Number(previous.cost_basis)) + (nextQuantity * Number(next.cost_basis))) / mergedQuantity,
      4
    );
  }

  return {
    ...previous,
    ...next,
    quantity: mergedQuantity,
    market_value: mergedMarketValue,
    cost_basis: mergedCostBasis,
    current_price: next.current_price ?? previous.current_price ?? null,
    weight_pct: next.weight_pct ?? previous.weight_pct ?? null,
    note: next.note || previous.note || null,
    import_confidence: next.import_confidence ?? previous.import_confidence ?? null
  };
}

function finalizeImportedRows(rows: ParsedHolding[], sourceKind: 'CSV' | 'SCREENSHOT', sourceLabel: string) {
  const grouped = new Map<string, ParsedHolding>();

  rows.forEach((row, index) => {
    const symbol = normalizeSymbol(row.symbol);
    if (!symbol) return;
    const assetClass = inferAssetClass(symbol, row.asset_class);
    const market = inferMarket(assetClass, row.market);
    const normalizedSymbol = assetClass === 'CRYPTO' && !symbol.includes('-') ? `${symbol}-USDT` : symbol;
    const normalizedRow: ParsedHolding = {
      ...row,
      id: row.id || `${String(sourceKind).toLowerCase()}-${index + 1}-${normalizedSymbol}`,
      symbol: normalizedSymbol,
      asset_class: assetClass,
      market,
      quantity: toNumber(row.quantity),
      cost_basis: toNumber(row.cost_basis),
      current_price: toNumber(row.current_price),
      market_value: toNumber(row.market_value),
      weight_pct: toNumber(row.weight_pct),
      note: asText(row.note) || null,
      source_kind: sourceKind,
      source_label: sourceLabel,
      import_confidence: toNumber(row.import_confidence)
    };
    const key = buildIdentityKey(normalizedRow);
    grouped.set(key, mergeParsedHoldings(grouped.get(key), normalizedRow));
  });

  return applyMarketValueWeights(Array.from(grouped.values()));
}

export function importHoldingsFromCsvText(args: { csvText: string; filename?: string }) {
  const csvText = String(args.csvText || '').trim();
  if (!csvText) {
    throw new Error('CSV text is required.');
  }

  const delimiter = detectDelimiter(csvText);
  const records = parseCsvSync(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
    delimiter
  }) as Array<Record<string, unknown>>;

  if (!records.length) {
    return {
      holdings: [],
      summary: {
        source: 'CSV',
        imported_count: 0,
        skipped_count: 0,
        warnings: ['The file had no rows to import.'],
        source_label: args.filename || 'CSV import',
        columns: []
      } satisfies ImportSummary
    };
  }

  const warnings: string[] = [];
  let skippedCount = 0;
  const rows: ParsedHolding[] = [];

  for (const record of records) {
    const symbol = normalizeSymbol(
      resolveField(record, ['symbol', 'ticker', 'asset', 'instrument', 'code', 'security', 'token', 'coin'])
    );
    if (!symbol) {
      skippedCount += 1;
      continue;
    }

    const assetClass = inferAssetClass(symbol, resolveField(record, ['asset class', 'asset type', 'type', 'category']));
    const quantity = toNumber(resolveField(record, ['quantity', 'qty', 'shares', 'units', 'size', 'position size']));
    const currentPrice = toNumber(resolveField(record, ['current price', 'price', 'last price', 'mark price', 'market price', 'last']));
    const marketValue = toNumber(resolveField(record, ['market value', 'position value', 'value', 'current value', 'notional']));
    const costBasis = toNumber(resolveField(record, ['cost basis', 'avg cost', 'average cost', 'avg entry', 'avg entry price', 'cost']));
    const weightPct = normalizeWeight(resolveField(record, ['weight', 'weight pct', 'weight %', 'allocation', 'allocation pct', 'portfolio pct']));
    const note = asText(resolveField(record, ['name', 'description', 'note', 'company']));

    rows.push({
      symbol,
      asset_class: assetClass,
      market: inferMarket(assetClass, resolveField(record, ['market', 'venue'])),
      quantity,
      current_price: currentPrice,
      market_value: marketValue,
      cost_basis: costBasis,
      weight_pct: weightPct,
      note
    });
  }

  const holdings = finalizeImportedRows(rows, 'CSV', args.filename || 'CSV import');
  if (!holdings.length) {
    warnings.push('No recognizable holdings rows were found in the file.');
  }

  return {
    holdings,
    summary: {
      source: 'CSV',
      imported_count: holdings.length,
      skipped_count: skippedCount,
      warnings,
      source_label: args.filename || 'CSV import',
      columns: Object.keys(records[0] || {})
    } satisfies ImportSummary
  };
}

function visionEndpoint() {
  const raw = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions').trim();
  if (raw.endsWith('/chat/completions')) return raw;
  if (raw.endsWith('/v1')) return `${raw}/chat/completions`;
  return `${raw.replace(/\/+$/, '')}/v1/chat/completions`;
}

export async function importHoldingsFromScreenshot(args: { imageDataUrl: string }) {
  const imageDataUrl = String(args.imageDataUrl || '').trim();
  if (!imageDataUrl.startsWith('data:image/')) {
    throw new Error('A screenshot image is required.');
  }

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('Screenshot import requires OPENAI_API_KEY.');
    error.name = 'SCREENSHOT_IMPORT_UNAVAILABLE';
    throw error;
  }

  const response = await fetch(visionEndpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Extract portfolio holdings from brokerage or exchange screenshots. Return strict JSON only. Skip cash, buying power, day PnL, totals, and watchlists.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Return {"holdings":[{"symbol":"","asset_class":"US_STOCK|CRYPTO|OPTIONS|null","market":"US|CRYPTO|null","quantity":null,"current_price":null,"market_value":null,"cost_basis":null,"weight_pct":null,"note":null,"import_confidence":null}],"warnings":[""]}. Only include open positions that are clearly visible. Use BTC-USDT style symbols for crypto when only the base symbol is visible.'
            },
            {
              type: 'image_url',
              image_url: {
                url: imageDataUrl
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Screenshot import failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = payload.choices?.[0]?.message?.content || '';
  const parsed = extractJsonObject(raw);
  const rawHoldings = Array.isArray(parsed?.holdings) ? (parsed?.holdings as ParsedHolding[]) : [];
  const holdings = finalizeImportedRows(rawHoldings, 'SCREENSHOT', 'Screenshot import');
  const warnings = Array.isArray(parsed?.warnings)
    ? parsed.warnings.map((item) => asText(item)).filter(Boolean)
    : [];

  return {
    holdings,
    summary: {
      source: 'SCREENSHOT',
      imported_count: holdings.length,
      skipped_count: Math.max(0, rawHoldings.length - holdings.length),
      warnings,
      source_label: 'Screenshot import'
    } satisfies ImportSummary
  };
}
