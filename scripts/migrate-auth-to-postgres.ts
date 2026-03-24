import { closeDb, getDb } from '../src/server/db/database.js';
import {
  closePostgresAuthStore,
  ensurePostgresAuthSchema,
  hasPostgresAuthStore,
  pgUpsertSession,
  pgUpsertUser,
  pgUpsertUserRole,
  pgUpsertUserState
} from '../src/server/auth/postgresStore.js';

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function main() {
  if (!hasPostgresAuthStore()) {
    throw new Error('POSTGRES_AUTH_STORE_NOT_CONFIGURED');
  }

  await ensurePostgresAuthSchema();
  const db = getDb();

  const users = db.prepare(
    `SELECT user_id, email, password_hash, name, trade_mode, broker, locale, created_at_ms, updated_at_ms, last_login_at_ms
     FROM auth_users
     ORDER BY created_at_ms ASC`
  ).all() as Array<{
    user_id: string;
    email: string;
    password_hash: string;
    name: string;
    trade_mode: 'starter' | 'active' | 'deep';
    broker: string;
    locale: string | null;
    created_at_ms: number;
    updated_at_ms: number;
    last_login_at_ms: number | null;
  }>;

  const states = new Map(
    (
      db.prepare(
        `SELECT user_id, asset_class, market, ui_mode, risk_profile_key, watchlist_json, holdings_json, executions_json, discipline_log_json, updated_at_ms
         FROM auth_user_state_sync`
      ).all() as Array<{
        user_id: string;
        asset_class: string;
        market: string;
        ui_mode: string;
        risk_profile_key: string;
        watchlist_json: string | null;
        holdings_json: string | null;
        executions_json: string | null;
        discipline_log_json: string | null;
        updated_at_ms: number;
      }>
    ).map((row) => [
      row.user_id,
      {
        assetClass: row.asset_class || 'US_STOCK',
        market: row.market || 'US',
        uiMode: row.ui_mode || 'standard',
        riskProfileKey: row.risk_profile_key || 'balanced',
        watchlist: parseJson<string[]>(row.watchlist_json, []),
        holdings: parseJson<unknown[]>(row.holdings_json, []),
        executions: parseJson<unknown[]>(row.executions_json, []),
        disciplineLog: parseJson<{ checkins: string[]; boundary_kept: string[]; weekly_reviews: string[] }>(
          row.discipline_log_json,
          { checkins: [], boundary_kept: [], weekly_reviews: [] }
        ),
        updatedAtMs: row.updated_at_ms
      }
    ])
  );

  const roles = db.prepare(
    `SELECT user_id, role, granted_at_ms, granted_by_user_id
     FROM auth_user_roles
     ORDER BY granted_at_ms ASC`
  ).all() as Array<{
    user_id: string;
    role: 'ADMIN' | 'OPERATOR' | 'SUPPORT';
    granted_at_ms: number;
    granted_by_user_id: string | null;
  }>;

  const sessions = db.prepare(
    `SELECT session_id, user_id, session_token_hash, user_agent, ip_address, expires_at_ms, revoked_at_ms, created_at_ms, updated_at_ms, last_seen_at_ms
     FROM auth_sessions
     ORDER BY created_at_ms ASC`
  ).all() as Array<{
    session_id: string;
    user_id: string;
    session_token_hash: string;
    user_agent: string | null;
    ip_address: string | null;
    expires_at_ms: number;
    revoked_at_ms: number | null;
    created_at_ms: number;
    updated_at_ms: number;
    last_seen_at_ms: number;
  }>;

  for (const user of users) {
    await pgUpsertUser(user);
    const state = states.get(user.user_id) || {
      assetClass: 'US_STOCK',
      market: 'US',
      uiMode: 'standard',
      riskProfileKey: 'balanced',
      watchlist: [],
      holdings: [],
      executions: [],
      disciplineLog: { checkins: [], boundary_kept: [], weekly_reviews: [] },
      updatedAtMs: user.updated_at_ms
    };
    await pgUpsertUserState(
      user.user_id,
      {
        assetClass: state.assetClass,
        market: state.market,
        uiMode: state.uiMode,
        riskProfileKey: state.riskProfileKey,
        watchlist: state.watchlist,
        holdings: state.holdings,
        executions: state.executions,
        disciplineLog: state.disciplineLog
      },
      state.updatedAtMs
    );
  }

  for (const role of roles) {
    await pgUpsertUserRole({
      userId: role.user_id,
      role: role.role,
      grantedAtMs: role.granted_at_ms,
      grantedByUserId: role.granted_by_user_id
    });
  }

  for (const session of sessions) {
    await pgUpsertSession(session);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        users: users.length,
        roles: roles.length,
        sessions: sessions.length
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(String((error as Error)?.stack || error));
    process.exitCode = 1;
  })
  .finally(() => {
    closeDb();
    void closePostgresAuthStore();
  });
