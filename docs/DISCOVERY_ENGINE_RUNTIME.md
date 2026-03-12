# Discovery Engine Runtime

Last updated: 2026-03-09

## Purpose

This document defines how Nova Quant discovery moved from partially manual wiring to seed-driven runtime generation.

## What Changed

Runtime seed loading is now centralized in:

- `src/research/discovery/seedRuntime.js`

Loaded at runtime:

- `data/reference_seeds/hypothesis_registry_seed.json`
- `data/reference_seeds/strategy_template_seed.json`
- `data/reference_seeds/feature_catalog_seed.json`
- `data/reference_seeds/research_doctrine_seed.json`
- `data/reference_seeds/governance_checklist_seed.json`

Registry modules now consume runtime seed objects first (with legacy fallback):

- `src/research/discovery/hypothesisRegistry.js`
- `src/research/discovery/templateRegistry.js`

Candidate generation now depends on seed-derived mapping:

- hypothesis template hints
- template aliases
- feature catalog alignment

Primary module:

- `src/research/discovery/candidateGenerator.js`

## Audit Snapshot (Before This Upgrade)

- `hypothesisRegistry.js`: mostly hard-coded hypothesis objects.
- `templateRegistry.js`: mostly hard-coded template objects.
- Seed files existed in `data/reference_seeds/*` but were largely passive for runtime generation.
- Candidate generation used structured logic, but consumed mostly manual registry payloads.
- No explicit diagnostics for unused seeds or hypothesis-template mapping failures.

## Runtime Constraints

Discovery runs now support constraints for:

- `market`
- `asset_class`
- `regime`
- `family`
- `trade_horizon`
- `risk_profile`
- `discovery_batch_size`

These constraints are applied at registry + generation stages.

Pipeline wiring:

- `src/engines/pipeline.js` -> `config.discovery`
- `src/research/core/researchCoreUpgrade.js` -> passes runtime discovery config (defaulting risk profile to pipeline risk profile).

## Runtime Diagnostics

Discovery now emits seed-usage diagnostics in:

- `candidate_generation.summary.runtime_seed_diagnostics`
- `candidate_diagnostics.seed_runtime_diagnostics`

Includes:

- hypotheses producing candidates
- top used templates
- hypotheses without candidates
- unused templates
- mapping failures with reason counters

## Candidate Metadata

Each generated candidate now carries:

- `hypothesis_id`
- `template_id`
- `required_features`
- `required_feature_groups`
- `candidate_source_metadata`

`candidate_source_metadata` includes:

- seed ids used
- doctrine/checklist version references
- hypothesis/template source lineage
- feature alignment (matched/missing)
- runtime constraints used for the run

## Remaining Manual Areas

1. Candidate validation metrics are still simulation-heavy (seed-driven generation is now runtime, but validation realism remains a separate axis).
2. Research doctrine and governance checklist seeds are loaded and attached to metadata, but hard policy enforcement from those seed rules is still partial.
3. Legacy fallback registries remain in code for resilience.
