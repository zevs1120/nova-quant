> Archived / Historical
> Archived on: 2026-03-09
> Applicable snapshot: pre-credibility-cleanup review cycle
> This file is retained for traceability and does not represent current system status.

# Nova Quant Layer-by-Layer Ratings

As of 2026-03-09.

## Rating Scale

A, A-, B+, B, C

## Ratings

| Layer                                         | Rating | Why This Rating                                                                                                                                                                            | What Still Blocks Higher Rating                                                                                                                                     |
| --------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Research Core                              |     A- | Strong modular design across strategy families, regime/risk integration, evidence objects, and traceable outputs. Research materials and advanced doctrine are integrated into code paths. | Replay-backed evidence depth is uneven across strategies; some research outcomes still rely on limited empirical history windows.                                   |
| B. Discovery Engine                           |     A- | Runtime seed ingestion is operational (hypothesis/template/feature/doctrine/checklist seeds), constrained generation works, diagnostics expose mapping failures and unused seeds.          | Promotion throughput is currently conservative (`promoted_to_shadow = 0` in baseline run); needs broader validated candidate graduation under real replay evidence. |
| C. Validation / Diagnostics                   |     B+ | Replay engine, execution realism sensitivity, strict-fill monotonicity checks, funnel diagnostics, shadow logging, and stress framework are integrated and test-covered.                   | Current baseline run shows replay-backed coverage only 1/4 strategies and OOS survivors 0/4; this is the largest credibility limiter.                               |
| D. Risk / Governance                          |     A- | Lifecycle workflow is enforced with stage checks, review records, decision objects, rollback/demotion paths, and execution-realism-aware degradation gates.                                | Reviewer process is still mostly system-generated; human sign-off workflow exists structurally but not fully operationally demonstrated.                            |
| E. Portfolio Intelligence                     |     B+ | Multi-strategy simulator includes risk-budgeted allocation, diversification diagnostics, regime stability, execution sensitivity, and new crowding guard.                                  | Return/correlation dynamics remain heuristic/proxy-driven rather than fully historical covariance + event-level portfolio replay.                                   |
| F. Product-facing Decision Layer              |     A- | Opportunity objects are structured, complete, and lineage-aware; required-field coverage is 1.0 in latest run; decision/risk/regime objects are explainable.                               | Product truth depends on upstream replay realism depth; stronger realized outcome linkage is still needed for top-tier confidence.                                  |
| G. Engineering / Technical DD Professionalism |     A- | Repository structure is coherent, docs are extensive, contracts are explicit, assumptions are transparent, tests are meaningful (49 passing), reliability report is reproducible.          | Build still has frontend bundle-size warning; CI-style artifact gating and stronger perf/quality automation can improve DD posture further.                         |

## Cross-Layer Summary

- Layers at or near A-: Research Core, Discovery Engine, Risk/Governance, Product Layer, Engineering DD.
- Layers below A-: Validation/Diagnostics, Portfolio Intelligence.
- Main pattern: system architecture is strong, but empirical realism coverage must increase to fully close skepticism under deep technical scrutiny.
