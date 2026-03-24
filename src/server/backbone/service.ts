import { getDb } from '../db/database.js';
import { ensureSchema } from '../db/schema.js';
import { MarketRepository } from '../db/repository.js';
import type { AssetClass, DecisionSnapshotRecord, Market } from '../types.js';
import {
  toActionCardContracts,
  toEvidenceBundleContracts,
  toRiskStateContract,
} from '../domain/contracts.js';
import { buildFeaturePlatformSummary } from '../feature/platform.js';
import { buildResearchKernelSummary } from '../research/kernel.js';
import { buildRegistrySummary } from '../registry/service.js';
import { buildLlmOpsSummary } from '../ai/llmOps.js';
import { buildDurableWorkflowSummary } from '../workflows/durable.js';
import { buildObservabilitySummary } from '../observability/spine.js';
import { buildRiskGovernanceSummary } from '../risk/governance.js';
import { buildPortfolioAllocatorSummary } from '../portfolio/allocator.js';
import { buildScorecardSummary } from '../evals/scorecards.js';

function parseJsonObject(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function parseJsonArray(text: string | null | undefined): Array<Record<string, unknown>> {
  if (!text) return [];
  try {
    const value = JSON.parse(text) as unknown;
    return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
}

function getRepo(): MarketRepository {
  const db = getDb();
  ensureSchema(db);
  return new MarketRepository(db);
}

export function buildBackendBackboneSummary(args: {
  userId?: string;
  market?: Market;
  assetClass?: AssetClass;
}) {
  const repo = getRepo();
  const userId = args.userId || 'guest-default';
  const market = args.market || 'US';
  const assetClass = args.assetClass || 'ALL';

  const decisionRows = repo.listDecisionSnapshots({
    userId,
    market,
    assetClass,
    limit: 8,
  });
  const currentDecision = decisionRows[0] || null;
  const marketState = repo.listMarketState({
    market,
    symbol: undefined,
    timeframe: undefined,
  });

  const riskState = currentDecision ? toRiskStateContract(currentDecision) : null;
  const actionCards = currentDecision ? toActionCardContracts(currentDecision) : [];
  const evidenceBundles = currentDecision ? toEvidenceBundleContracts(currentDecision) : [];
  const portfolioContext = currentDecision
    ? parseJsonObject(currentDecision.portfolio_context_json)
    : null;
  const riskRaw = currentDecision ? parseJsonObject(currentDecision.risk_state_json) : null;

  return {
    generated_at: new Date().toISOString(),
    user_scope: {
      user_id: userId,
      market,
      asset_class: assetClass,
    },
    research_kernel: buildResearchKernelSummary(repo),
    decision_engine: {
      latest_decision_snapshot_id: currentDecision?.id || null,
      risk_state: riskState,
      ranked_action_cards: actionCards,
      evidence_bundles: evidenceBundles,
      source_status: currentDecision?.source_status || 'INSUFFICIENT_DATA',
      data_status: currentDecision?.data_status || 'INSUFFICIENT_DATA',
    },
    risk_governance: buildRiskGovernanceSummary({
      riskState: riskRaw,
      marketState,
      portfolioContext,
    }),
    feature_platform: buildFeaturePlatformSummary(repo, {
      market,
      assetClass,
      timeframe: '1d',
    }),
    registries: buildRegistrySummary(repo),
    llm_ops: buildLlmOpsSummary(repo),
    durable_workflows: buildDurableWorkflowSummary(repo),
    observability: buildObservabilitySummary(repo),
    portfolio_allocator: buildPortfolioAllocatorSummary({
      actions: parseJsonArray(currentDecision?.actions_json),
      portfolioContext,
      riskState: riskRaw,
    }),
    evidence_review: {
      evidence_bundles: evidenceBundles,
      recommendation_reviews: repo.listRecommendationReviews({
        decisionSnapshotId: currentDecision?.id,
        limit: 20,
      }),
      scorecards: buildScorecardSummary(repo, decisionRows as DecisionSnapshotRecord[]),
    },
    canonical_semantics: {
      signal_timestamp_semantics:
        'Signals are evaluated at snapshot time; action cards inherit decision snapshot timestamp, not request render time.',
      execution_assumptions:
        'Backtest, replay, paper, and decision layers all reference execution profiles and cost assumptions as first-class records.',
      result_metrics_schema: [
        'gross_return',
        'net_return',
        'sharpe',
        'sortino',
        'max_drawdown',
        'turnover',
        'cost_drag',
        'sample_size',
      ],
    },
  };
}
