> Archived / Historical
> Archived on: 2026-03-09
> Applicable snapshot: pre-credibility-cleanup review cycle
> This file is retained for traceability and does not represent current system status.

# Remaining Skepticism Points

As of 2026-03-09.

## What a Skeptical Technical Reviewer Will Still Question

1. **Replay coverage breadth**

- Current baseline reports replay-backed strategies: 1/4.
- Question: why are challenger strategies not replay-backed to the same standard as champion paths?

2. **Out-of-sample survival quality**

- Current baseline reports OOS survivors: 0/4.
- Question: does Nova Quant currently have robust deployable edge, or mainly strong process scaffolding?

3. **Portfolio realism depth**

- Portfolio simulation now has crowding guard and stress checks, but expected-return/correlation path remains model-driven.
- Question: how much of portfolio behavior is empirically replayed versus heuristic simulation?

4. **Governance operational proof**

- Governance workflow is enforceable in code and emits formal decisions.
- Question: where is repeated evidence of human reviewer sign-off history across real promotion cycles?

5. **Discovery graduation throughput**

- Discovery can generate/score/diagnose candidates with seed runtime.
- Question: why is promotion throughput still zero in baseline (`promoted_to_shadow=0`)? Is the gate too strict, or candidate quality still weak?

## What Remains Synthetic or Approximate

1. Portfolio covariance/correlation model is still synthetic-heuristic.
2. Some strategy validation paths still fallback to legacy backtest series when no replay series is available.
3. Stress framework scenarios are deterministic and bounded; they are robust for regression but not a substitute for broad empirical replay.

## What Still Lacks Production Credibility

1. No broker/exchange execution adapter proving real order lifecycle behavior end-to-end.
2. Limited multi-strategy replay depth for hard portfolio-level empirical claims.
3. Reviewer workflow is structured but mostly system-generated in artifacts.

## Bottom Line

Nova Quant has credible architecture and discipline. The remaining skepticism is concentrated in **empirical depth**, not in system structure.
