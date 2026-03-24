# Strategy Review Memo Template

Last updated: 2026-03-09

Use this template for promotion/demotion/rollback/retirement reviews.

## 1) Strategy Identity

- Strategy ID:
- Family:
- Template:
- Version:
- Current State:
- Proposed State:
- Review Type: (`promotion_review` / `demotion_review` / `rollback_review` / `retirement_review` / `periodic_monitor_review`)

## 2) Review Metadata

- Reviewer:
- Review Timestamp (UTC):
- Approval State: (`APPROVED` / `REJECTED` / `CONDITIONAL` / `PENDING`)

## 3) Evidence Summary

- Evidence completeness score:
- Evidence status: (`complete` / `partial` / `weak`)
- Replay context present:
- Execution profile present:
- Evidence links:

## 4) Validation Summary

- Validation status: (`pass` / `watch` / `fail` / `missing`)
- OOS positive ratio:
- Survives costs:
- Survives harsh execution:
- Stability verdict:

## 5) Monitoring Summary

- Signal frequency:
- Degradation status:
- Degradation reasons:
- Critical concern count:
- Operational confidence:

## 6) Stage Check Results

List required checks and status:

- [ ] evidence_completeness
- [ ] replay_context
- [ ] execution_profile
- [ ] signal_frequency
- [ ] oos_positive_ratio
- [ ] survive_costs
- [ ] survive_harsh_execution
- [ ] stability
- [ ] operational_confidence
- [ ] critical_concern_gate

## 7) Decision Rationale

- Decision:
- Rationale:
- Key evidence supporting decision:

## 8) Unresolved Concerns

- Concern 1:
- Concern 2:
- Required follow-up:

## 9) Risk Controls and Contingency

- If promoted: position/risk limits, guardrails, and review cadence
- If demoted/rollback: rollback target and stabilization checks
- If retired: retirement reason and archival references
