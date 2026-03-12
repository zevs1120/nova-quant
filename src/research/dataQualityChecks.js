import { REQUIRED_FIELDS } from '../types/multiAssetSchema.js';
import { sourceHealthRow } from '../data_sources/sourceMeta.js';

function missingness(rows, fields) {
  const total = rows.length || 1;
  const summary = {};
  for (const field of fields) {
    const missing = rows.filter((row) => row[field] === null || row[field] === undefined || row[field] === '').length;
    summary[field] = {
      missing,
      ratio: Number((missing / total).toFixed(6))
    };
  }
  return summary;
}

function duplicateCheck(rows, keyFn) {
  const seen = new Set();
  let duplicate = 0;
  for (const row of rows) {
    const key = keyFn(row);
    if (seen.has(key)) duplicate += 1;
    seen.add(key);
  }
  return {
    duplicates: duplicate,
    duplicate_ratio: rows.length ? Number((duplicate / rows.length).toFixed(6)) : 0
  };
}

function monotonicityCheck(rows, groupField, timeField) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row[groupField];
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  let violations = 0;
  for (const items of grouped.values()) {
    const sorted = [...items].sort((a, b) => String(a[timeField]).localeCompare(String(b[timeField])));
    for (let i = 1; i < sorted.length; i += 1) {
      if (String(sorted[i - 1][timeField]) >= String(sorted[i][timeField])) {
        violations += 1;
      }
    }
  }

  return {
    violations,
    monotonic: violations === 0
  };
}

function schemaValidation(rows, schemaName) {
  const fields = REQUIRED_FIELDS[schemaName] || [];
  let invalid = 0;
  for (const row of rows) {
    const missingRequired = fields.some((field) => row[field] === undefined || row[field] === null || row[field] === '');
    if (missingRequired) invalid += 1;
  }
  return {
    schema: schemaName,
    total_rows: rows.length,
    invalid_rows: invalid,
    invalid_ratio: rows.length ? Number((invalid / rows.length).toFixed(6)) : 0
  };
}

function latestTimestamp(rows, field) {
  if (!rows?.length) return null;
  const sorted = [...rows]
    .map((row) => row[field])
    .filter(Boolean)
    .sort();
  return sorted[sorted.length - 1] || null;
}

function coverageSummary(assetClass, registryRows, dataRows, idField) {
  const covered = new Set((dataRows || []).map((row) => row[idField]));
  const totalAssets = registryRows.length;
  const coveredAssets = registryRows.filter((row) => covered.has(row.symbol) || covered.has(row.option_ticker) || covered.has(row.product_id)).length;
  return {
    asset_class: assetClass,
    total_assets: totalAssets,
    covered_assets: coveredAssets,
    coverage_ratio: totalAssets ? Number((coveredAssets / totalAssets).toFixed(6)) : 0,
    row_count: dataRows.length
  };
}

export function buildDataQualityReport({
  asOf,
  adapters,
  normalized,
  features,
  datasets
}) {
  const equityBars = normalized.equities?.bars || [];
  const optionSnapshots = normalized.options?.snapshots || [];
  const optionContracts = normalized.options?.contracts || [];
  const cryptoBars = normalized.crypto?.bars || [];

  const schemaChecks = [
    schemaValidation(normalized.asset_registry || [], 'Asset'),
    schemaValidation(equityBars, 'EquityBar'),
    schemaValidation(optionContracts, 'OptionContract'),
    schemaValidation(optionSnapshots, 'OptionSnapshot'),
    schemaValidation(normalized.options?.chains || [], 'OptionChainSnapshot'),
    schemaValidation(normalized.crypto?.products || [], 'CryptoProduct'),
    schemaValidation(cryptoBars, 'CryptoBar')
  ];

  const duplicateChecks = {
    equity_bars: duplicateCheck(equityBars, (row) => `${row.symbol}:${row.date}`),
    option_contracts: duplicateCheck(optionContracts, (row) => row.option_ticker),
    option_snapshots: duplicateCheck(optionSnapshots, (row) => `${row.option_ticker}:${row.date}`),
    crypto_bars: duplicateCheck(cryptoBars, (row) => `${row.product_id}:${row.date}`)
  };

  const monotonicity = {
    equity_bars: monotonicityCheck(equityBars, 'symbol', 'date'),
    option_snapshots: monotonicityCheck(optionSnapshots, 'option_ticker', 'date'),
    crypto_bars: monotonicityCheck(cryptoBars, 'product_id', 'date')
  };

  const missingnessSummary = {
    equity_bars: missingness(equityBars, ['open', 'high', 'low', 'close', 'volume', 'date', 'symbol']),
    option_snapshots: missingness(optionSnapshots, ['bid', 'ask', 'mid', 'implied_volatility', 'dte', 'underlying_price']),
    crypto_bars: missingness(cryptoBars, ['open', 'high', 'low', 'close', 'volume', 'date', 'product_id'])
  };

  const sourceHealth = [
    sourceHealthRow({
      source: adapters.equity.id,
      asset_class: 'equity',
      mode: adapters.equity.mode,
      supports_live: adapters.equity.supports_live,
      last_fetched_at: normalized.equities?.metadata?.fetched_at,
      latest_data_time: latestTimestamp(equityBars, 'date'),
      stale_threshold_hours: 72,
      notes: 'US equity daily research feed'
    }),
    sourceHealthRow({
      source: adapters.options.id,
      asset_class: 'option',
      mode: adapters.options.mode,
      supports_live: adapters.options.supports_live,
      last_fetched_at: normalized.options?.metadata?.fetched_at,
      latest_data_time: latestTimestamp(optionSnapshots, 'date'),
      stale_threshold_hours: 72,
      notes: 'US options chain snapshots'
    }),
    sourceHealthRow({
      source: adapters.crypto.id,
      asset_class: 'crypto',
      mode: adapters.crypto.mode,
      supports_live: adapters.crypto.supports_live,
      last_fetched_at: normalized.crypto?.metadata?.fetched_at,
      latest_data_time: latestTimestamp(cryptoBars, 'date'),
      stale_threshold_hours: 24,
      notes: 'Crypto spot 24/7 market data'
    })
  ];

  const coverage = {
    equity: coverageSummary('equity', normalized.equities?.assets || [], equityBars, 'symbol'),
    option: coverageSummary('option', normalized.options?.assets || [], optionSnapshots, 'option_ticker'),
    crypto: coverageSummary('crypto', normalized.crypto?.assets || [], cryptoBars, 'product_id')
  };

  const datasetHealth = (datasets || []).map((item) => ({
    dataset_id: item.dataset_id,
    asset_class: item.asset_class,
    rows: Object.values(item.split || {}).reduce((sum, value) => sum + Number(value || 0), 0),
    split: item.split
  }));

  const topIssues = [];
  for (const [key, value] of Object.entries(duplicateChecks)) {
    if (value.duplicates > 0) topIssues.push(`${key} has ${value.duplicates} duplicates`);
  }
  for (const [key, value] of Object.entries(monotonicity)) {
    if (!value.monotonic) topIssues.push(`${key} has ${value.violations} monotonicity violations`);
  }

  const latestDataStatus = {
    as_of: asOf,
    raw: {
      equity: normalized.equities?.metadata?.fetched_at,
      option: normalized.options?.metadata?.fetched_at,
      crypto: normalized.crypto?.metadata?.fetched_at
    },
    normalized: {
      equity: normalized.equities?.metadata?.normalized_at,
      option: normalized.options?.metadata?.normalized_at,
      crypto: normalized.crypto?.metadata?.normalized_at
    },
    derived: {
      equity_feature_rows: features.equity?.rows?.length || 0,
      option_feature_rows: features.option?.rows?.length || 0,
      crypto_feature_rows: features.crypto?.rows?.length || 0
    }
  };

  return {
    generated_at: new Date().toISOString(),
    source_health_summary: sourceHealth,
    coverage_summary: coverage,
    missingness_summary: missingnessSummary,
    duplicate_summary: duplicateChecks,
    monotonicity_summary: monotonicity,
    schema_validation: schemaChecks,
    stale_data_detection: sourceHealth.map((row) => ({
      source: row.source,
      asset_class: row.asset_class,
      stale: row.stale,
      age_hours: row.age_hours
    })),
    dataset_health: datasetHealth,
    top_issues: topIssues,
    overall_status: topIssues.length ? 'attention' : 'healthy',
    latest_data_status: latestDataStatus
  };
}
