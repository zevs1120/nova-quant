# Alpha Research Methodology

Last updated: 2026-03-08

This document defines higher-order research methodology for Nova Quant.

## 1) What makes a hypothesis worth testing

A hypothesis is worth research effort only if all conditions hold:
1. It has economic or market-structure intuition.
2. It maps to reusable templates, not one-off code logic.
3. It has observable feature hooks from available data contracts.
4. It has a plausible execution path after costs and slippage.
5. It has potential portfolio contribution, not just standalone Sharpe.

Reject hypotheses that are pure pattern-mining without causal interpretation.

## 2) Intuition vs overfitting

- Valid intuition: explains who is forced to trade, why flow persists/reverses, and in which regimes.
- Overfitting behavior: thresholds tuned to historical artifacts with no repeatable mechanism.

Research standard:
- describe expected failure conditions before first backtest;
- define invalidation triggers up front;
- prefer broad robust parameter zones over narrow local peaks.

## 3) Strategy diversity vs parameter duplication

True diversity:
- different families,
- different horizon behavior,
- different regime dependence,
- different cost sensitivity.

Fake diversity:
- same template with many near-identical parameter sets,
- multiple variants that collapse under correlation stress.

Discovery should optimize diversity-adjusted contribution, not candidate count.

## 4) Feature relevance vs feature clutter

Use only features that have a role in hypothesis logic:
- trigger,
- filter,
- risk sizing,
- exit control.

Feature clutter symptoms:
- many inputs with weak marginal explanatory power,
- unstable outcomes when minor features are removed,
- frequent null-spike sensitivity.

## 5) Why trade density matters

Insufficient density causes:
- weak statistical confidence,
- unstable governance decisions,
- poor product continuity.

Excessive density causes:
- overtrading risk,
- turnover drag,
- degraded signal quality.

Target: quality-controlled density consistent with regime and user posture.

## 6) Fragile edge recognition

Edge is fragile if it depends on:
- one regime slice only,
- one narrow parameter point,
- one short historical period,
- unrealistic fill/cost assumptions.

Fragility must block promotion even when in-sample metrics look attractive.

## 7) Signal quality is not win rate

Evaluate signal quality by a basket:
- expectancy after costs,
- drawdown behavior,
- tail risk,
- opportunity conversion realism,
- portfolio diversification impact.

Low win rate can still be acceptable if payoff asymmetry and risk discipline are strong.

## 8) Holding horizon alignment

Hypothesis, features, risk sizing, and product messaging must align on horizon.
Misalignment examples:
- intraday logic sold as multi-day conviction,
- multi-day setups sized with intraday risk assumptions.

Every candidate must carry explicit horizon contract.

## 9) Regime-conditioned validity

No strategy is universally valid. Each hypothesis must declare:
- compatible regimes,
- suppressed regimes,
- expected density profile by regime,
- posture recommendation (GO/REDUCE/SKIP).

## 10) Production realism doctrine

Research outputs are credible only if:
1. data freshness and coverage are valid,
2. execution assumptions are plausible,
3. risk constraints are respected,
4. governance trail is complete,
5. failure modes are explicitly monitored.

A "beautiful" backtest without production realism is treated as research draft only.
