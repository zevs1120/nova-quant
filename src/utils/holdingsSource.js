function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function asSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

const COMMON_CRYPTO_SYMBOLS = new Set([
  'BTC',
  'ETH',
  'SOL',
  'BNB',
  'XRP',
  'DOGE',
  'ADA',
  'AVAX',
  'TRX',
  'LINK',
  'LTC',
  'TON',
]);

function inferAssetClass(row = {}) {
  const explicit = String(row?.asset_class || '')
    .trim()
    .toUpperCase();
  if (explicit === 'CRYPTO' || explicit === 'OPTIONS' || explicit === 'US_STOCK') return explicit;
  const symbol = asSymbol(row?.symbol);
  if (COMMON_CRYPTO_SYMBOLS.has(symbol)) return 'CRYPTO';
  if (symbol.includes('-') || symbol.endsWith('USDT') || symbol.endsWith('USD')) return 'CRYPTO';
  return 'US_STOCK';
}

function inferMarket(row = {}) {
  const explicit = String(row?.market || '')
    .trim()
    .toUpperCase();
  if (explicit === 'US' || explicit === 'CRYPTO') return explicit;
  return inferAssetClass(row) === 'CRYPTO' ? 'CRYPTO' : 'US';
}

function baseMarketValue(row = {}) {
  const explicit = toNumber(row?.market_value);
  if (explicit !== null && explicit > 0) return explicit;
  const quantity = toNumber(row?.quantity);
  const currentPrice = toNumber(row?.current_price);
  if (quantity !== null && quantity > 0 && currentPrice !== null && currentPrice > 0) {
    return quantity * currentPrice;
  }
  return null;
}

function holdingKey(row = {}) {
  const symbol = asSymbol(row?.symbol);
  if (!symbol) return '';
  return `${inferMarket(row)}:${inferAssetClass(row)}:${symbol}`;
}

function mergeField(previous, next) {
  if (next === null || next === undefined || next === '') return previous;
  return next;
}

function mergeHoldingRecords(previous = {}, next = {}) {
  return {
    ...previous,
    ...next,
    id: mergeField(previous.id, next.id),
    symbol: mergeField(previous.symbol, next.symbol),
    asset_class: mergeField(previous.asset_class, next.asset_class),
    market: mergeField(previous.market, next.market),
    weight_pct: mergeField(previous.weight_pct, next.weight_pct),
    quantity: mergeField(previous.quantity, next.quantity),
    cost_basis: mergeField(previous.cost_basis, next.cost_basis),
    current_price: mergeField(previous.current_price, next.current_price),
    market_value: mergeField(previous.market_value, next.market_value),
    sector: mergeField(previous.sector, next.sector),
    note: mergeField(previous.note, next.note),
    source_kind: mergeField(previous.source_kind, next.source_kind),
    source_label: mergeField(previous.source_label, next.source_label),
    import_confidence: mergeField(previous.import_confidence, next.import_confidence),
  };
}

function normalizeHoldingRow(row = {}, fallbackSourceKind = 'MANUAL') {
  const symbol = asSymbol(row?.symbol);
  if (!symbol) return null;
  const assetClass = inferAssetClass(row);
  const market = inferMarket(row);
  const quantity = toNumber(row?.quantity);
  const currentPrice = toNumber(row?.current_price);
  const marketValue = baseMarketValue(row);
  return {
    ...row,
    id:
      row?.id ||
      `${String(fallbackSourceKind || 'manual').toLowerCase()}-${market}-${assetClass}-${symbol}`,
    symbol,
    asset_class: assetClass,
    market,
    weight_pct: toNumber(row?.weight_pct),
    quantity,
    cost_basis: toNumber(row?.cost_basis),
    current_price: currentPrice,
    market_value: marketValue === null ? null : round(marketValue, 2),
    sector: row?.sector || null,
    note: row?.note || '',
    source_kind: row?.source_kind || fallbackSourceKind,
    source_label: row?.source_label || null,
    import_confidence: toNumber(row?.import_confidence),
  };
}

export function applyMarketValueWeights(rows = []) {
  const normalized = rows
    .map((row) => normalizeHoldingRow(row, row?.source_kind || 'MANUAL'))
    .filter(Boolean);
  if (!normalized.length) return [];

  const values = normalized.map((row) => baseMarketValue(row));
  const canReweight = values.length > 0 && values.every((value) => value !== null && value > 0);

  if (!canReweight) {
    return normalized.map((row, index) => ({
      ...row,
      market_value: values[index] === null ? (row.market_value ?? null) : round(values[index], 2),
    }));
  }

  const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
  return normalized.map((row, index) => ({
    ...row,
    market_value: round(values[index], 2),
    weight_pct: total > 0 ? round((values[index] / total) * 100, 2) : (row.weight_pct ?? null),
  }));
}

export function upsertImportedHoldings(existingHoldings = [], importedHoldings = []) {
  const merged = new Map();

  for (const row of existingHoldings || []) {
    const normalized = normalizeHoldingRow(row, row?.source_kind || 'MANUAL');
    if (!normalized) continue;
    merged.set(holdingKey(normalized), normalized);
  }

  for (const row of importedHoldings || []) {
    const normalized = normalizeHoldingRow(row, row?.source_kind || 'MANUAL');
    if (!normalized) continue;
    const key = holdingKey(normalized);
    merged.set(key, mergeHoldingRecords(merged.get(key), normalized));
  }

  return applyMarketValueWeights(Array.from(merged.values()));
}

export function deriveConnectedHoldings({ brokerSnapshot, exchangeSnapshot }) {
  const brokerPositions = Array.isArray(brokerSnapshot?.positions) ? brokerSnapshot.positions : [];
  const exchangeBalances = Array.isArray(exchangeSnapshot?.balances)
    ? exchangeSnapshot.balances
    : [];
  const rows = [];

  for (const row of brokerPositions) {
    const symbol = asSymbol(row?.symbol);
    const quantity = Number(row?.qty || 0);
    if (!symbol || !(quantity > 0)) continue;
    rows.push({
      id: `broker-${symbol}`,
      symbol,
      asset_class: 'US_STOCK',
      market: 'US',
      quantity,
      cost_basis: toNumber(row?.avg_entry_price),
      current_price: toNumber(row?.current_price),
      market_value: toNumber(row?.market_value),
      note: '',
      source_kind: 'LIVE',
      source_label: brokerSnapshot?.provider
        ? `${brokerSnapshot.provider} read-only`
        : 'Broker read-only',
    });
  }

  const pricedExchangeBalances = exchangeBalances
    .map((row) => ({
      asset: asSymbol(row?.asset),
      total: Number(row?.total || Number(row?.free || 0) + Number(row?.locked || 0)),
      mark_price: toNumber(row?.mark_price),
      market_value: toNumber(row?.market_value),
    }))
    .filter((row) => row.asset && row.asset !== 'USDT' && row.total > 0);

  for (const row of pricedExchangeBalances) {
    rows.push({
      id: `exchange-${row.asset}`,
      symbol: `${row.asset}-USDT`,
      asset_class: 'CRYPTO',
      market: 'CRYPTO',
      quantity: row.total,
      current_price: row.mark_price,
      market_value: row.market_value,
      note: '',
      source_kind: 'LIVE',
      source_label: exchangeSnapshot?.provider
        ? `${exchangeSnapshot.provider} read-only`
        : 'Exchange read-only',
    });
  }

  return applyMarketValueWeights(rows);
}

export function mergeHoldingsSources({ manualHoldings = [], connectedHoldings = [] }) {
  const merged = new Map();
  const liveKeys = new Set();

  for (const row of connectedHoldings || []) {
    const normalized = normalizeHoldingRow(row, row?.source_kind || 'LIVE');
    if (!normalized) continue;
    const key = holdingKey(normalized);
    liveKeys.add(key);
    merged.set(key, normalized);
  }

  for (const row of manualHoldings || []) {
    const normalized = normalizeHoldingRow(row, row?.source_kind || 'MANUAL');
    if (!normalized) continue;
    const key = holdingKey(normalized);
    if (liveKeys.has(key)) continue;
    merged.set(key, normalized);
  }

  return applyMarketValueWeights(Array.from(merged.values()));
}

export function summarizeHoldingsSource({
  investorDemoEnabled,
  manualHoldings = [],
  connectedHoldings = [],
  brokerSnapshot,
  exchangeSnapshot,
}) {
  if (investorDemoEnabled) {
    return {
      kind: 'DEMO',
      connected: true,
      available: true,
      live_count: 0,
      manual_count: 0,
      message: 'Demo holdings enabled.',
    };
  }

  const liveReadable = Boolean(
    brokerSnapshot?.can_read_positions || exchangeSnapshot?.can_read_positions,
  );
  const manualCount = Array.isArray(manualHoldings)
    ? manualHoldings.filter((row) => asSymbol(row?.symbol)).length
    : 0;
  const liveCount = Array.isArray(connectedHoldings) ? connectedHoldings.length : 0;

  if (liveCount > 0 && manualCount > 0) {
    return {
      kind: 'LIVE_PLUS_IMPORTED',
      connected: true,
      available: true,
      live_count: liveCount,
      manual_count: manualCount,
      message: `Live read-only holdings loaded with ${manualCount} imported fallback position${manualCount === 1 ? '' : 's'}.`,
    };
  }

  if (liveCount > 0) {
    return {
      kind: 'LIVE',
      connected: true,
      available: true,
      live_count: liveCount,
      manual_count: manualCount,
      message: 'Live read-only holdings loaded from connected accounts.',
    };
  }

  if (liveReadable && manualCount > 0) {
    return {
      kind: 'IMPORTED_FALLBACK',
      connected: true,
      available: true,
      live_count: liveCount,
      manual_count: manualCount,
      message: 'Connected accounts are live, but imported holdings are filling the gap right now.',
    };
  }

  if (liveReadable) {
    return {
      kind: 'LIVE_EMPTY',
      connected: true,
      available: true,
      live_count: liveCount,
      manual_count: manualCount,
      message: 'Connected accounts are live, but no open holdings were reported.',
    };
  }

  if (manualCount > 0) {
    return {
      kind: 'IMPORTED',
      connected: false,
      available: true,
      live_count: liveCount,
      manual_count: manualCount,
      message: `Imported holdings ready (${manualCount} position${manualCount === 1 ? '' : 's'}).`,
    };
  }

  return {
    kind: 'UNAVAILABLE',
    connected: false,
    available: false,
    live_count: liveCount,
    manual_count: manualCount,
    message:
      brokerSnapshot?.message ||
      exchangeSnapshot?.message ||
      'Connect a broker or import holdings to get started.',
  };
}
