import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetDb = vi.fn(() => {
  throw new Error('SQLITE_SHOULD_NOT_RUN');
});
const mockQueryRowSync = vi.fn();
const mockQueryRowsSync = vi.fn();
const mockExecuteSync = vi.fn();
const mockBeginTransactionSync = vi.fn();
const mockCommitTransactionSync = vi.fn();
const mockRollbackTransactionSync = vi.fn();

vi.mock('../src/server/db/database.js', () => ({
  getDb: mockGetDb,
}));

vi.mock('../src/server/db/schema.js', () => ({
  ensureSchema: vi.fn(),
}));

vi.mock('../src/server/db/postgresSyncBridge.js', () => ({
  beginTransactionSync: mockBeginTransactionSync,
  commitTransactionSync: mockCommitTransactionSync,
  executeSync: mockExecuteSync,
  qualifyBusinessTable: (tableName: string) => `"novaquant_data"."${tableName}"`,
  queryRowSync: mockQueryRowSync,
  queryRowsSync: mockQueryRowsSync,
  rollbackTransactionSync: mockRollbackTransactionSync,
}));

describe('manual service in postgres runtime', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NOVA_DATA_RUNTIME_DRIVER', 'postgres');
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-host/db');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns a graceful unavailable dashboard when the auth user does not exist', async () => {
    mockQueryRowSync.mockImplementation((sql: string) => {
      if (sql.includes('FROM auth_users')) return null;
      return null;
    });
    mockQueryRowsSync.mockReturnValue([]);

    const { getManualDashboard } = await import('../src/server/manual/service.js');
    const result = getManualDashboard('cloud-only-user');

    expect(result.available).toBe(false);
    expect(result.reason).toBeNull();
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it('redeems vip days through postgres queries without sqlite fallback', async () => {
    mockQueryRowSync.mockImplementation((sql: string) => {
      if (
        sql.includes('FROM "novaquant_data"."manual_user_state"') &&
        sql.includes('WHERE user_id')
      ) {
        return {
          user_id: 'usr_manual_pg',
          invite_code: 'NV000123',
          referred_by_code: null,
          vip_days_balance: 0,
          vip_days_redeemed_total: 0,
        };
      }
      if (sql.includes('FROM "novaquant_data"."manual_points_ledger"')) {
        return { balance_after: 1200 };
      }
      if (sql.includes('FROM "novaquant_data"."manual_referrals"')) {
        return { total: 0, rewarded: 0 };
      }
      return null;
    });
    mockQueryRowsSync.mockReturnValue([]);

    const { redeemManualVipDay } = await import('../src/server/manual/service.js');
    const result = redeemManualVipDay({ userId: 'usr_manual_pg', days: 1 });

    expect(result.ok).toBe(true);
    expect(mockBeginTransactionSync).toHaveBeenCalledTimes(1);
    expect(mockCommitTransactionSync).toHaveBeenCalledTimes(1);
    expect(mockRollbackTransactionSync).not.toHaveBeenCalled();
    expect(mockExecuteSync).toHaveBeenCalled();
    expect(mockGetDb).not.toHaveBeenCalled();
  });
});
