# Research Materials Index

Last updated: 2026-03-23

This is the master index for Nova Quant research feed materials and seed assets.

Links below are **repository-relative** (from the repo root).

## 1) Official Source Materials

- [OFFICIAL_SOURCE_DIGEST.md](official_sources/OFFICIAL_SOURCE_DIGEST.md)
  - Purpose: Canonical mapping of official data/framework sources to Nova Quant subsystems.
  - Update cadence: Monthly or whenever API contracts change.
- [DATA_SOURCE_SETUP_GUIDE.md](official_sources/DATA_SOURCE_SETUP_GUIDE.md)
  - Purpose: Integration tiering, key requirements, and practical activation sequence.
  - Update cadence: When onboarding new providers or changing source priorities.

## 2) Internal Seed Libraries

- [HYPOTHESIS_LIBRARY.md](internal_seeds/HYPOTHESIS_LIBRARY.md)
  - Purpose: 100 structured alpha hypotheses for discovery generation.
  - Feeds: Strategy Discovery Engine hypothesis layer.
- [STRATEGY_TEMPLATE_LIBRARY.md](internal_seeds/STRATEGY_TEMPLATE_LIBRARY.md)
  - Purpose: 30 reusable parameterizable strategy templates.
  - Feeds: Discovery template layer and validation contracts.
- [FEATURE_CATALOG.md](internal_seeds/FEATURE_CATALOG.md)
  - Purpose: Feature-family catalog and dependency map.
  - Feeds: Feature engineering roadmap and template compatibility.
- [RESEARCH_QUESTION_LIBRARY.md](internal_seeds/RESEARCH_QUESTION_LIBRARY.md)
  - Purpose: 100 practical weekly improvement questions.
  - Feeds: Weekly research loop and diagnostics review agenda.

## 3) Playbooks and Weekly Feed

- [MARKET_OBSERVATION_PLAYBOOK.md](playbooks/MARKET_OBSERVATION_PLAYBOOK.md)
  - Purpose: Translate market observations into hypotheses, families, and regime implications.
  - Update cadence: Quarterly or after major regime behavior drift.
- [WEEKLY_RESEARCH_FEED_TEMPLATE.md](playbooks/WEEKLY_RESEARCH_FEED_TEMPLATE.md)
  - Purpose: Fill-in template for weekly research summaries.
  - Update cadence: Weekly (operational use).
- [weekly_feed/WEEKLY_RESEARCH_FEED_TEMPLATE.md](weekly_feed/WEEKLY_RESEARCH_FEED_TEMPLATE.md)
  - Purpose: Dedicated weekly-feed folder copy for operations and automation handoff.

## 4) Seed JSON Assets (Machine-Usable)

### Universes

- [us_equities_core.json](../../data/reference_universes/us_equities_core.json)
- [us_equities_extended.json](../../data/reference_universes/us_equities_extended.json)
- [us_sector_etfs.json](../../data/reference_universes/us_sector_etfs.json)
- [crypto_core.json](../../data/reference_universes/crypto_core.json)
- [crypto_extended.json](../../data/reference_universes/crypto_extended.json)
- [market_proxies.json](../../data/reference_universes/market_proxies.json)

### Discovery Seeds

- [hypothesis_registry_seed.json](../../data/reference_seeds/hypothesis_registry_seed.json)
- [strategy_template_seed.json](../../data/reference_seeds/strategy_template_seed.json)

## 5) Foundational vs Weekly-Updated Materials

### Foundational (long-cycle)

- Official source digest and setup guide
- Hypothesis library
- Strategy template library
- Feature catalog
- Universe seed JSON files

### Weekly-updated (operational)

- Weekly research feed template output
- Research question selection for that week
- Source freshness and integration status notes

## 6) Files That Feed the Discovery Engine Directly

1. `data/reference_seeds/hypothesis_registry_seed.json`
2. `data/reference_seeds/strategy_template_seed.json`
3. `docs/research_materials/internal_seeds/FEATURE_CATALOG.md` (feature compatibility reference)
4. `data/reference_universes/*.json` (candidate market scope and universe control)

## 7) Recommended Weekly Process

1. Fill weekly feed template.
2. Select 10-20 questions from question library based on latest diagnostics.
3. Add or prune hypotheses/templates where repeated failures or gaps are observed.
4. Re-run discovery cycle and compare promoted candidates vs previous week.
