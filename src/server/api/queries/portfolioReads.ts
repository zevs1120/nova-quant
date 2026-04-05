import type { RiskProfileKey } from '../../types.js';

type PortfolioReadDeps = {
  getRepo: () => any;
  syncQuantState: (userId?: string) => void;
  cachedFrontendRead: <T>(
    scope: string,
    keyParts: Record<string, unknown>,
    loader: () => Promise<T>,
    ttlMs?: number,
  ) => Promise<T>;
  tryPrimaryPostgresRead: <T>(scope: string, loader: () => Promise<T>) => Promise<T | null>;
  readPostgresRiskProfile: (userId: string) => Promise<any | null>;
  readPostgresExternalConnections: (args: {
    userId: string;
    connectionType?: 'BROKER' | 'EXCHANGE';
  }) => Promise<any[] | null>;
  invalidateFrontendReadCacheForUser: (userId: string) => void;
  riskProfilePresets: Record<
    RiskProfileKey,
    {
      max_loss_per_trade: number;
      max_daily_loss: number;
      max_drawdown: number;
      exposure_cap: number;
      leverage_cap: number;
    }
  >;
};

export function createPortfolioReadApi(deps: PortfolioReadDeps) {
  function getRiskProfile(userId = 'guest-default', opts?: { skipSync?: boolean }) {
    const repo = deps.getRepo();
    const existing = repo.getUserRiskProfile(userId);
    if (existing) return existing;
    if (!opts?.skipSync) {
      deps.syncQuantState(userId);
      return repo.getUserRiskProfile(userId);
    }
    deps.syncQuantState(userId);
    return repo.getUserRiskProfile(userId);
  }

  async function getRiskProfilePrimary(userId = 'guest-default', opts?: { skipSync?: boolean }) {
    return deps.cachedFrontendRead(
      'risk_profile',
      {
        userId,
        skipSync: Boolean(opts?.skipSync),
      },
      async () => {
        const row = await deps.tryPrimaryPostgresRead('risk_profile', async () =>
          deps.readPostgresRiskProfile(userId),
        );
        if (row) return row;
        return getRiskProfile(userId, opts);
      },
      30_000,
    );
  }

  function setRiskProfile(userId: string, profileKey: 'conservative' | 'balanced' | 'aggressive') {
    const repo = deps.getRepo();
    const preset = deps.riskProfilePresets[profileKey] || deps.riskProfilePresets.balanced;
    repo.upsertUserRiskProfile({
      user_id: userId,
      profile_key: profileKey,
      max_loss_per_trade: preset.max_loss_per_trade,
      max_daily_loss: preset.max_daily_loss,
      max_drawdown: preset.max_drawdown,
      exposure_cap: preset.exposure_cap,
      leverage_cap: preset.leverage_cap,
      updated_at_ms: Date.now(),
    });
    deps.invalidateFrontendReadCacheForUser(userId);
    return repo.getUserRiskProfile(userId);
  }

  function listExternalConnections(args: {
    userId: string;
    connectionType?: 'BROKER' | 'EXCHANGE';
  }) {
    const repo = deps.getRepo();
    const rows = repo.listExternalConnections({
      userId: args.userId,
      connectionType: args.connectionType,
    });
    return rows.map((row: any) => ({
      ...row,
      meta: row.meta_json ? JSON.parse(row.meta_json) : null,
    }));
  }

  async function listExternalConnectionsPrimary(args: {
    userId: string;
    connectionType?: 'BROKER' | 'EXCHANGE';
  }) {
    const rows = await deps.tryPrimaryPostgresRead('external_connections', async () =>
      deps.readPostgresExternalConnections(args),
    );
    if (!rows) {
      return listExternalConnections(args);
    }
    return rows.map((row: any) => ({
      ...row,
      meta: row.meta_json ? JSON.parse(row.meta_json) : null,
    }));
  }

  return {
    getRiskProfile,
    getRiskProfilePrimary,
    setRiskProfile,
    listExternalConnections,
    listExternalConnectionsPrimary,
  };
}
