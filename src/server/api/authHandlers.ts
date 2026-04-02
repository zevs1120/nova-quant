import {
  clearAdminAuthCookieHeader,
  clearAuthCookieHeader,
  getEffectiveAuthRolesForUser,
  getAdminAuthCookieHeader,
  getAdminSession,
  getAuthCookieHeader,
  getAuthSession,
  getAuthSessionFromAccessToken,
  getAuthUserState,
  loginAuthUser,
  loginAdminUser,
  logoutAuthSession,
  upsertAuthUserState,
} from '../auth/service.js';
import { readSupabaseBrowserRuntimeConfig } from '../auth/supabase.js';
import { checkAuthRateLimit } from '../auth/rateLimit.js';

type BasicRequest = {
  body?: unknown;
  query?: Record<string, unknown>;
  ip?: string;
  socket?: { remoteAddress?: string };
  header?: (name: string) => string | undefined;
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
};

type BasicResponse = {
  status: (code: number) => BasicResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

function getHeader(req: BasicRequest, name: string) {
  if (typeof req.header === 'function') {
    return req.header(name) || '';
  }
  const headers = req.headers || {};
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function parseCookies(req: BasicRequest) {
  const header = getHeader(req, 'cookie');
  return header.split(';').reduce<Record<string, string>>((acc, item) => {
    const [key, ...rest] = item.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('=') || '');
    return acc;
  }, {});
}

function parseBearerToken(req: BasicRequest) {
  const header = getHeader(req, 'authorization');
  const match = String(header || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function resolveUserSession(req: BasicRequest) {
  const bearerToken = parseBearerToken(req);
  if (bearerToken) {
    return getAuthSessionFromAccessToken(bearerToken);
  }
  const cookies = parseCookies(req);
  return getAuthSession(cookies.novaquant_session);
}

function requestIp(req: BasicRequest) {
  return (req.ip || req.socket?.remoteAddress || '').slice(0, 120) || null;
}

function sendAuthServiceError(res: BasicResponse, error: unknown) {
  const message = String((error as Error)?.message || error || '');
  if (
    message.includes('REMOTE_AUTH_STORE_NOT_CONFIGURED') ||
    message.includes('POSTGRES_AUTH_STORE_NOT_CONFIGURED') ||
    message.includes('BUSINESS_RUNTIME_POSTGRES_REQUIRED') ||
    message.includes('SUPABASE_AUTH_NOT_CONFIGURED')
  ) {
    res.status(503).json({ ok: false, error: 'AUTH_STORE_NOT_CONFIGURED' });
    return;
  }
  if (
    message.includes('REMOTE_AUTH_STORE_TIMEOUT') ||
    message.includes('REMOTE_AUTH_STORE_UNREACHABLE') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ENOTFOUND') ||
    message.includes('connect ECONN')
  ) {
    res.status(503).json({ ok: false, error: 'AUTH_STORE_UNREACHABLE' });
    return;
  }
  if (message.includes('RESET_EMAIL_NOT_CONFIGURED')) {
    res.status(503).json({ ok: false, error: 'RESET_DELIVERY_NOT_CONFIGURED' });
    return;
  }
  if (message.includes('RESET_EMAIL_SEND_FAILED')) {
    res.status(502).json({ ok: false, error: 'RESET_DELIVERY_FAILED' });
    return;
  }
  res.status(500).json({ ok: false, error: 'AUTH_SERVICE_ERROR' });
}

export async function handleAuthSession(req: BasicRequest, res: BasicResponse) {
  try {
    const session = await resolveUserSession(req);
    if (!session) {
      res.json({ authenticated: false });
      return;
    }
    const roles = await getEffectiveAuthRolesForUser(session.user);
    res.json({
      authenticated: true,
      user: session.user,
      state: session.state,
      roles,
      isAdmin: roles.includes('ADMIN'),
    });
  } catch (error) {
    sendAuthServiceError(res, error);
  }
}

export function handleGetAuthProviderConfig(_req: BasicRequest, res: BasicResponse) {
  try {
    res.json(readSupabaseBrowserRuntimeConfig());
  } catch (error) {
    sendAuthServiceError(res, error);
  }
}

export async function handleAdminSession(req: BasicRequest, res: BasicResponse) {
  try {
    const cookies = parseCookies(req);
    const session = await getAdminSession(cookies.novaquant_admin_session);
    if (!session) {
      res.status(401).json({ authenticated: false, authorized: false });
      return;
    }
    res.json({
      authenticated: true,
      authorized: true,
      user: session.user,
      roles: session.roles,
    });
  } catch (error) {
    sendAuthServiceError(res, error);
  }
}

export async function handleAuthSignup(req: BasicRequest, res: BasicResponse) {
  res.status(410).json({
    ok: false,
    error: 'AUTH_MANAGED_BY_SUPABASE',
    message: 'Sign up is managed by Supabase browser auth and no longer supported via this API.',
  });
}

export async function handleAdminLogin(req: BasicRequest, res: BasicResponse) {
  try {
    const ip = requestIp(req) || 'unknown';
    const rl = checkAuthRateLimit(ip);
    if (!rl.allowed) {
      res.status(429).json({ ok: false, error: 'RATE_LIMITED', retryAfterMs: rl.retryAfterMs });
      return;
    }
    const body = (req.body || {}) as { email?: string; password?: string };
    const result = await loginAdminUser({
      email: String(body.email || ''),
      password: String(body.password || ''),
      userAgent: getHeader(req, 'user-agent') || null,
      ipAddress: requestIp(req),
    });
    if (!result.ok) {
      res
        .status(result.error === 'INVALID_CREDENTIALS' ? 401 : 403)
        .json({ ok: false, error: result.error });
      return;
    }
    res.setHeader('Set-Cookie', getAdminAuthCookieHeader(result.sessionToken));
    res.json({
      ok: true,
      authenticated: true,
      authorized: true,
      user: result.user,
      roles: result.roles,
    });
  } catch (error) {
    sendAuthServiceError(res, error);
  }
}

export async function handleAuthLogin(req: BasicRequest, res: BasicResponse) {
  try {
    const ip = requestIp(req) || 'unknown';
    const rl = checkAuthRateLimit(ip);
    if (!rl.allowed) {
      res.status(429).json({ ok: false, error: 'RATE_LIMITED', retryAfterMs: rl.retryAfterMs });
      return;
    }
    const body = (req.body || {}) as { email?: string; password?: string };
    const result = await loginAuthUser({
      email: String(body.email || ''),
      password: String(body.password || ''),
      userAgent: getHeader(req, 'user-agent') || null,
      ipAddress: requestIp(req),
    });
    if (!result.ok) {
      res.status(result.error === 'INVALID_CREDENTIALS' ? 401 : 403).json({
        ok: false,
        error: result.error,
      });
      return;
    }
    res.setHeader('Set-Cookie', getAuthCookieHeader(result.sessionToken));
    res.json({
      ok: true,
      authenticated: true,
      user: result.user,
      state: result.state,
    });
  } catch (error) {
    sendAuthServiceError(res, error);
  }
}

export async function handleAdminLogout(req: BasicRequest, res: BasicResponse) {
  try {
    const cookies = parseCookies(req);
    await logoutAuthSession(cookies.novaquant_admin_session);
    res.setHeader('Set-Cookie', clearAdminAuthCookieHeader());
    res.json({ ok: true });
  } catch (error) {
    sendAuthServiceError(res, error);
  }
}

export async function handleAuthLogout(req: BasicRequest, res: BasicResponse) {
  try {
    const cookies = parseCookies(req);
    await logoutAuthSession(cookies.novaquant_session);
    res.setHeader('Set-Cookie', clearAuthCookieHeader());
    res.json({ ok: true });
  } catch (error) {
    sendAuthServiceError(res, error);
  }
}

export async function handleForgotPassword(req: BasicRequest, res: BasicResponse) {
  res.status(410).json({
    ok: false,
    error: 'AUTH_MANAGED_BY_SUPABASE',
    message:
      'Password reset is managed by Supabase browser auth and no longer supported via this API.',
  });
}

export async function handleResetPassword(req: BasicRequest, res: BasicResponse) {
  res.status(410).json({
    ok: false,
    error: 'AUTH_MANAGED_BY_SUPABASE',
    message:
      'Password reset is managed by Supabase browser auth and no longer supported via this API.',
  });
}

export async function handleGetAuthProfile(req: BasicRequest, res: BasicResponse) {
  try {
    const session = await resolveUserSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      return;
    }
    const roles = await getEffectiveAuthRolesForUser(session.user);
    res.json({
      ok: true,
      user: session.user,
      state: await getAuthUserState(session.user.userId),
      roles,
      isAdmin: roles.includes('ADMIN'),
    });
  } catch (error) {
    sendAuthServiceError(res, error);
  }
}

export async function handlePostAuthProfile(req: BasicRequest, res: BasicResponse) {
  try {
    const session = await resolveUserSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      return;
    }
    const body = (req.body || {}) as {
      assetClass?: string;
      market?: string;
      uiMode?: string;
      riskProfileKey?: string;
      watchlist?: string[];
      holdings?: unknown[];
      executions?: unknown[];
      disciplineLog?: { checkins: string[]; boundary_kept: string[]; weekly_reviews: string[] };
    };
    const state = await upsertAuthUserState(session.user.userId, {
      assetClass: body.assetClass,
      market: body.market,
      uiMode: body.uiMode,
      riskProfileKey: body.riskProfileKey,
      watchlist: body.watchlist,
      holdings: body.holdings,
      executions: body.executions,
      disciplineLog: body.disciplineLog,
    });
    res.json({ ok: true, state });
  } catch (error) {
    sendAuthServiceError(res, error);
  }
}
