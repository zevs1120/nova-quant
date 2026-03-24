import { DATA_STATUS, FREQUENCY } from '../types/multiAssetSchema.js';
import { transparencyFromSourceMode } from '../research/governance/taxonomy.js';

export function sourceMeta({
  source,
  source_type = 'adapter',
  fetched_at,
  frequency = FREQUENCY.DAILY,
  data_status = DATA_STATUS.RAW,
  use_notes,
  license_notes,
  mode,
  docs_url,
}) {
  const transparency = transparencyFromSourceMode(mode, true);
  return {
    source,
    source_type,
    fetched_at: fetched_at || new Date().toISOString(),
    frequency,
    data_status,
    data_transparency: transparency,
    use_notes,
    license_notes,
    mode,
    docs_url,
  };
}

export function sourceHealthRow({
  source,
  asset_class,
  mode,
  supports_live,
  last_fetched_at,
  latest_data_time,
  stale_threshold_hours,
  failures = 0,
  notes,
}) {
  const latest = latest_data_time ? new Date(latest_data_time).getTime() : 0;
  const now = Date.now();
  const ageHours = latest ? (now - latest) / 36e5 : Number.POSITIVE_INFINITY;
  const stale = Number.isFinite(ageHours) ? ageHours > stale_threshold_hours : true;
  const transparency = transparencyFromSourceMode(mode, supports_live);

  return {
    source,
    asset_class,
    mode,
    data_transparency: transparency,
    supports_live,
    last_fetched_at,
    latest_data_time,
    age_hours: Number.isFinite(ageHours) ? Number(ageHours.toFixed(2)) : null,
    stale,
    failures,
    status: failures > 0 ? 'degraded' : stale ? 'stale' : 'healthy',
    notes,
  };
}
