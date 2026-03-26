import { getDb } from '../db/database.js';
import { ensureSchema } from '../db/schema.js';
import { MarketRepository } from '../db/repository.js';
import type { AlphaEvaluationMetrics } from '../alpha_registry/index.js';
import { buildAlphaRegistrySummary } from '../alpha_registry/index.js';
import { readAlphaDiscoveryConfig } from '../alpha_discovery/index.js';

type JsonObject = Record<string, unknown>;

type CountItem = {
  label: string;
  value: number;
};

type AlphaDataSource = {
  mode: 'local-db' | 'live-upstream' | 'local-fallback';
  label: string;
  live_connected: boolean;
  timezone: string;
  local_date: string;
  upstream_base_url: string | null;
  error: string | null;
};

type AdminAlphaCandidateRow = {
  id: string;
  thesis: string;
  family: string;
  status: string;
  integration_path: string;
  acceptance_score: number | null;
  correlation_to_active: number | null;
  stability_score: number | null;
  shadow: {
    total_observations: number;
    sample_size: number;
    expectancy: number | null;
    max_drawdown: number | null;
    sharpe: number | null;
    approval_rate: number;
  };
  latest_evaluation_created_at: string | null;
  latest_acceptance_score: number | null;
  latest_rejection_reasons: string[];
  metrics: {
    net_pnl: number | null;
    sharpe: number | null;
    max_drawdown: number | null;
    stability_score: number | null;
    correlation_to_active: number | null;
  } | null;
};

type DiscoveryAcceptedCandidate = {
  alpha_id: string;
  family: string;
  acceptance_score: number | null;
  integration_path: string | null;
  discovered_at: string | null;
};

type DiscoveryRejectedCandidate = {
  alpha_id: string;
  family: string;
  rejection_reasons: string[];
  discovered_at: string | null;
};

type RecentDiscoveryRun = {
  id: string;
  updated_at: string | null;
  status: string;
  trigger_type: string;
  evaluated: number;
  accepted: number;
  rejected: number;
  watchlist: number;
  candidates_registered: number;
  evaluation_queue: number;
  accepted_candidates: DiscoveryAcceptedCandidate[];
  rejected_candidates: DiscoveryRejectedCandidate[];
};

type RecentShadowRun = {
  id: string;
  updated_at: string | null;
  status: string;
  trigger_type: string;
  candidates_processed: number;
  signals_evaluated: number;
  promoted_to_canary: number;
  promoted_to_prod: number;
  retired: number;
  held: number;
};

export type AdminAlphaSnapshot = {
  generated_at: string;
  data_source: AlphaDataSource;
  inventory: Record<string, number>;
  family_mix: CountItem[];
  integration_mix: CountItem[];
  top_candidates: ReturnType<typeof buildAlphaRegistrySummary>['top_candidates'];
  decaying_candidates: ReturnType<typeof buildAlphaRegistrySummary>['decaying_candidates'];
  correlation_map: ReturnType<typeof buildAlphaRegistrySummary>['correlation_map'];
  state_transitions: ReturnType<typeof buildAlphaRegistrySummary>['state_transitions'];
  candidates: AdminAlphaCandidateRow[];
  controls: {
    min_acceptance_score: number;
    shadow_admission_min_acceptance_score: number;
    shadow_admission_max_drawdown: number;
    shadow_promotion_min_sample_size: number;
    shadow_promotion_min_sharpe: number;
    shadow_promotion_min_expectancy: number;
    shadow_promotion_max_drawdown: number;
    shadow_promotion_min_approval_rate: number;
    retirement_min_expectancy: number;
    retirement_max_drawdown: number;
    retirement_decay_streak_limit: number;
  };
  today: {
    discovery_runs: number;
    shadow_runs: number;
    accepted_count: number;
    rejected_count: number;
    watchlist_count: number;
    candidates_registered: number;
    candidates_processed: number;
    signals_evaluated: number;
    promoted_to_canary: number;
    promoted_to_prod: number;
    retired_count: number;
    held_count: number;
    latest_discovery: RecentDiscoveryRun | null;
    latest_shadow: RecentShadowRun | null;
    recent_acceptances: DiscoveryAcceptedCandidate[];
    recent_rejections: DiscoveryRejectedCandidate[];
    recent_discovery_runs: RecentDiscoveryRun[];
    recent_shadow_runs: RecentShadowRun[];
  };
};

function getRepo() {
  const db = getDb();
  ensureSchema(db);
  return new MarketRepository(db);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function parseJsonObject(value: string | null | undefined): JsonObject {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as JsonObject;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function toIso(ms: number | null | undefined) {
  return Number.isFinite(ms) ? new Date(Number(ms)).toISOString() : null;
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function countBy<T>(rows: T[], keyFn: (row: T) => string | null | undefined) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = String(keyFn(row) || '').trim();
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function getTimeZoneFormatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const formatted = getTimeZoneFormatter(timeZone)
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});
  return {
    year: Number(formatted.year || 0),
    month: Number(formatted.month || 1),
    day: Number(formatted.day || 1),
    hour: Number(formatted.hour || 0),
    minute: Number(formatted.minute || 0),
    second: Number(formatted.second || 0),
  };
}

function getTimeZoneDateKey(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const actualUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  );
  return zonedAsUtc - actualUtc;
}

function getStartOfDayUtcMs(timeZone: string, localDate?: string) {
  const normalizedDate =
    typeof localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(localDate)
      ? localDate
      : getTimeZoneDateKey(new Date(), timeZone);
  const [yearText, monthText, dayText] = normalizedDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  let utcMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let index = 0; index < 3; index += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
    const nextUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs;
    if (nextUtcMs === utcMs) break;
    utcMs = nextUtcMs;
  }
  return {
    localDate: normalizedDate,
    sinceMs: utcMs,
  };
}

function resolveReportTimeZone(explicitTimeZone?: string) {
  return (
    String(explicitTimeZone || process.env.NOVA_ADMIN_REPORT_TIMEZONE || 'Asia/Shanghai').trim() ||
    'Asia/Shanghai'
  );
}

function resolveLiveApiBase() {
  const candidates = [
    process.env.NOVA_ADMIN_LIVE_API_BASE,
    process.env.NOVA_LIVE_API_BASE,
    process.env.NOVA_CONTROL_PLANE_API_BASE,
  ];
  return (
    candidates
      .map((value) =>
        String(value || '')
          .trim()
          .replace(/\/+$/, ''),
      )
      .find(Boolean) || ''
  );
}

function resolveLiveApiToken() {
  return String(
    process.env.NOVA_ADMIN_LIVE_API_TOKEN || process.env.NOVA_CONTROL_PLANE_API_TOKEN || '',
  ).trim();
}

function mapLatestAlphaEvaluations(repo: MarketRepository, candidateIds: string[]) {
  return new Map(
    candidateIds.map((candidateId) => {
      const evaluation = repo.getLatestAlphaEvaluation(candidateId);
      const metrics = evaluation
        ? parseJson<AlphaEvaluationMetrics & JsonObject>(
            evaluation.metrics_json,
            {} as AlphaEvaluationMetrics & JsonObject,
          )
        : null;
      const rejectionReasons = evaluation
        ? parseJson<string[]>(evaluation.rejection_reasons_json, [])
        : [];
      return [
        candidateId,
        {
          evaluation,
          metrics,
          rejection_reasons: rejectionReasons,
        },
      ] as const;
    }),
  );
}

function parseRecentDiscoveryRun(
  row: ReturnType<MarketRepository['listWorkflowRuns']>[number],
): RecentDiscoveryRun {
  const output = parseJsonObject(row.output_json);
  const evaluationSummary =
    output.evaluation_summary && typeof output.evaluation_summary === 'object'
      ? (output.evaluation_summary as JsonObject)
      : null;
  const generationSummary =
    output.generation_summary && typeof output.generation_summary === 'object'
      ? (output.generation_summary as JsonObject)
      : null;
  const updatedAt = toIso(row.updated_at_ms);
  const acceptedCandidates = Array.isArray(output.accepted_candidates)
    ? output.accepted_candidates.map((item) => {
        const entry = item as JsonObject;
        return {
          alpha_id: String(entry.alpha_id || ''),
          family: String(entry.family || 'unknown'),
          acceptance_score: Number.isFinite(Number(entry.acceptance_score))
            ? round(Number(entry.acceptance_score), 4)
            : null,
          integration_path: entry.integration_path ? String(entry.integration_path) : null,
          discovered_at: updatedAt,
        };
      })
    : [];
  const rejectedCandidates = Array.isArray(output.rejected_candidates)
    ? output.rejected_candidates.map((item) => {
        const entry = item as JsonObject;
        return {
          alpha_id: String(entry.alpha_id || ''),
          family: String(entry.family || 'unknown'),
          rejection_reasons: Array.isArray(entry.rejection_reasons)
            ? entry.rejection_reasons.map((reason) => String(reason))
            : [],
          discovered_at: updatedAt,
        };
      })
    : [];
  return {
    id: row.id,
    updated_at: updatedAt,
    status: row.status,
    trigger_type: row.trigger_type,
    evaluated: Number(evaluationSummary?.evaluated || 0),
    accepted: Number(evaluationSummary?.accepted || 0),
    rejected: Number(evaluationSummary?.rejected || 0),
    watchlist: Number(evaluationSummary?.watchlist || 0),
    candidates_registered: Number(generationSummary?.candidates_registered || 0),
    evaluation_queue: Number(generationSummary?.evaluation_queue || 0),
    accepted_candidates: acceptedCandidates.filter((item) => item.alpha_id),
    rejected_candidates: rejectedCandidates.filter((item) => item.alpha_id),
  };
}

function parseRecentShadowRun(
  row: ReturnType<MarketRepository['listWorkflowRuns']>[number],
): RecentShadowRun {
  const output = parseJsonObject(row.output_json);
  const shadow =
    output.shadow && typeof output.shadow === 'object' ? (output.shadow as JsonObject) : null;
  const promotion =
    output.promotion && typeof output.promotion === 'object' ? (output.promotion as JsonObject) : null;
  return {
    id: row.id,
    updated_at: toIso(row.updated_at_ms),
    status: row.status,
    trigger_type: row.trigger_type,
    candidates_processed: Number(shadow?.candidates_processed || 0),
    signals_evaluated: Number(shadow?.signals_evaluated || 0),
    promoted_to_canary: Array.isArray(promotion?.promoted_to_canary)
      ? (promotion?.promoted_to_canary as unknown[]).length
      : 0,
    promoted_to_prod: Array.isArray(promotion?.promoted_to_prod)
      ? (promotion?.promoted_to_prod as unknown[]).length
      : 0,
    retired: Array.isArray(promotion?.retired) ? (promotion?.retired as unknown[]).length : 0,
    held: Array.isArray(promotion?.held) ? (promotion?.held as unknown[]).length : 0,
  };
}

function dedupeAccepted(items: DiscoveryAcceptedCandidate[]) {
  const map = new Map<string, DiscoveryAcceptedCandidate>();
  for (const item of items) {
    if (!item.alpha_id || map.has(item.alpha_id)) continue;
    map.set(item.alpha_id, item);
  }
  return Array.from(map.values());
}

function dedupeRejected(items: DiscoveryRejectedCandidate[]) {
  const map = new Map<string, DiscoveryRejectedCandidate>();
  for (const item of items) {
    if (!item.alpha_id || map.has(item.alpha_id)) continue;
    map.set(item.alpha_id, item);
  }
  return Array.from(map.values());
}

function buildLocalSnapshot(args?: { timeZone?: string; localDate?: string }): AdminAlphaSnapshot {
  const repo = getRepo();
  const timeZone = resolveReportTimeZone(args?.timeZone);
  const { localDate, sinceMs } = getStartOfDayUtcMs(timeZone, args?.localDate);
  const summary = buildAlphaRegistrySummary(repo);
  const candidateIds = summary.records.map((row) => row.id);
  const evaluationMap = mapLatestAlphaEvaluations(repo, candidateIds);
  const familyMix = countBy(summary.records, (row) => row.family);
  const integrationMix = countBy(summary.records, (row) => row.integration_path);
  const discoveryConfig = readAlphaDiscoveryConfig();

  const candidates = summary.records.slice(0, 60).map((row) => {
    const latest = evaluationMap.get(row.id);
    return {
      ...row,
      shadow: {
        total_observations: Number(row.shadow.total_observations || 0),
        sample_size: Number(row.shadow.realized_sample_size || 0),
        expectancy: row.shadow.expectancy,
        max_drawdown: row.shadow.max_drawdown,
        sharpe: row.shadow.sharpe,
        approval_rate: 0,
      },
      latest_evaluation_created_at: latest?.evaluation
        ? toIso(latest.evaluation.created_at_ms)
        : null,
      latest_acceptance_score: latest?.evaluation?.acceptance_score ?? row.acceptance_score ?? null,
      latest_rejection_reasons: latest?.rejection_reasons || [],
      metrics: latest?.metrics
        ? {
            net_pnl: latest.metrics.net_pnl ?? null,
            sharpe: latest.metrics.sharpe ?? null,
            max_drawdown: latest.metrics.max_drawdown ?? null,
            stability_score: latest.metrics.stability_score ?? null,
            correlation_to_active: latest.metrics.correlation_to_active ?? null,
          }
        : null,
    };
  });

  const recentAlphaWorkflows = repo
    .listWorkflowRuns({ limit: 240 })
    .filter(
      (row) =>
        Number(row.updated_at_ms || 0) >= sinceMs &&
        (row.workflow_key === 'alpha_discovery_loop' || row.workflow_key === 'alpha_shadow_runner'),
    );

  const discoveryRuns = recentAlphaWorkflows
    .filter((row) => row.workflow_key === 'alpha_discovery_loop')
    .map(parseRecentDiscoveryRun);
  const shadowRuns = recentAlphaWorkflows
    .filter((row) => row.workflow_key === 'alpha_shadow_runner')
    .map(parseRecentShadowRun);
  const acceptedToday = dedupeAccepted(
    discoveryRuns.flatMap((run) => run.accepted_candidates).sort((a, b) => {
      const aMs = Date.parse(String(a.discovered_at || ''));
      const bMs = Date.parse(String(b.discovered_at || ''));
      return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
    }),
  );
  const rejectedToday = dedupeRejected(
    discoveryRuns.flatMap((run) => run.rejected_candidates).sort((a, b) => {
      const aMs = Date.parse(String(a.discovered_at || ''));
      const bMs = Date.parse(String(b.discovered_at || ''));
      return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
    }),
  );

  return {
    generated_at: new Date().toISOString(),
    data_source: {
      mode: 'local-db',
      label: 'Local DB',
      live_connected: false,
      timezone: timeZone,
      local_date: localDate,
      upstream_base_url: null,
      error: null,
    },
    inventory: summary.counts,
    family_mix: familyMix,
    integration_mix: integrationMix,
    top_candidates: summary.top_candidates,
    decaying_candidates: summary.decaying_candidates,
    correlation_map: summary.correlation_map,
    state_transitions: summary.state_transitions,
    candidates,
    controls: {
      min_acceptance_score: discoveryConfig.minAcceptanceScore,
      shadow_admission_min_acceptance_score:
        discoveryConfig.shadowAdmissionThresholds.minAcceptanceScore,
      shadow_admission_max_drawdown: discoveryConfig.shadowAdmissionThresholds.maxDrawdown,
      shadow_promotion_min_sample_size: discoveryConfig.shadowPromotionThresholds.minSampleSize,
      shadow_promotion_min_sharpe: discoveryConfig.shadowPromotionThresholds.minSharpe,
      shadow_promotion_min_expectancy: discoveryConfig.shadowPromotionThresholds.minExpectancy,
      shadow_promotion_max_drawdown: discoveryConfig.shadowPromotionThresholds.maxDrawdown,
      shadow_promotion_min_approval_rate:
        discoveryConfig.shadowPromotionThresholds.minApprovalRate,
      retirement_min_expectancy: discoveryConfig.retirementThresholds.minExpectancy,
      retirement_max_drawdown: discoveryConfig.retirementThresholds.maxDrawdown,
      retirement_decay_streak_limit: discoveryConfig.retirementThresholds.decayStreakLimit,
    },
    today: {
      discovery_runs: discoveryRuns.length,
      shadow_runs: shadowRuns.length,
      accepted_count: discoveryRuns.reduce((sum, row) => sum + row.accepted, 0),
      rejected_count: discoveryRuns.reduce((sum, row) => sum + row.rejected, 0),
      watchlist_count: discoveryRuns.reduce((sum, row) => sum + row.watchlist, 0),
      candidates_registered: discoveryRuns.reduce((sum, row) => sum + row.candidates_registered, 0),
      candidates_processed: shadowRuns.reduce((sum, row) => sum + row.candidates_processed, 0),
      signals_evaluated: shadowRuns.reduce((sum, row) => sum + row.signals_evaluated, 0),
      promoted_to_canary: shadowRuns.reduce((sum, row) => sum + row.promoted_to_canary, 0),
      promoted_to_prod: shadowRuns.reduce((sum, row) => sum + row.promoted_to_prod, 0),
      retired_count: shadowRuns.reduce((sum, row) => sum + row.retired, 0),
      held_count: shadowRuns.reduce((sum, row) => sum + row.held, 0),
      latest_discovery: discoveryRuns[0] || null,
      latest_shadow: shadowRuns[0] || null,
      recent_acceptances: acceptedToday.slice(0, 10),
      recent_rejections: rejectedToday.slice(0, 10),
      recent_discovery_runs: discoveryRuns.slice(0, 8),
      recent_shadow_runs: shadowRuns.slice(0, 8),
    },
  };
}

async function fetchUpstreamSnapshot(args?: { timeZone?: string; localDate?: string }) {
  const baseUrl = resolveLiveApiBase();
  if (!baseUrl) return null;
  const timeZone = resolveReportTimeZone(args?.timeZone);
  const localDate =
    typeof args?.localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.localDate)
      ? args.localDate
      : '';
  const url = new URL('/api/control-plane/alphas', baseUrl);
  url.searchParams.set('tz', timeZone);
  if (localDate) url.searchParams.set('localDate', localDate);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const headers: Record<string, string> = {};
    const token = resolveLiveApiToken();
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`UPSTREAM_HTTP_${response.status}`);
    }
    const payload = (await response.json()) as AdminAlphaSnapshot;
    return {
      baseUrl,
      payload,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function buildLocalAdminAlphaSnapshot(args?: { timeZone?: string; localDate?: string }) {
  return buildLocalSnapshot(args);
}

export async function buildAdminAlphaSnapshot(args?: {
  timeZone?: string;
  localDate?: string;
}) {
  const upstreamBaseUrl = resolveLiveApiBase();
  if (!upstreamBaseUrl) {
    return buildLocalSnapshot(args);
  }

  try {
    const result = await fetchUpstreamSnapshot(args);
    if (!result?.payload) {
      const localSnapshot = buildLocalSnapshot(args);
      return {
        ...localSnapshot,
        data_source: {
          ...localSnapshot.data_source,
          mode: 'local-fallback',
          label: 'Local fallback',
          upstream_base_url: upstreamBaseUrl,
          error: 'UPSTREAM_EMPTY',
        },
      };
    }
    return {
      ...result.payload,
      data_source: {
        ...result.payload.data_source,
        mode: 'live-upstream',
        label: 'EC2 live upstream',
        live_connected: true,
        upstream_base_url: result.baseUrl,
        error: null,
      },
    };
  } catch (error) {
    const localSnapshot = buildLocalSnapshot(args);
    return {
      ...localSnapshot,
      data_source: {
        ...localSnapshot.data_source,
        mode: 'local-fallback',
        label: 'Local fallback',
        upstream_base_url: upstreamBaseUrl,
        error: error instanceof Error ? error.message : String(error || 'UPSTREAM_FETCH_FAILED'),
      },
    };
  }
}
