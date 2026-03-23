# Recommended Repository Layout

> **Note:** This tree is a **target / reference** layout for greenfield or large splits. The **current** Nova Quant repo structure is described in [`../REPOSITORY_OVERVIEW.md`](../REPOSITORY_OVERVIEW.md) and root [`README.md`](../../README.md). Do not assume paths below exist verbatim.

```text
repo/
  apps/
    web/
    api/
    copilot/
  services/
    data_ingestion/
    feature_store/
    strategy_factory/
    validation_runner/
    decision_engine/
    release_governance/
  libs/
    common_types/
    cost_models/
    regime_models/
    risk_models/
    audit/
  docs/
    quant_ai_pack/
    promotion_memos/
    experiment_reports/
  configs/
    universes/
    strategies/
    regimes/
    risk_buckets/
    release_policies/
  tests/
    unit/
    integration/
    regression/
```

## Rule
No strategy should exist only as code.
Every strategy must have:
- config,
- validation report,
- promotion memo,
- and audit hooks.
