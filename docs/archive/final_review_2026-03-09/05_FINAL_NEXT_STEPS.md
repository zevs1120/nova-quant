> Archived / Historical
> Archived on: 2026-03-09
> Applicable snapshot: pre-credibility-cleanup review cycle
> This file is retained for traceability and does not represent current system status.

# Final Next Steps (Post A-minus Upgrade Phase)

As of 2026-03-09.

## Priority 1 — Expand Replay-Backed Validation Coverage
**Why**
This is the largest remaining credibility bottleneck.

**Implement next**
1. Build per-strategy replay adapters so challengers inherit real replay evaluation where signal definitions are compatible.
2. Add replay coverage KPI in governance gate (`replay_coverage_ratio`) and block promotion when below threshold.
3. Persist replay artifacts per strategy run for DD replay reproducibility.

**Success criteria**
- Replay-backed strategies >= 70% of active governed set.
- Governance records include replay coverage pass/fail reason.

## Priority 2 — Portfolio Engine Empirical Mode
**Why**
Current portfolio logic is solid but still partly heuristic.

**Implement next**
1. Add historical covariance estimator from replayed strategy return paths.
2. Add event-driven portfolio replay mode using trade lifecycle outputs.
3. Compare heuristic mode vs empirical mode and surface divergence diagnostics.

**Success criteria**
- Portfolio report includes `mode=empirical_replay` and `mode=heuristic` comparisons.
- Correlation and drawdown claims become empirically sourced in default DD report.

## Priority 3 — Discovery-to-Governance Graduation Throughput
**Why**
Discovery quality is high, but promotions are currently too sparse in baseline runs.

**Implement next**
1. Add calibrated acceptance bands (`promote`, `hold`, `reject`) tied to regime and replay coverage.
2. Add candidate retest queue with bounded parameter neighborhood retries.
3. Add weekly promotion pipeline report with explicit blockers per candidate family.

**Success criteria**
- Non-zero promotion throughput under strict criteria.
- Clear audit trail for why candidates fail or progress.

## Priority 4 — Human Review Operationalization
**Why**
Institutional credibility needs repeated reviewer-driven approvals, not only system-generated records.

**Implement next**
1. Add reviewer identity source and signed memo linkage.
2. Enforce unresolved-concern resolution before CANARY->PROD transition.
3. Add governance dashboard artifact for external DD walkthrough.

**Success criteria**
- Promotion records include reviewer identity and memo reference.
- At least one full human-reviewed lifecycle path demonstrated.

## Priority 5 — Engineering DD Final Polish
**Why**
Core quality is strong; final polish increases confidence.

**Implement next**
1. Add CI workflow for tests + stress report generation.
2. Add bundle/performance optimization pass for frontend build warning.
3. Add deterministic snapshot tests for final review artifacts.

**Success criteria**
- CI green gate for merge-ready state.
- Final review package reproducible from one command.
