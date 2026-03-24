const STORAGE_KEY = 'nova-quant-research-store-v1';
const MAX_RUNS = 120;
const MAX_DAYS = 520;
const MAX_ALPHA_ROWS = 18000;
const MAX_EXPERIMENTS = 220;

let memoryStore = null;

function defaultStore() {
  const nowIso = new Date().toISOString();
  return {
    type: 'ResearchStore',
    schema_version: '1.0.0',
    created_at: nowIso,
    updated_at: nowIso,
    runs: [],
    daily_snapshots: [],
    model_history: [],
    risk_history: [],
    portfolio_history: [],
    alpha_daily_stats: [],
    promotion_decisions: [],
    experiments: [],
  };
}

function hasLocalStorage() {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readStore() {
  if (!hasLocalStorage()) {
    if (!memoryStore) memoryStore = defaultStore();
    return memoryStore;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = defaultStore();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    return {
      ...defaultStore(),
      ...parsed,
    };
  } catch {
    return defaultStore();
  }
}

function writeStore(store) {
  if (!hasLocalStorage()) {
    memoryStore = store;
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage failures in restricted browser storage mode.
  }
}

function mergeByKey(existing = [], incoming = [], keyFn, limit = 500) {
  const map = new Map();
  for (const row of existing) {
    map.set(keyFn(row), row);
  }
  for (const row of incoming) {
    map.set(keyFn(row), row);
  }
  const merged = Array.from(map.values()).sort((a, b) =>
    String(a.date || a.created_at || '').localeCompare(String(b.date || b.created_at || '')),
  );
  return merged.slice(-limit);
}

function runSummary(research) {
  return {
    generated_at: research.generated_at,
    champion_version: research?.champion?.config?.version,
    lookback_days: research?.dates?.length || 0,
    snapshots: research?.daily_snapshots?.length || 0,
    challengers: research?.challengers?.length || 0,
  };
}

export function upsertResearchStoreFromLoop(research) {
  if (!research) return readStore();

  const store = readStore();
  const champion = research?.champion || {};

  const nextStore = {
    ...store,
    updated_at: new Date().toISOString(),
    runs: [...(store.runs || []), runSummary(research)].slice(-MAX_RUNS),
    daily_snapshots: mergeByKey(
      store.daily_snapshots,
      research.daily_snapshots,
      (row) => row.date,
      MAX_DAYS,
    ),
    model_history: mergeByKey(
      store.model_history,
      champion.model_history,
      (row) => row.date,
      MAX_DAYS,
    ),
    risk_history: mergeByKey(
      store.risk_history,
      champion.risk_history,
      (row) => row.date,
      MAX_DAYS,
    ),
    portfolio_history: mergeByKey(
      store.portfolio_history,
      champion.portfolio_history,
      (row) => row.date,
      MAX_DAYS,
    ),
    alpha_daily_stats: mergeByKey(
      store.alpha_daily_stats,
      champion.alpha_daily_stats,
      (row) => `${row.date}-${row.alpha_id}`,
      MAX_ALPHA_ROWS,
    ),
    promotion_decisions: mergeByKey(
      store.promotion_decisions,
      research.promotion_decisions,
      (row) => row.decision_id,
      MAX_EXPERIMENTS,
    ),
    experiments: mergeByKey(
      store.experiments,
      research.experiments,
      (row) => row.experiment_id,
      MAX_EXPERIMENTS,
    ),
  };

  writeStore(nextStore);
  return nextStore;
}

export function clearResearchStore() {
  memoryStore = defaultStore();
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures in restricted browser storage mode.
  }
}
