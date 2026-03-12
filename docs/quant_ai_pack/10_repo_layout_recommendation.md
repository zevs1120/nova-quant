# Recommended Repository Layout

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
    ai_quant_pack/
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
