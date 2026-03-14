# Nova Quant Research Assistant Tools

Last updated: 2026-03-14

## Purpose

Nova Quant's canonical assistant is no longer only a signal explainer. It now has an explicit
research tool layer that supports factor research, strategy research, validation review, regime
diagnostics, and evidence-aware explanation.

This layer is designed to answer questions like:

- What factors are driving this signal?
- Why is there no signal right now?
- How does momentum behave under different regimes?
- Is this backtest likely to be overfit?
- Does turnover and cost drag make this signal less usable in practice?

## Canonical Design

User-facing AI still routes through:

- `POST /api/chat`

The research layer lives behind the assistant as tools:

- `src/server/research/knowledge.ts`
- `src/server/research/tools.ts`
- `src/server/chat/tools.ts`

The user does not see a second "research AI". Instead, the same Nova Assistant can enter
`research-assistant` mode when the task is research-heavy.

## Research Knowledge Primitives

### Factor taxonomy

Current factor families:

- value
- momentum
- quality
- carry
- low_vol
- liquidity
- size
- seasonality
- reversal
- sentiment
- revision
- breadth

Each factor card includes:

- definition
- common proxies / features
- supported asset classes
- failure modes
- interactions (supports / conflicts)
- holding horizon
- turnover sensitivity
- implementation sensitivity

### Regime taxonomy

Current regime knowledge includes:

- primary regimes from runtime policy:
  - trend
  - range
  - high_volatility
  - risk_off
- combined regimes:
  - uptrend_normal
  - uptrend_high_vol
  - downtrend_normal
  - downtrend_high_vol
  - range_normal
  - range_high_vol
  - stress_risk_off

### Strategy metadata

Strategy metadata is derived from the strategy family registry and includes:

- family name
- template metadata
- supported asset classes
- compatible regimes
- holding horizon
- cost sensitivity assumptions
- validation requirements
- governance hooks

### Research memory objects

The assistant can reference:

- factor cards
- regime taxonomy
- strategy family metadata
- cross-sectional model catalog
- failed-idea registry
- doctrine principles

## Research Tools

Current tool inventory:

- `get_factor_catalog`
- `get_factor_definition`
- `get_factor_interactions`
- `get_factor_research_snapshot`
- `get_strategy_registry`
- `get_regime_taxonomy`
- `get_regime_diagnostics`
- `run_factor_diagnostics`
- `compare_factor_performance_by_regime`
- `get_strategy_evaluation_report`
- `get_validation_report`
- `get_backtest_integrity_report`
- `get_turnover_cost_report`
- `get_signal_evidence`
- `explain_why_signal_exists`
- `explain_why_no_signal`
- `get_experiment_registry`
- `get_research_memory`
- `get_research_workflow_plan`
- `list_failed_experiments`
- `summarize_research_on_topic`

## What Is Measured vs What Is Taxonomy-Guided

Nova Assistant must stay honest.

Measured / runtime-backed examples:

- current signal metadata
- current regime diagnostics from `market_state`
- latest backtest integrity summary
- turnover / cost drag from evidence metrics
- strategy evaluation summaries from the latest canonical evidence run
- experiment registry history from `experiment_registry`
- recent failed experiments from registry when available

Taxonomy-guided / knowledge-backed examples:

- factor interactions
- expected failure modes
- expected regime fit
- model-family strengths and weaknesses

If measured factor-level history is unavailable, the assistant must clearly separate:

- what is observed evidence
- what is taxonomy knowledge

## Output Style

In research mode, the assistant should default to:

- `VERDICT`
- `PLAN`
- `WHY`
- `RISK`
- `EVIDENCE`

The `PLAN` section should explicitly say whether the idea is worth:

- deeper research only
- backtest
- replay
- paper

## Current Boundaries

What is already usable:

- factor/strategy/regime knowledge retrieval
- signal-level factor diagnostics
- no-signal explanation
- strategy evaluation report objects
- validation report objects
- research workflow planning
- experiment registry memory view
- integrity / turnover / cost review
- failed experiment surfacing

What is still partial:

- factor-level realized performance history
- deeper PBO / deflated Sharpe style diagnostics
- richer cross-sectional model evaluation objects
- stricter structured tool-calling schemas

The current design is intentionally honest: when measured evidence is missing, Nova should say so
instead of hallucinating a stronger research record than the system actually has.
