> Archived / Historical
> Archived on: 2026-03-09
> Applicable snapshot: pre-credibility-cleanup review cycle
> This file is retained for traceability and does not represent current system status.

# Nova Quant Global Review — Portfolio Intelligence Status

As of 2026-03-08.

## 1) Portfolio Simulation
**Current state**
- Portfolio simulation engine is implemented (`src/portfolio_simulation/portfolioSimulationEngine.js`).
- Supports multi-strategy rows, allocation normalization, regime-aware multipliers, and risk-cap integration.

**Strength**
- Nova Quant is no longer only signal-level; it has portfolio-level objects and diagnostics.

**Gap**
- Returns/volatility/correlation behavior is deterministic proxy-driven, not full event-level realized portfolio replay.

## 2) Diversification Analysis
**Current state**
- Diversification score, HHI concentration, and average pairwise correlation are generated.

**Strength**
- Useful for governance and allocation review.

**Gap**
- Correlation matrix is synthetic family/market-aware logic with deterministic noise, not historical covariance estimation.

## 3) Strategy Correlation
**Current state**
- Strategy correlation matrix output exists.

**Strength**
- Provides interpretable relative overlap view.

**Gap**
- Correlation realism is limited; likely optimistic/unstable under true market stress conditions.

## 4) Concentration Risk
**Current state**
- Exposure breakdowns by strategy family, asset, and regime are provided.
- Marginal strategy impact diagnostics are available.

**Strength**
- Strong early-stage diagnostics surface.

**Gap**
- Concentration and marginal impact rely on simulated expected-return inputs.

## 5) Regime-Aware Allocation
**Current state**
- Allocation multipliers adapt to regime posture (`GO`, `REDUCE`, `SKIP`) and governance stage.

**Strength**
- Correct conceptual behavior for a decision platform.

**Gap**
- Regime-aware allocation has not been deeply validated against realized cross-regime portfolio performance.

## Portfolio Intelligence Verdict
Nova Quant has **meaningfully progressed from signal-level logic to portfolio-level intelligence scaffolding**.

It is credible for early research and product explanation, but not yet credible for hard capital-allocation claims under strict institutional scrutiny.
