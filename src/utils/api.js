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

function runtimeApiBases() {
  const envBases = unique([
    trimTrailingSlash(import.meta.env?.VITE_API_BASE_URL),
    trimTrailingSlash(import.meta.env?.VITE_PUBLIC_API_BASE_URL)
  ]);

  if (typeof window === 'undefined') return envBases;

  const localBases = [];
  const hostname = String(window.location?.hostname || '');
  const protocol = String(window.location?.protocol || '');
  if (protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1') {
    localBases.push('http://127.0.0.1:8787', 'http://localhost:8787');
  }

  return unique([...envBases, ...localBases]);
}

export function buildApiUrl(path, base = '') {
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${String(path || '')}`;
  if (!base) return normalizedPath;
  return `${trimTrailingSlash(base)}${normalizedPath}`;
}

export async function fetchApiJson(path, options = {}) {
  const candidates = unique([cachedApiBase, '', ...runtimeApiBases()]);
  let lastError = null;

  for (const base of candidates) {
    const isCrossOrigin = Boolean(base);
    const url = buildApiUrl(path, base);
    try {
      const response = await fetch(url, {
        ...options,
        mode: isCrossOrigin ? 'cors' : options.mode,
        credentials: options.credentials ?? (isCrossOrigin ? 'omit' : 'same-origin')
      });
      if (!response.ok) {
        throw new Error(`${url} failed (${response.status})`);
      }
      cachedApiBase = base;
      return response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error(`Unable to reach API for ${path}`);
}
