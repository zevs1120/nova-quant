> Archived / Historical
> Archived on: 2026-03-09
> Applicable snapshot: pre-credibility-cleanup review cycle
> This file is retained for traceability and does not represent current system status.

# Nova Quant Global Review — Risk & Governance Status

As of 2026-03-08.

## 1) User Risk Profiles

**Current state**

- Implemented in `riskBucketSystem.js` with conservative/balanced/active/aggressive buckets.
- Includes exposure caps, correlated exposure caps, concentration limits, daily loss limits, drawdown thresholds, and concurrent trade caps.

**Assessment**

- Strong for early platform maturity.
- Rules are explicit and explainable.

## 2) Portfolio Risk Budgets

**Current state**

- Portfolio-level constraints are computed and checked against active signal set.
- Concentration by market/asset class and correlated theme exposure are included.

**Assessment**

- Useful and practical.
- Correlation and concentration logic remains mostly heuristic vs full covariance/risk model.

## 3) Trade-Level Risk Buckets

**Current state**

- A/B/experimental/blocked quality buckets are implemented.
- Position sizing uses quality, user risk, and regime multipliers.
- Decision objects include allow/reduce/block rationale.

**Assessment**

- Good explainability and user-facing actionability.
- Bucket classification thresholds are rule-based and may need empirical recalibration.

## 4) Strategy Lifecycle Governance

**Current state**

- Lifecycle stages implemented (`DRAFT`, `SHADOW`, `CANARY`, `PROD`, `DEGRADE`, `RETIRE`).
- Stage policies, promotion/demotion rules, and rollback planning are present.

**Assessment**

- Governance architecture is credible and reviewable.
- Human-in-the-loop workflow (reviewer identity, formal sign-off, memo enforcement) remains lightweight.

## 5) Promotion / Demotion / Retirement Logic

**Current state**

- Decisions are emitted as first-class objects with rationale.
- Discovery and governance both produce stage movement decisions.

**Assessment**

- Strong object model for auditability.
- Many decisions are still `system-generated`; governance process maturity is below institutional standard.

## Disciplined system or signal generator?

Nova Quant now behaves more like a **disciplined governed system** than a raw signal feed:

- risk boundaries are explicit,
- no-trade outcomes are valid outputs,
- stage transitions are codified.

Remaining skepticism point:

- governance discipline is stronger in code structure than in operational review workflow.
