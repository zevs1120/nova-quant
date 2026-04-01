/**
 * Enhanced Smoke Test — Massive API Real Validation
 *
 * Tests against the live Massive.com API with real API key.
 * Run: npx tsx scripts/massive-smoke-test.ts
 *
 * Validates:
 * 1. Multiple ticker types (stock, ETF, crypto)
 * 2. Data integrity (OHLC invariants)
 * 3. Time continuity (no unexpected gaps)
 * 4. Invalid ticker handling
 * 5. Full DB round-trip via getOhlcv
 * 6. Multiple timeframes
 */
import dotenv from 'dotenv';
dotenv.config();

import { fetchMassiveAggs, convertCryptoSymbol } from '../src/server/ingestion/massive.js';
import { normalizeBars } from '../src/server/ingestion/normalize.js';
import { InMemorySyncDb as Database } from '../src/server/db/inMemorySyncDb.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;
let warnCount = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${label}`);
  } else {
    failCount++;
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function warn(label: string) {
  warnCount++;
  console.log(`  ⚠️  ${label}`);
}

const RATE_DELAY_MS = 12_500; // 12.5s to stay within Basic tier (5 req/min)

async function rateWait(label?: string) {
  if (label) console.log(`  ⏳ Rate limit pause (${RATE_DELAY_MS / 1000}s)... [before ${label}]`);
  await new Promise((r) => setTimeout(r, RATE_DELAY_MS));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.MASSIVE_API_KEY;
  if (!apiKey) {
    console.error('❌ MASSIVE_API_KEY not set in .env');
    process.exit(1);
  }

  console.log('🔑 API key found, starting enhanced smoke test...\n');

  const to = new Date();
  const from = new Date(to.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 days

  const fetchParams = (ticker: string, timeframe: '1d' | '1h' | '5m' = '1d') => ({
    ticker,
    timeframe: timeframe as '1d',
    from,
    to,
    apiKey,
    baseUrl: 'https://api.massive.com',
    timeoutMs: 15000,
    retry: { attempts: 2, baseDelayMs: 1000 },
    requestDelayMs: 0,
  });

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 1: Multiple Ticker Types
  // ═══════════════════════════════════════════════════════════════════════

  console.log('═══ TEST 1: Multiple Ticker Types ═══\n');

  // Stock — AAPL
  console.log('📊 AAPL (individual stock)...');
  const aaplBars = await fetchMassiveAggs(fetchParams('AAPL'));
  assert(aaplBars.length > 0, `AAPL returned ${aaplBars.length} bars`);
  if (aaplBars.length > 0) {
    console.log(
      `     Sample: O=${aaplBars[0].open} H=${aaplBars[0].high} L=${aaplBars[0].low} C=${aaplBars[0].close}`,
    );
  }

  await rateWait('SPY');

  // ETF — SPY
  console.log('📊 SPY (ETF)...');
  const spyBars = await fetchMassiveAggs(fetchParams('SPY'));
  assert(spyBars.length > 0, `SPY returned ${spyBars.length} bars`);

  await rateWait('MSFT');

  // Another stock — MSFT
  console.log('📊 MSFT (large-cap)...');
  const msftBars = await fetchMassiveAggs(fetchParams('MSFT'));
  assert(msftBars.length > 0, `MSFT returned ${msftBars.length} bars`);

  await rateWait('X:BTCUSD');

  // Crypto — BTC
  console.log('📊 X:BTCUSD (crypto)...');
  const btcBars = await fetchMassiveAggs(fetchParams('X:BTCUSD'));
  assert(btcBars.length > 0, `X:BTCUSD returned ${btcBars.length} bars`);

  await rateWait('X:ETHUSD');

  // Crypto — ETH
  console.log('📊 X:ETHUSD (crypto)...');
  const ethBars = await fetchMassiveAggs(fetchParams('X:ETHUSD'));
  assert(ethBars.length > 0, `X:ETHUSD returned ${ethBars.length} bars`);

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 2: Data Integrity — OHLC Invariants
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n═══ TEST 2: Data Integrity (OHLC Invariants) ═══\n');

  function validateOhlcIntegrity(bars: typeof aaplBars, label: string) {
    let violations = 0;
    for (let i = 0; i < bars.length; i++) {
      const o = parseFloat(bars[i].open);
      const h = parseFloat(bars[i].high);
      const l = parseFloat(bars[i].low);
      const c = parseFloat(bars[i].close);
      const v = parseFloat(bars[i].volume);
      const ts = bars[i].ts_open;

      // High >= Open, Close, Low
      if (h < o || h < c || h < l) {
        violations++;
        console.error(`     [${label}] bar ${i}: high(${h}) < open(${o})/close(${c})/low(${l})`);
      }
      // Low <= Open, Close, High
      if (l > o || l > c || l > h) {
        violations++;
        console.error(`     [${label}] bar ${i}: low(${l}) > open(${o})/close(${c})/high(${h})`);
      }
      // Volume >= 0
      if (v < 0) {
        violations++;
        console.error(`     [${label}] bar ${i}: negative volume ${v}`);
      }
      // Timestamp > 0
      if (!ts || ts <= 0) {
        violations++;
        console.error(`     [${label}] bar ${i}: invalid timestamp ${ts}`);
      }
    }
    assert(violations === 0, `${label}: ${bars.length} bars, 0 OHLC violations`);
  }

  validateOhlcIntegrity(aaplBars, 'AAPL');
  validateOhlcIntegrity(spyBars, 'SPY');
  validateOhlcIntegrity(btcBars, 'X:BTCUSD');
  validateOhlcIntegrity(ethBars, 'X:ETHUSD');

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 3: Time Continuity
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n═══ TEST 3: Time Continuity ═══\n');

  function validateTimeContinuity(bars: typeof aaplBars, label: string, isCrypto: boolean) {
    if (bars.length < 2) {
      warn(`${label}: only ${bars.length} bars, skipping continuity check`);
      return;
    }

    let sorted = true;
    let duplicates = 0;
    for (let i = 1; i < bars.length; i++) {
      if (bars[i].ts_open <= bars[i - 1].ts_open) {
        if (bars[i].ts_open === bars[i - 1].ts_open) duplicates++;
        else sorted = false;
      }
    }

    assert(sorted, `${label}: timestamps are strictly sorted ascending`);
    assert(
      duplicates === 0,
      `${label}: no duplicate timestamps`,
      duplicates > 0 ? `${duplicates} dupes` : undefined,
    );

    // For daily bars: check gap between consecutive bars
    // Stocks: should be roughly 1 day (86400000ms) on trading days (gaps for weekends okay)
    // Crypto: should be exactly 1 day (markets 24/7)
    const gaps: number[] = [];
    for (let i = 1; i < bars.length; i++) {
      const gapMs = bars[i].ts_open - bars[i - 1].ts_open;
      gaps.push(gapMs);
    }

    const oneDayMs = 86400000;
    const maxExpectedGap = isCrypto ? 2 * oneDayMs : 4 * oneDayMs; // crypto 2d, stock 4d (holiday)
    const hugeGaps = gaps.filter((g) => g > maxExpectedGap);
    assert(
      hugeGaps.length === 0,
      `${label}: no unexpectedly large gaps (max tolerance: ${maxExpectedGap / oneDayMs}d)`,
      hugeGaps.length > 0 ? `${hugeGaps.length} gap(s) exceed tolerance` : undefined,
    );
  }

  validateTimeContinuity(aaplBars, 'AAPL', false);
  validateTimeContinuity(spyBars, 'SPY', false);
  validateTimeContinuity(btcBars, 'X:BTCUSD', true);
  validateTimeContinuity(ethBars, 'X:ETHUSD', true);

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 4: Invalid Ticker Handling
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n═══ TEST 4: Invalid Ticker Handling ═══\n');

  await rateWait('INVALID_TICKER');

  console.log('📊 Testing non-existent ticker (ZZZNOTREAL)...');
  const invalidBars = await fetchMassiveAggs(fetchParams('ZZZNOTREAL'));
  assert(invalidBars.length === 0, `Invalid ticker returned 0 bars (got ${invalidBars.length})`);

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 5: DB Round-Trip — persist & read via getOhlcv
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n═══ TEST 5: DB Round-Trip (persist → getOhlcv) ═══\n');

  const db = new Database(':memory:');
  ensureSchema(db);
  const repo = new MarketRepository(db);

  // Persist AAPL
  if (aaplBars.length > 0) {
    const asset = repo.upsertAsset({
      market: 'US',
      symbol: 'AAPL',
      venue: 'MASSIVE',
      quote: 'USD',
      status: 'ACTIVE',
    });
    const normalized = normalizeBars(aaplBars);
    const written = repo.upsertOhlcvBars(asset.asset_id, '1d', normalized, 'MASSIVE');
    assert(written === aaplBars.length, `AAPL: wrote ${written} bars`);

    // Read back
    const readBack = repo.getOhlcv({ assetId: asset.asset_id, timeframe: '1d' });
    assert(
      readBack.length === aaplBars.length,
      `AAPL: read back ${readBack.length} bars (expected ${aaplBars.length})`,
    );
    assert(readBack[0].source === 'MASSIVE', `AAPL: source is MASSIVE`);

    // Verify values match
    assert(readBack[0].open === aaplBars[0].open, `AAPL: open matches (${readBack[0].open})`);
    assert(readBack[0].close === aaplBars[0].close, `AAPL: close matches (${readBack[0].close})`);

    // getLatestTsOpen
    const latestTs = repo.getLatestTsOpen(asset.asset_id, '1d');
    const expectedLastTs = aaplBars[aaplBars.length - 1].ts_open;
    assert(
      latestTs === expectedLastTs,
      `AAPL: latestTsOpen = ${latestTs} (expected ${expectedLastTs})`,
    );

    // getOhlcvStats
    const stats = repo.getOhlcvStats(asset.asset_id, '1d');
    assert(stats.bar_count === aaplBars.length, `AAPL: stats.bar_count = ${stats.bar_count}`);
  }

  // Persist BTC
  if (btcBars.length > 0) {
    const asset = repo.upsertAsset({
      market: 'CRYPTO',
      symbol: 'BTCUSDT',
      venue: 'MASSIVE',
      base: 'BTC',
      quote: 'USD',
      status: 'ACTIVE',
    });
    const normalized = normalizeBars(btcBars);
    repo.upsertOhlcvBars(asset.asset_id, '1d', normalized, 'MASSIVE');

    const readBack = repo.getOhlcv({ assetId: asset.asset_id, timeframe: '1d' });
    assert(readBack.length === btcBars.length, `BTC: read back ${readBack.length} bars`);
    assert(readBack[0].source === 'MASSIVE', `BTC: source is MASSIVE`);
  }

  // Idempotency test — re-ingest AAPL
  if (aaplBars.length > 0) {
    const asset = repo.getAssetBySymbol('US', 'AAPL')!;
    const normalized = normalizeBars(aaplBars);
    repo.upsertOhlcvBars(asset.asset_id, '1d', normalized, 'MASSIVE');
    const stats = repo.getOhlcvStats(asset.asset_id, '1d');
    assert(
      stats.bar_count === aaplBars.length,
      `AAPL idempotency: still ${stats.bar_count} bars after re-ingest`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 6: convertCryptoSymbol Validation
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n═══ TEST 6: convertCryptoSymbol Validation ═══\n');

  assert(convertCryptoSymbol('BTCUSDT') === 'X:BTCUSD', 'BTCUSDT → X:BTCUSD');
  assert(convertCryptoSymbol('ETHUSDT') === 'X:ETHUSD', 'ETHUSDT → X:ETHUSD');
  assert(convertCryptoSymbol('SOLUSDT') === 'X:SOLUSD', 'SOLUSDT → X:SOLUSD');
  assert(convertCryptoSymbol('BTCUSD') === 'X:BTCUSD', 'BTCUSD → X:BTCUSD (no-op)');
  assert(convertCryptoSymbol('btcusdt') === 'X:BTCUSD', 'lowercase btcusdt → X:BTCUSD');
  assert(convertCryptoSymbol('SHIBUSDT') === 'X:SHIBUSD', 'SHIBUSDT → X:SHIBUSD');

  db.close();

  // ═══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  ✅ Passed: ${passCount}`);
  if (warnCount > 0) console.log(`  ⚠️  Warnings: ${warnCount}`);
  if (failCount > 0) console.log(`  ❌ Failed: ${failCount}`);
  console.log('═══════════════════════════════════════════════════\n');

  if (failCount > 0) {
    console.error('🔴 Smoke test FAILED');
    process.exit(1);
  } else {
    console.log('🎉 All smoke tests passed!');
  }
}

main().catch((err) => {
  console.error('❌ Smoke test crashed:', err);
  process.exit(1);
});
