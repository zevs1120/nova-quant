# Advanced Knowledge Synthesis

Last updated: 2026-03-08

This synthesis explains how the advanced knowledge pack upgrades Nova Quant's research maturity.

## 1) New higher-order capabilities now encoded

Nova Quant now has explicit doctrine for:
- alpha research methodology,
- portfolio construction intelligence,
- anti-overfitting and validation discipline,
- decay/drift monitoring,
- quant/product failure-mode management,
- governance-grade audit standards,
- weekly/monthly research operations.

This upgrades the platform from "component-complete" to "policy-aware and review-ready".

## 2) How this should change Strategy Discovery Engine

Discovery should now:
1. prioritize hypothesis quality over parameter breadth,
2. enforce diversity-aware candidate generation,
3. penalize low-density and fragile candidates earlier,
4. use failure-mode priors when selecting weekly hypothesis clusters,
5. emit governance-ready evidence artifacts by default.

Priority modules:
- `src/research/discovery/strategyDiscoveryEngine.js`
- `src/research/discovery/candidateGenerator.js`
- `src/research/discovery/candidateValidation.js`
- `src/research/discovery/candidateScoring.js`

## 3) How this should change Validation Framework

Validation should adopt doctrine-controlled gates:
- stricter sample and stability floors,
- regime-sliced viability as hard criteria,
- stronger cost/fill realism stress,
- explicit fragility and decay labels.

Priority modules:
- `src/research/core/walkForwardValidation.js`
- `src/research/discovery/candidateValidation.js`

## 4) How this should change Portfolio Simulator

Portfolio simulation should incorporate:
- diversification score as first-class output,
- drawdown concentration attribution,
- family concentration controls,
- regime posture-aware capital allocation,
- turnover cost diagnostics under stress.

Priority module:
- `src/portfolio_simulation/portfolioSimulationEngine.js`

## 5) How this should change Strategy Governance

Governance should move from metric thresholding to evidence standards:
- checklist-based promotion review,
- stage-specific evidence minimums,
- explicit rollback and retirement policy triggers,
- version comparison with marginal contribution logic.

Priority modules:
- `src/research/core/strategyGovernanceV2.js`
- `src/research/evidence/evidenceSystem.js`
- `src/research/weekly_cycle/weeklyResearchCycle.js`

## 6) How this improves technical due diligence readiness

Due-diligence posture improves by adding:
- explicit doctrine and standards,
- auditable promotion criteria,
- formal failure-mode taxonomy,
- operating cadence definitions,
- machine-readable policy seeds for deterministic enforcement.

This reduces "prototype risk" and improves external reviewer trust.

## 7) Modules still below advanced standard

1. Validation still relies partly on synthetic/proxy assumptions instead of full event-level replay.
2. Portfolio simulator remains deterministic in parts and needs richer historical scenario replay.
3. Governance reviewer workflow is still mostly system-generated.
4. Product-layer explanation quality audits are not yet fully automated.
5. Seed doctrines are documented but not yet fully wired into runtime enforcement.

## 8) Operationalization sequence (recommended)

1. Wire seed JSON policies into discovery/validation/governance constructors.
2. Add checklist scoring to promotion pipeline.
3. Add portfolio evaluation seed-driven diagnostics to weekly cycle.
4. Add failure-mode priors into copilot recommendation ranking.
5. Add monthly growth review artifact generation.
