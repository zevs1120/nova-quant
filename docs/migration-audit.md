# Nova Quant Migration Audit

Last updated: 2026-03-08 (Asia/Shanghai)

## Scope

This audit reviews the post-migration repository state with focus on backend/research/paper-trading continuity and governance readiness.

## Audit Results

### 1) Directory structure clarity / migration leftovers

- Status: `partial`
- Findings:
  - Core app/runtime code is split across `src/quant/*`, `src/research/*`, `src/server/*`, `src/engines/*`.
  - `src/engines/*` contains advanced pipeline modules, but current runtime path uses `src/quant/system.js` + `src/quant/researchLoop.js` via `src/engines/pipeline.js`.
  - `docs/PROJECT_MEMORY.md` still references an old repository root path, indicating migration residue.
- Risk:
  - Architectural intent and runtime reality can drift.

### 2) Data sources / schema / types / services duplication

- Status: `partial`
- Findings:
  - There are two major signal/data pipelines:
    1. Frontend quant state (`src/quant/system.js`)
    2. Server quant contract pipeline (`src/server/quant/service.ts`)
  - Naming and field styles differ between these paths.
  - Stage/status naming is not fully canonicalized across research objects.
- Risk:
  - Type drift and semantic mismatch between UI, research, and API outputs.

### 3) sample / simulated / real boundary

- Status: `mostly_clear`
- Findings:
  - Many modules explicitly label `sample/simulated/live_not_available`.
  - Multi-asset adapters expose `mode` (`sample_fallback` vs `live_path_available`) and source metadata.
  - Boundary is present but labels are not centralized as canonical enums.
- Risk:
  - Label semantics can drift as modules expand.

### 4) paper / backtest / live separation

- Status: `mostly_clear`
- Findings:
  - Proof layer clearly separates backtest/paper/live.
  - Live is intentionally unavailable, not fabricated.
  - Paper objects exist, but daily paper ops schema can be hardened for long-running operations.
- Risk:
  - Paper operational traceability not yet first-class enough for sustained governance.

### 5) Multi-asset shared foundation

- Status: `good_base`
- Findings:
  - Unified adapter -> normalizer -> feature factory -> dataset builder flow exists for equity/options/crypto.
  - Shared data quality report and source health exist.
  - Build is reproducible and runnable.
- Risk:
  - Dataset governance metadata (registry, feature/label manifests with quality semantics) is still thin.

### 6) Alpha / model / portfolio / risk / experiment object consistency

- Status: `partial`
- Findings:
  - Alpha history, challenger comparisons, diagnostics, and experiments exist.
  - Registry style objects are present in multiple places but not unified under canonical schema contracts.
- Risk:
  - Governance logic can become brittle as strategies/models increase.

### 7) Training set / feature / label / eval traceability

- Status: `partial`
- Findings:
  - Dataset generation exists and includes split/date range.
  - Missing: canonical dataset registry layer, explicit label manifest schema, feature-level train-safety/leakage flags, richer build-time snapshot summaries.
- Risk:
  - Hard to compare datasets over time and audit training provenance.

### 8) UI exists but backend object mismatch

- Status: `yes`
- Findings:
  - Some frontend pages read from quant runtime objects; server APIs use separate TS contracts.
  - AI route currently defaults to local retrieval in UI, while server-side multi-provider chat exists separately.
- Risk:
  - Product behavior may differ by entrypoint and confuse debugging.

### 9) Naming confusion / type drift / duplicated fields / state distortion

- Status: `yes`
- Findings:
  - Stage/status values vary (`promoted`, `candidate`, `testing`, plus model-related stage wording in docs).
  - Similar concepts use different names across modules (e.g., strategy stages, data provenance labels).
  - Some documents contain outdated assumptions.
- Risk:
  - Governance decisions may not be comparable across components.

### 10) Highest leverage fixes for this cycle

- Status: `identified`
- Priority list below.

## Priority Fix List (This Implementation Cycle)

### P0 (must do now)

1. Introduce canonical backend governance constants:
   - stage/state taxonomy
   - data provenance labels
   - paper/backtest/live labels
2. Add training dataset governance layer:
   - dataset registry objects
   - feature manifest (with null ratio/range/train-safe/leakage-sensitive)
   - label manifest (asset-specific horizon/cutoff alignment)
   - dataset snapshot quality output
3. Add unified registry system for:
   - alpha registry
   - model registry
   - strategy registry
4. Harden champion/challenger promotion loop with structured decision objects and failure reason taxonomy.
5. Harden daily paper operations outputs:
   - daily run object
   - paper ledger schema normalization
   - paper vs backtest gap diagnostics with explicit causes.

### P1 (within same cycle if feasible)

1. Add model health / strategy health / weekly system review objects.
2. Wire all new objects into research outputs so UI/AI/internal diagnostics can consume them directly.
3. Align docs terminology with code taxonomy.

### P2 (deferred)

1. Merge duplicated runtime pipelines into a single execution backbone.
2. Replace heuristic correlation/risk components with return-matrix based models.
3. Full live broker integration and production-grade execution lifecycle.

## Success Criteria for This Cycle

- All new governance outputs are real runtime objects (not doc-only placeholders).
- Training, registry, evaluation, paper ops, and monitoring outputs are traceable by ID and timestamp.
- Existing frontend behavior remains stable while output layer becomes more governable.

## Implementation Status (2026-03-08)

### Completed in this cycle

- Added canonical taxonomy and normalization utilities:
  - `src/research/governance/taxonomy.js`
- Added training data governance objects:
  - dataset registry
  - detailed feature manifests
  - label manifests
  - dataset quality snapshots
- Added unified registry system:
  - alpha/model/strategy registry outputs
- Added promotion loop governance:
  - canonical rules
  - structured decision object
  - structured failure reasons
- Added paper trading hardening:
  - daily run objects (signals/orders/fills/positions/equity/safety guards)
  - normalized ledger schema
  - paper-vs-backtest gap diagnostics
- Added internal intelligence and weekly review:
  - alpha/model/strategy/data health
  - weekly system review
- Added governance contract validation:
  - `src/research/governance/contracts.js`
  - runtime output `research.contract_checks`
- Added reproducible backend governance snapshot script:
  - `npm run snapshot:backend-governance`
  - output `data/snapshots/backend-governance.sample.json`

### Current cycle result against priority list

- P0: done
- P1: done
- P2: intentionally deferred (kept out of this iteration)
