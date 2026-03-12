> Archived / Historical
> Archived on: 2026-03-09
> Applicable snapshot: pre-credibility-cleanup review cycle
> This file is retained for traceability and does not represent current system status.

# Nova Quant Global Review — Discovery Engine Status

As of 2026-03-08.

## Components Reviewed
- hypothesis registry
- template registry
- candidate generation
- candidate validation
- candidate scoring
- discovery loop

## 1) Hypothesis Registry
**Current state**
- Implemented runtime registry (`src/research/discovery/hypothesisRegistry.js`) with priority scoring.
- Full 100-hypothesis seed exists in materials pack.

**Strength**
- Structured hypothesis objects with economic intuition and regime/asset mapping.

**Weakness**
- Runtime still uses a smaller built-in hypothesis set; not yet fully seed-driven.

## 2) Template Registry
**Current state**
- Implemented runtime template registry (`templateRegistry.js`) with parameter ranges and compatibility constraints.
- Larger template seed library exists separately.

**Strength**
- Reusable templates with explicit entry/exit/risk/sizing structures.

**Weakness**
- Runtime breadth remains narrower than seed library; scaling is still partly manual.

## 3) Candidate Generation
**Current state**
- Implemented guided generation (`candidateGenerator.js`) combining hypothesis + template + features + bounded parameter modes.

**Strength**
- Avoids brute-force explosion.
- Provides traceability and rejection counters.

**Weakness**
- Candidate richness is currently bounded by small active registries.

## 4) Candidate Validation
**Current state**
- Implemented 5-stage pipeline (sanity, quick backtest, robustness, walk-forward style checks, portfolio contribution gate).

**Strength**
- Correct architecture and staged kill logic for weak candidates.

**Weakness**
- Major realism gap: stage metrics are deterministic/proxy-based (hash/noise simulations), not event-level historical replay.

## 5) Candidate Scoring
**Current state**
- Implemented Candidate Quality Score with recommendation outputs.
- Produces promotion decisions and retest/reject buckets.

**Strength**
- Governance-ready scoring object and explicit decisions.

**Weakness**
- Score quality is bounded by proxy validation inputs.

## 6) Discovery Loop
**Current state**
- Discovery orchestration and diagnostics are implemented in `strategyDiscoveryEngine.js` and linked into research core.
- Weekly report includes discovery output snapshots.

**Strength**
- End-to-end traceability from idea to lifecycle recommendation.

**Weakness**
- Still depends heavily on synthetic validation environment; limited persistent run lineage beyond current-cycle objects.

## Can Nova Quant truly generate new candidates today?
**Answer:** Yes, structurally and programmatically it can.

**But:** it still relies too much on manual curation and proxy realism.
- Candidate generation is real.
- Candidate credibility is not yet fully market-replay verified.

## Reviewer Conclusion
Discovery engine is **architecturally credible and operationally active**, but still **research-lab early stage**, not yet institutional-grade autonomous discovery.
