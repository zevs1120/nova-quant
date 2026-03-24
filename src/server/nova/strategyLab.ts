import { randomUUID } from 'node:crypto';
import type { MarketRepository } from '../db/repository.js';
import { createTraceId, recordAuditEvent } from '../observability/spine.js';
import { runLoggedNovaTextTask } from './service.js';
import { buildHypothesisRegistry } from '../../research/discovery/hypothesisRegistry.js';
import { buildTemplateRegistry } from '../../research/discovery/templateRegistry.js';
import { buildCandidateGenerator } from '../../research/discovery/candidateGenerator.js';
import { buildCandidateValidationPipeline } from '../../research/discovery/candidateValidation.js';
import { buildCandidateScoring } from '../../research/discovery/candidateScoring.js';
import { loadDiscoverySeedRuntime } from '../../research/discovery/seedRuntime.js';
import { formatStructuredAssistantReply } from '../../utils/assistantLanguage.js';

type JsonObject = Record<string, unknown>;
type StrategyCandidate = Record<string, unknown>;
type StrategyScoreRow = Record<string, unknown>;
type StrategySelectionRow = {
  candidate_id: unknown;
  strategy_id: unknown;
  recommendation: string;
  next_stage: string | null;
  candidate_quality_score: unknown;
  candidate_quality_score_pct: unknown;
  rejection_reasons: unknown[];
  strategy_family: unknown;
  template_name: unknown;
  parameter_set: unknown;
  supporting_features: unknown;
  supported_asset_classes: unknown;
  compatible_regimes: unknown;
  quality_prior_score: unknown;
  generation_mode: unknown;
  candidate_source_metadata: unknown;
  traceability: unknown;
};

type StrategyLabArgs = {
  repo: MarketRepository;
  userId?: string | null;
  prompt: string;
  locale?: string | null;
  market?: 'US' | 'CRYPTO' | null;
  riskProfile?: string | null;
  maxCandidates?: number;
};

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 6): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function firstJsonObject(text: string): JsonObject | null {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as JsonObject;
  } catch {
    return null;
  }
}

function parseIntent(prompt: string, market?: 'US' | 'CRYPTO' | null, riskProfile?: string | null) {
  const text = String(prompt || '').toLowerCase();
  const inferredMarket =
    market ||
    (text.includes('crypto') || text.includes('btc') || text.includes('eth') ? 'CRYPTO' : 'US');

  const regimes = [
    text.includes('trend') ? 'trend' : null,
    text.includes('range') || text.includes('mean reversion') ? 'range' : null,
    text.includes('high vol') || text.includes('volatile') ? 'high_volatility' : null,
    text.includes('risk off') || text.includes('defensive') ? 'risk_off' : null,
  ].filter(Boolean);

  const families = [
    text.includes('momentum') || text.includes('breakout') ? 'Momentum / Trend Following' : null,
    text.includes('mean reversion') || text.includes('revert') ? 'Mean Reversion' : null,
    text.includes('relative strength') || text.includes('rotation')
      ? 'Relative Strength / Cross-Sectional'
      : null,
    text.includes('funding') || text.includes('basis') ? 'Crypto-Native Families' : null,
  ].filter(Boolean);

  const horizon =
    text.includes('scalp') || text.includes('intraday')
      ? 'short'
      : text.includes('swing') || text.includes('multi-day')
        ? 'medium'
        : text.includes('longer')
          ? 'long'
          : 'medium';

  const profile =
    riskProfile ||
    (text.includes('conservative') || text.includes('low risk')
      ? 'conservative'
      : text.includes('aggressive') || text.includes('high risk')
        ? 'aggressive'
        : 'balanced');

  return {
    market: inferredMarket,
    regimes: regimes.length
      ? regimes
      : inferredMarket === 'CRYPTO'
        ? ['trend', 'high_volatility']
        : ['trend', 'range'],
    families,
    trade_horizon: horizon,
    risk_profile: profile,
  };
}

function buildCandidateSummary(candidates: StrategyCandidate[], scored: StrategyScoreRow[]) {
  const scoreById = new Map(scored.map((row) => [String(row.candidate_id || ''), row]));
  return candidates.slice(0, 12).map((candidate) => {
    const scoreRow = scoreById.get(String(candidate.candidate_id || '')) || {};
    return {
      candidate_id: candidate.candidate_id,
      strategy_id: candidate.strategy_id,
      template_id: candidate.template_id,
      template_name: candidate.template_name,
      strategy_family: candidate.strategy_family,
      expected_holding_horizon: candidate.expected_holding_horizon,
      supported_asset_classes: candidate.supported_asset_classes,
      compatible_regimes: candidate.compatible_regimes,
      supporting_features: candidate.supporting_features,
      parameter_set: candidate.parameter_set,
      quality_prior_score: candidate.quality_prior_score,
      validation_status: scoreRow.final_status || 'unscored',
      candidate_quality_score: scoreRow.candidate_quality_score ?? null,
      recommendation: scoreRow.recommendation || 'REJECT',
      rejection_reasons: scoreRow.rejection_reasons || [],
    };
  });
}

function buildStrategyLabPrompts(args: {
  prompt: string;
  locale?: string | null;
  constraints: ReturnType<typeof parseIntent>;
  candidateSummary: ReturnType<typeof buildCandidateSummary>;
}) {
  const systemPrompt = [
    'You are Nova Strategy Lab.',
    'Your job is to choose the most promising governed strategy candidates from the supplied discovery pool.',
    'You may only choose candidate_ids that already exist in the pool.',
    'Prefer robust, explainable, risk-aware strategies over flashy ones.',
    'If the pool is weak, choose fewer candidates rather than forcing ideas.',
    'Return strict JSON with keys:',
    'selected_candidate_ids: string[]',
    'parameter_overrides: [{"candidate_id":"...","parameter_overrides":{"name":value}}]',
    'portfolio_fit: string',
    'risk_note: string',
    'why: string[]',
  ].join('\n');

  const userPrompt = JSON.stringify({
    locale: args.locale || 'en',
    operator_request: args.prompt,
    constraints: args.constraints,
    candidate_pool: args.candidateSummary,
  });

  return { systemPrompt, userPrompt };
}

function applyOverrides(
  candidate: StrategyCandidate,
  override: Record<string, unknown> | undefined,
) {
  const parameterSet = asObject(candidate.parameter_set);
  const ranges = asObject(candidate.parameter_space_reference);
  if (!override) return { ...candidate, parameter_set: parameterSet };

  const nextParams: Record<string, unknown> = { ...parameterSet };
  for (const [key, rawValue] of Object.entries(override)) {
    const range = asObject(ranges[key]);
    const min = safeNumber(range.min, Number.NaN);
    const max = safeNumber(range.max, Number.NaN);
    const step = safeNumber(range.step, Number.NaN);
    const n = safeNumber(rawValue, Number.NaN);
    if (!Number.isFinite(n)) continue;
    let next = Number.isFinite(min) && Number.isFinite(max) ? clamp(n, min, max) : n;
    if (Number.isFinite(step) && step > 0 && Number.isFinite(min)) {
      const snapped = min + Math.round((next - min) / step) * step;
      next = Number.isFinite(max) ? clamp(snapped, min, max) : snapped;
    }
    nextParams[key] = round(next, 6);
  }

  return {
    ...candidate,
    candidate_id: `${String(candidate.candidate_id || 'candidate')}-ai`,
    strategy_id: `${String(candidate.strategy_id || 'strategy')}-AI`,
    parameter_set: nextParams,
    candidate_source_metadata: {
      ...asObject(candidate.candidate_source_metadata),
      source_type: 'nova_strategy_lab',
      tuned_from_candidate_id: candidate.candidate_id,
    },
    traceability: {
      ...asObject(candidate.traceability),
      tuned_by: 'nova-strategy-lab.v1',
    },
  };
}

function validateAndScore(candidates: StrategyCandidate[]) {
  const validation = buildCandidateValidationPipeline({
    candidates,
    context: {
      research: {},
      regimeState: {},
      signalFunnel: {},
      strategyGovernance: {},
      walkForward: {},
    },
    config: {
      stage_2: {
        execution_realism_profile: {
          mode: 'paper',
        },
      },
    },
  });

  const scoring = buildCandidateScoring({
    candidates,
    validation,
  });

  return { validation, scoring };
}

function formatStrategyLabReply(
  result: Awaited<ReturnType<typeof generateGovernedNovaStrategies>>,
  locale = 'en',
) {
  const zh = String(locale || '')
    .toLowerCase()
    .startsWith('zh');
  const rows = result.selected_candidates;
  if (!rows.length) {
    return formatStructuredAssistantReply({
      language: locale,
      verdict: zh
        ? '当前还没有足够干净、值得行动的候选策略。'
        : 'No candidate is clean enough to act on yet.',
      plan: zh
        ? [
            '先保持当前在线策略不变。',
            '用更严的约束或更好的证据重新跑 discovery。',
            '宁可没有新策略，也不要上弱策略。',
          ]
        : [
            'Keep current live strategies unchanged.',
            'Re-run discovery with tighter constraints or better evidence.',
            'Prefer no new strategy over weak strategy.',
          ],
      why: zh
        ? [
            '当前候选池没有足够强地通过质量和治理门槛。',
            '当稳健性不足时，策略生成本来就应该允许返回空。',
            '这能让研究纪律优先于新奇感。',
          ]
        : [
            'The candidate pool did not pass quality and governance gates strongly enough.',
            'Strategy generation is allowed to return nothing when robustness is weak.',
            'This keeps research discipline ahead of novelty.',
          ],
      risk: zh
        ? [
            '常见失效模式 / 什么情况下不要做',
            '没有验证前，不要把 AI 想法直接推进到 live runtime。',
            '候选池偏弱时，往往隐藏着成本或市场状态脆弱性。',
          ]
        : [
            'Common failure modes / when NOT to trade',
            'Do not promote AI ideas directly into live runtime without validation.',
            'Weak candidate pools often hide cost or regime fragility.',
          ],
      evidence: [
        `provider ${result.provider}`,
        `source ${result.source}`,
        zh
          ? `候选池 ${result.pool_summary.total_candidates} 个候选`
          : `pool ${result.pool_summary.total_candidates} candidates`,
      ],
    });
  }

  const top = rows[0];
  return formatStructuredAssistantReply({
    language: locale,
    verdict: zh
      ? `当前治理后最优候选是：${top.strategy_id}（${top.strategy_family}）。`
      : `Best governed candidate: ${top.strategy_id} (${top.strategy_family}).`,
    plan: rows
      .slice(0, 3)
      .map((row: StrategySelectionRow) =>
        zh
          ? `${String(row.strategy_id || 'unknown')}：${row.recommendation} | 分数 ${String(row.candidate_quality_score_pct || 'n/a')} | 下一步 ${String(row.next_stage || 'unknown')}`
          : `${String(row.strategy_id || 'unknown')}: ${row.recommendation} | score ${String(row.candidate_quality_score_pct || 'n/a')} | next ${String(row.next_stage || 'unknown')}`,
      ),
    why: result.why.length
      ? result.why.slice(0, 3)
      : zh
        ? [result.portfolio_fit, result.risk_note, '这些候选在 AI 调优后又做了一次验证。']
        : [result.portfolio_fit, result.risk_note, 'Candidates were revalidated after AI tuning.'],
    risk: zh
      ? [
          '常见失效模式 / 什么情况下不要做',
          result.risk_note,
          '仍处于 HOLD_FOR_RETEST 或 REJECT 的想法不要推进。',
        ]
      : [
          'Common failure modes / when NOT to trade',
          result.risk_note,
          'Do not promote ideas that remain HOLD_FOR_RETEST or REJECT.',
        ],
    evidence: [
      `provider ${result.provider}`,
      `source ${result.source}`,
      `promoted ${result.governance_summary.promotable_count} | hold ${result.governance_summary.hold_count} | reject ${result.governance_summary.reject_count}`,
    ],
  });
}

export async function generateGovernedNovaStrategies(args: StrategyLabArgs) {
  const asof = new Date().toISOString();
  const traceId = createTraceId('nova-strategy');
  const workflowId = `workflow-nova-strategy-${randomUUID().slice(0, 12)}`;
  const constraints = parseIntent(args.prompt, args.market || null, args.riskProfile || null);
  const seedRuntime = loadDiscoverySeedRuntime();

  args.repo.upsertWorkflowRun({
    id: workflowId,
    workflow_key: 'nova_strategy_lab',
    workflow_version: 'nova-strategy-lab.v1',
    trigger_type: 'manual',
    status: 'RUNNING',
    trace_id: traceId,
    input_json: JSON.stringify({
      prompt: args.prompt,
      locale: args.locale || 'en',
      constraints,
    }),
    output_json: null,
    attempt_count: 1,
    started_at_ms: Date.now(),
    updated_at_ms: Date.now(),
    completed_at_ms: null,
  });

  const hypothesisRegistry = buildHypothesisRegistry({
    asOf: asof,
    context: {
      currentRegime: constraints.regimes[0] || 'range',
      starvation: false,
      decayingFamilies: [],
    },
    config: { constraints },
    seedRuntime,
  });
  const templateRegistry = buildTemplateRegistry({
    asOf: asof,
    config: { constraints },
    seedRuntime,
  });
  const generated = buildCandidateGenerator({
    asOf: asof,
    hypothesisRegistry,
    templateRegistry,
    seedRuntime,
    context: {
      currentRegime: constraints.regimes[0] || 'range',
      starvation: false,
      walkforward_promotion_ready: [],
    },
    config: {
      max_candidates: Math.max(8, Math.min(18, args.maxCandidates || 12)),
      max_hypotheses: 8,
      max_templates_per_hypothesis: 3,
      constraints,
    },
  });

  const initial = validateAndScore(generated.candidates);
  const rankedPool = initial.scoring.ranking.slice(
    0,
    Math.max(8, Math.min(12, args.maxCandidates || 8)),
  );
  const candidateById = new Map<string, StrategyCandidate>(
    generated.candidates.map(
      (row: StrategyCandidate) => [String(row.candidate_id || ''), row] as const,
    ),
  );
  const candidateSummary = buildCandidateSummary(
    rankedPool
      .map((row: StrategyScoreRow) => candidateById.get(String(row.candidate_id || '')) || null)
      .filter((row: StrategyCandidate | null): row is StrategyCandidate => Boolean(row)),
    initial.scoring.candidates as StrategyScoreRow[],
  );

  const prompts = buildStrategyLabPrompts({
    prompt: args.prompt,
    locale: args.locale,
    constraints,
    candidateSummary,
  });

  const novaRun = await runLoggedNovaTextTask({
    repo: args.repo,
    userId: args.userId || null,
    task: 'strategy_lab',
    promptTaskKey: 'strategy-lab-generator',
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    context: {
      surface: 'strategy_lab',
      locale: args.locale || 'en',
      constraints,
    },
    traceId,
  });

  const parsed = novaRun.ok ? firstJsonObject(novaRun.text) : null;
  const selectedIds = asArray<string>(parsed?.selected_candidate_ids).filter(Boolean);
  const overrideRows = asArray<JsonObject>(parsed?.parameter_overrides);
  const overrideById = new Map(
    overrideRows.map((row) => [String(row.candidate_id || ''), asObject(row.parameter_overrides)]),
  );

  const selectedBaseCandidates =
    selectedIds
      .map((id): StrategyCandidate | null => candidateById.get(String(id)) || null)
      .filter((row: StrategyCandidate | null): row is StrategyCandidate => Boolean(row))
      .slice(0, 4) || [];

  const deterministicFallback = rankedPool
    .map(
      (row: StrategyScoreRow): StrategyCandidate | null =>
        candidateById.get(String(row.candidate_id || '')) || null,
    )
    .filter((row: StrategyCandidate | null): row is StrategyCandidate => Boolean(row))
    .slice(0, 3);

  const tunedCandidates = (
    selectedBaseCandidates.length ? selectedBaseCandidates : deterministicFallback
  ).map((candidate: StrategyCandidate) =>
    applyOverrides(candidate, overrideById.get(String(candidate.candidate_id || ''))),
  );

  const finalSelection = validateAndScore(tunedCandidates);
  const finalCandidateById = new Map<string, StrategyCandidate>(
    tunedCandidates.map((row: StrategyCandidate) => [String(row.candidate_id || ''), row] as const),
  );
  const selected: StrategySelectionRow[] = finalSelection.scoring.ranking.map(
    (scoreRow: StrategyScoreRow) => {
      const candidate = asObject(finalCandidateById.get(String(scoreRow.candidate_id || '')));
      return {
        candidate_id: scoreRow.candidate_id,
        strategy_id: scoreRow.strategy_id,
        strategy_family: candidate.strategy_family || null,
        template_name: candidate.template_name || null,
        candidate_quality_score: scoreRow.candidate_quality_score,
        candidate_quality_score_pct: scoreRow.candidate_quality_score_pct,
        recommendation: scoreRow.recommendation,
        next_stage: scoreRow.next_stage,
        rejection_reasons: scoreRow.rejection_reasons || [],
        parameter_set: candidate.parameter_set || {},
        supporting_features: candidate.supporting_features || [],
        supported_asset_classes: candidate.supported_asset_classes || [],
        compatible_regimes: candidate.compatible_regimes || [],
        quality_prior_score: candidate.quality_prior_score ?? null,
        generation_mode: candidate.generation_mode || null,
        candidate_source_metadata: candidate.candidate_source_metadata || {},
        traceability: candidate.traceability || {},
      };
    },
  );

  const result = {
    generated_at: asof,
    workflow_id: workflowId,
    trace_id: traceId,
    provider: novaRun.ok
      ? `${novaRun.route.provider}:${novaRun.route.alias}`
      : 'deterministic-ranked',
    source: novaRun.ok ? 'nova-generated' : 'deterministic-ranked',
    runtime_mode: novaRun.ok ? novaRun.route.provider : 'deterministic',
    prompt: args.prompt,
    constraints,
    pool_summary: {
      total_candidates: generated.summary.total_candidates,
      shortlisted_candidates: candidateSummary.length,
    },
    selected_candidates: selected,
    portfolio_fit: String(
      parsed?.portfolio_fit || 'Prefer small controlled experiments over immediate promotion.',
    ),
    risk_note: String(
      parsed?.risk_note ||
        'Treat new strategies as draft research until they clear validation and governance.',
    ),
    why: asArray<string>(parsed?.why).filter(Boolean),
    governance_summary: {
      promotable_count: selected.filter(
        (row: StrategySelectionRow) => row.recommendation === 'PROMOTE_TO_SHADOW',
      ).length,
      hold_count: selected.filter(
        (row: StrategySelectionRow) => row.recommendation === 'HOLD_FOR_RETEST',
      ).length,
      reject_count: selected.filter((row: StrategySelectionRow) => row.recommendation === 'REJECT')
        .length,
    },
    raw_generation_text: novaRun.ok ? novaRun.text : null,
  };

  args.repo.upsertWorkflowRun({
    id: workflowId,
    workflow_key: 'nova_strategy_lab',
    workflow_version: 'nova-strategy-lab.v1',
    trigger_type: 'manual',
    status: 'SUCCEEDED',
    trace_id: traceId,
    input_json: JSON.stringify({
      prompt: args.prompt,
      locale: args.locale || 'en',
      constraints,
    }),
    output_json: JSON.stringify(result),
    attempt_count: 1,
    started_at_ms: Date.now(),
    updated_at_ms: Date.now(),
    completed_at_ms: Date.now(),
  });

  recordAuditEvent(args.repo, {
    traceId,
    scope: 'nova_strategy_lab',
    eventType: 'NOVA_STRATEGY_GENERATED',
    userId: args.userId || null,
    entityType: 'workflow_run',
    entityId: workflowId,
    payload: result,
  });

  return result;
}

export async function generateGovernedNovaStrategyReply(args: StrategyLabArgs) {
  const result = await generateGovernedNovaStrategies(args);
  return {
    provider: result.provider,
    text: formatStrategyLabReply(result, args.locale || 'en'),
    result,
  };
}
