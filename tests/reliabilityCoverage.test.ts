import { describe, expect, it } from 'vitest';
// @ts-ignore JS runtime module import
import { buildNovaQuantSystem } from '../src/quant/system.js';
// @ts-ignore JS runtime module import
import { runQuantPipeline } from '../src/engines/pipeline.js';
// @ts-ignore runtime JS import
import { buildRiskBucketSystem } from '../src/research/core/riskBucketSystem.js';
// @ts-ignore runtime JS import
import { runReliabilityStressFramework } from '../src/research/reliability/reliabilityStressFramework.js';

describe('reliability coverage expansion', () => {
  const baselineSystem = buildNovaQuantSystem({
    asOf: '2026-03-08T00:00:00.000Z',
    riskProfileKey: 'balanced',
    executionTrades: []
  });
  const baselinePipeline = runQuantPipeline({
    as_of: '2026-03-08T00:00:00.000Z',
    config: { risk_profile: 'balanced' }
  });
  const core = baselinePipeline?.research?.research_core;

  it('A: signal generation remains internally coherent', () => {
    const signals = (baselineSystem.signals || [])
      .filter((signal: any) => Boolean(signal.entry_zone?.low) && Boolean(signal.entry_zone?.high))
      .slice(0, 12);
    expect(signals.length).toBeGreaterThan(0);

    for (const signal of signals) {
      const entryLow = Number(signal.entry_zone?.low ?? 0);
      const entryHigh = Number(signal.entry_zone?.high ?? 0);
      const stop = Number(signal.stop_loss?.price ?? signal.stop_loss_value ?? 0);
      const firstTarget = Number(signal.take_profit_levels?.[0]?.price ?? 0);
      expect(entryLow).toBeGreaterThan(0);
      expect(entryHigh).toBeGreaterThan(entryLow);
      expect(stop).toBeGreaterThan(0);
      expect(firstTarget).toBeGreaterThan(0);

      if (signal.direction === 'LONG') {
        expect(stop).toBeLessThan(entryHigh);
        expect(firstTarget).toBeGreaterThan(entryLow);
      } else if (signal.direction === 'SHORT') {
        expect(stop).toBeGreaterThan(entryLow);
        expect(firstTarget).toBeLessThan(entryHigh);
      }
    }
  });

  it('B: regime engine emits classification + compatibility traceability', () => {
    const regime = core?.regime_engine;
    expect(regime?.state?.primary).toBeTruthy();
    expect(regime?.transition_history).toBeTruthy();
    expect(regime?.warnings?.length).toBeGreaterThan(0);
    expect(regime?.by_signal_compatibility?.length).toBeGreaterThan(0);
  });

  it('C: risk filtering catches concentration overload', () => {
    const overloadedSignals = (baselineSystem.signals || []).map((row: any, idx: number) => ({
      ...row,
      status: idx < 8 ? 'NEW' : row.status,
      market: 'US',
      asset_class: 'US_STOCK',
      sector: 'CONCENTRATED_THEME',
      position_advice: {
        ...(row.position_advice || {}),
        position_pct: idx < 8 ? 14 : Number(row.position_advice?.position_pct || 0)
      }
    }));

    const overloadedRisk = buildRiskBucketSystem({
      asOf: '2026-03-08T00:00:00.000Z',
      riskProfileKey: 'balanced',
      championState: baselineSystem,
      regimeState: core?.regime_engine,
      signals: overloadedSignals,
      trades: baselineSystem.trades
    });

    expect(overloadedRisk?.portfolio_risk_budget?.budget_status).toBe('stressed');
    expect(
      Number(overloadedRisk?.portfolio_risk_budget?.market_concentration_pct || 0)
    ).toBeGreaterThan(
      Number(overloadedRisk?.portfolio_risk_budget?.market_concentration_cap_pct || 0)
    );
  });

  it('D/E/F/G: discovery, validation, governance, portfolio all remain inspectable under stress', () => {
    const suite = runReliabilityStressFramework({
      asOf: '2026-03-08T00:00:00.000Z',
      riskProfileKey: 'balanced'
    });

    const starvation = suite.scenarios.find((row: any) => row.scenario_id === 'strategy_starvation');
    const highSlippage = suite.scenarios.find((row: any) => row.scenario_id === 'high_slippage');
    const poorFills = suite.scenarios.find((row: any) => row.scenario_id === 'poor_fills');
    const crowding = suite.scenarios.find((row: any) => row.scenario_id === 'strategy_crowding_fake_diversification');

    expect(starvation?.metrics?.mapping_failures).toBeGreaterThan(0);
    expect(highSlippage?.checks?.some((item: any) => item.check_id === 'execution_profile_applied' && item.pass)).toBe(
      true
    );
    expect(poorFills?.checks?.length).toBeGreaterThan(0);
    expect(crowding?.metrics?.avg_pairwise_correlation).toBeGreaterThan(0.5);
  });

  it('H/I: decision objects and logging/traceability remain complete', () => {
    const opportunities = core?.product_opportunities || [];
    const evidence = core?.research_evidence_system;
    const governance = core?.strategy_governance;
    const discovery = core?.strategy_discovery_engine;

    expect(opportunities.length).toBeGreaterThan(0);
    const firstOpp = opportunities[0];
    expect(firstOpp.evidence_fields).toBeTruthy();
    expect(firstOpp.audit_lineage?.signal_id).toBeTruthy();
    expect(firstOpp.audit_lineage?.decision_source).toBeTruthy();

    expect(evidence?.strategies?.length).toBeGreaterThan(0);
    expect(evidence?.strategies?.[0]?.audit_chain).toBeTruthy();
    const withAssumption = (evidence?.strategies || []).find((row: any) => Boolean(row.assumption_profile));
    expect(withAssumption).toBeTruthy();

    expect(governance?.review_workflow?.reviews?.length).toBeGreaterThan(0);
    expect(governance?.decision_objects?.all?.length).toBeGreaterThan(0);

    expect(core?.explainability_log).toBeTruthy();
    expect(discovery?.candidates?.[0]?.traceability?.hypothesis_origin).toBeTruthy();
    expect(discovery?.candidates?.[0]?.candidate_source_metadata).toBeTruthy();
  });
});
