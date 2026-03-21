import { getAdminSession } from '../auth/service.js';
import {
  buildAdminAlphaSnapshot,
  buildAdminOverviewSnapshot,
  buildAdminSignalsSnapshot,
  buildAdminSystemSnapshot,
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
  res.json({
    ok: true,
    session: {
      user: session.user,
      roles: session.roles
    },
    data: buildAdminOverviewSnapshot()
  });
}

export async function handleAdminUsers(req: BasicRequest, res: BasicResponse) {
  const session = await authorizeAdmin(req, res);
  if (!session) return;
  res.json({
    ok: true,
    session: {
      user: session.user,
      roles: session.roles
    },
    data: buildAdminUsersSnapshot()
  });
}

export async function handleAdminAlphas(req: BasicRequest, res: BasicResponse) {
  const session = await authorizeAdmin(req, res);
  if (!session) return;
  res.json({
    ok: true,
    session: {
      user: session.user,
      roles: session.roles
    },
    data: buildAdminAlphaSnapshot()
  });
}

export async function handleAdminSignals(req: BasicRequest, res: BasicResponse) {
  const session = await authorizeAdmin(req, res);
  if (!session) return;
  res.json({
    ok: true,
    session: {
      user: session.user,
      roles: session.roles
    },
    data: buildAdminSignalsSnapshot()
  });
}

export async function handleAdminSystem(req: BasicRequest, res: BasicResponse) {
  const session = await authorizeAdmin(req, res);
  if (!session) return;
  res.json({
    ok: true,
    session: {
      user: session.user,
      roles: session.roles
    },
    data: buildAdminSystemSnapshot()
  });
}
