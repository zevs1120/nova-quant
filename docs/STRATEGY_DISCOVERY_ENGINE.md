# Strategy Discovery Engine

Last updated: 2026-03-09

## 1. Purpose

The Strategy Discovery Engine upgrades Nova Quant from static strategy configuration into a recurring, structured alpha hypothesis research pipeline.

Mission:

- generate candidate strategies from explicit hypotheses,
- reject fragile variants quickly,
- promote robust candidates to `SHADOW` with traceability,
- keep discovery auditable and explainable.

This engine is **not** brute-force parameter optimization.
It is guided discovery based on hypothesis + template + feature compatibility.

## 2. Baseline Audit Before Implementation

### What already existed

- Strategy family registry and template metadata: `src/research/core/strategyFamilies.js`
- Regime engine with compatibility policy: `src/research/core/regimeEngineV2.js`
- Risk bucket system: `src/research/core/riskBucketSystem.js`
- Signal funnel and shadow log diagnostics:
  - `src/research/core/signalFunnelDiagnosticsV2.js`
  - `src/research/core/shadowOpportunityLog.js`
- Walk-forward validation baseline: `src/research/core/walkForwardValidation.js`
- Strategy governance lifecycle: `src/research/core/strategyGovernanceV2.js`

### Missing components identified

1. No explicit hypothesis registry.
2. No dedicated template registry for discovery-oriented candidate generation.
3. No structured candidate generation module.
4. No staged candidate validation pipeline from sanity to portfolio contribution.
5. No candidate quality scoring framework.
6. No periodic discovery loop object with promotion decisions.
7. No discovery diagnostics to measure hypothesis/family success rates.
8. No complete discovery traceability object from hypothesis to decision.

## 3. Implemented Architecture

The engine is implemented under `src/research/discovery/`.

### Layer A: Hypothesis Layer

- Module: `hypothesisRegistry.js`
- Output: `hypothesis_registry`
- Runtime source: seed-first from `data/reference_seeds/hypothesis_registry_seed.json` (legacy fallback retained)
- Includes:
  - `hypothesis_id`
  - `description`
  - `economic_intuition`
  - `relevant_asset_classes`
  - `relevant_regimes`
  - `candidate_strategy_families`
  - `expected_holding_horizon`
  - `supporting_features`
  - `discovery_priority_score`

### Layer B: Template Layer

- Module: `templateRegistry.js`
- Output: `template_registry`
- Runtime source: seed-first from `data/reference_seeds/strategy_template_seed.json` (legacy fallback retained)
- Includes reusable template contracts:
  - entry/exit/risk/sizing logic structures,
  - compatible features,
  - parameter ranges,
  - market + regime compatibility.

### Layer C: Candidate Generation Layer

- Module: `candidateGenerator.js`
- Output: `candidate_generation`
- Guided generation rule:
  - `hypothesis + template + feature overlap + bounded parameter modes`
- Runtime seed consumption:
  - feature catalog alignment (`feature_catalog_seed.json`)
  - doctrine/checklist metadata linkage (`research_doctrine_seed.json`, `governance_checklist_seed.json`)
- Parameter modes:
  - `base`
  - `conservative`
  - `exploratory`
  - `regime_tuned`
- Controlled limits prevent combinatorial explosion.
- Supports runtime constraints:
  - market
  - asset class
  - regime
  - family
  - trade horizon
  - risk profile
  - discovery batch size

### Layer D: Candidate Evaluation Layer

- Modules:
  - `candidateValidation.js`
  - `candidateScoring.js`
  - `discoveryDiagnostics.js`
- Output blocks:
  - `candidate_validation`
  - `candidate_scoring`
  - `candidate_diagnostics`

## 4. Validation Pipeline

Every candidate passes through 5 stages:

1. `stage_1_fast_sanity`

- trade frequency realism
- turnover realism
- leverage dependence
- sparse-signal rejection

2. `stage_2_quick_backtest`

- return
- drawdown
- Sharpe proxy
- turnover
- average holding time
- fees/slippage-aware post-cost output

3. `stage_3_robustness_tests`

- parameter perturbation stability
- regime-segment stability
- cost stress (`+25%`, `+50%`)
- slippage shock

4. `stage_4_walkforward`

- rolling window out-of-sample proxy
- positive window ratio
- degradation check

5. `stage_5_portfolio_contribution`

- diversification contribution
- independent alpha proxy
- portfolio improvement gate

Candidates failing any stage are rejected with structured reasons.

## 5. Candidate Quality Score

Implemented in `candidateScoring.js`.

Components:

- Performance score
- Robustness score
- Regime stability score
- Diversification score
- Cost sensitivity score
- Parameter stability score

Weighted formula:

`0.26*performance + 0.20*robustness + 0.16*regime_stability + 0.14*diversification + 0.12*cost_sensitivity + 0.12*parameter_stability`

Decision mapping:

- `>= 0.86` -> `PROMOTE_TO_SHADOW`
- `0.74 - 0.8599` -> `HOLD_FOR_RETEST`
- `< 0.74` or failed validation -> `REJECT`

## 6. Discovery Loop Workflow

Implemented in `strategyDiscoveryEngine.js`.

Cycle:

1. analyze existing production strategies
2. identify performance decay
3. identify signal starvation
4. select hypotheses
5. generate candidates
6. run validation pipeline
7. rank candidates
8. promote best to `SHADOW`
9. update discovery diagnostics/log objects

Integrated into research core:

- `src/research/core/researchCoreUpgrade.js`
- Output key: `research.research_core.strategy_discovery_engine`

## 7. Discovery Diagnostics

Implemented in `discoveryDiagnostics.js`.

Tracks:

- candidates generated per hypothesis
- pass and promotion rates by hypothesis
- discovery by regime
- discovery by asset class
- top rejection reasons
- recurring family failures
- coverage gaps
- seed runtime diagnostics:
  - hypotheses producing candidates
  - templates used most
  - unused hypotheses/templates
  - mapping failures

Primary questions answered:

- which hypotheses produce robust candidates?
- which families repeatedly fail?
- which regimes or asset classes are under-covered?

## 8. Traceability Contract

Every candidate now carries:

- hypothesis origin
- template origin
- feature set
- parameter set + parameter-space reference
- validation metrics
- rejection reasons
- promotion decision

Discovery decisions are emitted as first-class objects:

- `discovery_decision_id`
- `candidate_id`
- `decision`
- `from_stage`
- `to_stage`
- `metrics_summary`
- `rationale`
- `created_at`

## 9. Current Limits

1. Candidate quick backtest/robustness metrics are simulation proxies, not full market replay.
2. Portfolio contribution is a calibrated proxy pending tighter integration with portfolio simulation.
3. Promotion reviewer remains `system-generated`; human approval workflow can be layered later.

## 10. Module Map

- `src/research/discovery/hypothesisRegistry.js`
- `src/research/discovery/templateRegistry.js`
- `src/research/discovery/candidateGenerator.js`
- `src/research/discovery/candidateValidation.js`
- `src/research/discovery/candidateScoring.js`
- `src/research/discovery/discoveryDiagnostics.js`
- `src/research/discovery/strategyDiscoveryEngine.js`
- `src/research/discovery/index.js`
