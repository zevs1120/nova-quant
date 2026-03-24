import { getAdminSession } from '../auth/service.js';
import {
  buildAdminAlphaSnapshot,
  buildAdminOverviewSnapshot,
  buildAdminSignalsSnapshot,
  buildAdminSystemSnapshot,
  buildAdminTodayOpsSnapshot,
  buildAdminUsersSnapshot
} from '../admin/service.js';

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
};

function respondAdminError(res: BasicResponse, code: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error || code);
  res.status(500).json({
    ok: false,
    error: code,
    detail
  });
}

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

async function authorizeAdmin(req: BasicRequest, res: BasicResponse) {
  const cookies = parseCookies(req);
  const session = await getAdminSession(cookies.novaquant_admin_session);
  if (!session) {
    res.status(401).json({ ok: false, error: 'ADMIN_UNAUTHORIZED' });
    return null;
  }
  return session;
}

export async function handleAdminOverview(req: BasicRequest, res: BasicResponse) {
  const session = await authorizeAdmin(req, res);
  if (!session) return;
  try {
    res.json({
      ok: true,
      session: {
        user: session.user,
        roles: session.roles
      },
      data: await buildAdminOverviewSnapshot()
    });
  } catch (error) {
    respondAdminError(res, 'ADMIN_OVERVIEW_FAILED', error);
  }
}

export async function handleAdminUsers(req: BasicRequest, res: BasicResponse) {
  const session = await authorizeAdmin(req, res);
  if (!session) return;
  try {
    res.json({
      ok: true,
      session: {
        user: session.user,
        roles: session.roles
      },
      data: buildAdminUsersSnapshot()
    });
  } catch (error) {
    respondAdminError(res, 'ADMIN_USERS_FAILED', error);
  }
}

export async function handleAdminAlphas(req: BasicRequest, res: BasicResponse) {
  const session = await authorizeAdmin(req, res);
  if (!session) return;
  try {
    res.json({
      ok: true,
      session: {
        user: session.user,
        roles: session.roles
      },
      data: buildAdminAlphaSnapshot()
    });
  } catch (error) {
    respondAdminError(res, 'ADMIN_ALPHAS_FAILED', error);
  }
}

export async function handleAdminSignals(req: BasicRequest, res: BasicResponse) {
  const session = await authorizeAdmin(req, res);
  if (!session) return;
  try {
    res.json({
      ok: true,
      session: {
        user: session.user,
        roles: session.roles
      },
      data: buildAdminSignalsSnapshot()
    });
  } catch (error) {
    respondAdminError(res, 'ADMIN_SIGNALS_FAILED', error);
  }
}

export async function handleAdminSystem(req: BasicRequest, res: BasicResponse) {
  const session = await authorizeAdmin(req, res);
  if (!session) return;
  try {
    res.json({
      ok: true,
      session: {
        user: session.user,
        roles: session.roles
      },
      data: await buildAdminSystemSnapshot()
    });
  } catch (error) {
    respondAdminError(res, 'ADMIN_SYSTEM_FAILED', error);
  }
}

export async function handleAdminResearchOps(req: BasicRequest, res: BasicResponse) {
  const session = await authorizeAdmin(req, res);
  if (!session) return;
  try {
    const timeZone = typeof req.query?.tz === 'string' ? req.query.tz : typeof req.query?.timezone === 'string' ? req.query.timezone : undefined;
    const localDate = typeof req.query?.localDate === 'string' ? req.query.localDate : undefined;
    res.json({
      ok: true,
      session: {
        user: session.user,
        roles: session.roles
      },
      data: await buildAdminTodayOpsSnapshot({
        timeZone,
        localDate
      })
    });
  } catch (error) {
    respondAdminError(res, 'ADMIN_RESEARCH_OPS_FAILED', error);
  }
}
