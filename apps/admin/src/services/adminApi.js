function detectDefaultApiBase() {
  if (typeof window === 'undefined') return 'https://novaquant.cloud';
  const envBase = String(import.meta.env.VITE_ADMIN_API_BASE || '').trim();
  if (envBase) return envBase.replace(/\/+$/, '');
  const { protocol, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://127.0.0.1:8787';
  }
  if (hostname.startsWith('admin.')) {
    return `${protocol}//${hostname.replace(/^admin\./, '')}`;
  }
  return window.location.origin;
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
      ...(init.headers || {})
    }
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
    method: 'GET'
  });
}

export function loginAdmin(args) {
  return adminRequest('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(args || {})
  });
}

export function logoutAdmin() {
  return adminRequest('/api/admin/logout', {
    method: 'POST',
    body: JSON.stringify({})
  });
}
