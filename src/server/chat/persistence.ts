import type { ChatContextInput } from './types.js';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function truncateValue(value: unknown, maxLength: number): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function compactDecisionSummary(value: unknown): JsonObject | null {
  const source = asObject(value);
  const next: JsonObject = {};
  const todayCall = truncateValue(source.today_call, 180);
  const riskPosture = truncateValue(source.risk_posture, 48);
  const topActionId = truncateValue(source.top_action_id, 64);
  const topActionSymbol = truncateValue(source.top_action_symbol, 24);
  const topActionLabel = truncateValue(source.top_action_label, 96);
  const sourceStatus = truncateValue(source.source_status, 32);
  const dataStatus = truncateValue(source.data_status, 32);
  if (todayCall) next.today_call = todayCall;
  if (riskPosture) next.risk_posture = riskPosture;
  if (topActionId) next.top_action_id = topActionId;
  if (topActionSymbol) next.top_action_symbol = topActionSymbol;
  if (topActionLabel) next.top_action_label = topActionLabel;
  if (sourceStatus) next.source_status = sourceStatus;
  if (dataStatus) next.data_status = dataStatus;
  return Object.keys(next).length ? next : null;
}

function compactHoldingsSummary(value: unknown): JsonObject | null {
  const source = asObject(value);
  const next: JsonObject = {};
  const numberKeys = [
    'holdings_count',
    'total_weight_pct',
    'aligned_weight_pct',
    'unsupported_weight_pct',
    'top1_pct',
  ] as const;
  for (const key of numberKeys) {
    const parsed = Number(source[key]);
    if (Number.isFinite(parsed)) next[key] = parsed;
  }
  const riskLevel = truncateValue(source.risk_level, 48);
  const recommendation = truncateValue(source.recommendation, 160);
  if (riskLevel) next.risk_level = riskLevel;
  if (recommendation) next.recommendation = recommendation;
  return Object.keys(next).length ? next : null;
}

function compactEngagementSummary(value: unknown): JsonObject | null {
  const source = asObject(value);
  const next: JsonObject = {};
  const locale = truncateValue(source.locale, 24);
  const morningCheckStatus = truncateValue(source.morning_check_status, 48);
  const perceptionStatus = truncateValue(source.perception_status, 48);
  const behaviorQuality = truncateValue(source.behavior_quality, 48);
  const recommendationChange = truncateValue(source.recommendation_change, 120);
  const uiTone = truncateValue(source.ui_tone, 48);
  const disciplineScore = Number(source.discipline_score);
  if (locale) next.locale = locale;
  if (morningCheckStatus) next.morning_check_status = morningCheckStatus;
  if (perceptionStatus) next.perception_status = perceptionStatus;
  if (behaviorQuality) next.behavior_quality = behaviorQuality;
  if (recommendationChange) next.recommendation_change = recommendationChange;
  if (uiTone) next.ui_tone = uiTone;
  if (Number.isFinite(disciplineScore)) next.discipline_score = disciplineScore;
  if (typeof source.wrap_up_ready === 'boolean') next.wrap_up_ready = source.wrap_up_ready;
  if (typeof source.wrap_up_completed === 'boolean') {
    next.wrap_up_completed = source.wrap_up_completed;
  }
  return Object.keys(next).length ? next : null;
}

export function truncateChatText(value: unknown, maxLength: number): string {
  return truncateValue(value, maxLength) || '';
}

export function compactChatContext(context?: ChatContextInput | JsonObject | null): JsonObject {
  const source = asObject(context);
  const next: JsonObject = {};
  const scalarKeys = [
    'locale',
    'signalId',
    'symbol',
    'market',
    'assetClass',
    'timeframe',
    'page',
    'riskProfileKey',
    'uiMode',
  ] as const;

  for (const key of scalarKeys) {
    const value = truncateValue(source[key], key === 'locale' ? 24 : 48);
    if (value) next[key] = value;
  }

  const decisionSummary = compactDecisionSummary(source.decisionSummary);
  const holdingsSummary = compactHoldingsSummary(source.holdingsSummary);
  const engagementSummary = compactEngagementSummary(source.engagementSummary);

  if (decisionSummary) next.decisionSummary = decisionSummary;
  if (holdingsSummary) next.holdingsSummary = holdingsSummary;
  if (engagementSummary) next.engagementSummary = engagementSummary;

  return next;
}

export function stringifyCompactChatContext(
  context?: ChatContextInput | JsonObject | null,
): string {
  return JSON.stringify(compactChatContext(context));
}
