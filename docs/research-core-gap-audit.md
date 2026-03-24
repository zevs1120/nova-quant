# Research Core Gap Audit (Phase A)

Last updated: 2026-03-08

## Scope

Audit of current `research_core` against target domains:
A) strategy family architecture
B) feature and signal layer
C) regime system
D) risk and portfolio budget
E) signal funnel diagnostics
F) shadow opportunity analysis
G) validation / anti-overfit
H) strategy governance
I) research automation loop
J) product-facing decision object quality

## Current State vs Target

1. Strategy family architecture: `PARTIAL`

- Implemented: modular family/template registry, lifecycle tags, regime compatibility.
- Missing: optional future families, explicit per-template validation requirements, governance hooks metadata richness.

2. Feature + signal layer: `WEAK`

- Implemented: operational signals with rich fields.
- Missing: explicit separation objects for raw data -> derived features -> raw signal -> scored signal -> filtered signal -> executable opportunity.
- Missing: reusable feature catalog object for cross-family feature consumption.

3. Regime system: `PARTIAL`

- Implemented: primary/combined state classification and policy posture.
- Missing: explicit regime confidence, transition history, expected trade density, warning severity, per-signal compatibility checks.

4. Risk + portfolio budget: `PARTIAL`

- Implemented: user bucket + basic portfolio budget + trade bucket decisions.
- Missing: market/asset concentration budgets, max active risk, drawdown state, stronger full-size/reduced/blocked rationale structure.

5. Signal funnel diagnostics: `PARTIAL`

- Implemented: stage counters, bottleneck, no-trade top reasons, by family/regime/market.
- Missing: explicit prefilter/passed-stage counters, by-date-range slices, threshold sensitivity and over-filtering diagnostics.

6. Shadow opportunity analysis: `PARTIAL`

- Implemented: near-miss records, reduced-size pass flag, forward proxy outcomes.
- Missing: drawdown profile, template-level analysis, under-traded family/regime analytics.

7. Validation / anti-overfit: `PARTIAL`

- Implemented: walk-forward windows, embargo, regime slices, cost/slippage stress, degradation tracking.
- Missing: rolling re-optimization metadata, richer regime-sliced density/drawdown, parameter sensitivity surface.

8. Strategy governance: `PARTIAL`

- Implemented: lifecycle decisions and rollback/retirement outputs.
- Missing: state policy contracts (visibility/execution/monitoring), explicit governance operations (promote/demote/rollback/retire/compare).

9. Research automation loop: `MISSING`

- Missing: periodic research summaries, deterioration alerts, candidate suggestions, funnel abnormality alerts.

10. Product-facing decision object quality: `PARTIAL`

- Implemented: signal objects are rich but not standardized as product-facing decision objects with lineage/audit schema.

## Priority Fix List (Phase B -> E)

P0 (implement now)

1. Feature + signal abstraction layer with explicit lifecycle objects.
2. Regime engine enrichments: confidence + transition history + expected density + per-signal compatibility checks.
3. Risk bucket enrichments: multi-budget object and detailed decision rationale.
4. Funnel enrichments: prefilter/pass counters and threshold sensitivity diagnostics.

P1 (implement next) 5. Shadow analytics enrichments (drawdown profile, under-traded matrix). 6. Validation enrichments (re-optimization metadata, sensitivity surface, regime trade-density slices). 7. Governance enrichments (state policy and operation primitives).

P2 (implement in this session if feasible) 8. Research automation loop outputs. 9. Product-facing opportunity object standardization with lineage fields.

## Constraints

- Preserve existing demo usability and existing pipeline fields.
- Additive upgrades only; avoid breaking current UI contracts.
- Mark synthetic assumptions explicitly.
