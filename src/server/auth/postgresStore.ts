import { Pool } from 'pg';

export type PgAuthTradeMode = 'starter' | 'active' | 'deep';
export type PgAuthRole = 'ADMIN' | 'OPERATOR' | 'SUPPORT';

export type PgAuthUserRow = {
  user_id: string;
  email: string;
  password_hash: string;
  name: string;
  trade_mode: PgAuthTradeMode;
  broker: string;
  locale: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  last_login_at_ms: number | null;
};

export type PgAuthUserRoleRow = {
  user_id: string;
  role: PgAuthRole;
  granted_at_ms: number;
  granted_by_user_id: string | null;
};

export type PgAuthSessionRow = {
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
};

export type PgAuthPasswordResetRow = {
  reset_id: string;
  user_id: string;
  email: string;
  code_hash: string;
  expires_at_ms: number;
  used_at_ms: number | null;
  created_at_ms: number;
  updated_at_ms: number;
};

export type PgAuthUserState = {
  assetClass: string;
  market: string;
  uiMode: string;
  riskProfileKey: string;
  watchlist: string[];
  holdings: unknown[];
  executions: unknown[];
  disciplineLog: {
    checkins: string[];
    boundary_kept: string[];
    weekly_reviews: string[];
  };
};

export type PgSupabaseAuthUserRow = {
  auth_user_id: string;
  email: string;
  encrypted_password: string;
  email_confirmed_at_ms: number | null;
  last_sign_in_at_ms: number | null;
  created_at_ms: number | null;
  updated_at_ms: number | null;
  raw_user_meta_data: Record<string, unknown> | null;
  raw_app_meta_data: Record<string, unknown> | null;
};

type PgAuthSessionBundleRow = PgAuthSessionRow &
  PgAuthUserRow & {
    session_created_at_ms: number;
    session_updated_at_ms: number;
    user_created_at_ms: number;
    user_updated_at_ms: number;
    asset_class: string | null;
    market: string | null;
    ui_mode: string | null;
    risk_profile_key: string | null;
    watchlist_json: unknown;
    holdings_json: unknown;
    executions_json: unknown;
    discipline_log_json: unknown;
    roles?: unknown;
  };

let poolSingleton: Pool | null = null;
let schemaReady = false;

const AUTH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS auth_users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  trade_mode TEXT NOT NULL CHECK (trade_mode IN ('starter', 'active', 'deep')),
  broker TEXT NOT NULL,
  locale TEXT,
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL,
  last_login_at_ms BIGINT
);

CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);

CREATE TABLE IF NOT EXISTS auth_user_roles (
  user_id TEXT NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR', 'SUPPORT')),
  granted_at_ms BIGINT NOT NULL,
  granted_by_user_id TEXT REFERENCES auth_users(user_id) ON DELETE SET NULL,
  PRIMARY KEY(user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_auth_user_roles_role ON auth_user_roles(role, granted_at_ms DESC);

CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip_address TEXT,
  expires_at_ms BIGINT NOT NULL,
  revoked_at_ms BIGINT,
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL,
  last_seen_at_ms BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, updated_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(session_token_hash);

CREATE TABLE IF NOT EXISTS auth_password_resets (
  reset_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at_ms BIGINT NOT NULL,
  used_at_ms BIGINT,
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_password_resets_user ON auth_password_resets(user_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS auth_user_state_sync (
  user_id TEXT PRIMARY KEY REFERENCES auth_users(user_id) ON DELETE CASCADE,
  asset_class TEXT NOT NULL DEFAULT 'US_STOCK',
  market TEXT NOT NULL DEFAULT 'US',
  ui_mode TEXT NOT NULL DEFAULT 'standard',
  risk_profile_key TEXT NOT NULL DEFAULT 'balanced',
  watchlist_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  holdings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  executions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  discipline_log_json JSONB NOT NULL DEFAULT '{"checkins":[],"boundary_kept":[],"weekly_reviews":[]}'::jsonb,
  updated_at_ms BIGINT NOT NULL
);
`;

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function asNullableString(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function toTimestampMs(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function buildDefaultState(): PgAuthUserState {
  return {
    assetClass: 'US_STOCK',
    market: 'US',
    uiMode: 'standard',
    riskProfileKey: 'balanced',
    watchlist: [],
    holdings: [],
    executions: [],
    disciplineLog: {
      checkins: [],
      boundary_kept: [],
      weekly_reviews: [],
    },
  };
}

function resolveAuthDriver() {
  return String(process.env.NOVA_AUTH_DRIVER || '')
    .trim()
    .toLowerCase();
}

function resolveAuthDatabaseUrl() {
  return String(
    process.env.NOVA_AUTH_DATABASE_URL ||
      process.env.NOVA_DATA_DATABASE_URL ||
      process.env.SUPABASE_DB_URL ||
      process.env.DATABASE_URL ||
      '',
  ).trim();
}

function shouldUseSsl(connectionString: string) {
  if (
    String(process.env.NOVA_AUTH_PG_SSL || '')
      .trim()
      .toLowerCase() === 'disable'
  ) {
    return false;
  }
  return !/(localhost|127\.0\.0\.1)/i.test(connectionString);
}

export function hasPostgresAuthStore() {
  return resolveAuthDriver() === 'postgres' && Boolean(resolveAuthDatabaseUrl());
}

function getAuthPool() {
  if (!hasPostgresAuthStore()) {
    throw new Error('POSTGRES_AUTH_STORE_NOT_CONFIGURED');
  }
  if (poolSingleton) return poolSingleton;
  const connectionString = resolveAuthDatabaseUrl();
  poolSingleton = new Pool({
    connectionString,
    max: Math.max(1, Number(process.env.NOVA_AUTH_PG_POOL_MAX || 5)),
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
  return poolSingleton;
}

export async function ensurePostgresAuthSchema() {
  if (!hasPostgresAuthStore() || schemaReady) return;
  const pool = getAuthPool();
  await pool.query(AUTH_SCHEMA_SQL);
  schemaReady = true;
}

function mapUserRow(row: Record<string, unknown>): PgAuthUserRow {
  return {
    user_id: String(row.user_id || ''),
    email: String(row.email || ''),
    password_hash: String(row.password_hash || ''),
    name: String(row.name || ''),
    trade_mode: String(row.trade_mode || 'active') as PgAuthTradeMode,
    broker: String(row.broker || 'Other'),
    locale: asNullableString(row.locale),
    created_at_ms: toNumber(row.created_at_ms),
    updated_at_ms: toNumber(row.updated_at_ms),
    last_login_at_ms:
      row.last_login_at_ms === null || row.last_login_at_ms === undefined
        ? null
        : toNumber(row.last_login_at_ms),
  };
}

function mapRoleRow(row: Record<string, unknown>): PgAuthUserRoleRow {
  return {
    user_id: String(row.user_id || ''),
    role: String(row.role || 'SUPPORT') as PgAuthRole,
    granted_at_ms: toNumber(row.granted_at_ms),
    granted_by_user_id: asNullableString(row.granted_by_user_id),
  };
}

function mapSessionRow(row: Record<string, unknown>): PgAuthSessionRow {
  return {
    session_id: String(row.session_id || ''),
    user_id: String(row.user_id || ''),
    session_token_hash: String(row.session_token_hash || ''),
    user_agent: asNullableString(row.user_agent),
    ip_address: asNullableString(row.ip_address),
    expires_at_ms: toNumber(row.expires_at_ms),
    revoked_at_ms:
      row.revoked_at_ms === null || row.revoked_at_ms === undefined
        ? null
        : toNumber(row.revoked_at_ms),
    created_at_ms: toNumber(row.created_at_ms),
    updated_at_ms: toNumber(row.updated_at_ms),
    last_seen_at_ms: toNumber(row.last_seen_at_ms),
  };
}

function mapResetRow(row: Record<string, unknown>): PgAuthPasswordResetRow {
  return {
    reset_id: String(row.reset_id || ''),
    user_id: String(row.user_id || ''),
    email: String(row.email || ''),
    code_hash: String(row.code_hash || ''),
    expires_at_ms: toNumber(row.expires_at_ms),
    used_at_ms:
      row.used_at_ms === null || row.used_at_ms === undefined ? null : toNumber(row.used_at_ms),
    created_at_ms: toNumber(row.created_at_ms),
    updated_at_ms: toNumber(row.updated_at_ms),
  };
}

function mapStateRow(row: Record<string, unknown> | null | undefined): PgAuthUserState {
  const fallback = buildDefaultState();
  if (!row) return fallback;
  return {
    assetClass: String(row.asset_class || fallback.assetClass),
    market: String(row.market || fallback.market),
    uiMode: String(row.ui_mode || fallback.uiMode),
    riskProfileKey: String(row.risk_profile_key || fallback.riskProfileKey),
    watchlist: parseJsonValue<string[]>(row.watchlist_json, fallback.watchlist),
    holdings: parseJsonValue<unknown[]>(row.holdings_json, fallback.holdings),
    executions: parseJsonValue<unknown[]>(row.executions_json, fallback.executions),
    disciplineLog: parseJsonValue<PgAuthUserState['disciplineLog']>(
      row.discipline_log_json,
      fallback.disciplineLog,
    ),
  };
}

function mapSupabaseAuthUserRow(row: Record<string, unknown>): PgSupabaseAuthUserRow {
  return {
    auth_user_id: String(row.id || ''),
    email: String(row.email || ''),
    encrypted_password: String(row.encrypted_password || ''),
    email_confirmed_at_ms: toTimestampMs(row.email_confirmed_at),
    last_sign_in_at_ms: toTimestampMs(row.last_sign_in_at),
    created_at_ms: toTimestampMs(row.created_at),
    updated_at_ms: toTimestampMs(row.updated_at),
    raw_user_meta_data:
      row.raw_user_meta_data && typeof row.raw_user_meta_data === 'object'
        ? (row.raw_user_meta_data as Record<string, unknown>)
        : null,
    raw_app_meta_data:
      row.raw_app_meta_data && typeof row.raw_app_meta_data === 'object'
        ? (row.raw_app_meta_data as Record<string, unknown>)
        : null,
  };
}

function parseRoleList(value: unknown): PgAuthRole[] {
  let rawItems: unknown[] = [];
  if (Array.isArray(value)) {
    rawItems = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '{}') return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        rawItems = Array.isArray(parsed) ? parsed : [];
      } catch {
        rawItems = [];
      }
    } else {
      rawItems = trimmed
        .replace(/^\{/, '')
        .replace(/\}$/, '')
        .split(',')
        .map((item) => item.replace(/^"(.*)"$/, '$1'));
    }
  }
  return rawItems
    .map((item) => String(item || '').trim())
    .filter(
      (item): item is PgAuthRole => item === 'ADMIN' || item === 'OPERATOR' || item === 'SUPPORT',
    );
}

export async function pgGetUserByEmail(email: string) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  const result = await pool.query(
    `SELECT user_id, email, password_hash, name, trade_mode, broker, locale, created_at_ms, updated_at_ms, last_login_at_ms
     FROM auth_users
     WHERE email = $1
     LIMIT 1`,
    [email],
  );
  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

export async function pgGetUserById(userId: string) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  const result = await pool.query(
    `SELECT user_id, email, password_hash, name, trade_mode, broker, locale, created_at_ms, updated_at_ms, last_login_at_ms
     FROM auth_users
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

export async function pgGetSupabaseAuthUserByEmail(email: string) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  const result = await pool.query(
    `SELECT
       id,
       email,
       encrypted_password,
       email_confirmed_at,
       last_sign_in_at,
       created_at,
       updated_at,
       raw_user_meta_data,
       raw_app_meta_data
     FROM auth.users
     WHERE lower(email) = lower($1::text)
       AND deleted_at IS NULL
     LIMIT 1`,
    [email],
  );
  return result.rows[0] ? mapSupabaseAuthUserRow(result.rows[0]) : null;
}

export async function pgVerifySupabaseAuthPassword(email: string, password: string) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  const result = await pool.query(
    `SELECT
       id,
       email,
       encrypted_password,
       email_confirmed_at,
       last_sign_in_at,
       created_at,
       updated_at,
       raw_user_meta_data,
       raw_app_meta_data
     FROM auth.users
     WHERE lower(email) = lower($1::text)
       AND deleted_at IS NULL
       AND encrypted_password IS NOT NULL
       AND encrypted_password <> ''
       AND encrypted_password = crypt($2::text, encrypted_password)
     LIMIT 1`,
    [email, password],
  );
  return result.rows[0] ? mapSupabaseAuthUserRow(result.rows[0]) : null;
}

export async function pgInsertSupabaseAuthUser(args: {
  email: string;
  password: string;
  name: string;
  tradeMode: PgAuthTradeMode;
  broker: string;
  locale?: string | null;
  legacyUserId?: string | null;
  createdAtMs?: number | null;
  updatedAtMs?: number | null;
  lastSignInAtMs?: number | null;
  emailConfirmedAtMs?: number | null;
}) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  const result = await pool.query(
    `WITH new_user AS (
       INSERT INTO auth.users (
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         last_sign_in_at,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         is_sso_user,
         is_anonymous
       ) VALUES (
         gen_random_uuid(),
         'authenticated',
         'authenticated',
         $1::text,
         crypt($2::text, gen_salt('bf')),
         CASE
           WHEN $8::bigint IS NULL THEN now()
           ELSE to_timestamp($8::double precision / 1000.0)
         END,
         CASE
           WHEN $7::bigint IS NULL THEN NULL
           ELSE to_timestamp($7::double precision / 1000.0)
         END,
         jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
         jsonb_build_object(
           'name', $3::text,
           'tradeMode', $4::text,
           'broker', $5::text,
           'locale', $6::text,
           'legacyUserId', $9::text
         ),
         CASE
           WHEN $10::bigint IS NULL THEN now()
           ELSE to_timestamp($10::double precision / 1000.0)
         END,
         CASE
           WHEN $11::bigint IS NULL THEN now()
           ELSE to_timestamp($11::double precision / 1000.0)
         END,
         false,
         false
       )
       RETURNING id, email
     )
     INSERT INTO auth.identities (
       user_id,
       identity_data,
       provider,
       provider_id,
       last_sign_in_at,
       created_at,
       updated_at
     )
     SELECT
       id,
       jsonb_build_object(
         'sub', id::text,
         'email', email,
         'email_verified', true
       ),
       'email',
       email,
       CASE
         WHEN $7::bigint IS NULL THEN NULL
         ELSE to_timestamp($7::double precision / 1000.0)
       END,
       CASE
         WHEN $10::bigint IS NULL THEN now()
         ELSE to_timestamp($10::double precision / 1000.0)
       END,
       CASE
         WHEN $11::bigint IS NULL THEN now()
         ELSE to_timestamp($11::double precision / 1000.0)
       END
     FROM new_user
     RETURNING user_id`,
    [
      args.email,
      args.password,
      args.name,
      args.tradeMode,
      args.broker,
      args.locale || null,
      args.lastSignInAtMs || null,
      args.emailConfirmedAtMs || args.lastSignInAtMs || null,
      args.legacyUserId || null,
      args.createdAtMs || null,
      args.updatedAtMs || null,
    ],
  );
  return result.rows[0] ? String(result.rows[0].user_id || '') : null;
}

export async function pgTouchSupabaseAuthUser(email: string, lastSignInAtMs: number) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  await pool.query(
    `UPDATE auth.users
     SET last_sign_in_at = to_timestamp($2::double precision / 1000.0),
         updated_at = to_timestamp($2::double precision / 1000.0)
     WHERE lower(email) = lower($1::text)
       AND deleted_at IS NULL`,
    [email, lastSignInAtMs],
  );
}

export async function pgUpdateSupabaseAuthPassword(
  email: string,
  password: string,
  updatedAtMs: number,
) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  await pool.query(
    `UPDATE auth.users
     SET encrypted_password = crypt($2::text, gen_salt('bf')),
         updated_at = to_timestamp($3::double precision / 1000.0)
     WHERE lower(email) = lower($1::text)
       AND deleted_at IS NULL`,
    [email, password, updatedAtMs],
  );
}

export async function pgInsertUserWithState(args: { user: PgAuthUserRow; state: PgAuthUserState }) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO auth_users(
        user_id, email, password_hash, name, trade_mode, broker, locale, created_at_ms, updated_at_ms, last_login_at_ms
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        args.user.user_id,
        args.user.email,
        args.user.password_hash,
        args.user.name,
        args.user.trade_mode,
        args.user.broker,
        args.user.locale,
        args.user.created_at_ms,
        args.user.updated_at_ms,
        args.user.last_login_at_ms,
      ],
    );
    await client.query(
      `INSERT INTO auth_user_state_sync(
        user_id, asset_class, market, ui_mode, risk_profile_key, watchlist_json, holdings_json, executions_json, discipline_log_json, updated_at_ms
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10)`,
      [
        args.user.user_id,
        args.state.assetClass,
        args.state.market,
        args.state.uiMode,
        args.state.riskProfileKey,
        JSON.stringify(args.state.watchlist || []),
        JSON.stringify(args.state.holdings || []),
        JSON.stringify(args.state.executions || []),
        JSON.stringify(args.state.disciplineLog || buildDefaultState().disciplineLog),
        args.user.updated_at_ms,
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function pgUpsertUser(user: PgAuthUserRow) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  await pool.query(
    `INSERT INTO auth_users(
      user_id, email, password_hash, name, trade_mode, broker, locale, created_at_ms, updated_at_ms, last_login_at_ms
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT(user_id) DO UPDATE SET
      email = EXCLUDED.email,
      password_hash = EXCLUDED.password_hash,
      name = EXCLUDED.name,
      trade_mode = EXCLUDED.trade_mode,
      broker = EXCLUDED.broker,
      locale = EXCLUDED.locale,
      updated_at_ms = EXCLUDED.updated_at_ms,
      last_login_at_ms = EXCLUDED.last_login_at_ms`,
    [
      user.user_id,
      user.email,
      user.password_hash,
      user.name,
      user.trade_mode,
      user.broker,
      user.locale,
      user.created_at_ms,
      user.updated_at_ms,
      user.last_login_at_ms,
    ],
  );
}

export async function pgListUserRoles(userId: string) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  const result = await pool.query(
    `SELECT user_id, role, granted_at_ms, granted_by_user_id
     FROM auth_user_roles
     WHERE user_id = $1
     ORDER BY granted_at_ms DESC`,
    [userId],
  );
  return result.rows.map((row: Record<string, unknown>) => mapRoleRow(row));
}

export async function pgUpsertUserRole(args: {
  userId: string;
  role: PgAuthRole;
  grantedAtMs: number;
  grantedByUserId?: string | null;
}) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  await pool.query(
    `INSERT INTO auth_user_roles(user_id, role, granted_at_ms, granted_by_user_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT(user_id, role) DO UPDATE SET
       granted_by_user_id = COALESCE(auth_user_roles.granted_by_user_id, EXCLUDED.granted_by_user_id)`,
    [args.userId, args.role, args.grantedAtMs, args.grantedByUserId || null],
  );
}

export async function pgUpsertSession(session: PgAuthSessionRow) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  await pool.query(
    `INSERT INTO auth_sessions(
      session_id, user_id, session_token_hash, user_agent, ip_address, expires_at_ms, revoked_at_ms, created_at_ms, updated_at_ms, last_seen_at_ms
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT(session_id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      session_token_hash = EXCLUDED.session_token_hash,
      user_agent = EXCLUDED.user_agent,
      ip_address = EXCLUDED.ip_address,
      expires_at_ms = EXCLUDED.expires_at_ms,
      revoked_at_ms = EXCLUDED.revoked_at_ms,
      updated_at_ms = EXCLUDED.updated_at_ms,
      last_seen_at_ms = EXCLUDED.last_seen_at_ms`,
    [
      session.session_id,
      session.user_id,
      session.session_token_hash,
      session.user_agent,
      session.ip_address,
      session.expires_at_ms,
      session.revoked_at_ms,
      session.created_at_ms,
      session.updated_at_ms,
      session.last_seen_at_ms,
    ],
  );
}

export async function pgGetSessionBundle(tokenHash: string, now: number) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  const result = await pool.query(
    `SELECT
       s.session_id,
       s.user_id,
       s.session_token_hash,
       s.user_agent,
       s.ip_address,
       s.expires_at_ms,
       s.revoked_at_ms,
       s.created_at_ms AS session_created_at_ms,
       s.updated_at_ms AS session_updated_at_ms,
       s.last_seen_at_ms,
       u.email,
       u.password_hash,
       u.name,
       u.trade_mode,
       u.broker,
       u.locale,
       u.created_at_ms AS user_created_at_ms,
       u.updated_at_ms AS user_updated_at_ms,
       u.last_login_at_ms,
       sync.asset_class,
       sync.market,
       sync.ui_mode,
       sync.risk_profile_key,
       sync.watchlist_json,
       sync.holdings_json,
       sync.executions_json,
       sync.discipline_log_json
     FROM auth_sessions s
     JOIN auth_users u ON u.user_id = s.user_id
     LEFT JOIN auth_user_state_sync sync ON sync.user_id = u.user_id
     WHERE s.session_token_hash = $1
       AND s.revoked_at_ms IS NULL
       AND s.expires_at_ms > $2
     LIMIT 1`,
    [tokenHash, now],
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0] as Record<string, unknown>;
  const bundle = row as unknown as PgAuthSessionBundleRow;
  return {
    session: mapSessionRow({
      ...bundle,
      created_at_ms: bundle.session_created_at_ms,
      updated_at_ms: bundle.session_updated_at_ms,
    }),
    user: mapUserRow({
      ...bundle,
      created_at_ms: bundle.user_created_at_ms,
      updated_at_ms: bundle.user_updated_at_ms,
    }),
    state: mapStateRow(bundle),
  };
}

export async function pgGetAdminSessionBundle(tokenHash: string, now: number) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  const result = await pool.query(
    `SELECT
       s.session_id,
       s.user_id,
       s.session_token_hash,
       s.user_agent,
       s.ip_address,
       s.expires_at_ms,
       s.revoked_at_ms,
       s.created_at_ms AS session_created_at_ms,
       s.updated_at_ms AS session_updated_at_ms,
       s.last_seen_at_ms,
       u.email,
       u.password_hash,
       u.name,
       u.trade_mode,
       u.broker,
       u.locale,
       u.created_at_ms AS user_created_at_ms,
       u.updated_at_ms AS user_updated_at_ms,
       u.last_login_at_ms,
       sync.asset_class,
       sync.market,
       sync.ui_mode,
       sync.risk_profile_key,
       sync.watchlist_json,
       sync.holdings_json,
       sync.executions_json,
       sync.discipline_log_json,
       COALESCE(
         (
           SELECT array_agg(role_map.role ORDER BY role_map.granted_at_ms DESC)
           FROM auth_user_roles role_map
           WHERE role_map.user_id = u.user_id
         ),
         ARRAY[]::text[]
       ) AS roles
     FROM auth_sessions s
     JOIN auth_users u ON u.user_id = s.user_id
     LEFT JOIN auth_user_state_sync sync ON sync.user_id = u.user_id
     WHERE s.session_token_hash = $1
       AND s.revoked_at_ms IS NULL
       AND s.expires_at_ms > $2
     LIMIT 1`,
    [tokenHash, now],
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0] as Record<string, unknown>;
  const bundle = row as unknown as PgAuthSessionBundleRow;
  return {
    session: mapSessionRow({
      ...bundle,
      created_at_ms: bundle.session_created_at_ms,
      updated_at_ms: bundle.session_updated_at_ms,
    }),
    user: mapUserRow({
      ...bundle,
      created_at_ms: bundle.user_created_at_ms,
      updated_at_ms: bundle.user_updated_at_ms,
    }),
    state: mapStateRow(bundle),
    roles: parseRoleList(bundle.roles),
  };
}

export async function pgTouchSession(sessionId: string, now: number) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  await pool.query(
    `UPDATE auth_sessions
     SET updated_at_ms = $2, last_seen_at_ms = $2
     WHERE session_id = $1`,
    [sessionId, now],
  );
}

export async function pgRevokeSessionByTokenHash(tokenHash: string, now: number) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  await pool.query(
    `UPDATE auth_sessions
     SET revoked_at_ms = $2, updated_at_ms = $2
     WHERE session_token_hash = $1 AND revoked_at_ms IS NULL`,
    [tokenHash, now],
  );
}

export async function pgRevokeUserSessions(userId: string, now: number) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  await pool.query(
    `UPDATE auth_sessions
     SET revoked_at_ms = $2, updated_at_ms = $2
     WHERE user_id = $1 AND revoked_at_ms IS NULL`,
    [userId, now],
  );
}

export async function pgInvalidateOpenPasswordResets(userId: string, now: number) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  await pool.query(
    `UPDATE auth_password_resets
     SET used_at_ms = $2, updated_at_ms = $2
     WHERE user_id = $1 AND used_at_ms IS NULL`,
    [userId, now],
  );
}

export async function pgInsertPasswordReset(reset: PgAuthPasswordResetRow) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  await pool.query(
    `INSERT INTO auth_password_resets(
      reset_id, user_id, email, code_hash, expires_at_ms, used_at_ms, created_at_ms, updated_at_ms
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(reset_id) DO UPDATE SET
      code_hash = EXCLUDED.code_hash,
      expires_at_ms = EXCLUDED.expires_at_ms,
      used_at_ms = EXCLUDED.used_at_ms,
      updated_at_ms = EXCLUDED.updated_at_ms`,
    [
      reset.reset_id,
      reset.user_id,
      reset.email,
      reset.code_hash,
      reset.expires_at_ms,
      reset.used_at_ms,
      reset.created_at_ms,
      reset.updated_at_ms,
    ],
  );
}

export async function pgGetLatestPasswordReset(userId: string, email: string) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  const result = await pool.query(
    `SELECT reset_id, user_id, email, code_hash, expires_at_ms, used_at_ms, created_at_ms, updated_at_ms
     FROM auth_password_resets
     WHERE user_id = $1 AND email = $2
     ORDER BY created_at_ms DESC
     LIMIT 1`,
    [userId, email],
  );
  return result.rows[0] ? mapResetRow(result.rows[0]) : null;
}

export async function pgMarkPasswordResetUsed(resetId: string, now: number) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  await pool.query(
    `UPDATE auth_password_resets
     SET used_at_ms = $2, updated_at_ms = $2
     WHERE reset_id = $1`,
    [resetId, now],
  );
}

export async function pgGetUserState(userId: string) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  const result = await pool.query(
    `SELECT asset_class, market, ui_mode, risk_profile_key, watchlist_json, holdings_json, executions_json, discipline_log_json
     FROM auth_user_state_sync
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  return mapStateRow(result.rows[0] as Record<string, unknown> | undefined);
}

export async function pgUpsertUserState(
  userId: string,
  state: PgAuthUserState,
  updatedAtMs: number,
) {
  await ensurePostgresAuthSchema();
  const pool = getAuthPool();
  await pool.query(
    `INSERT INTO auth_user_state_sync(
      user_id, asset_class, market, ui_mode, risk_profile_key, watchlist_json, holdings_json, executions_json, discipline_log_json, updated_at_ms
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10)
    ON CONFLICT(user_id) DO UPDATE SET
      asset_class = EXCLUDED.asset_class,
      market = EXCLUDED.market,
      ui_mode = EXCLUDED.ui_mode,
      risk_profile_key = EXCLUDED.risk_profile_key,
      watchlist_json = EXCLUDED.watchlist_json,
      holdings_json = EXCLUDED.holdings_json,
      executions_json = EXCLUDED.executions_json,
      discipline_log_json = EXCLUDED.discipline_log_json,
      updated_at_ms = EXCLUDED.updated_at_ms`,
    [
      userId,
      state.assetClass,
      state.market,
      state.uiMode,
      state.riskProfileKey,
      JSON.stringify(state.watchlist || []),
      JSON.stringify(state.holdings || []),
      JSON.stringify(state.executions || []),
      JSON.stringify(state.disciplineLog || buildDefaultState().disciplineLog),
      updatedAtMs,
    ],
  );
}

export async function closePostgresAuthStore() {
  if (!poolSingleton) return;
  const pool = poolSingleton;
  poolSingleton = null;
  schemaReady = false;
  await pool.end();
}
