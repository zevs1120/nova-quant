import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDb } from '../db/database.js';

const SESSION_COOKIE_NAME = 'novaquant_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const RESET_TTL_MS = 1000 * 60 * 15;

const SEEDED_USER = {
  email: 'zevs1120@gmail.com',
  password: 'Zevs1120',
  name: 'Zevs',
  tradeMode: 'active',
  broker: 'Robinhood',
  locale: 'en'
} as const;

export type AuthTradeMode = 'starter' | 'active' | 'deep';

export type PublicAuthUser = {
  userId: string;
  email: string;
  name: string;
  tradeMode: AuthTradeMode;
  broker: string;
  locale: string | null;
  createdAtMs: number;
  lastLoginAtMs: number | null;
};

export type AuthUserState = {
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

type AuthUserRow = {
  user_id: string;
  email: string;
  password_hash: string;
  name: string;
  trade_mode: AuthTradeMode;
  broker: string;
  locale: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  last_login_at_ms: number | null;
};

type AuthSessionRow = {
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

function nowMs() {
  return Date.now();
}

function normalizeEmail(value: string) {
  return String(value || '').trim().toLowerCase();
}

function createId(prefix: string) {
  return `${prefix}_${randomBytes(10).toString('hex')}`;
}

function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string) {
  const [kind, salt, digest] = String(stored || '').split(':');
  if (kind !== 'scrypt' || !salt || !digest) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

function hashToken(token: string) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

function hashResetCode(code: string) {
  return createHash('sha256').update(`reset:${String(code || '')}`).digest('hex');
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function defaultUserState(): AuthUserState {
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
      weekly_reviews: []
    }
  };
}

function mapPublicUser(row: AuthUserRow): PublicAuthUser {
  return {
    userId: row.user_id,
    email: row.email,
    name: row.name,
    tradeMode: row.trade_mode,
    broker: row.broker,
    locale: row.locale,
    createdAtMs: row.created_at_ms,
    lastLoginAtMs: row.last_login_at_ms ?? null
  };
}

function ensureSeededUser() {
  const db = getDb();
  const email = normalizeEmail(SEEDED_USER.email);
  const existing = db.prepare('SELECT user_id FROM auth_users WHERE email = ? LIMIT 1').get(email) as { user_id: string } | undefined;
  if (existing) return;
  const ts = nowMs();
  const userId = createId('usr');
  db.prepare(
    `INSERT INTO auth_users(
      user_id, email, password_hash, name, trade_mode, broker, locale, created_at_ms, updated_at_ms, last_login_at_ms
    ) VALUES (
      @user_id, @email, @password_hash, @name, @trade_mode, @broker, @locale, @created_at_ms, @updated_at_ms, @last_login_at_ms
    )`
  ).run({
    user_id: userId,
    email,
    password_hash: hashPassword(SEEDED_USER.password),
    name: SEEDED_USER.name,
    trade_mode: SEEDED_USER.tradeMode,
    broker: SEEDED_USER.broker,
    locale: SEEDED_USER.locale,
    created_at_ms: ts,
    updated_at_ms: ts,
    last_login_at_ms: null
  });
  db.prepare(
    `INSERT INTO auth_user_state_sync(
      user_id, asset_class, market, ui_mode, risk_profile_key, watchlist_json, holdings_json, executions_json, discipline_log_json, updated_at_ms
    ) VALUES (
      @user_id, 'US_STOCK', 'US', 'standard', 'balanced', '[]', '[]', '[]', '{"checkins":[],"boundary_kept":[],"weekly_reviews":[]}', @updated_at_ms
    )`
  ).run({
    user_id: userId,
    updated_at_ms: ts
  });
}

function getUserByEmail(email: string): AuthUserRow | null {
  ensureSeededUser();
  const row = getDb().prepare(
    `SELECT user_id, email, password_hash, name, trade_mode, broker, locale, created_at_ms, updated_at_ms, last_login_at_ms
     FROM auth_users WHERE email = ? LIMIT 1`
  ).get(normalizeEmail(email)) as AuthUserRow | undefined;
  return row ?? null;
}

function getUserById(userId: string): AuthUserRow | null {
  ensureSeededUser();
  const row = getDb().prepare(
    `SELECT user_id, email, password_hash, name, trade_mode, broker, locale, created_at_ms, updated_at_ms, last_login_at_ms
     FROM auth_users WHERE user_id = ? LIMIT 1`
  ).get(userId) as AuthUserRow | undefined;
  return row ?? null;
}

function createSession(args: { userId: string; userAgent?: string | null; ipAddress?: string | null }) {
  const db = getDb();
  const token = randomBytes(24).toString('hex');
  const ts = nowMs();
  const sessionId = createId('sess');
  db.prepare(
    `INSERT INTO auth_sessions(
      session_id, user_id, session_token_hash, user_agent, ip_address, expires_at_ms, revoked_at_ms, created_at_ms, updated_at_ms, last_seen_at_ms
    ) VALUES (
      @session_id, @user_id, @session_token_hash, @user_agent, @ip_address, @expires_at_ms, NULL, @created_at_ms, @updated_at_ms, @last_seen_at_ms
    )`
  ).run({
    session_id: sessionId,
    user_id: args.userId,
    session_token_hash: hashToken(token),
    user_agent: args.userAgent || null,
    ip_address: args.ipAddress || null,
    expires_at_ms: ts + SESSION_TTL_MS,
    created_at_ms: ts,
    updated_at_ms: ts,
    last_seen_at_ms: ts
  });
  return token;
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getAuthCookieHeader(token: string) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearAuthCookieHeader() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getAuthSession(token: string | null | undefined): { user: PublicAuthUser; state: AuthUserState } | null {
  if (!token) return null;
  ensureSeededUser();
  const db = getDb();
  const now = nowMs();
  const row = db.prepare(
    `SELECT
       s.session_id,
       s.user_id,
       s.session_token_hash,
       s.user_agent,
       s.ip_address,
       s.expires_at_ms,
       s.revoked_at_ms,
       s.created_at_ms,
       s.updated_at_ms,
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
     WHERE s.session_token_hash = ? AND s.revoked_at_ms IS NULL AND s.expires_at_ms > ?
     LIMIT 1`
  ).get(hashToken(token), now) as (AuthSessionRow &
    AuthUserRow & {
      user_created_at_ms: number;
      user_updated_at_ms: number;
      asset_class: string | null;
      market: string | null;
      ui_mode: string | null;
      risk_profile_key: string | null;
      watchlist_json: string | null;
      holdings_json: string | null;
      executions_json: string | null;
      discipline_log_json: string | null;
    }) | undefined;
  if (!row) return null;
  db.prepare('UPDATE auth_sessions SET updated_at_ms = ?, last_seen_at_ms = ? WHERE session_id = ?').run(now, now, row.session_id);
  return {
    user: {
      userId: row.user_id,
      email: row.email,
      name: row.name,
      tradeMode: row.trade_mode,
      broker: row.broker,
      locale: row.locale,
      createdAtMs: row.user_created_at_ms,
      lastLoginAtMs: row.last_login_at_ms ?? null
    },
    state: {
      assetClass: row.asset_class || 'US_STOCK',
      market: row.market || 'US',
      uiMode: row.ui_mode || 'standard',
      riskProfileKey: row.risk_profile_key || 'balanced',
      watchlist: parseJson(row.watchlist_json, [] as string[]),
      holdings: parseJson(row.holdings_json, [] as unknown[]),
      executions: parseJson(row.executions_json, [] as unknown[]),
      disciplineLog: parseJson(
        row.discipline_log_json,
        defaultUserState().disciplineLog
      )
    }
  };
}

export function signupAuthUser(args: {
  email: string;
  password: string;
  name: string;
  tradeMode: AuthTradeMode;
  broker: string;
  locale?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  ensureSeededUser();
  const email = normalizeEmail(args.email);
  const password = String(args.password || '');
  if (!/\S+@\S+\.\S+/.test(email)) {
    return { ok: false as const, error: 'INVALID_EMAIL' };
  }
  if (password.length < 8) {
    return { ok: false as const, error: 'WEAK_PASSWORD' };
  }
  if (getUserByEmail(email)) {
    return { ok: false as const, error: 'EMAIL_EXISTS' };
  }
  const ts = nowMs();
  const db = getDb();
  const userId = createId('usr');
  db.prepare(
    `INSERT INTO auth_users(
      user_id, email, password_hash, name, trade_mode, broker, locale, created_at_ms, updated_at_ms, last_login_at_ms
    ) VALUES (
      @user_id, @email, @password_hash, @name, @trade_mode, @broker, @locale, @created_at_ms, @updated_at_ms, @last_login_at_ms
    )`
  ).run({
    user_id: userId,
    email,
    password_hash: hashPassword(password),
    name: String(args.name || '').trim() || 'NovaQuant User',
    trade_mode: args.tradeMode,
    broker: String(args.broker || 'Other'),
    locale: args.locale || null,
    created_at_ms: ts,
    updated_at_ms: ts,
    last_login_at_ms: ts
  });
  db.prepare(
    `INSERT INTO auth_user_state_sync(
      user_id, asset_class, market, ui_mode, risk_profile_key, watchlist_json, holdings_json, executions_json, discipline_log_json, updated_at_ms
    ) VALUES (
      @user_id, 'US_STOCK', 'US', @ui_mode, @risk_profile_key, '[]', '[]', '[]', '{"checkins":[],"boundary_kept":[],"weekly_reviews":[]}', @updated_at_ms
    )`
  ).run({
    user_id: userId,
    ui_mode: args.tradeMode === 'starter' ? 'beginner' : args.tradeMode === 'deep' ? 'advanced' : 'standard',
    risk_profile_key: args.tradeMode === 'deep' ? 'aggressive' : args.tradeMode === 'starter' ? 'conservative' : 'balanced',
    updated_at_ms: ts
  });
  const user = getUserById(userId);
  if (!user) return { ok: false as const, error: 'SIGNUP_FAILED' };
  const sessionToken = createSession({
    userId,
    userAgent: args.userAgent,
    ipAddress: args.ipAddress
  });
  return {
    ok: true as const,
    user: mapPublicUser(user),
    state: defaultUserState(),
    sessionToken
  };
}

export function loginAuthUser(args: {
  email: string;
  password: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  ensureSeededUser();
  const user = getUserByEmail(args.email);
  if (!user || !verifyPassword(String(args.password || ''), user.password_hash)) {
    return { ok: false as const, error: 'INVALID_CREDENTIALS' };
  }
  const ts = nowMs();
  getDb().prepare('UPDATE auth_users SET last_login_at_ms = ?, updated_at_ms = ? WHERE user_id = ?').run(ts, ts, user.user_id);
  const sessionToken = createSession({
    userId: user.user_id,
    userAgent: args.userAgent,
    ipAddress: args.ipAddress
  });
  const currentUser = getUserById(user.user_id);
  const session = getAuthSession(sessionToken);
  return {
    ok: true as const,
    user: mapPublicUser(currentUser || user),
    state: session?.state || defaultUserState(),
    sessionToken
  };
}

export function logoutAuthSession(token: string | null | undefined) {
  if (!token) return;
  const ts = nowMs();
  getDb()
    .prepare('UPDATE auth_sessions SET revoked_at_ms = ?, updated_at_ms = ? WHERE session_token_hash = ? AND revoked_at_ms IS NULL')
    .run(ts, ts, hashToken(token));
}

export function createPasswordReset(args: { email: string }) {
  ensureSeededUser();
  const email = normalizeEmail(args.email);
  const user = getUserByEmail(email);
  if (!user) {
    return { ok: true as const, codeHint: null, expiresInMinutes: Math.floor(RESET_TTL_MS / 60000) };
  }
  const db = getDb();
  const ts = nowMs();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.prepare('UPDATE auth_password_resets SET used_at_ms = ?, updated_at_ms = ? WHERE user_id = ? AND used_at_ms IS NULL').run(ts, ts, user.user_id);
  db.prepare(
    `INSERT INTO auth_password_resets(
      reset_id, user_id, email, code_hash, expires_at_ms, used_at_ms, created_at_ms, updated_at_ms
    ) VALUES (
      @reset_id, @user_id, @email, @code_hash, @expires_at_ms, NULL, @created_at_ms, @updated_at_ms
    )`
  ).run({
    reset_id: createId('rst'),
    user_id: user.user_id,
    email,
    code_hash: hashResetCode(code),
    expires_at_ms: ts + RESET_TTL_MS,
    created_at_ms: ts,
    updated_at_ms: ts
  });
  return {
    ok: true as const,
    codeHint: code,
    expiresInMinutes: Math.floor(RESET_TTL_MS / 60000)
  };
}

export function resetPasswordWithCode(args: { email: string; code: string; newPassword: string }) {
  ensureSeededUser();
  const email = normalizeEmail(args.email);
  const user = getUserByEmail(email);
  if (!user) return { ok: false as const, error: 'INVALID_RESET' };
  if (String(args.newPassword || '').length < 8) return { ok: false as const, error: 'WEAK_PASSWORD' };
  const ts = nowMs();
  const db = getDb();
  const row = db.prepare(
    `SELECT reset_id, code_hash, expires_at_ms, used_at_ms
     FROM auth_password_resets
     WHERE user_id = ? AND email = ?
     ORDER BY created_at_ms DESC
     LIMIT 1`
  ).get(user.user_id, email) as { reset_id: string; code_hash: string; expires_at_ms: number; used_at_ms: number | null } | undefined;
  if (!row || row.used_at_ms || row.expires_at_ms < ts || row.code_hash !== hashResetCode(args.code)) {
    return { ok: false as const, error: 'INVALID_RESET' };
  }
  db.prepare('UPDATE auth_users SET password_hash = ?, updated_at_ms = ? WHERE user_id = ?').run(hashPassword(args.newPassword), ts, user.user_id);
  db.prepare('UPDATE auth_password_resets SET used_at_ms = ?, updated_at_ms = ? WHERE reset_id = ?').run(ts, ts, row.reset_id);
  db.prepare('UPDATE auth_sessions SET revoked_at_ms = ?, updated_at_ms = ? WHERE user_id = ? AND revoked_at_ms IS NULL').run(ts, ts, user.user_id);
  return { ok: true as const };
}

export function getAuthUserState(userId: string): AuthUserState {
  ensureSeededUser();
  const row = getDb().prepare(
    `SELECT asset_class, market, ui_mode, risk_profile_key, watchlist_json, holdings_json, executions_json, discipline_log_json
     FROM auth_user_state_sync
     WHERE user_id = ? LIMIT 1`
  ).get(userId) as {
    asset_class: string;
    market: string;
    ui_mode: string;
    risk_profile_key: string;
    watchlist_json: string;
    holdings_json: string;
    executions_json: string;
    discipline_log_json: string;
  } | undefined;
  if (!row) return defaultUserState();
  return {
    assetClass: row.asset_class || 'US_STOCK',
    market: row.market || 'US',
    uiMode: row.ui_mode || 'standard',
    riskProfileKey: row.risk_profile_key || 'balanced',
    watchlist: parseJson(row.watchlist_json, [] as string[]),
    holdings: parseJson(row.holdings_json, [] as unknown[]),
    executions: parseJson(row.executions_json, [] as unknown[]),
    disciplineLog: parseJson(row.discipline_log_json, defaultUserState().disciplineLog)
  };
}

export function upsertAuthUserState(userId: string, input: Partial<AuthUserState>) {
  ensureSeededUser();
  const current = getAuthUserState(userId);
  const next: AuthUserState = {
    assetClass: String(input.assetClass || current.assetClass || 'US_STOCK'),
    market: String(input.market || current.market || 'US'),
    uiMode: String(input.uiMode || current.uiMode || 'standard'),
    riskProfileKey: String(input.riskProfileKey || current.riskProfileKey || 'balanced'),
    watchlist: Array.isArray(input.watchlist) ? input.watchlist : current.watchlist,
    holdings: Array.isArray(input.holdings) ? input.holdings : current.holdings,
    executions: Array.isArray(input.executions) ? input.executions : current.executions,
    disciplineLog: input.disciplineLog || current.disciplineLog
  };
  getDb().prepare(
    `INSERT INTO auth_user_state_sync(
      user_id, asset_class, market, ui_mode, risk_profile_key, watchlist_json, holdings_json, executions_json, discipline_log_json, updated_at_ms
    ) VALUES (
      @user_id, @asset_class, @market, @ui_mode, @risk_profile_key, @watchlist_json, @holdings_json, @executions_json, @discipline_log_json, @updated_at_ms
    )
    ON CONFLICT(user_id) DO UPDATE SET
      asset_class = excluded.asset_class,
      market = excluded.market,
      ui_mode = excluded.ui_mode,
      risk_profile_key = excluded.risk_profile_key,
      watchlist_json = excluded.watchlist_json,
      holdings_json = excluded.holdings_json,
      executions_json = excluded.executions_json,
      discipline_log_json = excluded.discipline_log_json,
      updated_at_ms = excluded.updated_at_ms`
  ).run({
    user_id: userId,
    asset_class: next.assetClass,
    market: next.market,
    ui_mode: next.uiMode,
    risk_profile_key: next.riskProfileKey,
    watchlist_json: JSON.stringify(next.watchlist || []),
    holdings_json: JSON.stringify(next.holdings || []),
    executions_json: JSON.stringify(next.executions || []),
    discipline_log_json: JSON.stringify(next.disciplineLog || defaultUserState().disciplineLog),
    updated_at_ms: nowMs()
  });
  return next;
}

