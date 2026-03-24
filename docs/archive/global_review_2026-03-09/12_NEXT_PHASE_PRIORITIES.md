> Archived / Historical
> Archived on: 2026-03-09
> Applicable snapshot: pre-credibility-cleanup review cycle
> This file is retained for traceability and does not represent current system status.

# Nova Quant Global Review — Next Phase Priorities

As of 2026-03-08.

## Priority 1 — Replace Synthetic Validation Paths with Real Replay

**Why**
This is the single biggest credibility blocker.

**What to do next**

- Replace synthetic shadow forward path with bar-joined realized outcomes.
- Upgrade discovery quick-backtest and robustness stages to consume replayed market bars.
- Add reproducible validation artifacts per run (inputs, assumptions, outputs).

## Priority 2 — Harden Cost/Fill Realism and Paper/Backtest Consistency

**Why**
Without execution realism, performance and governance conclusions remain fragile.

**What to do next**

- Introduce venue-aware fee/slippage presets and stress scenarios.
- Track funnel stages from executable -> entered -> filled -> roundtrip with strict event audit.
- Add explicit backtest-vs-paper divergence diagnostics by strategy/day/regime.

## Priority 3 — Operationalize Governance Workflow (Human-in-the-Loop)

**Why**
Current decisions are mostly system-generated; institutional credibility requires review governance.

**What to do next**

- Require reviewer identity/sign-off for promotions/demotions.
- Generate promotion memos with linked evidence bundles.
- Enforce checklist pass/fail gates before stage transitions.

## Priority 4 — Make Discovery Truly Seed-Driven and Self-Improving

**Why**
Research materials are strong but not fully operationally consumed.

**What to do next**

- Load hypothesis/template seed libraries as default runtime inputs.
- Track per-hypothesis yield, rejection patterns, and retirement of low-value clusters.
- Connect failure-mode/doctrine seeds into automated validation rejection tags.

## Priority 5 — Increase DD Credibility Through Deeper Testing and Metrics

**Why**
Current tests prove structure, not deep empirical robustness.

**What to do next**

- Add regression tests for replayed validation and governance transitions.
- Add scenario/stress suites (volatility shock, liquidity shock, correlation spike).
- Add objective quality KPIs for copilot recommendations and opportunity outcomes.

## Outcome Target for Next Milestone

Nova Quant should move from “well-architected early platform” to “empirically credible early research platform” with:

- replay-based evidence,
- enforceable governance,
- and materially stronger validation realism.
