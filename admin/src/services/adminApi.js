import { runtimeApiBases } from '../../../src/shared/http/apiBase.js';
import { fetchAcrossApiBases } from '../../../src/shared/http/fetchAcrossApiBases.js';

const DEFAULT_TIMEOUT_MS = 10_000;

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function adminRequest(path, init = {}) {
  try {
    const response = await fetchAcrossApiBases(
      path,
      {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        },
      },
      {
        credentials: 'include',
        timeoutMs: DEFAULT_TIMEOUT_MS,
      },
    );
    const payload = await parseJson(response);
    if (!response.ok) {
      const error = payload?.error || `HTTP_${response.status}`;
      throw new Error(String(error));
    }
    return payload;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('ADMIN_REQUEST_TIMEOUT');
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export function getAdminApiBase() {
  return runtimeApiBases()[0] || '';
}

export function getAdminSession() {
  return adminRequest('/api/admin/session', {
    method: 'GET',
  });
}

export function getAdminOverview() {
  return adminRequest('/api/admin/overview', {
    method: 'GET',
  });
}

export function getAdminOverviewHeadline() {
  return adminRequest('/api/admin/overview/headline', {
    method: 'GET',
  });
}

export function getAdminUsers() {
  return adminRequest('/api/admin/users', {
    method: 'GET',
  });
}

export function getAdminAlphas() {
  return adminRequest('/api/admin/alphas', {
    method: 'GET',
  });
}

export function getAdminSignals() {
  return adminRequest('/api/admin/signals', {
    method: 'GET',
  });
}

export function getAdminSystem() {
  return adminRequest('/api/admin/system', {
    method: 'GET',
  });
}

export function getAdminResearchOps() {
  return adminRequest('/api/admin/research-ops', {
    method: 'GET',
  });
}

export function loginAdmin(args) {
  return adminRequest('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(args || {}),
  });
}

export function logoutAdmin() {
  return adminRequest('/api/admin/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
