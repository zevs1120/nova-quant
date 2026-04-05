import { trim, trimTrailingSlash, isLocalHost } from '../http/apiBase.js';

function readGlobal(key) {
  return trim(globalThis?.[key]);
}

function readEnv(key) {
  return trim(import.meta.env?.[key]);
}

function normalizeUrl(value, fallback) {
  const normalized = trimTrailingSlash(value);
  return normalized || fallback;
}

function buildPublicUrl(baseUrl, path = '') {
  const base = trimTrailingSlash(baseUrl);
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) return base;
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  return `${base}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
}

export function resolveSiteUrl() {
  return normalizeUrl(
    readEnv('VITE_PUBLIC_SITE_URL') || readGlobal('__NOVA_PUBLIC_SITE_URL__'),
    'https://novaquant.cloud',
  );
}

export function resolveAppUrl() {
  return normalizeUrl(
    readEnv('VITE_PUBLIC_APP_URL') || readGlobal('__NOVA_PUBLIC_APP_URL__'),
    'https://app.novaquant.cloud',
  );
}

export function resolveAdminUrl() {
  return normalizeUrl(
    readEnv('VITE_PUBLIC_ADMIN_URL') || readGlobal('__NOVA_PUBLIC_ADMIN_URL__'),
    'https://admin.novaquant.cloud',
  );
}

export function buildAppUrl(path = '') {
  return buildPublicUrl(resolveAppUrl(), path);
}

export function resolveBillingReturnUrl() {
  if (typeof window === 'undefined') return resolveAppUrl();
  const hostname = String(window.location?.hostname || '');
  const pathname = String(window.location?.pathname || '/');
  if (isLocalHost(hostname)) {
    return `${window.location.origin}${pathname}`;
  }
  return buildAppUrl(pathname);
}

export function shouldRedirectToSiteAfterLogout() {
  if (typeof window === 'undefined') return false;
  const hostname = String(window.location?.hostname || '');
  return hostname === 'app.novaquant.cloud';
}
