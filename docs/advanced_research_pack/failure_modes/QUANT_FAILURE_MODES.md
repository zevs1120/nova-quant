# Quant Failure Modes

Last updated: 2026-03-08

This document lists practical failure patterns in quant research platforms.

## 1) Too few trades

- Failure: insufficient sample and weak product continuity.
- Typical causes: over-strict filters, small universe, stale features.
- Control: funnel diagnostics + shadow opportunity analysis.

## 2) Too many similar strategies

- Failure: fake diversification and clustered drawdowns.
- Typical causes: parameter duplication within same family.
- Control: correlation-aware governance and family concentration caps.

## 3) Fragile edge

- Failure: performance collapses under slight parameter/regime changes.
- Typical causes: overfitting and threshold tuning.
- Control: stability doctrine and robustness score gating.

## 4) Unrealistic fills

- Failure: paper/backtest divergence and false confidence.
- Typical causes: optimistic fill assumptions.
- Control: execution realism checks and conversion diagnostics.

## 5) Cost blindness

- Failure: gross-positive but net-negative strategies promoted.
- Typical causes: ignoring slippage/fees/funding sensitivity.
- Control: mandatory cost stress in validation.

## 6) Hidden concentration

- Failure: portfolio behaves like one macro bet.
- Typical causes: exposure clustering across assets/families.
- Control: portfolio contribution and concentration diagnostics.

## 7) Regime mismatch

- Failure: strategy active in incompatible regimes.
- Typical causes: weak regime gating and confidence misuse.
- Control: regime compatibility checks + posture multipliers.

## 8) Overconfident sizing

- Failure: drawdown acceleration from sizing errors.
- Typical causes: ignoring correlation and risk-bucket constraints.
- Control: multi-layer risk bucket system and size-down logic.

## 9) Low-quality discovery output

- Failure: discovery engine emits many weak candidates.
- Typical causes: hypothesis/template mismatch, weak sanity filters.
- Control: stricter pre-validation and rejection reason analytics.

## 10) Governance inertia

- Failure: weak strategies remain active too long.
- Typical causes: no retirement discipline, weak decay monitoring.
- Control: explicit demotion/retirement triggers and audit trail.
