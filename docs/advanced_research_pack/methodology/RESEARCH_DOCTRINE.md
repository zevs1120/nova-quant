# Research Doctrine

Last updated: 2026-03-08

This doctrine governs all Nova Quant research and strategy decisions.

## Core doctrine statements

1. Robustness over in-sample beauty.
2. Transparency over black-box magic.
3. Controlled risk over signal volume.
4. Portfolio usefulness over isolated strategy metrics.
5. Fast rejection of weak hypotheses.
6. Regime awareness over static assumptions.
7. Cost-aware realism over gross-return vanity.
8. Governance discipline over ad hoc promotion.

## Mandatory design commitments

1. Every strategy must be traceable from hypothesis to governance action.
2. Every promoted strategy must pass out-of-sample and cost-stress checks.
3. Every production recommendation must include invalidation conditions.
4. Every no-trade decision is a first-class output, not a missing signal.
5. Every major module change must update project memory/logs.

## Anti-patterns to avoid

- Parameter farming with no new intuition.
- Regime-agnostic deployment.
- Overreliance on one family during style concentration.
- Suppressing warnings to preserve short-term headline metrics.
- Treating copilot narratives as evidence.

## Governance interpretation of doctrine

- DRAFT: hypothesis plausibility only.
- SHADOW: evidence gathering under realistic constraints.
- CANARY: controlled exposure with strict monitoring.
- PROD: only for stable, diversified, and explainable candidates.
- RETIRED: default outcome for persistent degradation.

## Enforcement hooks in codebase

- Discovery gating: `src/research/discovery/candidateValidation.js`
- Governance state logic: `src/research/core/strategyGovernanceV2.js`
- Evidence quality checks: `src/research/evidence/evidenceSystem.js`
- Weekly controls: `src/research/weekly_cycle/weeklyResearchCycle.js`
