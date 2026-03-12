# Anti-Overfitting Patterns

Last updated: 2026-03-08

This document catalogs common overfitting and pseudo-robustness traps.

## 1) Parameter peak chasing

- Pattern: selecting a tiny high-performing parameter point.
- Symptom: neighboring parameters degrade sharply.
- Control: neighborhood stability requirement and sensitivity heatmap checks.

## 2) Threshold over-optimization

- Pattern: repeatedly tightening/loosening thresholds to fit recent data.
- Symptom: unstable trade density and oscillating performance.
- Control: bounded threshold adjustments + shadow evidence review.

## 3) Signal starvation masquerading as precision

- Pattern: extremely low trade count interpreted as "high quality".
- Symptom: high headline metrics with low statistical credibility.
- Control: minimum sample constraints and funnel-density diagnostics.

## 4) Regime concentration trap

- Pattern: most performance concentrated in one regime.
- Symptom: severe drawdown when regime changes.
- Control: regime-sliced score floors and posture-aware suppression.

## 5) Cost-blind edge

- Pattern: positive gross returns but negative net returns.
- Symptom: turnover-heavy strategy collapses after slippage stress.
- Control: mandatory cost sensitivity stage before promotion.

## 6) Fill realism illusion

- Pattern: assuming perfect execution in low-liquidity conditions.
- Symptom: backtest-to-paper conversion gap grows.
- Control: fill-probability and liquidity-stress constraints.

## 7) Low-sample illusion

- Pattern: making strong conclusions from too few events.
- Symptom: unstable confidence and high variance outcomes.
- Control: sample-size floor and confidence penalty.

## 8) Spurious diversification

- Pattern: many strategies that share same risk driver.
- Symptom: simultaneous drawdown spikes.
- Control: correlation cluster checks and family concentration caps.

## 9) Data leakage / alignment drift

- Pattern: future information accidentally enters features or labels.
- Symptom: unrealistically strong historical performance.
- Control: strict timestamp alignment and leakage-sensitive manifest controls.

## 10) Re-optimization addiction

- Pattern: frequent re-tuning to rescue weak strategy.
- Symptom: unstable production behavior and weak persistence.
- Control: governed re-optimization schedule and rollback trigger.
