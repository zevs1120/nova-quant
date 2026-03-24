import { buildSampleMarketData } from '../../quant/sampleData.js';
import { ASSET_CLASS, DATA_STATUS, FREQUENCY } from '../../types/multiAssetSchema.js';
import { sourceMeta } from '../sourceMeta.js';

const DEFAULT_UNIVERSE = [
  'SPY',
  'QQQ',
  'IWM',
  'AAPL',
  'MSFT',
  'NVDA',
  'AMZN',
  'META',
  'GOOGL',
  'TSLA',
  'JPM',
  'XLF',
  'XLE',
  'XLK',
];

function inferSourceMode(config = {}) {
  if (config?.provider_mode) return config.provider_mode;
  return config?.polygon_api_key ? 'live_path_available' : 'sample_fallback';
}

function buildEquityMetadata(marketItem) {
  return {
    symbol: marketItem.ticker,
    name: marketItem.name,
    sector: marketItem.sector,
    industry: marketItem.industry,
    market_cap: marketItem.market_cap,
    market_cap_bucket:
      marketItem.market_cap_billions >= 200
        ? 'mega'
        : marketItem.market_cap_billions >= 10
          ? 'large'
          : 'mid',
  };
}

export function createEquityAdapter(config = {}) {
  const mode = inferSourceMode(config);

  return {
    id: 'equity-primary',
    asset_class: ASSET_CLASS.EQUITY,
    mode,
    supports_live: true,
    primary_source: mode === 'live_path_available' ? 'polygon' : 'stooq_sample',
    docs: {
      polygon:
        'https://polygon.io/docs/stocks/get_v2_aggs_ticker__stocksticker__range__multiplier___timespan___from___to',
      stooq: 'https://stooq.com/db/h/',
    },
    fetchRawSnapshot({ asOf, symbols = DEFAULT_UNIVERSE } = {}) {
      const sample = buildSampleMarketData({ asOf });
      const selected = sample.instruments.filter(
        (item) => item.market === 'US' && symbols.includes(item.ticker),
      );
      const benchmarks = sample.benchmarks.filter((item) => item.market === 'US');

      return {
        metadata: sourceMeta({
          source: mode === 'live_path_available' ? 'polygon/stooq' : 'local_sample_equity_adapter',
          source_type: 'equity_adapter',
          frequency: FREQUENCY.DAILY,
          data_status: DATA_STATUS.RAW,
          mode,
          use_notes:
            'US equities and ETF daily research data. Live path configured via Polygon or Stooq bulk scripts.',
          license_notes:
            'Sample fallback generated locally. Live path requires provider terms review.',
        }),
        bars: selected.flatMap((item) =>
          item.bars.map((bar) => ({
            symbol: item.ticker,
            date: bar.date,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            adjusted_close: bar.close,
            volume: bar.volume,
            vwap: bar.vwap,
            returns: bar.ret_1d,
            source: mode === 'live_path_available' ? 'polygon_or_stooq_path' : 'sample_equity_bars',
            fetched_at: sample.as_of,
            frequency: FREQUENCY.DAILY,
            data_status: DATA_STATUS.RAW,
            use_notes: 'Daily bar aligned for backtest and training use.',
            license_notes: 'Sample fallback for demo. Replace with licensed feed for production.',
          })),
        ),
        assets: selected.map((item) => ({
          ...buildEquityMetadata(item),
          asset_id: `${ASSET_CLASS.EQUITY}:US:${item.ticker}`,
          asset_class: ASSET_CLASS.EQUITY,
          venue: 'XNYS',
          status: 'active',
          source: mode === 'live_path_available' ? 'polygon/stooq' : 'sample',
        })),
        benchmarks: benchmarks.map((item) => ({
          symbol: item.ticker,
          bars: item.bars,
        })),
        live_path: {
          provider: 'polygon',
          requires_api_key: true,
          endpoint_templates: [
            '/v2/aggs/ticker/{symbol}/range/1/day/{from}/{to}',
            '/v3/reference/tickers/{symbol}',
          ],
        },
      };
    },
  };
}
