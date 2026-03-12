# Portfolio Simulation Engine

Last updated: 2026-03-08

## Purpose

Nova Quant portfolio simulation evaluates portfolio-level behavior, not only single-signal outputs.

The engine simulates:

- multi-strategy portfolios
- multi-asset exposure mixes
- risk-budget-aware allocations

## Module

- Runtime implementation: `src/portfolio_simulation/portfolioSimulationEngine.js`
- Review-layer entrypoint: `portfolio_simulation/index.js`
- Research core output key: `research.research_core.portfolio_simulation_engine`

## Simulation Method

1. Build strategy rows from evidence records that are not rejected/retired.
2. Derive expected return, volatility, turnover, and quality per row.
3. Apply regime posture multiplier and risk bucket exposure caps.
4. Allocate capital by quality-weighted normalized weights.
5. Build strategy correlation matrix (family/market-aware with deterministic noise).
6. Estimate portfolio volatility via weighted covariance.
7. Simulate equity path for drawdown and stability diagnostics.

## Outputs

Core metrics:

- `portfolio_return`
- `drawdown`
- `sharpe`
- `volatility`
- `turnover`

Exposure breakdowns:

- `exposures.by_strategy_family`
- `exposures.by_asset`
- `exposures.by_regime`

Diagnostics:

- `diversification_contribution`
- `marginal_strategy_impact`
- `strategy_correlation_matrix`
- `portfolio_stability_across_regimes`

## Diversification Measurement

Diversification score combines:

- concentration (HHI)
- average pairwise strategy correlation

Higher score = lower concentration and lower average correlation.

## Use in Governance

Simulation outputs can be used for:

- candidate promotion risk checks,
- concentration warnings,
- family-level allocation reviews,
- regime stress stability checks.

## Current Limitations

- Uses simulation-proxy expected returns/volatility from evidence objects.
- Not yet a full event-level execution replay simulator.

It is suitable for architecture-level due diligence and iterative research governance, not final production PnL claims.
