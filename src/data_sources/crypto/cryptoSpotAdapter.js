import { buildSampleMarketData } from '../../quant/sampleData.js';
import { deterministicNoise, hashCode } from '../../quant/math.js';
import { ASSET_CLASS, DATA_STATUS, FREQUENCY } from '../../types/multiAssetSchema.js';
import { sourceMeta } from '../sourceMeta.js';

const DEFAULT_PRODUCTS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];

function inferMode(config = {}) {
  if (config?.provider_mode) return config.provider_mode;
  return config?.coinbase_enabled ? 'live_path_available' : 'sample_fallback';
}

function splitPair(symbol) {
  const [base, quote] = symbol.split('-');
  return { base, quote };
}

export function createCryptoSpotAdapter(config = {}) {
  const mode = inferMode(config);

  return {
    id: 'crypto-spot-primary',
    asset_class: ASSET_CLASS.CRYPTO,
    mode,
    supports_live: true,
    primary_source: mode === 'live_path_available' ? 'coinbase_public' : 'sample_crypto_spot',
    docs: {
      coinbase_products: 'https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproducts',
      coinbase_candles: 'https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles'
    },
    fetchRawSnapshot({ asOf, productIds = DEFAULT_PRODUCTS } = {}) {
      const sample = buildSampleMarketData({ asOf });
      const selected = sample.instruments.filter((item) => item.market === 'CRYPTO' && productIds.includes(item.ticker));

      const products = selected.map((item) => {
        const pair = splitPair(item.ticker);
        return {
          venue: 'COINBASE',
          product_id: item.ticker,
          symbol: item.ticker,
          base_asset: pair.base,
          quote_asset: pair.quote,
          status: 'online',
          source: mode === 'live_path_available' ? 'coinbase_path' : 'sample_crypto_products',
          fetched_at: sample.as_of,
          frequency: FREQUENCY.DAILY,
          data_status: DATA_STATUS.RAW,
          use_notes: 'Spot products normalized by base/quote for multi-exchange compatibility.',
          license_notes: 'Sample fallback from deterministic generator.'
        };
      });

      const bars = selected.flatMap((item) => {
        const seed = hashCode(item.ticker);
        return item.bars.slice(-140).map((bar, index) => ({
          product_id: item.ticker,
          symbol: item.ticker,
          timestamp: `${bar.date}T00:00:00.000Z`,
          date: bar.date,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          trades_count: Math.max(12, Math.round(bar.volume / Math.max(bar.close, 1) * 0.9 + deterministicNoise(seed, index + 9) * 40)),
          source: mode === 'live_path_available' ? 'coinbase_candles_path' : 'sample_crypto_bars',
          fetched_at: `${bar.date}T00:10:00.000Z`,
          frequency: FREQUENCY.DAILY,
          data_status: DATA_STATUS.RAW,
          use_notes: 'Crypto spot OHLCV on 24/7 calendar.',
          license_notes: 'Sample fallback. Use exchange-compliant feed for production.'
        }));
      });

      return {
        metadata: sourceMeta({
          source: mode === 'live_path_available' ? 'coinbase_public' : 'local_sample_crypto_adapter',
          source_type: 'crypto_adapter',
          frequency: FREQUENCY.DAILY,
          data_status: DATA_STATUS.RAW,
          mode,
          use_notes: 'Crypto spot research feed with normalized product schema.',
          license_notes: 'Public exchange endpoints are rate-limited and venue-specific.'
        }),
        products,
        bars,
        live_path: {
          provider: 'coinbase_exchange_public',
          requires_api_key: false,
          endpoint_templates: [
            '/products',
            '/products/{product_id}/candles',
            '/products/{product_id}/ticker'
          ]
        }
      };
    }
  };
}
