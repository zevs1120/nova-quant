# Research Evidence System

Last updated: 2026-03-08

## Purpose

Nova Quant Research Evidence System makes every strategy traceable across the full research lifecycle:

`hypothesis -> template -> candidate strategy -> validation results -> governance decision -> production recommendation`

It is designed for auditability, governance discipline, and technical due diligence.

## Module

- Runtime implementation: `src/research/evidence/evidenceSystem.js`
- Review-layer entrypoint: `research/evidence/index.js`
- Research core output key: `research.research_core.research_evidence_system`

## Standardized Evidence Object

Each evidence record contains:

- `hypothesis_id`
- `template_id`
- `feature_set`
- `parameter_set`
- `validation_summary`
- `regime_performance`
- `cost_sensitivity`
- `walk_forward_results`
- `governance_state`
- `promotion_history`
- `production_recommendation`
- `audit_chain`
- `evidence_quality_score`
- `assumption_profile`
- `cost_realism_notes`
- `fill_realism_notes`
- `funding_realism_notes`

## How Evidence Is Generated

1. Pull candidate records from strategy discovery output.
2. Attach validation stage metrics and quality score.
3. Join governance lifecycle state and decisions.
4. Join walk-forward strategy-level evaluation when available.
5. Attach promotion history from discovery + governance decisions.
6. Emit chain completeness and quality scores.

For legacy/governance-only strategies without candidate ancestry, a governed-only evidence record is emitted with partial lineage.

## Governance Recording

Governance evidence is captured from:

- discovery promotion decisions (`DRAFT -> SHADOW` and hold/reject)
- strategy governance lifecycle decisions (`PROMOTE`, `DEMOTE`, `ROLLBACK`, `RETIRE`, `HOLD`)
- structured governance decision objects:
  - `PromotionDecision`
  - `DemotionDecision`
  - `RollbackDecision`
  - `RetirementDecision`

Promotion history is preserved as ordered events with:

- source
- from/to stage
- rationale
- created_at

## Why It Improves Auditability

The system allows external reviewers to verify:

- where a strategy originated,
- what validation evidence exists,
- what governance action was taken,
- why production recommendation is allowed or blocked.

This removes black-box decisioning and supports reproducible due diligence review.
