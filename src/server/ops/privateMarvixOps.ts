import type { MarketRepository } from '../db/repository.js';
import { decodeSignalContract } from '../quant/service.js';
import { getNovaModelPlan, getNovaRoutingPolicies, getNovaRuntimeMode } from '../ai/llmOps.js';

type JsonObject = Record<string, unknown>;

function parseJson(text: string | null | undefined): JsonObject {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as JsonObject;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function toIso(ms: number | null | undefined) {
  return Number.isFinite(ms) ? new Date(Number(ms)).toISOString() : null;
}

export function isLoopbackAddress(address: string | null | undefined): boolean {
  const value = String(address || '').trim();
  return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';
}

export function buildPrivateMarvixOpsReport(repo: MarketRepository) {
  const now = Date.now();
  const workflowKeys = new Set(['free_data_flywheel', 'nova_training_flywheel', 'nova_strategy_lab']);
  const newsRows = repo.listNewsItems({ limit: 24, sinceMs: now - 1000 * 60 * 60 * 72 });
  const recentNewsFactors = newsRows
    .map((row) => {
      const payload = parseJson(row.payload_json);
      const geminiAnalysis = payload.gemini_analysis && typeof payload.gemini_analysis === 'object' ? (payload.gemini_analysis as JsonObject) : null;
      const batch = geminiAnalysis?.batch && typeof geminiAnalysis.batch === 'object' ? (geminiAnalysis.batch as JsonObject) : null;
      const headline = geminiAnalysis?.headline && typeof geminiAnalysis.headline === 'object' ? (geminiAnalysis.headline as JsonObject) : null;
      if (!batch && !headline) return null;
      return {
        id: row.id,
        market: row.market,
        symbol: row.symbol,
        headline: row.headline,
        published_at: toIso(row.published_at_ms),
        source: row.source,
        tone: row.sentiment_label,
        relevance: row.relevance_score,
        analysis_provider: batch?.provider || 'gemini',
        trading_bias: batch?.trading_bias || null,
        factor_tags: Array.isArray(batch?.factor_tags) ? batch.factor_tags : [],
        factor_summary: typeof batch?.summary === 'string' ? batch.summary : null,
        sentiment_score: headline?.sentiment_score ?? batch?.sentiment_score ?? null,
        event_risk_score: batch?.event_risk_score ?? null,
        macro_policy_score: batch?.macro_policy_score ?? null,
        earnings_impact_score: batch?.earnings_impact_score ?? null
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .slice(0, 10);

  const topSignals = repo
    .listSignals({ status: 'NEW', limit: 6 })
    .map((row) => {
      const signal = decodeSignalContract(row);
      return {
        signal_id: row.signal_id,
        market: row.market,
        symbol: row.symbol,
        strategy_id: row.strategy_id,
        direction: row.direction,
        score: row.score,
        confidence: row.confidence,
        created_at: toIso(row.created_at_ms),
        status: row.status,
        news_context: signal?.news_context || null,
        why_now: signal?.explain_bullets?.[0] || null
      };
    });

  const workflowRuns = repo
    .listWorkflowRuns({ limit: 20 })
    .filter((row) => workflowKeys.has(row.workflow_key))
    .slice(0, 12)
    .map((row) => {
      const output = parseJson(row.output_json);
      const news = output.news && typeof output.news === 'object' ? (output.news as JsonObject) : null;
      return {
        id: row.id,
        workflow_key: row.workflow_key,
        status: row.status,
        trigger_type: row.trigger_type,
        updated_at: toIso(row.updated_at_ms),
        completed_at: toIso(row.completed_at_ms),
        trace_id: row.trace_id,
        summary:
          row.workflow_key === 'free_data_flywheel'
            ? {
                refreshed_symbols: news?.refreshed_symbols ?? null,
                rows_upserted: news?.rows_upserted ?? null
              }
            : row.workflow_key === 'nova_training_flywheel'
              ? {
                  dataset_count: output.dataset_count ?? null,
                  ready_for_training: output.ready_for_training ?? null
                }
              : {
                  selected_count: Array.isArray(output.selected_candidates) ? output.selected_candidates.length : null,
                  provider: output.provider ?? null
                }
      };
    });

  const fundamentals = repo.listFundamentalSnapshots({ market: 'US', limit: 12 }).map((row) => {
    const payload = parseJson(row.payload_json);
    return {
      id: row.id,
      symbol: row.symbol,
      source: row.source,
      asof_date: row.asof_date,
      updated_at: toIso(row.updated_at_ms),
      keys: Object.keys(payload).slice(0, 8)
    };
  });

  const optionChains = repo.listOptionChainSnapshots({ market: 'US', limit: 12 }).map((row) => {
    const payload = parseJson(row.payload_json);
    const summary = payload.summary && typeof payload.summary === 'object' ? (payload.summary as JsonObject) : null;
    return {
      id: row.id,
      symbol: row.symbol,
      source: row.source,
      expiration_date: row.expiration_date,
      snapshot_at: toIso(row.snapshot_ts_ms),
      contracts_count: summary?.contracts_count ?? null,
      total_open_interest: summary?.total_open_interest ?? null,
      total_volume: summary?.total_volume ?? null,
      iv_skew: summary?.iv_skew ?? null
    };
  });

  const novaRuns = repo.listNovaTaskRuns({ limit: 12 }).map((row) => ({
    id: row.id,
    task_type: row.task_type,
    status: row.status,
    route_alias: row.route_alias,
    model_name: row.model_name,
    created_at: toIso(row.created_at_ms),
    error: row.error
  }));

  const plan = getNovaModelPlan();

  return {
    generated_at: new Date(now).toISOString(),
    visibility: 'private-loopback-only',
    runtime: {
      mode: getNovaRuntimeMode(),
      provider: plan.provider,
      endpoint: plan.endpoint,
      aliases: plan.models,
      routes: getNovaRoutingPolicies()
    },
    workflows: workflowRuns,
    recent_news_factors: recentNewsFactors,
    reference_data: {
      fundamentals,
      option_chains: optionChains
    },
    active_signals: topSignals,
    recent_nova_runs: novaRuns
  };
}
