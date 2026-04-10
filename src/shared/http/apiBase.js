function trim(value) {
  return String(value || '').trim();
}

export function readDefinedGlobal(key) {
  return trim(globalThis?.[key]);
}

export function trimTrailingSlash(value) {
  return trim(value).replace(/\/+$/, '');
}

export function unique(values) {
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

export function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function runtimeApiBases() {
  const envBases = unique([
    trimTrailingSlash(import.meta.env?.VITE_API_BASE_URL),
    trimTrailingSlash(import.meta.env?.VITE_PUBLIC_API_BASE_URL),
    trimTrailingSlash(readDefinedGlobal('__NOVA_PUBLIC_API_BASE_URL__')),
  ]);

  if (typeof window === 'undefined') return envBases;

  const hostname = String(window.location?.hostname || '');
  const protocol = String(window.location?.protocol || 'https:');
  if (protocol === 'file:' || isLocalHost(hostname)) {
    return unique([
      '',
      'http://127.0.0.1:8787',
      'http://localhost:8787',
      ...envBases,
      'https://api.novaquant.cloud',
    ]);
  }

  if (hostname === 'api.novaquant.cloud') {
    return unique(['', ...envBases]);
  }

  // Admin session cookies are host-only for `admin.*`; never call `api.*` with credentials from
  // the admin SPA — that always 401s and pollutes DevTools. Vercel rewrites `/api/*` on admin.
  if (hostname === 'admin.novaquant.cloud') {
    return unique(['']);
  }

  if (
    hostname === 'novaquant.cloud' ||
    hostname === 'app.novaquant.cloud' ||
    hostname.endsWith('.novaquant.cloud')
  ) {
    return unique(['', ...envBases, 'https://api.novaquant.cloud']);
  }

  return unique(['', ...envBases, 'https://api.novaquant.cloud']);
}

export function buildApiUrl(path, base = '') {
  const normalizedPath = String(path || '').startsWith('/')
    ? String(path)
    : `/${String(path || '')}`;
  if (!base) return normalizedPath;
  return `${trimTrailingSlash(base)}${normalizedPath}`;
}

export { trim };
