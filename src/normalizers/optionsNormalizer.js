import { ASSET_CLASS, DATA_STATUS, FREQUENCY, createAssetId } from '../types/multiAssetSchema.js';
import { toNumber } from './utils.js';

export function normalizeOptions(rawSnapshot) {
  const fetchedAt = rawSnapshot?.metadata?.fetched_at || new Date().toISOString();
  const contracts = (rawSnapshot?.contracts || []).map((row) => ({
    option_ticker: row.option_ticker,
    contract_id: row.contract_id || row.option_ticker,
    underlying_symbol: row.underlying_symbol,
    expiration_date: row.expiration_date,
    strike: toNumber(row.strike),
    option_type: row.option_type,
    multiplier: toNumber(row.multiplier, 100),
    exercise_style: row.exercise_style || 'american',
    source: row.source || rawSnapshot?.metadata?.source || 'options_adapter',
    fetched_at: row.fetched_at || fetchedAt,
    frequency: row.frequency || FREQUENCY.DAILY,
    data_status: DATA_STATUS.NORMALIZED,
    use_notes: row.use_notes || 'Normalized option contract metadata.',
    license_notes: row.license_notes || 'Sample fallback in demo environment.',
  }));

  const contractMap = Object.fromEntries(contracts.map((item) => [item.option_ticker, item]));

  const snapshots = (rawSnapshot?.snapshots || []).map((row) => {
    const contract = contractMap[row.option_ticker] || {};
    const underlyingPrice = toNumber(row.underlying_price);
    const strike = toNumber(contract.strike);
    const moneyness = strike > 0 ? underlyingPrice / strike : 0;
    const dte = Math.max(
      0,
      Math.round(
        (new Date(`${contract.expiration_date}T00:00:00.000Z`).getTime() -
          new Date(row.timestamp || row.date).getTime()) /
          86400000,
      ),
    );

    return {
      option_ticker: row.option_ticker,
      timestamp: row.timestamp || `${row.date}T20:00:00.000Z`,
      date: row.date || String(row.timestamp || '').slice(0, 10),
      last: toNumber(row.last),
      bid: toNumber(row.bid),
      ask: toNumber(row.ask),
      mid: toNumber(row.mid),
      volume: Math.max(0, Math.round(toNumber(row.volume))),
      open_interest: Math.max(0, Math.round(toNumber(row.open_interest))),
      implied_volatility: toNumber(row.implied_volatility),
      greeks: {
        delta: toNumber(row.greeks?.delta),
        gamma: toNumber(row.greeks?.gamma),
        theta: toNumber(row.greeks?.theta),
        vega: toNumber(row.greeks?.vega),
      },
      underlying_symbol: contract.underlying_symbol,
      underlying_price: underlyingPrice,
      expiration_date: contract.expiration_date,
      strike,
      option_type: contract.option_type,
      dte,
      moneyness,
      source: row.source || rawSnapshot?.metadata?.source || 'options_adapter',
      fetched_at: row.fetched_at || fetchedAt,
      frequency: row.frequency || FREQUENCY.DAILY,
      data_status: DATA_STATUS.NORMALIZED,
      use_notes: row.use_notes || 'Normalized option snapshot with contract-enriched fields.',
      license_notes: row.license_notes || 'Sample fallback in demo environment.',
    };
  });

  const chains = (rawSnapshot?.chains || []).map((row) => ({
    underlying_symbol: row.underlying_symbol,
    timestamp: row.timestamp,
    date: row.date || String(row.timestamp || '').slice(0, 10),
    contracts: row.contracts || [],
    derived_chain_metrics: {
      call_put_iv_skew: toNumber(row.derived_chain_metrics?.call_put_iv_skew),
      concentration_top5_oi: toNumber(row.derived_chain_metrics?.concentration_top5_oi),
      total_open_interest: Math.max(
        0,
        Math.round(toNumber(row.derived_chain_metrics?.total_open_interest)),
      ),
      total_volume: Math.max(0, Math.round(toNumber(row.derived_chain_metrics?.total_volume))),
    },
    source: row.source || rawSnapshot?.metadata?.source || 'options_adapter',
    fetched_at: row.fetched_at || fetchedAt,
    frequency: row.frequency || FREQUENCY.DAILY,
    data_status: DATA_STATUS.NORMALIZED,
    use_notes: row.use_notes || 'Normalized chain snapshot for term/skew/concentration features.',
    license_notes: row.license_notes || 'Sample fallback in demo environment.',
  }));

  const assets = contracts.map((item) => ({
    asset_id: createAssetId(ASSET_CLASS.OPTION, 'OPRA', item.option_ticker),
    asset_class: ASSET_CLASS.OPTION,
    symbol: item.option_ticker,
    venue: 'OPRA',
    exchange: 'OPRA',
    status: 'active',
    source: item.source,
    underlying_symbol: item.underlying_symbol,
    expiration_date: item.expiration_date,
    option_type: item.option_type,
    strike: item.strike,
    fetched_at: item.fetched_at,
    frequency: item.frequency,
    data_status: DATA_STATUS.NORMALIZED,
    use_notes: 'Normalized option asset registry entry.',
    license_notes: item.license_notes,
  }));

  return {
    metadata: {
      ...rawSnapshot?.metadata,
      data_status: DATA_STATUS.NORMALIZED,
      normalized_at: new Date().toISOString(),
    },
    assets,
    contracts,
    snapshots,
    chains,
  };
}
