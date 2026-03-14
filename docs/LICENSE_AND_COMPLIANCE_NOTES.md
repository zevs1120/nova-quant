# License & Compliance Notes

NovaQuant's backend refactor drew architectural inspiration from several public repositories.
This document explains how that was done without introducing license contamination.

## Compliance Position

NovaQuant did **not** directly copy third-party core implementations into the repository for this refactor.

The operating rule was:

- study architecture
- borrow abstractions and governance patterns
- implement NovaQuant-native code inside NovaQuant domain boundaries

## Repositories Reviewed

### MIT / Apache / BSD style sources used for conceptual borrowing
- Qlib
- Lean
- Feast
- Great Expectations
- MLflow
- Temporal
- OpenTelemetry Collector
- Langfuse (MIT-safe surface only, never enterprise/ee content)
- Riskfolio-Lib

### Restricted-license sources used only as pattern references
- vectorbt
  - reason: Commons Clause restrictions
  - policy: no direct implementation borrowing
- OpenBB
  - reason: AGPL-3.0
  - policy: pattern-only inspiration for adapters and normalization

## Explicitly Avoided

- no AGPL implementation copied into backend runtime code
- no Commons Clause implementation copied into backend runtime code
- no enterprise-only code referenced
- no license-misaligned dependencies added for this refactor

## What Was Safe To Implement

The following were implemented as original NovaQuant code:

- registry persistence tables
- local Nova model routing layer
- domain contracts
- feature platform summary
- durable workflow blueprint layer
- observability spine
- portfolio allocator summary
- scorecard summary
- backbone summary API

These are NovaQuant-native implementations inspired by public architecture patterns, not copied implementations.

## Ongoing Guardrails

When adding future modules:

1. treat AGPL / Commons Clause repositories as idea sources only
2. do not copy code, schema, or test fixtures from restricted repos
3. if a new external dependency is introduced, record:
   - why it is needed
   - its license
   - whether it affects commercial distribution
4. keep enterprise-only paths out of consideration unless separately licensed

## Practical Outcome

NovaQuant now benefits from stronger backend architecture patterns while keeping:

- clean provenance
- commercial flexibility
- maintainable internal ownership of the codebase
