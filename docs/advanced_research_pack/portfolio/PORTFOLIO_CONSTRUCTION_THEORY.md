# Portfolio Construction Theory

Last updated: 2026-03-08

This document defines portfolio-level intelligence standards for Nova Quant.

## 1) Single-strategy success is insufficient

A strategy can look good in isolation and still hurt portfolio quality due to:
- correlation overlap,
- synchronized drawdowns,
- turnover drag,
- regime concentration.

Promotion decisions must include portfolio marginal value, not only standalone metrics.

## 2) Multi-strategy interaction logic

Portfolio assembly must account for:
1. family-level behavior diversity,
2. horizon diversity,
3. regime-specific interaction,
4. cost interaction under stress.

## 3) Correlation-aware allocation

Allocate capital using correlation-adjusted conviction:
- high correlation cluster -> reduce incremental sizing,
- low correlation high-quality candidate -> allow diversification premium.

## 4) Diversification vs fake diversification

True diversification:
- distinct risk drivers,
- distinct failure conditions,
- different regime payoffs.

Fake diversification:
- many symbols but same beta/risk factor,
- many templates but same trigger mechanics.

## 5) Exposure clustering controls

Track clustering across:
- asset class,
- sector/theme,
- direction,
- family,
- regime sensitivity.

Use concentration caps to prevent hidden one-factor portfolios.

## 6) Regime-aware portfolio posture

Portfolio posture should adapt by regime:
- trend: allow selective expansion in momentum + relative strength.
- range: favor reversion/selective spread structures.
- high volatility: reduce gross exposure; emphasize execution realism.
- risk-off: preserve capital and prioritize no-trade guidance.

## 7) Family concentration risk

Set upper bounds per family to avoid overdependence.
Even strong families should be size-capped when regime confidence is low.

## 8) Capital efficiency

Capital must be allocated where expected incremental utility is highest:
- better risk-adjusted contribution,
- better diversification contribution,
- better operational reliability.

## 9) Turnover and friction at portfolio level

Portfolio turnover is not linear in strategy count.
Combined strategy interactions can create hidden churn and fee drag.
Portfolio simulation should include turnover impact diagnostics and stress scenarios.

## 10) Operational implication

`src/portfolio_simulation/portfolioSimulationEngine.js` should prioritize:
- contribution-aware sizing,
- concentration-aware caps,
- regime posture multipliers,
- diagnostics for cluster risk and marginal impact.
