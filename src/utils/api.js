let cachedApiBase = null;

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function unique(values) {
  const seen = new Set();
  const next = [];
  values.forEach((value) => {
    if (value === null || value === undefined) return;
    const normalized = String(value);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    next.push(normalized);
  });
  return next;
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function runtimeApiBases() {
  const envBases = unique([
    trimTrailingSlash(import.meta.env?.VITE_API_BASE_URL),
    trimTrailingSlash(import.meta.env?.VITE_PUBLIC_API_BASE_URL),
  ]);

  if (typeof window === 'undefined') return envBases;

  const hostname = String(window.location?.hostname || '');
  const protocol = String(window.location?.protocol || 'https:');
  if (protocol === 'file:' || isLocalHost(hostname)) {
    return unique([...envBases, 'http://127.0.0.1:8787', 'http://localhost:8787', '']);
  }

  if (hostname === 'api.novaquant.cloud') {
    return unique([...envBases, '']);
  }

  if (
    hostname === 'novaquant.cloud' ||
    hostname === 'admin.novaquant.cloud' ||
    hostname.endsWith('.novaquant.cloud')
  ) {
    return unique(['', ...envBases, 'https://api.novaquant.cloud']);
  }

  return unique([...envBases, 'https://api.novaquant.cloud']);
}

export function buildApiUrl(path, base = '') {
  const normalizedPath = String(path || '').startsWith('/')
    ? String(path)
    : `/${String(path || '')}`;
  if (!base) return normalizedPath;
  return `${trimTrailingSlash(base)}${normalizedPath}`;
}

export function resolveApiUrl(path) {
  return buildApiUrl(path, cachedApiBase ?? runtimeApiBases()[0] ?? '');
}

export async function fetchApi(path, options = {}) {
  // Fast path: use cached base without computing fallback candidates
  if (cachedApiBase !== null) {
    const url = buildApiUrl(path, cachedApiBase);
    try {
      return await fetch(url, {
        ...options,
        mode: cachedApiBase ? 'cors' : options.mode,
        credentials: options.credentials ?? 'include',
      });
    } catch {
      // Cached base failed — fall through to full candidate list
      cachedApiBase = null;
    }
  }

  const candidates = unique(runtimeApiBases());
  let lastError = null;

  for (const base of candidates) {
    const url = buildApiUrl(path, base);
    try {
      const response = await fetch(url, {
        ...options,
        mode: base ? 'cors' : options.mode,
        credentials: options.credentials ?? 'include',
      });
      cachedApiBase = base;
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error(`Unable to reach API for ${path}`);
}

export async function fetchApiJson(path, options = {}) {
  const response = await fetchApi(path, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `${resolveApiUrl(path)} failed (${response.status})`);
  }
  return response.json();
}
