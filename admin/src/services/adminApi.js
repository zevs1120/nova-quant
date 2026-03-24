function detectDefaultApiBase() {
  if (typeof window === 'undefined') return '';
  const envBase = String(
    import.meta.env.VITE_ADMIN_API_BASE || import.meta.env.VITE_API_BASE_URL || '',
  ).trim();
  const { protocol, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return envBase ? envBase.replace(/\/+$/, '') : 'http://127.0.0.1:8787';
  }
  if (hostname === 'api.novaquant.cloud') {
    return '';
  }
  if (
    hostname === 'admin.novaquant.cloud' ||
    hostname === 'novaquant.cloud' ||
    hostname.endsWith('.novaquant.cloud')
  ) {
    return '';
  }
  if (envBase) return envBase.replace(/\/+$/, '');
  return `${protocol}//api.novaquant.cloud`;
}

const API_BASE = detectDefaultApiBase();

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function adminRequest(path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    const error = payload?.error || `HTTP_${response.status}`;
    throw new Error(String(error));
  }
  return payload;
}

export function getAdminApiBase() {
  return API_BASE;
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
