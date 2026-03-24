export const ENTITY_STAGE = Object.freeze({
  DRAFT: 'draft',
  TESTING: 'testing',
  PAPER: 'paper',
  CANDIDATE: 'candidate',
  CHAMPION: 'champion',
  CHALLENGER: 'challenger',
  RETIRED: 'retired',
});

export const STAGE_ORDER = Object.freeze([
  ENTITY_STAGE.DRAFT,
  ENTITY_STAGE.TESTING,
  ENTITY_STAGE.PAPER,
  ENTITY_STAGE.CANDIDATE,
  ENTITY_STAGE.CHAMPION,
  ENTITY_STAGE.RETIRED,
]);

export const DATA_TRANSPARENCY = Object.freeze({
  SAMPLE: 'sample',
  SIMULATED: 'simulated',
  REAL_PATH_READY: 'real_path_ready',
  REAL_LIVE: 'real_live',
  LIVE_NOT_AVAILABLE: 'live_not_available',
});

export const EXECUTION_MODE = Object.freeze({
  BACKTEST: 'backtest',
  PAPER: 'paper',
  LIVE: 'live',
});

export const MARKET_TIME_MODE = Object.freeze({
  US_TRADING_DAY: 'us_trading_day',
  CRYPTO_24_7: 'crypto_24_7',
  MIXED_MULTI_ASSET: 'mixed_multi_asset',
});

const LEGACY_STAGE_MAP = Object.freeze({
  promoted: ENTITY_STAGE.CHAMPION,
  champion: ENTITY_STAGE.CHAMPION,
  candidate: ENTITY_STAGE.CANDIDATE,
  paper: ENTITY_STAGE.PAPER,
  testing: ENTITY_STAGE.TESTING,
  draft: ENTITY_STAGE.DRAFT,
  challenger: ENTITY_STAGE.CHALLENGER,
  retired: ENTITY_STAGE.RETIRED,
});

const LEGACY_TRANSPARENCY_MAP = Object.freeze({
  sample: DATA_TRANSPARENCY.SAMPLE,
  simulated: DATA_TRANSPARENCY.SIMULATED,
  real: DATA_TRANSPARENCY.REAL_LIVE,
  live: DATA_TRANSPARENCY.REAL_LIVE,
  live_not_available: DATA_TRANSPARENCY.LIVE_NOT_AVAILABLE,
  real_path_ready_fallback_sample: DATA_TRANSPARENCY.REAL_PATH_READY,
  sample_with_live_path_ready: DATA_TRANSPARENCY.REAL_PATH_READY,
  live_path_available: DATA_TRANSPARENCY.REAL_PATH_READY,
  sample_fallback: DATA_TRANSPARENCY.SAMPLE,
});

function safeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeStage(stage, fallback = ENTITY_STAGE.DRAFT) {
  const key = safeSlug(stage).replaceAll('-', '_');
  if (!key) return fallback;
  return LEGACY_STAGE_MAP[key] || fallback;
}

export function normalizeTransparency(label, fallback = DATA_TRANSPARENCY.SAMPLE) {
  const key = safeSlug(label).replaceAll('-', '_');
  if (!key) return fallback;
  return LEGACY_TRANSPARENCY_MAP[key] || fallback;
}

export function stageRank(stage) {
  const normalized = normalizeStage(stage);
  const idx = STAGE_ORDER.indexOf(normalized);
  return idx >= 0 ? idx : 0;
}

export function canPromoteStage(fromStage, toStage) {
  return stageRank(toStage) > stageRank(fromStage);
}

export function registryId(prefix, ...parts) {
  const body = parts
    .map((item) => safeSlug(item))
    .filter(Boolean)
    .join('__');
  return `${String(prefix || 'reg').toLowerCase()}::${body || 'default'}`;
}

export function assetTimeMode(assetClass) {
  const normalized = String(assetClass || '').toUpperCase();
  return normalized === 'CRYPTO' ? MARKET_TIME_MODE.CRYPTO_24_7 : MARKET_TIME_MODE.US_TRADING_DAY;
}

export function transparencyFromSourceMode(mode, supportsLive = true) {
  const key = safeSlug(mode).replaceAll('-', '_');
  if (LEGACY_TRANSPARENCY_MAP[key]) return LEGACY_TRANSPARENCY_MAP[key];
  return supportsLive ? DATA_TRANSPARENCY.REAL_PATH_READY : DATA_TRANSPARENCY.LIVE_NOT_AVAILABLE;
}
