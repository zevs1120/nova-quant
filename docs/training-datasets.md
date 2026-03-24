# Training Datasets (v1)

## Builders

- Equities: `src/dataset_builders/equityDatasetBuilder.js`
- Options: `src/dataset_builders/optionsDatasetBuilder.js`
- Crypto: `src/dataset_builders/cryptoDatasetBuilder.js`

Each builder performs:

1. data alignment
2. feature join
3. label generation
4. split assignment (`train/valid/test/paper`)
5. metadata emission (`TrainingDataset`)

## Equity Dataset

- Feature set: `equity_core_v1`
- Labels:
  - `future_return_5d`
  - `direction_5d` (`up/down/flat`)
  - `volatility_label`
  - `ranking_label`

## Options Dataset

- Feature set: `options_chain_v1`
- Labels (option-specific, not reused from equities):
  - `future_option_return_3d`
  - `option_direction_3d` (`premium_up/premium_down`)
  - `payoff_alignment_3d` (call/put vs underlying move)
  - `vol_risk_label` (`vol_crush_risk`/`vol_expansion`/`stable_vol`)
  - `underlying_future_return_3d`

## Crypto Dataset

- Feature set: `crypto_spot_v1`
- Labels:
  - `future_return_3d`
  - `direction_3d`
  - `volatility_label`
  - `ranking_label`
  - `regime_alignment`

## Split Policy

Current split is date-based to avoid leakage:

- train: oldest ~55%
- valid: next ~15%
- test: next ~15%
- paper: latest ~15%

## API Interface

Provided by `src/training/multiAssetTrainingService.js`:

- `get_training_dataset(asset_class, feature_set, split)`
- `list_available_assets(asset_class)`
- `get_dataset_snapshot(asset_class)`
- `get_feature_manifest(asset_class)`
- `get_source_health()`
- `get_latest_data_status()`
