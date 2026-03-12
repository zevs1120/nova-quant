# Multi-Asset Schema (v1)

## Unified Base
All records include provenance fields:
- `source`
- `fetched_at`
- `frequency`
- `data_status`
- `use_notes`
- `license_notes`

## 1. Asset
- `asset_id`
- `asset_class` (`equity` / `option` / `crypto`)
- `symbol`
- `venue` / `exchange`
- `status`
- `source`

## 2. EquityBar
- `symbol`
- `date`
- `open/high/low/close`
- `adjusted_close`
- `volume`
- `vwap`
- `returns`
- `source`

## 3. OptionContract
- `option_ticker` / `contract_id`
- `underlying_symbol`
- `expiration_date`
- `strike`
- `option_type`
- `multiplier`
- `exercise_style`
- `source`

## 4. OptionSnapshot
- `option_ticker`
- `timestamp` / `date`
- `last/bid/ask/mid`
- `volume`
- `open_interest`
- `implied_volatility`
- `greeks` (`delta/gamma/theta/vega`)
- `underlying_price`
- `source`

## 5. OptionChainSnapshot
- `underlying_symbol`
- `timestamp` / `date`
- `contracts[]`
- `derived_chain_metrics`

## 6. CryptoProduct
- `venue`
- `product_id` / `symbol`
- `base_asset`
- `quote_asset`
- `status`

## 7. CryptoBar
- `product_id`
- `timestamp` / `date`
- `open/high/low/close`
- `volume`
- `trades_count`
- `source`

## 8. DatasetSnapshot
- `dataset_id`
- `asset_class`
- `frequency`
- `date_range`
- `source_summary`
- `coverage_summary`
- `missingness_summary`

## 9. TrainingDataset
- `dataset_id`
- `asset_class`
- `feature_set_name`
- `label_definition`
- `split` (`train/valid/test/paper` counts)
- `created_at`

## Notes
- Options are not treated as a generic ticker; chain linkage and contract fields are preserved.
- Crypto uses continuous 24/7 timestamps and separate handling from US trading day logic.
