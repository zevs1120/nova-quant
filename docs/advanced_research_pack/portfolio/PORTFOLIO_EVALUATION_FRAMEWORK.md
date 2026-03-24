# Portfolio Evaluation Framework

Last updated: 2026-03-08

This framework defines how Nova Quant judges portfolio quality.

## 1) Core evaluation dimensions

1. Return quality: cost-adjusted return and consistency.
2. Risk quality: drawdown, volatility, tail behavior.
3. Diversification quality: correlation dispersion and marginal contribution.
4. Stability quality: regime robustness and degradation profile.
5. Execution quality: turnover and fill realism.

## 2) Required metrics

- CAGR / total return proxy
- max drawdown
- volatility
- Sharpe/Sortino proxy
- turnover
- hit rate + payoff ratio
- exposure by family
- exposure by asset
- exposure by regime
- drawdown concentration (who caused losses)

## 3) Marginal contribution framework

For each strategy/family, compute:

1. return delta when included/excluded,
2. drawdown delta,
3. volatility delta,
4. diversification delta,
5. turnover delta.

Candidates with weak standalone returns may still be promoted if they improve portfolio robustness.

## 4) Diversification score concept

Use a composite diversification score:

- correlation distance,
- regime payoff complementarity,
- failure-mode independence,
- concentration reduction.

## 5) Drawdown concentration analysis

Track what fraction of drawdown comes from:

- top strategy,
- top family,
- top asset bucket,
- top regime mismatch episodes.

High concentration flags governance risk even with acceptable aggregate return.

## 6) Regime-specific failure analysis

Evaluate portfolio metrics by regime slices:

- identify brittle regime zones,
- identify under-covered regimes,
- recommend family-level rebalancing.

## 7) Decision thresholds (operational defaults)

- Promotion requires non-negative marginal diversification value.
- Portfolio-level drawdown concentration above threshold triggers REDUCE posture.
- Excess turnover with weak incremental return triggers demotion candidate list.

## 8) Consumption in Nova Quant

Primary consumers:

- `src/portfolio_simulation/portfolioSimulationEngine.js`
- `src/research/weekly_cycle/weeklyResearchCycle.js`
- `src/research/copilot/aiResearchCopilot.js`
