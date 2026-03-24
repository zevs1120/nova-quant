# Validation Doctrine

Last updated: 2026-03-08

This doctrine defines production-grade validation standards for Nova Quant.

## 1) Why naive backtests are insufficient

Naive backtests often ignore:

- regime shifts,
- realistic costs,
- slippage/fill constraints,
- parameter fragility,
- data availability limits.

Any strategy passing only naive backtest stays in DRAFT.

## 2) Walk-forward philosophy

Validation must use rolling windows with strict temporal separation.
Goals:

- estimate performance stability over time,
- detect decay early,
- avoid one-period overfitting.

## 3) Out-of-sample discipline

Promotion evidence must be primarily out-of-sample.
In-sample performance is considered hypothesis support only.

## 4) Cost sensitivity doctrine

Every candidate must be stress-tested under:

- base cost assumptions,
- harsher slippage assumptions,
- fee/funding stress.

If edge disappears under moderate stress, candidate is not production-ready.

## 5) Parameter stability doctrine

Prefer broad stable parameter neighborhoods.
Reject candidates where tiny parameter changes collapse performance.

## 6) Regime-sliced validation

Evaluate metrics by regime to identify:

- conditional edge,
- regime mismatch failure,
- concentration risk.

## 7) Capacity and execution realism

Validation must include:

- realistic fill probability assumptions,
- liquidity filters,
- turnover constraints,
- unavailable data handling.

## 8) Degradation monitoring

After promotion, monitor:

- recent-vs-historical delta,
- rising drawdown asymmetry,
- conversion drop across funnel stages,
- cost drift.

## 9) Beautiful backtest warning

A strategy with smooth historical equity but poor realism controls is a high-risk false positive.
Default action: keep in SHADOW or reject.

## 10) Current module mapping

- Walk-forward + sensitivity: `src/research/core/walkForwardValidation.js`
- Discovery validation stages: `src/research/discovery/candidateValidation.js`
- Governance promotion checks: `src/research/core/strategyGovernanceV2.js`
