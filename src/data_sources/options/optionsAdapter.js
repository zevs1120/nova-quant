import { buildSampleMarketData } from '../../quant/sampleData.js';
import { deterministicNoise, hashCode, round } from '../../quant/math.js';
import { ASSET_CLASS, DATA_STATUS, FREQUENCY } from '../../types/multiAssetSchema.js';
import { sourceMeta } from '../sourceMeta.js';

const DEFAULT_UNDERLYINGS = ['AAPL', 'MSFT', 'SPY', 'QQQ'];
const EXPIRY_OFFSETS = [14, 35, 63];
const STRIKE_BUCKETS = [0.9, 0.95, 1, 1.05, 1.1];

function toDatePlus(baseDate, days) {
  const cursor = new Date(`${baseDate}T00:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

function optionTicker(underlying, expiry, strike, side) {
  const yymmdd = expiry.replaceAll('-', '').slice(2);
  const strikeCode = String(Math.round(strike * 1000)).padStart(8, '0');
  const cp = side === 'call' ? 'C' : 'P';
  return `O:${underlying}${yymmdd}${cp}${strikeCode}`;
}

function inferMode(config = {}) {
  if (config?.provider_mode) return config.provider_mode;
  return config?.polygon_api_key ? 'live_path_available' : 'sample_fallback';
}

function buildContracts(underlying, spotPrice, baseDate, mode) {
  const contracts = [];
  for (const offset of EXPIRY_OFFSETS) {
    const expiry = toDatePlus(baseDate, offset);
    for (const strikeMul of STRIKE_BUCKETS) {
      const strike = round(spotPrice * strikeMul, 2);
      for (const optionType of ['call', 'put']) {
        const ticker = optionTicker(underlying, expiry, strike, optionType);
        contracts.push({
          option_ticker: ticker,
          contract_id: ticker,
          underlying_symbol: underlying,
          expiration_date: expiry,
          strike,
          option_type: optionType,
          multiplier: 100,
          exercise_style: 'american',
          source: mode === 'live_path_available' ? 'polygon_path' : 'sample_option_contracts',
          fetched_at: `${baseDate}T20:00:00.000Z`,
          frequency: FREQUENCY.DAILY,
          data_status: DATA_STATUS.RAW,
          use_notes: 'Contract metadata used for chain snapshots and feature generation.',
          license_notes: 'Sample contract map for demo research environment.',
        });
      }
    }
  }
  return contracts;
}

function buildSnapshot(contract, spotPrice, date, seed) {
  const dte = Math.max(
    1,
    Math.round(
      (new Date(`${contract.expiration_date}T00:00:00.000Z`) - new Date(`${date}T00:00:00.000Z`)) /
        86400000,
    ),
  );
  const intrinsic =
    contract.option_type === 'call'
      ? Math.max(spotPrice - contract.strike, 0)
      : Math.max(contract.strike - spotPrice, 0);
  const moneynessDistance = Math.abs(spotPrice / contract.strike - 1);
  const timeValue = Math.max(
    0.2,
    spotPrice * 0.012 * Math.exp(-moneynessDistance * 4) * Math.sqrt(dte / 365),
  );
  const noise = deterministicNoise(seed, dte + 3) * 0.06;

  const mid = Math.max(0.05, intrinsic + timeValue * (1 + noise));
  const spreadPct = 0.018 + moneynessDistance * 0.11 + Math.max(0, 0.2 - mid / spotPrice);
  const bid = Math.max(0.01, mid * (1 - spreadPct / 2));
  const ask = mid * (1 + spreadPct / 2);
  const ivBase = 0.22 + moneynessDistance * 0.6 + Math.max(0, 0.12 - (dte / 365) * 0.2);
  const impliedVol = Math.max(0.08, ivBase + deterministicNoise(seed + 13, dte + 9) * 0.04);

  const delta =
    contract.option_type === 'call'
      ? Math.max(
          0.05,
          Math.min(0.95, 0.5 + (spotPrice - contract.strike) / Math.max(spotPrice * 0.22, 1)),
        )
      : -Math.max(
          0.05,
          Math.min(0.95, 0.5 + (contract.strike - spotPrice) / Math.max(spotPrice * 0.22, 1)),
        );
  const gamma = Math.max(0.001, 0.018 * Math.exp(-moneynessDistance * 6));
  const theta = -Math.max(0.001, (mid / Math.max(dte, 1)) * 0.18);
  const vega = Math.max(0.01, mid * 0.12 * Math.sqrt(dte / 365));

  const volume = Math.round(
    Math.max(0, 18 + deterministicNoise(seed + 5, dte) * 35 + (1 - moneynessDistance) * 160),
  );
  const oi = Math.round(
    Math.max(
      volume,
      140 + deterministicNoise(seed + 7, dte + 5) * 180 + (1 - moneynessDistance) * 530,
    ),
  );

  return {
    option_ticker: contract.option_ticker,
    timestamp: `${date}T20:00:00.000Z`,
    date,
    last: round(mid * (1 + deterministicNoise(seed + 19, dte + 7) * 0.01), 4),
    bid: round(bid, 4),
    ask: round(ask, 4),
    mid: round(mid, 4),
    volume,
    open_interest: oi,
    implied_volatility: round(impliedVol, 4),
    greeks: {
      delta: round(delta, 4),
      gamma: round(gamma, 5),
      theta: round(theta, 5),
      vega: round(vega, 5),
    },
    underlying_price: round(spotPrice, 4),
    source: 'sample_option_snapshots',
    fetched_at: `${date}T20:10:00.000Z`,
    frequency: FREQUENCY.DAILY,
    data_status: DATA_STATUS.RAW,
    use_notes: 'Daily option mark snapshot for research and model training.',
    license_notes: 'Simulated proxy until live options feed is connected.',
  };
}

export function createOptionsAdapter(config = {}) {
  const mode = inferMode(config);

  return {
    id: 'options-primary',
    asset_class: ASSET_CLASS.OPTION,
    mode,
    supports_live: true,
    primary_source:
      mode === 'live_path_available' ? 'polygon_options' : 'sample_underlying_linked_options',
    docs: {
      polygon_reference: 'https://polygon.io/docs/options/get_v3_reference_options_contracts',
      polygon_snapshot: 'https://polygon.io/docs/options/get_v3_snapshot_options__underlyingasset',
    },
    fetchRawSnapshot({ asOf, underlyings = DEFAULT_UNDERLYINGS } = {}) {
      const sample = buildSampleMarketData({ asOf });
      const underlyingsData = sample.instruments.filter(
        (item) => item.market === 'US' && underlyings.includes(item.ticker),
      );

      const allContracts = [];
      const allSnapshots = [];
      const chainSnapshots = [];

      for (const underlying of underlyingsData) {
        const latestSpot = underlying.bars.at(-1)?.close || 0;
        const contracts = buildContracts(
          underlying.ticker,
          latestSpot,
          underlying.bars.at(-1)?.date || String(asOf).slice(0, 10),
          mode,
        );
        allContracts.push(...contracts);

        const contractsById = Object.fromEntries(
          contracts.map((item) => [item.option_ticker, item]),
        );
        const symbolSeed = hashCode(underlying.ticker);

        for (let i = Math.max(0, underlying.bars.length - 90); i < underlying.bars.length; i += 1) {
          const bar = underlying.bars[i];
          const chainRows = contracts
            .filter((contract) => contract.expiration_date >= bar.date)
            .map((contract, idx) => {
              const snap = buildSnapshot(contract, bar.close, bar.date, symbolSeed + idx * 17 + i);
              allSnapshots.push(snap);
              return snap;
            });

          const calls = chainRows.filter(
            (row) => contractsById[row.option_ticker]?.option_type === 'call',
          );
          const puts = chainRows.filter(
            (row) => contractsById[row.option_ticker]?.option_type === 'put',
          );
          const callIv = calls.length
            ? calls.reduce((sum, row) => sum + row.implied_volatility, 0) / calls.length
            : 0;
          const putIv = puts.length
            ? puts.reduce((sum, row) => sum + row.implied_volatility, 0) / puts.length
            : 0;
          const totalOi = chainRows.reduce((sum, row) => sum + (row.open_interest || 0), 0);
          const topOi = [...chainRows]
            .sort((a, b) => (b.open_interest || 0) - (a.open_interest || 0))
            .slice(0, 5)
            .reduce((sum, row) => sum + (row.open_interest || 0), 0);

          chainSnapshots.push({
            underlying_symbol: underlying.ticker,
            timestamp: `${bar.date}T20:00:00.000Z`,
            date: bar.date,
            contracts: chainRows.map((row) => row.option_ticker),
            derived_chain_metrics: {
              call_put_iv_skew: round(callIv - putIv, 5),
              concentration_top5_oi: totalOi > 0 ? round(topOi / totalOi, 5) : 0,
              total_open_interest: totalOi,
              total_volume: chainRows.reduce((sum, row) => sum + (row.volume || 0), 0),
            },
            source:
              mode === 'live_path_available' ? 'polygon_options_path' : 'sample_option_chains',
            fetched_at: `${bar.date}T20:15:00.000Z`,
            frequency: FREQUENCY.DAILY,
            data_status: DATA_STATUS.RAW,
            use_notes: 'Chain-level snapshot for options feature factory.',
            license_notes: 'Simulated chain metrics linked to sample underlyings.',
          });
        }
      }

      return {
        metadata: sourceMeta({
          source:
            mode === 'live_path_available' ? 'polygon_options' : 'local_sample_options_adapter',
          source_type: 'options_adapter',
          frequency: FREQUENCY.DAILY,
          data_status: DATA_STATUS.RAW,
          mode,
          use_notes: 'US equity options chain-level research data with underlying linkage.',
          license_notes: 'Live usage requires licensed options market data provider.',
        }),
        contracts: allContracts,
        snapshots: allSnapshots,
        chains: chainSnapshots,
        live_path: {
          provider: 'polygon_options',
          requires_api_key: true,
          endpoint_templates: [
            '/v3/reference/options/contracts',
            '/v3/snapshot/options/{underlyingAsset}',
            '/v2/aggs/ticker/{option_ticker}/range/1/day/{from}/{to}',
          ],
        },
      };
    },
  };
}
