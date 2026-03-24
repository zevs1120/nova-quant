export const ASSET_CLASS = {
  EQUITY: 'equity',
  OPTION: 'option',
  CRYPTO: 'crypto',
};

export const DATA_STATUS = {
  RAW: 'raw',
  NORMALIZED: 'normalized',
  DERIVED: 'derived',
};

export const FREQUENCY = {
  DAILY: '1d',
  HOURLY: '1h',
  MINUTE_5: '5m',
};

export const REQUIRED_FIELDS = {
  Asset: ['asset_id', 'asset_class', 'symbol', 'venue', 'status', 'source'],
  EquityBar: ['symbol', 'date', 'open', 'high', 'low', 'close', 'volume', 'source'],
  OptionContract: [
    'option_ticker',
    'underlying_symbol',
    'expiration_date',
    'strike',
    'option_type',
    'source',
  ],
  OptionSnapshot: ['option_ticker', 'timestamp', 'mid', 'underlying_price', 'source'],
  OptionChainSnapshot: ['underlying_symbol', 'timestamp', 'contracts'],
  CryptoProduct: ['venue', 'product_id', 'base_asset', 'quote_asset', 'status'],
  CryptoBar: ['product_id', 'timestamp', 'open', 'high', 'low', 'close', 'volume', 'source'],
  DatasetSnapshot: [
    'dataset_id',
    'asset_class',
    'frequency',
    'date_range',
    'source_summary',
    'coverage_summary',
    'missingness_summary',
  ],
  TrainingDataset: [
    'dataset_id',
    'asset_class',
    'feature_set_name',
    'label_definition',
    'split',
    'created_at',
  ],
};

export function buildProvenance({
  source,
  fetched_at,
  frequency,
  id,
  data_status,
  use_notes,
  license_notes,
}) {
  return {
    source,
    fetched_at,
    frequency,
    identifier: id,
    data_status,
    use_notes,
    license_notes,
  };
}

export function createAssetId(assetClass, venue, symbol) {
  return `${assetClass}:${venue}:${symbol}`;
}

export function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toIsoDate(value) {
  return String(value || '').slice(0, 10);
}

export function toIsoTimestamp(value) {
  if (!value) return new Date().toISOString();
  if (String(value).includes('T')) return new Date(value).toISOString();
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}
