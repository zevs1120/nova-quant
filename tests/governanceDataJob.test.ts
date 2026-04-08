import { InMemorySyncDb as Database } from '../src/server/db/inMemorySyncDb.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { buildUsTradingCalendarSeeds } from '../src/server/ingestion/tradingCalendar.js';

const fetchYahooChartSnapshotMock = vi.fn();

vi.mock('../src/server/ingestion/yahoo.js', () => ({
  fetchYahooChartSnapshot: fetchYahooChartSnapshotMock,
}));

describe('governance data jobs', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchYahooChartSnapshotMock.mockReset();
  });

  it('builds core US trading calendar holidays and half-days', () => {
    const rows = buildUsTradingCalendarSeeds([2026]);
    const keys = rows.map((row) => `${row.dayKey}:${row.status}:${row.reason}`);

    expect(keys).toContain('2026-01-01:CLOSED:New Year\'s Day');
    expect(keys).toContain('2026-11-26:CLOSED:Thanksgiving');
    expect(keys.some((row) => row.includes('HALF_DAY:Black Friday early close'))).toBe(true);
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

    expect(result.corporate_actions.rows_upserted).toBe(1);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.action_type).toBe('SPLIT');
    expect(calendarRows.length).toBeGreaterThan(5);
  });
});
