import { ASSET_CLASS, DATA_STATUS, FREQUENCY, createAssetId } from '../types/multiAssetSchema.js';
import { groupBy, sortByDate, toNumber } from './utils.js';

export function normalizeCryptoSpot(rawSnapshot) {
  const fetchedAt = rawSnapshot?.metadata?.fetched_at || new Date().toISOString();
  const products = (rawSnapshot?.products || []).map((item) => ({
    venue: item.venue || 'COINBASE',
    product_id: item.product_id,
    symbol: item.symbol || item.product_id,
    base_asset: item.base_asset,
    quote_asset: item.quote_asset,
    status: item.status || 'online',
    source: item.source || rawSnapshot?.metadata?.source || 'crypto_adapter',
    fetched_at: item.fetched_at || fetchedAt,
    frequency: item.frequency || FREQUENCY.DAILY,
    data_status: DATA_STATUS.NORMALIZED,
    use_notes: item.use_notes || 'Normalized crypto product metadata.',
    license_notes: item.license_notes || 'Sample fallback in demo environment.'
  }));

  const grouped = groupBy(rawSnapshot?.bars || [], (row) => row.product_id);
  const bars = [];

  for (const [productId, rows] of grouped.entries()) {
    const ordered = sortByDate(rows, 'date');
    for (let i = 0; i < ordered.length; i += 1) {
      const row = ordered[i];
      const prevClose = toNumber(ordered[i - 1]?.close);
      const close = toNumber(row.close);
      bars.push({
        product_id: productId,
        symbol: row.symbol || productId,
        timestamp: row.timestamp || `${row.date}T00:00:00.000Z`,
        date: row.date || String(row.timestamp || '').slice(0, 10),
        open: toNumber(row.open),
        high: toNumber(row.high),
        low: toNumber(row.low),
        close,
        volume: Math.max(0, toNumber(row.volume)),
        trades_count: Math.max(0, Math.round(toNumber(row.trades_count))),
        returns: prevClose > 0 ? Number((close / prevClose - 1).toFixed(6)) : 0,
        source: row.source || rawSnapshot?.metadata?.source || 'crypto_adapter',
        fetched_at: row.fetched_at || fetchedAt,
        frequency: row.frequency || FREQUENCY.DAILY,
        data_status: DATA_STATUS.NORMALIZED,
        use_notes: row.use_notes || 'Normalized crypto spot bars on 24/7 calendar.',
        license_notes: row.license_notes || 'Sample fallback in demo environment.'
      });
    }
  }

  const assets = products.map((item) => ({
    asset_id: createAssetId(ASSET_CLASS.CRYPTO, item.venue, item.product_id),
    asset_class: ASSET_CLASS.CRYPTO,
    symbol: item.product_id,
    venue: item.venue,
    exchange: item.venue,
    status: item.status,
    source: item.source,
    base_asset: item.base_asset,
    quote_asset: item.quote_asset,
    fetched_at: item.fetched_at,
    frequency: item.frequency,
    data_status: DATA_STATUS.NORMALIZED,
    use_notes: 'Normalized crypto asset registry entry.',
    license_notes: item.license_notes
  }));

  return {
    metadata: {
      ...rawSnapshot?.metadata,
      data_status: DATA_STATUS.NORMALIZED,
      normalized_at: new Date().toISOString()
    },
    assets,
    products,
    bars
  };
}
