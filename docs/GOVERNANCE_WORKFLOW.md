# Governance Workflow

Last updated: 2026-03-09

## 1) Governance Audit Snapshot (Before Hardening)

### Formalized

- Lifecycle labels existed (`DRAFT/SHADOW/CANARY/PROD` plus legacy variants).
- Governance decision rows existed (`action`, `from_stage`, `to_stage`, `rationale`).
- Basic degradation monitoring and rollback candidate logic existed.

### Informal

- Promotion/demotion thresholds were mostly heuristic and not stage-check enforced.
- Reviewer metadata was present but always lightweight/system-generated.
- Evidence/validation readiness was referenced but not codified as required check rows.

### Conceptual only

- Typed decision objects (Promotion/Demotion/Rollback/Retirement) were not first-class.
- Review workflow packets (reviewer, timestamp, evidence links, unresolved concerns) were not standardized.
- Strategy-version governance records were incomplete for promotion/demotion/rollback history.

### Not fully enforced

- Stage transitions were inferred by confidence/heuristics, not strict gate checks.
- Registry did not clearly expose evidence/validation/review readiness and next eligible action.

## 2) Enforced Lifecycle

Nova Quant now enforces:
`DRAFT -> SHADOW -> CANARY -> PROD -> RETIRED`

Runtime module:

- `src/research/core/strategyGovernanceV2.js`

## 3) Stage Workflow Contract

Each lifecycle state now includes explicit:

- requirements
- evidence thresholds
- validation criteria
- monitoring requirements
- promotion/demotion conditions

Output:

- `research_core.strategy_governance.stage_workflow`

## 4) Enforced Check Model

For each strategy version, governance now computes structured check rows:

- evidence completeness
- replay/execution-profile presence
- signal frequency threshold
- OOS/cost/harsh-execution survival
- stability
- operational confidence
- critical concern gate

Output:

- `research_core.strategy_governance.strategy_records[*].stage_check_results`
- `research_core.strategy_governance.strategy_records[*].unresolved_concerns`

## 5) Decision Objects

Governance now emits typed objects:

- `PromotionDecision`
- `DemotionDecision`
- `RollbackDecision`
- `RetirementDecision`

Output:

- `research_core.strategy_governance.decision_objects`

Each decision carries:

- strategy identity and version
- from/to state
- reviewer + review timestamp
- rationale
- evidence links
- unresolved concerns
- evidence/validation/monitoring snapshots

## 6) Review Workflow

Every strategy gets a structured review record:

- `reviewer`
- `review_timestamp`
- `decision_rationale`
- `evidence_links`
- `unresolved_concerns`
- `approval_state` (`APPROVED`, `REJECTED`, `CONDITIONAL`, `PENDING`)

Output:

- `research_core.strategy_governance.review_workflow.reviews`

## 7) Strategy Version Governance Record

Each strategy version now tracks:

- `strategy_id`, `family`, `template`, `version`
- `evidence_summary`
- `validation_summary`
- `approval_state` and `review_status`
- `promotion_history`
- `demotion_history`
- `rollback_history`
- `retirement_reason` (if retired)

Output:

- `research_core.strategy_governance.strategy_records`

## 8) Registry Inspection View

Registry now exposes governance readiness directly:

- `current_state`
- `evidence_status`
- `validation_status`
- `review_status`
- `next_eligible_action`

Output:

- `research.registry_system.strategy_registry`
- `research.registry_system.strategy_registry_governance_view`
- `research_core.strategy_governance.strategy_registry`

## 9) Due Diligence Value

This hardening changes governance from ad hoc stage labeling to:

- enforceable stage gate checks,
- typed decision artifacts,
- inspectable review workflow,
- strategy-version audit history.
