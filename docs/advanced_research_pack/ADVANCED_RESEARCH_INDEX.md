# Advanced Research Pack Index

Last updated: 2026-03-23

This index is the master entry for Nova Quant's higher-order research knowledge pack.

For repository layout and where code lives, see [`../REPOSITORY_OVERVIEW.md`](../REPOSITORY_OVERVIEW.md).

## Purpose

The base research materials layer gives Nova Quant raw inputs (universes, hypotheses, templates, features, questions).
This advanced pack adds doctrine and operating standards so those inputs are used with professional rigor.

## Knowledge Domains and Files

## Methodology
- `methodology/ALPHA_RESEARCH_METHODOLOGY.md`
  - Teaches how to form, test, and reject alpha ideas with production realism.
  - Should influence: `src/research/discovery/*`, `src/research/core/featureSignalLayer.js`.
- `methodology/RESEARCH_DOCTRINE.md`
  - Defines non-negotiable research principles for Nova Quant.
  - Should influence: discovery gating, validation thresholds, governance decisions.

## Portfolio Intelligence
- `portfolio/PORTFOLIO_CONSTRUCTION_THEORY.md`
  - Defines portfolio-level design logic across strategies/families/regimes.
  - Should influence: `src/portfolio_simulation/portfolioSimulationEngine.js` (and review notes under `portfolio_simulation/`), risk allocation rules.
- `portfolio/PORTFOLIO_EVALUATION_FRAMEWORK.md`
  - Defines portfolio-quality scoring and failure analysis.
  - Should influence: weekly cycle reports and copilot portfolio diagnostics.

## Validation Doctrine
- `validation/VALIDATION_DOCTRINE.md`
  - Canonical validation standard beyond naive backtest.
  - Should influence: `src/research/discovery/candidateValidation.js`, `src/research/core/walkForwardValidation.js`.
- `validation/ANTI_OVERFITTING_PATTERNS.md`
  - Trap catalog and mitigation controls.
  - Should influence: candidate rejection reasons and stability checks.
- `validation/STRATEGY_DECAY_AND_REGIME_DRIFT.md`
  - Decay detection and regime-drift interpretation framework.
  - Should influence: lifecycle demotion/retirement logic and deterioration alerts.

## Failure Modes
- `failure_modes/QUANT_FAILURE_MODES.md`
  - Platform-level quant failure patterns and controls.
  - Should influence: discovery diagnostics, funnel monitoring, governance safeguards.
- `failure_modes/PRODUCT_FAILURE_MODES.md`
  - Product-layer translation failure patterns.
  - Should influence: opportunity object quality and copilot answer structure.

## Governance
- `governance/RESEARCH_GOVERNANCE_STANDARDS.md`
  - Promotion/demotion evidence thresholds and stage requirements.
  - Should influence: `src/research/core/strategyGovernanceV2.js`, `src/research/discovery/candidateScoring.js`.
- `governance/STRATEGY_AUDIT_CHECKLIST.md`
  - Practical promotion checklist for strategy review.
  - Should influence: governance review workflows and stage change memos.

## Research Operations
- `research_ops/WEEKLY_RESEARCH_OPERATING_SYSTEM.md`
  - Weekly operating cadence for funnel/shadow/discovery/governance review.
  - Should influence: `src/research/weekly_cycle/weeklyResearchCycle.js` and report templates.
- `research_ops/MONTHLY_GROWTH_REVIEW.md`
  - Monthly maturity framework for discovery, validation, governance, product quality.
  - Should influence: roadmap and milestone acceptance criteria.

## Synthesis
- `ADVANCED_KNOWLEDGE_SYNTHESIS.md`
  - Maps advanced doctrines into concrete changes for discovery, validation, portfolio simulation, and governance.

## Machine-readable seeds
- `data/reference_seeds/research_doctrine_seed.json`
- `data/reference_seeds/failure_mode_seed.json`
- `data/reference_seeds/portfolio_evaluation_seed.json`
- `data/reference_seeds/governance_checklist_seed.json`

These seed files provide structured policy inputs for code modules and future automation loops.

## Consumption Priority

1. Validation and governance modules should consume doctrine/checklist seeds first.
2. Portfolio simulation should consume portfolio evaluation seed next.
3. Copilot and weekly cycle should consume failure-mode and doctrine seeds to produce higher-quality recommendations.
4. Discovery engine should consume doctrine constraints before expanding candidate generation breadth.
