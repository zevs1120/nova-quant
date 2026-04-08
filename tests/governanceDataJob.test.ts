import { InMemorySyncDb as Database } from '../src/server/db/inMemorySyncDb.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { buildUsTradingCalendarSeeds } from '../src/server/ingestion/tradingCalendar.js';

const fetchYahooChartSnapshotMock = vi.fn();
const fetchAlphaVantageCorporateActionsMock = vi.fn();

vi.mock('../src/server/ingestion/yahoo.js', () => ({
  fetchYahooChartSnapshot: fetchYahooChartSnapshotMock,
}));

vi.mock('../src/server/ingestion/hostedData.js', () => ({
  fetchAlphaVantageCorporateActions: fetchAlphaVantageCorporateActionsMock,
}));

describe('governance data jobs', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchYahooChartSnapshotMock.mockReset();
    fetchAlphaVantageCorporateActionsMock.mockReset();
  });

  it('builds core US trading calendar holidays and half-days', () => {
    const rows = buildUsTradingCalendarSeeds([2025, 2026]);
    const keys = rows.map((row) => `${row.dayKey}:${row.status}:${row.reason}`);

    expect(keys).toContain('2026-01-01:CLOSED:New Year\'s Day');
    expect(keys).toContain('2026-11-26:CLOSED:Thanksgiving');
    expect(keys.some((row) => row.includes('HALF_DAY:Black Friday early close'))).toBe(true);
    expect(keys).toContain('2025-01-09:CLOSED:National Day of Mourning for President Jimmy Carter');
  });

  it('syncs corporate actions and trading calendar rows into the repository', async () => {
    const { refreshGovernanceData } = await import('../src/server/jobs/governanceData.js');
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    fetchYahooChartSnapshotMock.mockResolvedValue({
      bars: [],
      corporateActions: [
        {
          effectiveTs: Date.UTC(2026, 5, 10),
          actionType: 'SPLIT',
          splitRatio: 10,
          notes: '10-for-1 split',
        },
      ],
    });
    fetchAlphaVantageCorporateActionsMock.mockResolvedValue([
      {
        effectiveTs: Date.UTC(2026, 5, 10),
        actionType: 'SPLIT',
        splitRatio: 10,
        notes: 'Alpha source agrees',
        source: 'ALPHA_VANTAGE_CORP_ACTIONS',
      },
    ]);

    const result = await refreshGovernanceData({
      repo,
      market: 'US',
      usSymbols: ['NVDA'],
    });

    const asset = repo.getAssetBySymbol('US', 'NVDA');
    const actions = repo.listCorporateActions({
      assetId: asset!.asset_id,
    });
    const calendarRows = repo.listTradingCalendarExceptions({
      market: 'US',
      startDayKey: '2026-01-01',
      endDayKey: '2026-12-31',
    });

    expect(result.corporate_actions.rows_upserted).toBe(2);
    expect(actions).toHaveLength(2);
    expect(actions[0]?.action_type).toBe('SPLIT');
    expect(calendarRows.length).toBeGreaterThan(5);
    expect(result.corporate_actions.mismatch_symbols).toBe(0);
  });

  it('marks corporate action mismatches when providers disagree on the same event', async () => {
    const { refreshGovernanceData } = await import('../src/server/jobs/governanceData.js');
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    fetchYahooChartSnapshotMock.mockResolvedValue({
      bars: [],
      corporateActions: [
        {
          effectiveTs: Date.UTC(2026, 5, 10),
          actionType: 'SPLIT',
          splitRatio: 10,
          notes: 'Yahoo says 10-for-1',
        },
      ],
    });
    fetchAlphaVantageCorporateActionsMock.mockResolvedValue([
      {
        effectiveTs: Date.UTC(2026, 5, 10),
        actionType: 'SPLIT',
        splitRatio: 4,
        notes: 'Alpha says 4-for-1',
        source: 'ALPHA_VANTAGE_CORP_ACTIONS',
      },
    ]);

    const result = await refreshGovernanceData({
      repo,
      market: 'US',
      usSymbols: ['AAPL'],
    });

    const asset = repo.getAssetBySymbol('US', 'AAPL');
    const qualityState = repo.getOhlcvQualityState({
      assetId: asset!.asset_id,
      timeframe: '1d',
    });
    const anomalies = db
      .prepare('SELECT anomaly_type FROM ingest_anomalies WHERE asset_id = ?')
      .all(asset!.asset_id) as Array<{ anomaly_type: string }>;

    expect(result.corporate_actions.mismatch_symbols).toBe(1);
    expect(qualityState?.reason).toBe('CORPORATE_ACTION_SOURCE_CONFLICT');
    expect(anomalies.map((row) => row.anomaly_type)).toContain('CORPORATE_ACTION_SOURCE_CONFLICT');
  });
});
