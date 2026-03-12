# Seed to Candidate Flow

Last updated: 2026-03-09

## End-to-End Flow

1. Load seed runtime (`seedRuntime.js`)
- Ingest hypothesis/template/feature/doctrine/checklist seed files.
- Normalize fields and canonical names.

2. Build constrained registries
- `buildHypothesisRegistry(...)`
- `buildTemplateRegistry(...)`
- Apply runtime constraints (market/asset/regime/family/horizon/risk profile).

3. Hypothesis -> Template mapping
- Family compatibility must match.
- Asset class overlap must exist.
- Regime compatibility must pass runtime filters.
- If hypothesis template hints exist, template aliases must match.

4. Template -> Feature mapping
- Align hypothesis + template required features with feature catalog.
- Record matched features, missing features, and feature groups.

5. Candidate generation
- Generate bounded parameter modes:
  - `base`
  - `conservative`
  - `exploratory` (can be suppressed by conservative risk profile)
  - `regime_tuned`
- Emit machine-readable candidate objects with full source metadata.

6. Diagnostics
- Record mapping failures and drop reasons.
- Record used vs unused hypotheses/templates.

## Runtime Output Example

Candidate core fields:

- `candidate_id`
- `strategy_id`
- `hypothesis_id`
- `template_id`
- `strategy_family`
- `supported_asset_classes`
- `compatible_regimes`
- `required_features`
- `parameter_set`
- `candidate_source_metadata`

## Candidate Source Metadata Example

```json
{
  "source_type": "seed_driven_runtime",
  "runtime_version": "discovery-seed-runtime.v1",
  "hypothesis_seed_id": "hypothesis_registry_seed_v1",
  "template_seed_id": "strategy_template_seed_v1",
  "feature_catalog_seed_id": "feature_catalog_seed_v1",
  "doctrine_version": "2026-03-08",
  "governance_checklist_version": "2026-03-08",
  "generation_constraints": {
    "market": ["CRYPTO"],
    "asset_classes": ["CRYPTO"],
    "families": ["Crypto-Native Families"]
  }
}
```

## Typical Mapping Failure Reasons

- `family_mismatch`
- `market_mismatch`
- `asset_mismatch`
- `regime_mismatch`
- `risk_profile_mismatch`
- `horizon_mismatch`
- `template_hint_mismatch`
- `feature_mismatch`

## Why This Matters

This wiring turns seed materials from passive documentation assets into runtime discovery inputs. Discovery can now be constrained, diagnosed, and tuned without rewriting manual candidate wiring in code.
