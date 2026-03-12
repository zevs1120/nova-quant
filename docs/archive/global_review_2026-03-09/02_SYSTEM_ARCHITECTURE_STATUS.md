> Archived / Historical
> Archived on: 2026-03-09
> Applicable snapshot: pre-credibility-cleanup review cycle
> This file is retained for traceability and does not represent current system status.

# Nova Quant Global Review — System Architecture Status

As of 2026-03-08.

Maturity scale used below:
- `L1` concept/stub
- `L2` demo-focused implementation
- `L3` functional early platform
- `L4` production-intended with partial realism gaps
- `L5` production-hardened

## 1) Market Data Layer
**Intended role**
- ingest US equities/options/crypto data,
- normalize into shared contracts,
- feed feature/training/research pipelines.

**Current implementation status**
- Multi-asset adapters and normalizers exist.
- Dataset governance and quality snapshots are implemented.
- Transparency labels (`DEMO`, `MOCK_DATA`, `EXPERIMENTAL`, `PRODUCTION_INTENDED`) are explicit.
- Live-path metadata exists, but runtime commonly falls back to sample generation (`buildSampleMarketData` and mock paths).

**Maturity**
- **L3.0** (structured and inspectable, but still sample-heavy at runtime).

## 2) Research Materials Layer
**Intended role**
- provide reusable official-source digests, universes, hypotheses, templates, feature catalogs, and doctrine.

**Current implementation status**
- Research materials pack exists under `docs/research_materials/`.
- Advanced doctrine pack exists under `docs/advanced_research_pack/`.
- Machine-readable seeds exist under `data/reference_seeds/`.

**Maturity**
- **L3.8** (very strong documentation/seeding; operational policy enforcement still partial).

## 3) Discovery Engine
**Intended role**
- continuously generate candidate strategies from structured hypotheses,
- validate, score, and promote candidates.

**Current implementation status**
- Hypothesis registry, template registry, candidate generation, staged validation, scoring, diagnostics, and promotion decisions are implemented.
- Traceability is explicit (`hypothesis -> template -> candidate -> validation -> decision`).
- Runtime registries are still relatively small hardcoded sets in code, not yet fully fed by seed libraries.

**Maturity**
- **L3.4** (real engine behavior present; realism and seed-driven scaling are still incomplete).

## 4) Validation / Risk / Governance Layer
**Intended role**
- enforce robustness, control risk, and govern lifecycle decisions.

**Current implementation status**
- Walk-forward, cost/slippage stress proxies, parameter sensitivity, regime slicing implemented.
- Layered risk buckets implemented (user/portfolio/trade).
- Governance lifecycle (`DRAFT -> SHADOW -> CANARY -> PROD -> DEGRADE -> RETIRE`) implemented with decisions and rollback logic.
- Remaining gap: validation and governance still partly proxy/system-generated, with limited human sign-off workflow.

**Maturity**
- **L3.5** (substantive controls exist; production realism and process rigor not complete).

## 5) Decision Object Layer
**Intended role**
- produce product-ready, explainable opportunity/risk/regime objects.

**Current implementation status**
- Feature/signal lifecycle abstraction exists (`raw -> scored -> filtered -> executable`).
- Opportunity objects include risk bucket, rationale, invalidation, and lineage fields.
- Evidence chain module links strategy decisions to validation/governance outputs.

**Maturity**
- **L3.9** (object quality is strong for early stage; upstream data realism still constrains trust).

## 6) Product Experience Layer
**Intended role**
- deliver a daily decision OS for non-professional traders.

**Current implementation status**
- IA and navigation are simplified.
- Daily check-in, AI explainability hub, holdings diagnostics, and weekly review are implemented.
- Product is coherent and differentiated from terminal-style dashboards.
- Front-end still consumes a mixed real/mock substrate.

**Maturity**
- **L3.2** (usable and coherent, but not yet backed by live-grade research outputs).

## Architecture Verdict
Nova Quant architecture is now **coherent and reviewable end-to-end**. The primary maturity bottleneck is no longer module absence; it is **operational realism and enforcement depth**.
