import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDb } from '../db/database.js';
import {
  hasRemoteAuthStore,
  remoteDeleteKey,
  remoteDeleteKeys,
  remoteGetJson,
  remoteGetString,
  remotePasswordResetKey,
  remoteSessionKey,
  remoteSetAdd,
  remoteSetJson,
  remoteSetMembers,
  remoteSetRemove,
  remoteSetString,
  remoteUserRolesKey,
  remoteUserIdByEmailKey,
  remoteUserKey,
  remoteUserSessionsKey,
  remoteUserStateKey
} from './remoteKv.js';

const SESSION_COOKIE_NAME = 'novaquant_session';
const ADMIN_SESSION_COOKIE_NAME = 'novaquant_admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const RESET_TTL_MS = 1000 * 60 * 15;

export type AuthTradeMode = 'starter' | 'active' | 'deep';
export type AuthRole = 'ADMIN' | 'OPERATOR' | 'SUPPORT';

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

type AuthUserRoleRow = {
  user_id: string;
  role: AuthRole;
  granted_at_ms: number;
  granted_by_user_id: string | null;
};

type SeededUserConfig = {
  email: string;
  password: string;
  name: string;
  tradeMode: AuthTradeMode;
  broker: string;
  locale: string;
  initialState?: Partial<AuthUserState>;
};

type RemoteSessionRecord = {
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

type RemoteResetRecord = {
  reset_id: string;
  user_id: string;
  email: string;
  code_hash: string;
  expires_at_ms: number;
  used_at_ms: number | null;
  created_at_ms: number;
  updated_at_ms: number;
};

function nowMs() {
  return Date.now();
}

function normalizeEmail(value: string) {
  return String(value || '').trim().toLowerCase();
}

function normalizeTradeMode(value: string | null | undefined): AuthTradeMode {
  if (value === 'starter' || value === 'deep') return value;
  return 'active';
}

function normalizeRole(value: string | null | undefined): AuthRole | null {
  const next = String(value || '').trim().toUpperCase();
  if (next === 'ADMIN' || next === 'OPERATOR' || next === 'SUPPORT') return next;
  return null;
}

function configuredAdminEmails() {
  const raw = [process.env.NOVA_ADMIN_EMAILS || '', process.env.NOVA_OWNER_EMAIL || '']
    .join(',')
    .split(',')
    .map((row) => normalizeEmail(row))
    .filter(Boolean);
  return new Set(raw);
}

function isConfiguredAdminEmail(email: string) {
  return configuredAdminEmails().has(normalizeEmail(email));
}

function mergeSeededUserState(user: SeededUserConfig): AuthUserState {
  const base = buildInitialUserState(user.tradeMode);
  const next = user.initialState || {};
  return {
    ...base,
    ...next,
    watchlist: Array.isArray(next.watchlist) ? next.watchlist : base.watchlist,
    holdings: Array.isArray(next.holdings) ? next.holdings : base.holdings,
    executions: Array.isArray(next.executions) ? next.executions : base.executions,
    disciplineLog: next.disciplineLog || base.disciplineLog
  };
}

function getSeededUserConfigs(): SeededUserConfig[] {
  const seededUsers: SeededUserConfig[] = [];

  if (process.env.NOVA_DISABLE_TEST_ACCOUNT !== '1') {
    seededUsers.push({
      email: 'test',
      password: 'test',
      name: 'Test Account',
      tradeMode: 'deep',
      broker: 'Robinhood',
      locale: 'zh',
      initialState: {
        watchlist: ['SPY', 'QQQ', 'AAPL'],
        assetClass: 'US_STOCK',
        market: 'US'
      }
    });
  }

  if (process.env.NOVA_ENABLE_SEEDED_DEMO_USER === '1') {
    const email = normalizeEmail(process.env.NOVA_SEEDED_DEMO_EMAIL || '');
    const password = String(process.env.NOVA_SEEDED_DEMO_PASSWORD || '');
    if (email && password) {
      seededUsers.push({
        email,
        password,
        name: String(process.env.NOVA_SEEDED_DEMO_NAME || 'Nova Demo'),
        tradeMode: normalizeTradeMode(process.env.NOVA_SEEDED_DEMO_TRADE_MODE),
        broker: String(process.env.NOVA_SEEDED_DEMO_BROKER || 'Robinhood'),
        locale: String(process.env.NOVA_SEEDED_DEMO_LOCALE || 'en')
      });
    }
  }

  const deduped = new Map<string, SeededUserConfig>();
  seededUsers.forEach((user) => {
    if (!user.email || !user.password) return;
    deduped.set(normalizeEmail(user.email), {
      ...user,
      email: normalizeEmail(user.email)
    });
  });
  return Array.from(deduped.values());
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

function buildCookieHeader(name: string, token: string, maxAgeSeconds: number) {
  const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

function clearCookieHeader(name: string) {
  const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
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

function buildInitialUserState(tradeMode: AuthTradeMode): AuthUserState {
  return {
    ...defaultUserState(),
    uiMode: tradeMode === 'starter' ? 'beginner' : tradeMode === 'deep' ? 'advanced' : 'standard',
    riskProfileKey: tradeMode === 'deep' ? 'aggressive' : tradeMode === 'starter' ? 'conservative' : 'balanced'
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

function shouldRequireRemoteAuthStore() {
  return process.env.VERCEL === '1';
}

function assertAuthStoreReady() {
  if (shouldRequireRemoteAuthStore() && !hasRemoteAuthStore()) {
    throw new Error('REMOTE_AUTH_STORE_NOT_CONFIGURED');
  }
}

function ensureSeededUserLocal() {
  const db = getDb();
  for (const seededUser of getSeededUserConfigs()) {
    const existing = db
      .prepare('SELECT user_id FROM auth_users WHERE email = ? LIMIT 1')
      .get(seededUser.email) as { user_id: string } | undefined;
    if (existing) continue;
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
      email: seededUser.email,
      password_hash: hashPassword(seededUser.password),
      name: seededUser.name,
      trade_mode: seededUser.tradeMode,
      broker: seededUser.broker,
      locale: seededUser.locale,
      created_at_ms: ts,
      updated_at_ms: ts,
      last_login_at_ms: null
    });
    const initialState = mergeSeededUserState(seededUser);
    db.prepare(
      `INSERT INTO auth_user_state_sync(
        user_id, asset_class, market, ui_mode, risk_profile_key, watchlist_json, holdings_json, executions_json, discipline_log_json, updated_at_ms
      ) VALUES (
        @user_id, @asset_class, @market, @ui_mode, @risk_profile_key, @watchlist_json, @holdings_json, @executions_json, @discipline_log_json, @updated_at_ms
      )`
    ).run({
      user_id: userId,
      asset_class: initialState.assetClass,
      market: initialState.market,
      ui_mode: initialState.uiMode,
      risk_profile_key: initialState.riskProfileKey,
      watchlist_json: JSON.stringify(initialState.watchlist),
      holdings_json: JSON.stringify(initialState.holdings),
      executions_json: JSON.stringify(initialState.executions),
      discipline_log_json: JSON.stringify(initialState.disciplineLog),
      updated_at_ms: ts
    });
  }
}

async function ensureSeededUserRemote() {
  for (const seededUser of getSeededUserConfigs()) {
    const existingUserId = await remoteGetString(remoteUserIdByEmailKey(seededUser.email));
    if (existingUserId) continue;

    const ts = nowMs();
    const userId = createId('usr');
    const user: AuthUserRow = {
      user_id: userId,
      email: seededUser.email,
      password_hash: hashPassword(seededUser.password),
      name: seededUser.name,
      trade_mode: seededUser.tradeMode,
      broker: seededUser.broker,
      locale: seededUser.locale,
      created_at_ms: ts,
      updated_at_ms: ts,
      last_login_at_ms: null
    };
    const state = mergeSeededUserState(seededUser);
    const reserved = await remoteSetString(remoteUserIdByEmailKey(seededUser.email), userId, { nx: true });
    if (!reserved) continue;
    try {
      await remoteSetJson(remoteUserKey(userId), user);
      await remoteSetJson(remoteUserStateKey(userId), state);
    } catch (error) {
      await remoteDeleteKey(remoteUserIdByEmailKey(seededUser.email));
      throw error;
    }
  }
}

async function ensureSeededUser() {
  assertAuthStoreReady();
  if (hasRemoteAuthStore()) {
    await ensureSeededUserRemote();
    return;
  }
  ensureSeededUserLocal();
}

function getUserByEmailLocal(email: string): AuthUserRow | null {
  ensureSeededUserLocal();
  const row = getDb()
    .prepare(
      `SELECT user_id, email, password_hash, name, trade_mode, broker, locale, created_at_ms, updated_at_ms, last_login_at_ms
       FROM auth_users WHERE email = ? LIMIT 1`
    )
    .get(normalizeEmail(email)) as AuthUserRow | undefined;
  return row ?? null;
}

async function getUserByEmail(email: string): Promise<AuthUserRow | null> {
  await ensureSeededUser();
  if (hasRemoteAuthStore()) {
    const userId = await remoteGetString(remoteUserIdByEmailKey(normalizeEmail(email)));
    if (!userId) return null;
    return (await remoteGetJson<AuthUserRow>(remoteUserKey(userId))) || null;
  }
  return getUserByEmailLocal(email);
}

function getUserByIdLocal(userId: string): AuthUserRow | null {
  ensureSeededUserLocal();
  const row = getDb()
    .prepare(
      `SELECT user_id, email, password_hash, name, trade_mode, broker, locale, created_at_ms, updated_at_ms, last_login_at_ms
       FROM auth_users WHERE user_id = ? LIMIT 1`
    )
    .get(userId) as AuthUserRow | undefined;
  return row ?? null;
}

async function getUserById(userId: string): Promise<AuthUserRow | null> {
  await ensureSeededUser();
  if (hasRemoteAuthStore()) {
    return (await remoteGetJson<AuthUserRow>(remoteUserKey(userId))) || null;
  }
  return getUserByIdLocal(userId);
}

function listAuthUserRoleRowsLocal(userId: string): AuthUserRoleRow[] {
  return (
    (getDb()
      .prepare(
        `SELECT user_id, role, granted_at_ms, granted_by_user_id
         FROM auth_user_roles
         WHERE user_id = ?
         ORDER BY granted_at_ms DESC`
      )
      .all(userId) as AuthUserRoleRow[] | undefined) || []
  ).map((row) => ({
    ...row,
    role: normalizeRole(row.role) || 'SUPPORT'
  }));
}

async function listAuthUserRoleRows(userId: string): Promise<AuthUserRoleRow[]> {
  await ensureSeededUser();
  if (hasRemoteAuthStore()) {
    const rows = (await remoteGetJson<AuthUserRoleRow[]>(remoteUserRolesKey(userId))) || [];
    return rows
      .map((row) => ({
        user_id: String(row.user_id || userId),
        role: normalizeRole(row.role) || null,
        granted_at_ms: Number(row.granted_at_ms || 0),
        granted_by_user_id: row.granted_by_user_id ? String(row.granted_by_user_id) : null
      }))
      .filter((row): row is AuthUserRoleRow => Boolean(row.role))
      .sort((a, b) => b.granted_at_ms - a.granted_at_ms);
  }
  return listAuthUserRoleRowsLocal(userId);
}

async function upsertAuthUserRole(args: { userId: string; role: AuthRole; grantedByUserId?: string | null }) {
  await ensureSeededUser();
  const ts = nowMs();
  if (hasRemoteAuthStore()) {
    const current = (await remoteGetJson<AuthUserRoleRow[]>(remoteUserRolesKey(args.userId))) || [];
    const next = current
      .map((row) => ({
        user_id: String(row.user_id || args.userId),
        role: normalizeRole(row.role) || null,
        granted_at_ms: Number(row.granted_at_ms || 0),
        granted_by_user_id: row.granted_by_user_id ? String(row.granted_by_user_id) : null
      }))
      .filter((row): row is AuthUserRoleRow => Boolean(row.role));
    const existing = next.find((row) => row.role === args.role);
    if (existing) {
      existing.granted_at_ms = existing.granted_at_ms || ts;
      existing.granted_by_user_id = existing.granted_by_user_id || args.grantedByUserId || null;
    } else {
      next.push({
        user_id: args.userId,
        role: args.role,
        granted_at_ms: ts,
        granted_by_user_id: args.grantedByUserId || null
      });
    }
    await remoteSetJson(remoteUserRolesKey(args.userId), next);
    return;
  }
  getDb()
    .prepare(
      `INSERT INTO auth_user_roles(user_id, role, granted_at_ms, granted_by_user_id)
       VALUES (@user_id, @role, @granted_at_ms, @granted_by_user_id)
       ON CONFLICT(user_id, role) DO UPDATE SET
         granted_by_user_id = COALESCE(auth_user_roles.granted_by_user_id, excluded.granted_by_user_id)`
    )
    .run({
      user_id: args.userId,
      role: args.role,
      granted_at_ms: ts,
      granted_by_user_id: args.grantedByUserId || null
    });
}

async function syncConfiguredAdminRole(user: AuthUserRow | PublicAuthUser | null | undefined) {
  if (!user) return;
  const userId = 'userId' in user ? user.userId : user.user_id;
  const email = user.email;
  if (!isConfiguredAdminEmail(email)) return;
  await upsertAuthUserRole({
    userId,
    role: 'ADMIN'
  });
}

function createSessionLocal(args: { userId: string; userAgent?: string | null; ipAddress?: string | null }) {
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

async function createSession(args: { userId: string; userAgent?: string | null; ipAddress?: string | null }) {
  if (!hasRemoteAuthStore()) {
    return createSessionLocal(args);
  }
  const token = randomBytes(24).toString('hex');
  const ts = nowMs();
  const sessionId = createId('sess');
  const tokenHash = hashToken(token);
  const record: RemoteSessionRecord = {
    session_id: sessionId,
    user_id: args.userId,
    session_token_hash: tokenHash,
    user_agent: args.userAgent || null,
    ip_address: args.ipAddress || null,
    expires_at_ms: ts + SESSION_TTL_MS,
    revoked_at_ms: null,
    created_at_ms: ts,
    updated_at_ms: ts,
    last_seen_at_ms: ts
  };
  await remoteSetJson(remoteSessionKey(tokenHash), record, { px: SESSION_TTL_MS });
  await remoteSetAdd(remoteUserSessionsKey(args.userId), tokenHash);
  return token;
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getAuthCookieHeader(token: string) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return buildCookieHeader(SESSION_COOKIE_NAME, token, maxAge);
}

export function clearAuthCookieHeader() {
  return clearCookieHeader(SESSION_COOKIE_NAME);
}

export function getAdminSessionCookieName() {
  return ADMIN_SESSION_COOKIE_NAME;
}

export function getAdminAuthCookieHeader(token: string) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return buildCookieHeader(ADMIN_SESSION_COOKIE_NAME, token, maxAge);
}

export function clearAdminAuthCookieHeader() {
  return clearCookieHeader(ADMIN_SESSION_COOKIE_NAME);
}

export async function getAuthSession(token: string | null | undefined): Promise<{ user: PublicAuthUser; state: AuthUserState } | null> {
  if (!token) return null;
  await ensureSeededUser();

  if (!hasRemoteAuthStore()) {
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
    ).get(hashToken(token), now) as (RemoteSessionRecord &
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
        disciplineLog: parseJson(row.discipline_log_json, defaultUserState().disciplineLog)
      }
    };
  }

  const tokenHash = hashToken(token);
  const session = await remoteGetJson<RemoteSessionRecord>(remoteSessionKey(tokenHash));
  const now = nowMs();
  if (!session || session.revoked_at_ms || session.expires_at_ms <= now) {
    if (session?.user_id) {
      await remoteSetRemove(remoteUserSessionsKey(session.user_id), tokenHash);
    }
    await remoteDeleteKey(remoteSessionKey(tokenHash));
    return null;
  }

  const [user, state] = await Promise.all([
    getUserById(session.user_id),
    getAuthUserState(session.user_id)
  ]);
  if (!user) {
    await remoteDeleteKey(remoteSessionKey(tokenHash));
    return null;
  }

  const remainingTtl = Math.max(session.expires_at_ms - now, 1_000);
  await remoteSetJson(
    remoteSessionKey(tokenHash),
    {
      ...session,
      updated_at_ms: now,
      last_seen_at_ms: now
    },
    { px: remainingTtl }
  );

  return {
    user: mapPublicUser(user),
    state
  };
}

export async function signupAuthUser(args: {
  email: string;
  password: string;
  name: string;
  tradeMode: AuthTradeMode;
  broker: string;
  locale?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  await ensureSeededUser();
  const email = normalizeEmail(args.email);
  const password = String(args.password || '');
  if (!/\S+@\S+\.\S+/.test(email)) {
    return { ok: false as const, error: 'INVALID_EMAIL' };
  }
  if (password.length < 8) {
    return { ok: false as const, error: 'WEAK_PASSWORD' };
  }
  if (!hasRemoteAuthStore()) {
    if (getUserByEmailLocal(email)) {
      return { ok: false as const, error: 'EMAIL_EXISTS' };
    }
    const ts = nowMs();
    const db = getDb();
    const userId = createId('usr');
    const state = buildInitialUserState(args.tradeMode);
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
        @user_id, @asset_class, @market, @ui_mode, @risk_profile_key, @watchlist_json, @holdings_json, @executions_json, @discipline_log_json, @updated_at_ms
      )`
    ).run({
      user_id: userId,
      asset_class: state.assetClass,
      market: state.market,
      ui_mode: state.uiMode,
      risk_profile_key: state.riskProfileKey,
      watchlist_json: JSON.stringify(state.watchlist),
      holdings_json: JSON.stringify(state.holdings),
      executions_json: JSON.stringify(state.executions),
      discipline_log_json: JSON.stringify(state.disciplineLog),
      updated_at_ms: ts
    });
    const user = getUserByIdLocal(userId);
    if (!user) return { ok: false as const, error: 'SIGNUP_FAILED' };
    await syncConfiguredAdminRole(user);
    const sessionToken = await createSession({
      userId,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress
    });
    return {
      ok: true as const,
      user: mapPublicUser(user),
      state,
      sessionToken
    };
  }

  const ts = nowMs();
  const userId = createId('usr');
  const state = buildInitialUserState(args.tradeMode);
  const user: AuthUserRow = {
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
  };

  const reserved = await remoteSetString(remoteUserIdByEmailKey(email), userId, { nx: true });
  if (!reserved) {
    return { ok: false as const, error: 'EMAIL_EXISTS' };
  }
  try {
    await remoteSetJson(remoteUserKey(userId), user);
    await remoteSetJson(remoteUserStateKey(userId), state);
    await syncConfiguredAdminRole(user);
    const sessionToken = await createSession({
      userId,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress
    });
    return {
      ok: true as const,
      user: mapPublicUser(user),
      state,
      sessionToken
    };
  } catch (error) {
    await remoteDeleteKeys([remoteUserIdByEmailKey(email), remoteUserKey(userId), remoteUserStateKey(userId)]);
    throw error;
  }
}

export async function loginAuthUser(args: {
  email: string;
  password: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  await ensureSeededUser();
  const user = await getUserByEmail(args.email);
  if (!user || !verifyPassword(String(args.password || ''), user.password_hash)) {
    return { ok: false as const, error: 'INVALID_CREDENTIALS' };
  }
  const ts = nowMs();
  const updatedUser: AuthUserRow = {
    ...user,
    updated_at_ms: ts,
    last_login_at_ms: ts
  };

  if (hasRemoteAuthStore()) {
    await remoteSetJson(remoteUserKey(user.user_id), updatedUser);
  } else {
    getDb().prepare('UPDATE auth_users SET last_login_at_ms = ?, updated_at_ms = ? WHERE user_id = ?').run(ts, ts, user.user_id);
  }
  await syncConfiguredAdminRole(updatedUser);

  const sessionToken = await createSession({
    userId: user.user_id,
    userAgent: args.userAgent,
    ipAddress: args.ipAddress
  });
  const state = await getAuthUserState(user.user_id);
  return {
    ok: true as const,
    user: mapPublicUser(updatedUser),
    state,
    sessionToken
  };
}

export async function loginAdminUser(args: {
  email: string;
  password: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const result = await loginAuthUser(args);
  if (!result.ok) return result;
  const roles = (await listAuthUserRoleRows(result.user.userId)).map((row) => row.role);
  if (!roles.includes('ADMIN')) {
    await logoutAuthSession(result.sessionToken);
    return { ok: false as const, error: 'ADMIN_ACCESS_DENIED' };
  }
  return {
    ok: true as const,
    user: result.user,
    roles,
    sessionToken: result.sessionToken
  };
}

export async function logoutAuthSession(token: string | null | undefined) {
  if (!token) return;
  const tokenHash = hashToken(token);
  if (hasRemoteAuthStore()) {
    const session = await remoteGetJson<RemoteSessionRecord>(remoteSessionKey(tokenHash));
    if (session?.user_id) {
      await remoteSetRemove(remoteUserSessionsKey(session.user_id), tokenHash);
    }
    await remoteDeleteKey(remoteSessionKey(tokenHash));
    return;
  }
  const ts = nowMs();
  getDb()
    .prepare('UPDATE auth_sessions SET revoked_at_ms = ?, updated_at_ms = ? WHERE session_token_hash = ? AND revoked_at_ms IS NULL')
    .run(ts, ts, tokenHash);
}

export async function getAdminSession(token: string | null | undefined): Promise<{ user: PublicAuthUser; roles: AuthRole[] } | null> {
  const session = await getAuthSession(token);
  if (!session) return null;
  await syncConfiguredAdminRole(session.user);
  const roles = (await listAuthUserRoleRows(session.user.userId)).map((row) => row.role);
  if (!roles.includes('ADMIN')) return null;
  return {
    user: session.user,
    roles
  };
}

export async function createPasswordReset(args: { email: string }) {
  await ensureSeededUser();
  const email = normalizeEmail(args.email);
  const user = await getUserByEmail(email);
  if (!user) {
    return { ok: true as const, codeHint: null, expiresInMinutes: Math.floor(RESET_TTL_MS / 60000) };
  }

  const ts = nowMs();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const exposeCodeHint = process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production';

  if (hasRemoteAuthStore()) {
    const reset: RemoteResetRecord = {
      reset_id: createId('rst'),
      user_id: user.user_id,
      email,
      code_hash: hashResetCode(code),
      expires_at_ms: ts + RESET_TTL_MS,
      used_at_ms: null,
      created_at_ms: ts,
      updated_at_ms: ts
    };
    await remoteSetJson(remotePasswordResetKey(user.user_id), reset, { px: RESET_TTL_MS });
    return {
      ok: true as const,
      codeHint: exposeCodeHint ? code : null,
      expiresInMinutes: Math.floor(RESET_TTL_MS / 60000)
    };
  }

  const db = getDb();
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
    codeHint: exposeCodeHint ? code : null,
    expiresInMinutes: Math.floor(RESET_TTL_MS / 60000)
  };
}

export async function resetPasswordWithCode(args: { email: string; code: string; newPassword: string }) {
  await ensureSeededUser();
  const email = normalizeEmail(args.email);
  const user = await getUserByEmail(email);
  if (!user) return { ok: false as const, error: 'INVALID_RESET' };
  if (String(args.newPassword || '').length < 8) return { ok: false as const, error: 'WEAK_PASSWORD' };
  const ts = nowMs();

  if (hasRemoteAuthStore()) {
    const row = await remoteGetJson<RemoteResetRecord>(remotePasswordResetKey(user.user_id));
    if (!row || row.used_at_ms || row.expires_at_ms < ts || row.code_hash !== hashResetCode(args.code)) {
      return { ok: false as const, error: 'INVALID_RESET' };
    }
    const updatedUser: AuthUserRow = {
      ...user,
      password_hash: hashPassword(args.newPassword),
      updated_at_ms: ts
    };
    await remoteSetJson(remoteUserKey(user.user_id), updatedUser);
    await remoteSetJson(remotePasswordResetKey(user.user_id), { ...row, used_at_ms: ts, updated_at_ms: ts }, { px: Math.max(row.expires_at_ms - ts, 1_000) });
    const sessionHashes = await remoteSetMembers(remoteUserSessionsKey(user.user_id));
    await Promise.all(sessionHashes.map((sessionHash) => remoteDeleteKey(remoteSessionKey(sessionHash))));
    await remoteDeleteKey(remoteUserSessionsKey(user.user_id));
    return { ok: true as const };
  }

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

export async function getAuthUserState(userId: string): Promise<AuthUserState> {
  await ensureSeededUser();
  if (hasRemoteAuthStore()) {
    return (await remoteGetJson<AuthUserState>(remoteUserStateKey(userId))) || defaultUserState();
  }
  const row = getDb()
    .prepare(
      `SELECT asset_class, market, ui_mode, risk_profile_key, watchlist_json, holdings_json, executions_json, discipline_log_json
       FROM auth_user_state_sync
       WHERE user_id = ? LIMIT 1`
    )
    .get(userId) as {
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

export async function upsertAuthUserState(userId: string, input: Partial<AuthUserState>) {
  await ensureSeededUser();
  const current = await getAuthUserState(userId);
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

  if (hasRemoteAuthStore()) {
    await remoteSetJson(remoteUserStateKey(userId), next);
    return next;
  }

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
