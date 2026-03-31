import { fetchApiJson } from './api';

const HOME_VIEWS = ['STOCK', 'CRYPTO'];
const MARKETS = ['US', 'CRYPTO'];
const HOME_STORAGE_TTL_MS = 1000 * 60 * 5;
const HOME_FRESH_MS = 1000 * 60;
const UNIVERSE_STORAGE_TTL_MS = 1000 * 60 * 60 * 12;
const UNIVERSE_FRESH_MS = 1000 * 60 * 30;
const DETAIL_STORAGE_TTL_MS = 1000 * 60 * 3;
const DETAIL_FRESH_MS = 1000 * 60 * 2;

const homeCache = new Map();
const homeInflight = new Map();
const universeCache = new Map();
const universeInflight = new Map();
const detailCache = new Map();
const detailInflight = new Map();

function nowMs() {
  return Date.now();
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readStorage(key, ttlMs) {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    if (parsed.savedAt + ttlMs < nowMs()) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(key, data) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        savedAt: nowMs(),
        data,
      }),
    );
  } catch {
    // ignore quota/storage errors
  }
}

function readMemory(map, key, freshMs) {
  const hit = map.get(key);
  if (!hit) return null;
  if (hit.savedAt + freshMs < nowMs()) return null;
  return hit;
}

function readSnapshot(map, storageKey, key, ttlMs) {
  const mem = map.get(key);
  if (mem && mem.savedAt + ttlMs >= nowMs()) return mem.data;
  const stored = readStorage(storageKey, ttlMs);
  if (!stored) return null;
  map.set(key, stored);
  return stored.data;
}

function writeSnapshot(map, storageKey, key, data) {
  const payload = {
    savedAt: nowMs(),
    data,
  };
  map.set(key, payload);
  writeStorage(storageKey, data);
}

function homeStorageKey(view) {
  return `nq:browse:home:${view}`;
}

function universeStorageKey(market) {
  return `nq:browse:universe:${market}`;
}

function detailStorageKey(key) {
  return `nq:browse:detail:${key}`;
}

export function readBrowseHomeSnapshot(view) {
  return readSnapshot(homeCache, homeStorageKey(view), view, HOME_STORAGE_TTL_MS);
}

export async function warmBrowseHomeSnapshot(view, options = {}) {
  const cached = readMemory(homeCache, view, HOME_FRESH_MS);
  if (cached && !options.force) return cached.data;
  if (homeInflight.has(view)) return homeInflight.get(view);
  const request = fetchApiJson(`/api/browse/home?view=${view}`, { cache: 'no-store' })
    .then((payload) => {
      writeSnapshot(homeCache, homeStorageKey(view), view, payload || null);
      if (payload) {
        void primeBrowseDetailSelections((payload.futuresMarkets || []).slice(0, 4));
      }
      return payload || null;
    })
    .finally(() => {
      homeInflight.delete(view);
    });
  homeInflight.set(view, request);
  return request;
}

export function primeBrowseHomeBundle() {
  HOME_VIEWS.forEach((view) => {
    void warmBrowseHomeSnapshot(view);
  });
}

export function readBrowseUniverseSnapshot(market) {
  return (
    readSnapshot(universeCache, universeStorageKey(market), market, UNIVERSE_STORAGE_TTL_MS) || []
  );
}

export async function warmBrowseUniverseSnapshot(market, options = {}) {
  const cached = readMemory(universeCache, market, UNIVERSE_FRESH_MS);
  if (cached && !options.force) return cached.data;
  if (universeInflight.has(market)) return universeInflight.get(market);
  const request = fetchApiJson(`/api/assets?market=${market}`, { cache: 'no-store' })
    .then((payload) => {
      const data = Array.isArray(payload?.data) ? payload.data : [];
      writeSnapshot(universeCache, universeStorageKey(market), market, data);
      return data;
    })
    .finally(() => {
      universeInflight.delete(market);
    });
  universeInflight.set(market, request);
  return request;
}

export function primeBrowseUniverseBundle() {
  MARKETS.forEach((market) => {
    void warmBrowseUniverseSnapshot(market);
  });
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '');
}

function scoreLocalAsset(query, item) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;
  const symbol = normalizeText(item.symbol);
  const name = normalizeText(item.name);
  const venue = normalizeText(item.venue);
  if (symbol === normalizedQuery) return 120;
  if (name === normalizedQuery) return 110;
  let score = 0;
  if (symbol.startsWith(normalizedQuery)) score += 90;
  else if (symbol.includes(normalizedQuery)) score += 65;
  if (name.startsWith(normalizedQuery)) score += 75;
  else if (name.includes(normalizedQuery)) score += 50;
  if (venue.includes(normalizedQuery)) score += 15;
  return score;
}

export function searchBrowseUniverseLocal(query, options = {}) {
  const markets = options.market ? [options.market] : MARKETS;
  const limit = Math.max(1, Math.min(Number(options.limit || 18), 50));
  const pool = markets.flatMap((market) => readBrowseUniverseSnapshot(market));
  return pool
    .map((item) => ({ item, score: scoreLocalAsset(query, item) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.item.symbol).localeCompare(String(b.item.symbol));
    })
    .slice(0, limit)
    .map(({ item }) => ({
      symbol: item.symbol,
      market: item.market,
      name: item.name || item.symbol,
      hint:
        item.market === 'CRYPTO'
          ? [item.base || item.symbol, item.quote || 'USDT'].filter(Boolean).join(' / ')
          : item.venue || item.assetClass || 'US',
      latest: null,
    }));
}

function selectionKey(selection) {
  return `${String(selection?.market || '').toUpperCase()}:${String(selection?.symbol || '').toUpperCase()}`;
}

export function readBrowseDetailSnapshot(selection) {
  const key = selectionKey(selection);
  if (!key || key === ':') return null;
  return readSnapshot(detailCache, detailStorageKey(key), key, DETAIL_STORAGE_TTL_MS);
}

export async function warmBrowseDetailSnapshot(selection, options = {}) {
  const key = selectionKey(selection);
  if (!key || key === ':') return null;
  const cached = readMemory(detailCache, key, DETAIL_FRESH_MS);
  if (cached && !options.force) return cached.data;
  if (detailInflight.has(key)) return detailInflight.get(key);
  const request = Promise.all([
    fetchApiJson(
      `/api/browse/chart?market=${selection.market}&symbol=${encodeURIComponent(selection.symbol)}`,
      { cache: 'no-store' },
    ).catch(() => null),
    fetchApiJson(
      `/api/browse/overview?market=${selection.market}&symbol=${encodeURIComponent(selection.symbol)}`,
      { cache: 'no-store' },
    ).catch(() => null),
    fetchApiJson(
      `/api/browse/news?market=${selection.market}&symbol=${encodeURIComponent(selection.symbol)}&limit=6`,
      { cache: 'no-store' },
    ).catch(() => null),
  ])
    .then(([chart, overview, news]) => {
      const payload = {
        chart: chart || null,
        overview: overview || null,
        news: Array.isArray(news?.data) ? news.data : [],
      };
      writeSnapshot(detailCache, detailStorageKey(key), key, payload);
      return payload;
    })
    .finally(() => {
      detailInflight.delete(key);
    });
  detailInflight.set(key, request);
  return request;
}

export function primeBrowseDetailSelections(items = []) {
  items
    .filter((item) => item?.symbol && item?.market)
    .slice(0, 4)
    .forEach((item) => {
      void warmBrowseDetailSnapshot({ market: item.market, symbol: item.symbol });
    });
}
