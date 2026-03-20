import { randomUUID } from 'node:crypto';
import type { MarketRepository } from '../db/repository.js';
import type { NovaReviewLabelRecord, NovaTaskRunRecord, NovaTaskType } from '../types.js';
import { createTraceId, recordAuditEvent } from '../observability/spine.js';
import { runNovaChatCompletion, runNovaEmbedding } from './client.js';
import { resolveBusinessTask, type NovaBusinessTask } from './router.js';
import { getNovaRuntimeMode, isLocalNovaEnabled } from '../ai/llmOps.js';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function sanitizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
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

function findPromptVersionId(repo: MarketRepository, taskKey: string): string | null {
  const row = repo.listPromptVersions({
    taskKey,
    status: 'active',
    limit: 1
  })[0];
  return row?.id || null;
}

function shouldSkipLocalNova(): boolean {
  return getNovaRuntimeMode() === 'deterministic-fallback';
}

function taskTypeForBusinessTask(task: NovaBusinessTask): NovaTaskType {
  if (task === 'today_risk') return 'risk_regime_explanation';
  if (task === 'daily_stance') return 'daily_stance_generation';
  if (task === 'action_card') return 'action_card_generation';
  if (task === 'daily_wrap_up') return 'daily_wrap_up_generation';
  if (task === 'assistant_answer') return 'assistant_grounded_answer';
  if (task === 'strategy_lab') return 'strategy_candidate_generation';
  if (task === 'fast_classification') return 'fast_classification';
  return 'retrieval_embedding';
}

export async function runLoggedNovaTextTask(args: {
  repo: MarketRepository;
  userId?: string | null;
  threadId?: string | null;
  task: NovaBusinessTask;
  promptTaskKey: string;
  systemPrompt: string;
  userPrompt: string;
  context: JsonObject;
  traceId?: string | null;
  parentRunId?: string | null;
}) {
  const route = resolveBusinessTask(args.task);
  const runId = `nova-run-${randomUUID()}`;
  const traceId = args.traceId || createTraceId('nova');
  const promptVersionId = findPromptVersionId(args.repo, args.promptTaskKey);
  const inputJson = JSON.stringify({
    system_prompt: args.systemPrompt,
    user_prompt: args.userPrompt
  });
  const nowMs = Date.now();

  if (shouldSkipLocalNova()) {
    args.repo.upsertNovaTaskRun({
      id: runId,
      user_id: args.userId || null,
      thread_id: args.threadId || null,
      task_type: taskTypeForBusinessTask(args.task),
      route_alias: route.alias,
      model_name: route.model,
      endpoint: route.endpoint,
      trace_id: traceId,
      prompt_version_id: promptVersionId,
      parent_run_id: args.parentRunId || null,
      input_json: inputJson,
      context_json: JSON.stringify(args.context),
      output_json: null,
      status: 'SKIPPED',
      error: 'Nova runtime is in deterministic fallback mode.',
      created_at_ms: nowMs,
      updated_at_ms: nowMs
    });
    return {
      ok: false as const,
      skipped: true as const,
      traceId,
      runId,
      route
    };
  }

  try {
    const result = await runNovaChatCompletion({
      task: route.task,
      systemPrompt: args.systemPrompt,
      userPrompt: args.userPrompt
    });
    args.repo.upsertNovaTaskRun({
      id: runId,
      user_id: args.userId || null,
      thread_id: args.threadId || null,
      task_type: taskTypeForBusinessTask(args.task),
      route_alias: result.route.alias,
      model_name: result.route.model,
      endpoint: result.endpoint,
      trace_id: traceId,
      prompt_version_id: promptVersionId,
      parent_run_id: args.parentRunId || null,
      input_json: inputJson,
      context_json: JSON.stringify(args.context),
      output_json: JSON.stringify({
        text: result.text,
        raw: result.raw
      }),
      status: 'SUCCEEDED',
      error: null,
      created_at_ms: nowMs,
      updated_at_ms: Date.now()
    });
    return {
      ok: true as const,
      skipped: false as const,
      traceId,
      runId,
      route: result.route,
      text: result.text
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    args.repo.upsertNovaTaskRun({
      id: runId,
      user_id: args.userId || null,
      thread_id: args.threadId || null,
      task_type: taskTypeForBusinessTask(args.task),
      route_alias: route.alias,
      model_name: route.model,
      endpoint: route.endpoint,
      trace_id: traceId,
      prompt_version_id: promptVersionId,
      parent_run_id: args.parentRunId || null,
      input_json: inputJson,
      context_json: JSON.stringify(args.context),
      output_json: null,
      status: 'FAILED',
      error: message,
      created_at_ms: nowMs,
      updated_at_ms: Date.now()
    });
    return {
      ok: false as const,
      skipped: false as const,
      traceId,
      runId,
      route,
      error: message
    };
  }
}

function buildDecisionNarrativeContext(decision: JsonObject, locale?: string) {
  const todayCall = asObject(decision.today_call);
  const riskState = asObject(decision.risk_state);
  const topAction = asObject(asArray<JsonObject>(decision.ranked_action_cards)[0]);
  const portfolio = asObject(decision.portfolio_context);
  return {
    locale: locale || 'en',
    today_call: {
      code: todayCall.code || null,
      headline: todayCall.headline || null,
      subtitle: todayCall.subtitle || null
    },
    risk_state: {
      posture: riskState.posture || null,
      summary: riskState.summary || null,
      user_message: riskState.user_message || null,
      drivers: asArray<string>(riskState.drivers).slice(0, 4)
    },
    top_action: {
      action_id: topAction.action_id || null,
      symbol: topAction.symbol || null,
      action_label: topAction.action_label || null,
      time_horizon: topAction.time_horizon || null,
      brief_why_now: topAction.brief_why_now || null,
      brief_caution: topAction.brief_caution || null,
      risk_note: topAction.risk_note || null
    },
    portfolio_context: {
      availability: portfolio.availability || null,
      recommendation: portfolio.recommendation || null,
      exposure_posture: portfolio.exposure_posture || null,
      same_symbol_weight_pct: portfolio.same_symbol_weight_pct || null
    }
  };
}

function buildDecisionNarrativePrompts(decision: JsonObject, locale?: string) {
  const systemPrompt =
    'You are Nova, a local AI decision layer for an investment product. Rewrite decision language only. Stay grounded in the supplied state. Keep the tone calm, exact, protective, and concise. Do not add market facts. Return strict JSON with keys: today_call_headline, today_call_subtitle, risk_user_message.';
  const userPrompt = JSON.stringify(buildDecisionNarrativeContext(decision, locale));
  return { systemPrompt, userPrompt };
}

function buildActionCardNarrativePrompts(decision: JsonObject, locale?: string) {
  const cards = asArray<JsonObject>(decision.ranked_action_cards)
    .slice(0, 3)
    .map((card) => ({
      action_id: card.action_id || null,
      symbol: card.symbol || null,
      action_label: card.action_label || null,
      action: card.action || null,
      conviction_label: card.conviction_label || null,
      time_horizon: card.time_horizon || null,
      brief_why_now: card.brief_why_now || null,
      brief_caution: card.brief_caution || null,
      risk_note: card.risk_note || null,
      thesis: asObject(card.evidence_bundle).thesis || null,
      invalidation: asArray<string>(asObject(card.evidence_bundle).invalidation_conditions).slice(0, 2)
    }));
  const systemPrompt =
    'You are Nova writing action card copy for a local decision system. Improve clarity and product tone without changing the underlying recommendation. Return strict JSON: {"cards":[{"action_id":"...","brief_why_now":"...","brief_caution":"...","risk_note":"..."}]}.';
  const userPrompt = JSON.stringify({
    locale: locale || 'en',
    cards
  });
  return { systemPrompt, userPrompt };
}

function buildWrapUpPrompts(args: {
  engagement: JsonObject;
  decision: JsonObject;
  locale?: string;
}) {
  const wrap = asObject(args.engagement.daily_wrap_up);
  const change = asObject(args.engagement.recommendation_change);
  const systemPrompt =
    'You are Nova writing the evening wrap-up. Explain what mattered in today’s judgment, why restraint or action mattered, and what to watch tomorrow. Stay concise, sober, and useful. Return strict JSON with keys: opening_line, summary, tomorrow_watch.';
  const userPrompt = JSON.stringify({
    locale: args.locale || 'en',
    wrap_up: {
      headline: wrap.headline || null,
      summary: wrap.summary || null,
      lessons: asArray<string>(wrap.lessons).slice(0, 3)
    },
    recommendation_change: {
      changed: change.changed || false,
      type: change.change_type || null,
      summary: change.summary || null
    },
    decision: buildDecisionNarrativeContext(args.decision, args.locale)
  });
  return { systemPrompt, userPrompt };
}

export async function applyLocalNovaDecisionLanguage<T extends JsonObject>(args: {
  repo: MarketRepository;
  userId?: string;
  locale?: string;
  traceId?: string | null;
  decision: T;
}) {
  const decisionCopy = JSON.parse(JSON.stringify(args.decision || {})) as T & {
    nova_local?: JsonObject;
  };
  const decisionState = decisionCopy as unknown as JsonObject;

  const narrativePrompts = buildDecisionNarrativePrompts(decisionCopy, args.locale);
  const narrativeRun = await runLoggedNovaTextTask({
    repo: args.repo,
    userId: args.userId,
    task: 'today_risk',
    promptTaskKey: 'today-risk-explainer',
    systemPrompt: narrativePrompts.systemPrompt,
    userPrompt: narrativePrompts.userPrompt,
    context: {
      surface: 'decision_snapshot',
      locale: args.locale || 'en'
    },
    traceId: args.traceId || null
  });

  if (narrativeRun.ok) {
    const parsed = firstJsonObject(narrativeRun.text);
    const todayCall = asObject(decisionState.today_call);
    const riskState = asObject(decisionState.risk_state);
    todayCall.headline = sanitizeText(parsed?.today_call_headline, sanitizeText(todayCall.headline));
    todayCall.subtitle = sanitizeText(parsed?.today_call_subtitle, sanitizeText(todayCall.subtitle));
    riskState.user_message = sanitizeText(parsed?.risk_user_message, sanitizeText(riskState.user_message));
    decisionState.today_call = todayCall;
    decisionState.risk_state = riskState;
    const summary = asObject(decisionState.summary);
    summary.today_call = todayCall;
    summary.user_message = riskState.user_message || summary.user_message || null;
    decisionState.summary = summary;
  }

  const actionPrompts = buildActionCardNarrativePrompts(decisionCopy, args.locale);
  const actionRun = await runLoggedNovaTextTask({
    repo: args.repo,
    userId: args.userId,
    task: 'action_card',
    promptTaskKey: 'action-card-writer',
    systemPrompt: actionPrompts.systemPrompt,
    userPrompt: actionPrompts.userPrompt,
    context: {
      surface: 'decision_snapshot',
      locale: args.locale || 'en'
    },
    traceId: narrativeRun.traceId,
    parentRunId: narrativeRun.runId
  });

  if (actionRun.ok) {
    const parsed = firstJsonObject(actionRun.text);
    const overrides = new Map(
      asArray<JsonObject>(parsed?.cards).map((row) => [
        String(row.action_id || ''),
        {
          brief_why_now: sanitizeText(row.brief_why_now),
          brief_caution: sanitizeText(row.brief_caution),
          risk_note: sanitizeText(row.risk_note)
        }
      ])
    );

    decisionState.ranked_action_cards = asArray<JsonObject>(decisionState.ranked_action_cards).map((card) => {
      const patch = overrides.get(String(card.action_id || ''));
      if (!patch) return card;
      return {
        ...card,
        brief_why_now: patch.brief_why_now || card.brief_why_now,
        brief_caution: patch.brief_caution || card.brief_caution,
        risk_note: patch.risk_note || card.risk_note
      };
    });
  }

  const summaryState = asObject(decisionState.summary);
  summaryState.nova_local = {
    attempted: true,
    applied: Boolean(narrativeRun.ok || actionRun.ok),
    skipped: Boolean(narrativeRun.skipped && actionRun.skipped),
    trace_id: narrativeRun.traceId
  };
  decisionState.summary = summaryState;

  decisionCopy.nova_local = {
    enabled: !shouldSkipLocalNova(),
    endpoint: resolveBusinessTask('today_risk').endpoint,
    trace_id: narrativeRun.traceId,
    model_tier: resolveBusinessTask('today_risk').alias
  };

  recordAuditEvent(args.repo, {
    traceId: String(decisionCopy.nova_local && asObject(decisionCopy.nova_local).trace_id) || createTraceId('nova'),
    scope: 'nova_local',
    eventType: 'decision_language_generated',
    userId: args.userId || null,
    entityType: 'decision_snapshot',
    entityId: String(decisionCopy.audit_snapshot_id || '') || null,
    payload: {
      task_runs: [narrativeRun.runId, actionRun.runId],
      applied: narrativeRun.ok || actionRun.ok,
      skipped: narrativeRun.skipped && actionRun.skipped
    }
  });

  return decisionCopy;
}

export async function applyLocalNovaWrapUpLanguage<T extends JsonObject>(args: {
  repo: MarketRepository;
  userId?: string;
  locale?: string;
  traceId?: string | null;
  engagement: T;
  decision: JsonObject;
}) {
  const engagementCopy = JSON.parse(JSON.stringify(args.engagement || {})) as T;
  const engagementState = engagementCopy as unknown as JsonObject;
  const prompts = buildWrapUpPrompts({
    engagement: engagementCopy,
    decision: args.decision,
    locale: args.locale
  });
  const run = await runLoggedNovaTextTask({
    repo: args.repo,
    userId: args.userId,
    task: 'daily_wrap_up',
    promptTaskKey: 'daily-wrap-up-writer',
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    context: {
      surface: 'daily_wrap_up',
      locale: args.locale || 'en'
    },
    traceId: args.traceId || null
  });

  if (run.ok) {
    const parsed = firstJsonObject(run.text);
    const wrap = asObject(engagementState.daily_wrap_up);
    wrap.opening_line = sanitizeText(parsed?.opening_line, sanitizeText(wrap.opening_line));
    wrap.summary = sanitizeText(parsed?.summary, sanitizeText(wrap.summary));
    wrap.tomorrow_watch = sanitizeText(parsed?.tomorrow_watch, sanitizeText(wrap.tomorrow_watch));
    engagementState.daily_wrap_up = wrap;
  }

  return engagementCopy;
}

export async function logNovaAssistantAnswer(args: {
  repo: MarketRepository;
  userId: string;
  threadId?: string;
  traceId?: string | null;
  context: JsonObject;
  message: string;
  responseText: string;
  provider: string;
  status: 'SUCCEEDED' | 'FAILED';
  error?: string;
}) {
  const route = resolveBusinessTask('assistant_answer');
  const runId = `nova-run-${randomUUID()}`;
  const traceId = args.traceId || createTraceId('nova-chat');
  const nowMs = Date.now();
  args.repo.upsertNovaTaskRun({
    id: runId,
    user_id: args.userId,
    thread_id: args.threadId || null,
    task_type: 'assistant_grounded_answer',
    route_alias: route.alias,
    model_name: route.model,
    endpoint: route.endpoint,
    trace_id: traceId,
    prompt_version_id: findPromptVersionId(args.repo, 'grounded-assistant'),
    parent_run_id: null,
    input_json: JSON.stringify({
      user_message: args.message,
      provider: args.provider
    }),
    context_json: JSON.stringify(args.context),
    output_json: JSON.stringify({
      text: args.responseText
    }),
    status: args.status,
    error: args.error || null,
    created_at_ms: nowMs,
    updated_at_ms: nowMs
  });
}

export async function retrieveNovaEmbedding(args: {
  repo: MarketRepository;
  userId?: string | null;
  traceId?: string | null;
  input: string;
  context?: JsonObject;
}) {
  const route = resolveBusinessTask('retrieval');
  const runId = `nova-run-${randomUUID()}`;
  const traceId = args.traceId || createTraceId('nova-embed');
  const nowMs = Date.now();

  if (shouldSkipLocalNova()) {
    args.repo.upsertNovaTaskRun({
      id: runId,
      user_id: args.userId || null,
      thread_id: null,
      task_type: 'retrieval_embedding',
      route_alias: route.alias,
      model_name: route.model,
      endpoint: route.endpoint,
      trace_id: traceId,
      prompt_version_id: null,
      parent_run_id: null,
      input_json: JSON.stringify({ input: args.input }),
      context_json: JSON.stringify(args.context || {}),
      output_json: null,
      status: 'SKIPPED',
      error: 'NOVA_DISABLE_LOCAL_GENERATION=1',
      created_at_ms: nowMs,
      updated_at_ms: nowMs
    });
    return [];
  }

  try {
    const result = await runNovaEmbedding({
      task: 'retrieval_embedding',
      input: args.input
    });
    args.repo.upsertNovaTaskRun({
      id: runId,
      user_id: args.userId || null,
      thread_id: null,
      task_type: 'retrieval_embedding',
      route_alias: result.route.alias,
      model_name: result.route.model,
      endpoint: result.endpoint,
      trace_id: traceId,
      prompt_version_id: null,
      parent_run_id: null,
      input_json: JSON.stringify({ input: args.input }),
      context_json: JSON.stringify(args.context || {}),
      output_json: JSON.stringify({ vector_length: result.vector.length }),
      status: 'SUCCEEDED',
      error: null,
      created_at_ms: nowMs,
      updated_at_ms: Date.now()
    });
    return result.vector;
  } catch (error) {
    args.repo.upsertNovaTaskRun({
      id: runId,
      user_id: args.userId || null,
      thread_id: null,
      task_type: 'retrieval_embedding',
      route_alias: route.alias,
      model_name: route.model,
      endpoint: route.endpoint,
      trace_id: traceId,
      prompt_version_id: null,
      parent_run_id: null,
      input_json: JSON.stringify({ input: args.input }),
      context_json: JSON.stringify(args.context || {}),
      output_json: null,
      status: 'FAILED',
      error: error instanceof Error ? error.message : String(error),
      created_at_ms: nowMs,
      updated_at_ms: Date.now()
    });
    return [];
  }
}

export function labelNovaRun(args: {
  repo: MarketRepository;
  runId: string;
  reviewerId: string;
  label: string;
  score?: number | null;
  notes?: string | null;
  includeInTraining?: boolean;
}) {
  const nowMs = Date.now();
  const row: NovaReviewLabelRecord = {
    id: `nova-label-${randomUUID()}`,
    run_id: args.runId,
    reviewer_id: args.reviewerId,
    label: args.label,
    score: Number.isFinite(Number(args.score)) ? Number(args.score) : null,
    notes: args.notes || null,
    include_in_training: args.includeInTraining ? 1 : 0,
    created_at_ms: nowMs,
    updated_at_ms: nowMs
  };
  args.repo.upsertNovaReviewLabel(row);
  return row;
}
