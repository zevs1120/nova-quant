import { ASSET_CLASS, DATA_STATUS, FREQUENCY, createAssetId } from '../types/multiAssetSchema.js';
import { groupBy, sortByDate, toNumber } from './utils.js';

export function normalizeEquities(rawSnapshot) {
  const fetchedAt = rawSnapshot?.metadata?.fetched_at || new Date().toISOString();
  const rawBars = rawSnapshot?.bars || [];
  const rawAssets = rawSnapshot?.assets || [];

  const assets = rawAssets.map((item) => ({
    asset_id: createAssetId(ASSET_CLASS.EQUITY, item.venue || 'XNYS', item.symbol),
    asset_class: ASSET_CLASS.EQUITY,
    symbol: item.symbol,
    venue: item.venue || 'XNYS',
    exchange: item.venue || 'XNYS',
    status: item.status || 'active',
    source: rawSnapshot?.metadata?.source || 'equity_adapter',
    name: item.name,
    sector: item.sector,
    industry: item.industry,
    market_cap: item.market_cap,
    fetched_at: fetchedAt,
    frequency: FREQUENCY.DAILY,
    data_status: DATA_STATUS.NORMALIZED,
    use_notes: 'Normalized US equity instrument registry entry.',
    license_notes: 'See provider terms for live feed usage.'
  }));

  const grouped = groupBy(rawBars, (row) => row.symbol);
  const bars = [];

  for (const [symbol, rows] of grouped.entries()) {
    const ordered = sortByDate(rows, 'date');
    for (let i = 0; i < ordered.length; i += 1) {
      const row = ordered[i];
      const prev = ordered[i - 1];
      const prevClose = toNumber(prev?.adjusted_close ?? prev?.close, 0);
      const close = toNumber(row.adjusted_close ?? row.close, 0);
      const ret = prevClose > 0 ? close / prevClose - 1 : 0;

      bars.push({
        symbol,
        date: row.date,
        open: toNumber(row.open),
        high: toNumber(row.high),
        low: toNumber(row.low),
        close,
        adjusted_close: toNumber(row.adjusted_close ?? row.close),
        volume: Math.max(0, Math.round(toNumber(row.volume))),
        vwap: toNumber(row.vwap, close),
        returns: Number(ret.toFixed(6)),
        source: row.source || rawSnapshot?.metadata?.source || 'equity_adapter',
        fetched_at: row.fetched_at || fetchedAt,
        frequency: row.frequency || FREQUENCY.DAILY,
        data_status: DATA_STATUS.NORMALIZED,
        use_notes: row.use_notes || 'Normalized daily bars for feature engineering and training.',
        license_notes: row.license_notes || 'Sample fallback in demo environment.'
      });
    }
  }

  return {
    metadata: {
      ...rawSnapshot?.metadata,
      data_status: DATA_STATUS.NORMALIZED,
      normalized_at: new Date().toISOString()
    },
    assets,
    bars,
    benchmarks: rawSnapshot?.benchmarks || []
  };
}
