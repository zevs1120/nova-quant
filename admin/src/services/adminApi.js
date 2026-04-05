import { buildApiUrl, runtimeApiBases, unique } from '../../../src/shared/http/apiBase.js';
import { shouldRetryWithNextBase } from '../../../src/shared/http/apiRetry.js';

const DEFAULT_TIMEOUT_MS = 10_000;

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function adminRequest(path, init = {}) {
  const candidates = unique(runtimeApiBases());
  let lastError = null;
  let lastPayload = null;
  let lastStatus = 500;

  for (const base of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(buildApiUrl(path, base), {
        ...init,
        credentials: 'include',
        mode: base ? 'cors' : init.mode,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        },
      });
      clearTimeout(timer);
      if (shouldRetryWithNextBase(path, response)) {
        continue;
      }
      const payload = await parseJson(response);
      if (!response.ok) {
        const error = payload?.error || `HTTP_${response.status}`;
        throw new Error(String(error));
      }
      return payload;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new Error('ADMIN_REQUEST_TIMEOUT');
        continue;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      lastPayload = null;
      lastStatus = 500;
    }
  }

  if (lastPayload?.error) {
    throw new Error(String(lastPayload.error || `HTTP_${lastStatus}`));
  }
  throw lastError instanceof Error ? lastError : new Error('ADMIN_REQUEST_FAILED');
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
