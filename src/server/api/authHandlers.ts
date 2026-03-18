import {
  clearAuthCookieHeader,
  createPasswordReset,
  getAuthSession,
  getAuthUserState,
  getAuthCookieHeader,
  loginAuthUser,
  logoutAuthSession,
  resetPasswordWithCode,
  signupAuthUser,
  upsertAuthUserState
} from '../auth/service.js';

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

function requestIp(req: BasicRequest) {
  return (req.ip || req.socket?.remoteAddress || '').slice(0, 120) || null;
}

function sendAuthServiceError(res: BasicResponse, error: unknown) {
  const message = String((error as Error)?.message || error || '');
  if (message.includes('REMOTE_AUTH_STORE_NOT_CONFIGURED')) {
    res.status(503).json({ ok: false, error: 'AUTH_STORE_NOT_CONFIGURED' });
    return;
  }
  res.status(500).json({ ok: false, error: 'AUTH_SERVICE_ERROR' });
}

export async function handleAuthSession(req: BasicRequest, res: BasicResponse) {
  try {
    const cookies = parseCookies(req);
    const session = await getAuthSession(cookies.novaquant_session);
    if (!session) {
      res.json({ authenticated: false });
      return;
    }
    res.json({
      authenticated: true,
      user: session.user,
      state: session.state
    });
  } catch (error) {
    sendAuthServiceError(res, error);
  }
}

export async function handleAuthSignup(req: BasicRequest, res: BasicResponse) {
  try {
    const body = (req.body || {}) as {
      email?: string;
      password?: string;
      name?: string;
      tradeMode?: 'starter' | 'active' | 'deep';
      broker?: string;
      locale?: string;
    };
    const result = await signupAuthUser({
      email: String(body.email || ''),
      password: String(body.password || ''),
      name: String(body.name || ''),
      tradeMode: (body.tradeMode || 'starter') as 'starter' | 'active' | 'deep',
      broker: String(body.broker || 'Other'),
      locale: body.locale || null,
      userAgent: getHeader(req, 'user-agent') || null,
      ipAddress: requestIp(req)
    });
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error });
      return;
    }
    res.setHeader('Set-Cookie', getAuthCookieHeader(result.sessionToken));
    res.json({
      ok: true,
      authenticated: true,
      user: result.user,
      state: result.state
    });
  } catch (error) {
    sendAuthServiceError(res, error);
  }
}

export async function handleAuthLogin(req: BasicRequest, res: BasicResponse) {
  try {
    const body = (req.body || {}) as { email?: string; password?: string };
    const result = await loginAuthUser({
      email: String(body.email || ''),
      password: String(body.password || ''),
      userAgent: getHeader(req, 'user-agent') || null,
      ipAddress: requestIp(req)
    });
    if (!result.ok) {
      res.status(401).json({ ok: false, error: result.error });
      return;
    }
    res.setHeader('Set-Cookie', getAuthCookieHeader(result.sessionToken));
    res.json({
      ok: true,
      authenticated: true,
      user: result.user,
      state: result.state
    });
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
  try {
    const body = (req.body || {}) as { email?: string };
    const result = await createPasswordReset({
      email: String(body.email || '')
    });
    res.json({
      ok: true,
      expiresInMinutes: result.expiresInMinutes,
      codeHint: result.codeHint || null
    });
  } catch (error) {
    sendAuthServiceError(res, error);
  }
}

export async function handleResetPassword(req: BasicRequest, res: BasicResponse) {
  try {
    const body = (req.body || {}) as { email?: string; code?: string; newPassword?: string };
    const result = await resetPasswordWithCode({
      email: String(body.email || ''),
      code: String(body.code || ''),
      newPassword: String(body.newPassword || '')
    });
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    sendAuthServiceError(res, error);
  }
}

export async function handleGetAuthProfile(req: BasicRequest, res: BasicResponse) {
  try {
    const cookies = parseCookies(req);
    const session = await getAuthSession(cookies.novaquant_session);
    if (!session) {
      res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      return;
    }
    res.json({
      ok: true,
      user: session.user,
      state: await getAuthUserState(session.user.userId)
    });
  } catch (error) {
    sendAuthServiceError(res, error);
  }
}

export async function handlePostAuthProfile(req: BasicRequest, res: BasicResponse) {
  try {
    const cookies = parseCookies(req);
    const session = await getAuthSession(cookies.novaquant_session);
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
      disciplineLog: body.disciplineLog
    });
    res.json({ ok: true, state });
  } catch (error) {
    sendAuthServiceError(res, error);
  }
}
