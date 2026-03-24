import { describe, expect, it } from 'vitest';
import {
  applyMarketValueWeights,
  upsertImportedHoldings,
  deriveConnectedHoldings,
  mergeHoldingsSources,
  summarizeHoldingsSource
  // @ts-ignore JS runtime module import
} from '../src/utils/holdingsSource.js';

/* ─────────────────────────────────────────────────
 * applyMarketValueWeights — portfolio weight rebalancing
 *
 * This feeds into risk engine. Wrong weights = wrong position sizing.
 * ───────────────────────────────────────────────── */

describe('applyMarketValueWeights', () => {
  it('computes weights that sum to ~100%', () => {
    const rows = [
      { symbol: 'AAPL', quantity: 10, current_price: 200 },
      { symbol: 'GOOGL', quantity: 5, current_price: 180 },
      { symbol: 'MSFT', quantity: 8, current_price: 400 }
    ];
    const result = applyMarketValueWeights(rows);
    const totalWeight = result.reduce((sum: number, r: any) => sum + (r.weight_pct || 0), 0);
    expect(totalWeight).toBeCloseTo(100, 0);
  });

  it('calculates market_value from quantity × current_price', () => {
    const rows = [{ symbol: 'AAPL', quantity: 10, current_price: 200 }];
    const result = applyMarketValueWeights(rows);
    expect(result[0].market_value).toBe(2000);
    expect(result[0].weight_pct).toBe(100);
  });

  it('returns empty array for empty input', () => {
    expect(applyMarketValueWeights([])).toEqual([]);
  });

  it('skips rows with empty symbol', () => {
    const rows = [
      { symbol: '', quantity: 10, current_price: 200 },
      { symbol: 'AAPL', quantity: 5, current_price: 100 }
    ];
    const result = applyMarketValueWeights(rows);
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('AAPL');
  });

  it('preserves existing market_value if provided', () => {
    const rows = [{ symbol: 'AAPL', market_value: 5000 }];
    const result = applyMarketValueWeights(rows);
    expect(result[0].market_value).toBe(5000);
  });

  it('handles row with only market_value (no qty × price)', () => {
    const rows = [
      { symbol: 'AAPL', market_value: 3000 },
      { symbol: 'GOOGL', market_value: 7000 }
    ];
    const result = applyMarketValueWeights(rows);
    expect(result[0].weight_pct).toBeCloseTo(30, 0);
    expect(result[1].weight_pct).toBeCloseTo(70, 0);
  });
});

/* ─────────────────────────────────────────────────
 * upsertImportedHoldings — merge and dedup
 * ───────────────────────────────────────────────── */

describe('upsertImportedHoldings', () => {
  it('merges duplicate symbols by key', () => {
    const existing = [{ symbol: 'AAPL', quantity: 10, current_price: 200, source_kind: 'MANUAL' }];
    const imported = [{ symbol: 'AAPL', quantity: 15, current_price: 205, source_kind: 'IMPORT' }];
    const result = upsertImportedHoldings(existing, imported);
    // Should have 1 merged record, not 2
    expect(result).toHaveLength(1);
    // Imported values should overwrite
    expect(result[0].quantity).toBe(15);
    expect(result[0].current_price).toBe(205);
  });

  it('preserves different symbols from both sources', () => {
    const existing = [{ symbol: 'AAPL', quantity: 10, current_price: 200 }];
    const imported = [{ symbol: 'GOOGL', quantity: 5, current_price: 180 }];
    const result = upsertImportedHoldings(existing, imported);
    expect(result).toHaveLength(2);
    const symbols = result.map((r: any) => r.symbol);
    expect(symbols).toContain('AAPL');
    expect(symbols).toContain('GOOGL');
  });

  it('handles empty existing array', () => {
    const result = upsertImportedHoldings([], [{ symbol: 'AAPL', quantity: 5, current_price: 100 }]);
    expect(result).toHaveLength(1);
  });

  it('handles empty imported array', () => {
    const result = upsertImportedHoldings([{ symbol: 'AAPL', quantity: 5, current_price: 100 }], []);
    expect(result).toHaveLength(1);
  });
});

/* ─────────────────────────────────────────────────
 * deriveConnectedHoldings — empty/null safety
 * ───────────────────────────────────────────────── */

describe('deriveConnectedHoldings', () => {
  it('handles empty broker and exchange snapshots', () => {
    const result = deriveConnectedHoldings({
      brokerSnapshot: {},
      exchangeSnapshot: {}
    });
    expect(result).toEqual([]);
  });

  it('handles null/undefined snapshots', () => {
    const result = deriveConnectedHoldings({
      brokerSnapshot: null,
      exchangeSnapshot: undefined
    });
    expect(result).toEqual([]);
  });

  it('extracts broker positions correctly', () => {
    const result = deriveConnectedHoldings({
      brokerSnapshot: {
        provider: 'Alpaca',
        positions: [
          { symbol: 'AAPL', qty: 10, avg_entry_price: 190, current_price: 200, market_value: 2000 }
        ]
      },
      exchangeSnapshot: {}
    });
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('AAPL');
    expect(result[0].asset_class).toBe('US_STOCK');
    expect(result[0].source_kind).toBe('LIVE');
  });

  it('extracts exchange balances as crypto holdings', () => {
    const result = deriveConnectedHoldings({
      brokerSnapshot: {},
      exchangeSnapshot: {
        provider: 'Binance',
        balances: [
          { asset: 'BTC', free: 0.5, locked: 0.1, mark_price: 62000 },
          { asset: 'ETH', total: 5, mark_price: 3400 }
        ]
      }
    });
    expect(result).toHaveLength(2);
    expect(result.find((r: any) => r.symbol === 'BTC-USDT')).toBeDefined();
    expect(result.find((r: any) => r.symbol === 'ETH-USDT')).toBeDefined();
    expect(result[0].asset_class).toBe('CRYPTO');
  });

  it('filters out USDT balance from exchange', () => {
    const result = deriveConnectedHoldings({
      brokerSnapshot: {},
      exchangeSnapshot: {
        balances: [
          { asset: 'USDT', total: 10000, mark_price: 1 }
        ]
      }
    });
    expect(result).toEqual([]);
  });

  it('skips broker positions with zero quantity', () => {
    const result = deriveConnectedHoldings({
      brokerSnapshot: {
        positions: [
          { symbol: 'AAPL', qty: 0, current_price: 200 }
        ]
      },
      exchangeSnapshot: {}
    });
    expect(result).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────
 * mergeHoldingsSources — live priority over manual
 * ───────────────────────────────────────────────── */

describe('mergeHoldingsSources', () => {
  it('live takes priority over manual for same symbol', () => {
    const result = mergeHoldingsSources({
      manualHoldings: [{ symbol: 'AAPL', quantity: 5, current_price: 190, source_kind: 'MANUAL' }],
      connectedHoldings: [{ symbol: 'AAPL', quantity: 10, current_price: 200, source_kind: 'LIVE', market: 'US', asset_class: 'US_STOCK' }]
    });
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(10);
    expect(result[0].source_kind).toBe('LIVE');
  });

  it('includes manual holdings for symbols not in live', () => {
    const result = mergeHoldingsSources({
      manualHoldings: [{ symbol: 'NVDA', quantity: 3, current_price: 900 }],
      connectedHoldings: [{ symbol: 'AAPL', quantity: 10, current_price: 200, source_kind: 'LIVE' }]
    });
    expect(result).toHaveLength(2);
    const symbols = result.map((r: any) => r.symbol);
    expect(symbols).toContain('AAPL');
    expect(symbols).toContain('NVDA');
  });

  it('handles empty inputs', () => {
    expect(mergeHoldingsSources({ manualHoldings: [], connectedHoldings: [] })).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────
 * summarizeHoldingsSource — status classification
 * ───────────────────────────────────────────────── */

describe('summarizeHoldingsSource', () => {
  it('returns DEMO when investorDemoEnabled', () => {
    const result = summarizeHoldingsSource({ investorDemoEnabled: true });
    expect(result.kind).toBe('DEMO');
    expect(result.connected).toBe(true);
  });

  it('returns LIVE when only connected holdings exist', () => {
    const result = summarizeHoldingsSource({
      investorDemoEnabled: false,
      connectedHoldings: [{ symbol: 'AAPL', quantity: 10 }],
      manualHoldings: []
    });
    expect(result.kind).toBe('LIVE');
    expect(result.live_count).toBe(1);
  });

  it('returns IMPORTED when only manual holdings exist', () => {
    const result = summarizeHoldingsSource({
      investorDemoEnabled: false,
      connectedHoldings: [],
      manualHoldings: [{ symbol: 'AAPL' }]
    });
    expect(result.kind).toBe('IMPORTED');
    expect(result.manual_count).toBe(1);
  });

  it('returns LIVE_PLUS_IMPORTED when both exist', () => {
    const result = summarizeHoldingsSource({
      investorDemoEnabled: false,
      connectedHoldings: [{ symbol: 'AAPL' }],
      manualHoldings: [{ symbol: 'GOOGL' }]
    });
    expect(result.kind).toBe('LIVE_PLUS_IMPORTED');
  });

  it('returns UNAVAILABLE when nothing is available', () => {
    const result = summarizeHoldingsSource({
      investorDemoEnabled: false,
      connectedHoldings: [],
      manualHoldings: []
    });
    expect(result.kind).toBe('UNAVAILABLE');
    expect(result.available).toBe(false);
  });

  it('returns LIVE_EMPTY when broker connected but no positions', () => {
    const result = summarizeHoldingsSource({
      investorDemoEnabled: false,
      connectedHoldings: [],
      manualHoldings: [],
      brokerSnapshot: { can_read_positions: true }
    });
    expect(result.kind).toBe('LIVE_EMPTY');
    expect(result.connected).toBe(true);
  });

  it('returns IMPORTED_FALLBACK when broker connected + manual only', () => {
    const result = summarizeHoldingsSource({
      investorDemoEnabled: false,
      connectedHoldings: [],
      manualHoldings: [{ symbol: 'AAPL' }],
      brokerSnapshot: { can_read_positions: true }
    });
    expect(result.kind).toBe('IMPORTED_FALLBACK');
  });
});

/* ─────────────────────────────────────────────────
 * Asset class inference (inferAssetClass via normalize)
 * ───────────────────────────────────────────────── */

describe('asset class inference through normalize', () => {
  it('detects common crypto symbols (BTC, ETH, SOL)', () => {
    const result = applyMarketValueWeights([
      { symbol: 'BTC', quantity: 1, current_price: 62000 }
    ]);
    expect(result[0].asset_class).toBe('CRYPTO');
    expect(result[0].market).toBe('CRYPTO');
  });

  it('detects USDT-suffixed symbols as crypto', () => {
    const result = applyMarketValueWeights([
      { symbol: 'ETHUSDT', quantity: 5, current_price: 3400 }
    ]);
    expect(result[0].asset_class).toBe('CRYPTO');
  });

  it('detects hyphenated crypto symbols', () => {
    const result = applyMarketValueWeights([
      { symbol: 'SOL-USD', quantity: 20, current_price: 150 }
    ]);
    expect(result[0].asset_class).toBe('CRYPTO');
  });

  it('defaults to US_STOCK for non-crypto symbols', () => {
    const result = applyMarketValueWeights([
      { symbol: 'AAPL', quantity: 10, current_price: 200 }
    ]);
    expect(result[0].asset_class).toBe('US_STOCK');
    expect(result[0].market).toBe('US');
  });

  it('respects explicit asset_class', () => {
    const result = applyMarketValueWeights([
      { symbol: 'AAPL', asset_class: 'OPTIONS', quantity: 1, current_price: 5 }
    ]);
    expect(result[0].asset_class).toBe('OPTIONS');
  });
});
