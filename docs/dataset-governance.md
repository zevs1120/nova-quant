# Dataset Governance

Last updated: 2026-03-08 (Asia/Shanghai)

## 目标

训练集不只是“可生成”，而是“可追溯、可比较、可复用、可审计”。

## 统一对象

实现位于 `src/research/governance/datasetGovernance.js`，输出挂在：

- `research.multi_asset.dataset_governance.registry`
- `research.multi_asset.dataset_governance.feature_manifests_detailed`
- `research.multi_asset.dataset_governance.label_manifests`
- `research.multi_asset.dataset_governance.snapshots`

## 1) Dataset Registry

最小字段：

- `dataset_id`
- `asset_class`
- `feature_set_name`
- `label_definition`
- `source_summary`
- `date_range`
- `split_strategy`
- `created_at`
- `version`
- `status`
- `notes`

ID 规则：`dataset::{asset_class}__{feature_set}__{dataset_id}`

## 2) Feature Manifest（详细）

每个特征记录：

- `feature_name`
- `feature_group`
- `source`
- `derivation_logic`
- `null_ratio`
- `expected_range`
- `train_safe`
- `leakage_sensitive`

说明：

- `train_safe=false` 表示可能存在泄露敏感风险（例如包含 future/label 语义）。

## 3) Label Manifest（按资产）

- Equity: 5D horizon，US 交易日收盘对齐
- Option: 3D premium/方向/payoff alignment
- Crypto: 3D horizon，24/7 cutoff 对齐

统一字段：

- `horizon`
- `cutoff_rule`
- `timestamp_alignment`
- `calendar_mode`
- `labels[]`（分布与统计）

## 4) Dataset Snapshot & Quality Summary

每次构建输出：

- `coverage_summary`
- `missingness_summary`
- `class_balance`
- `label_distribution`
- `stale_data_detection`
- `suspicious_anomalies`
- `last_refresh_time`

## 可复现性约束

- `dataset_id` 由 `asOf` 日期驱动
- `created_at` 与输入 `asOf` 对齐（不再使用运行瞬时时间）
- 同一输入数据 + 同一 `asOf`，输出结构可重复

## 对外读取接口

`src/training/multiAssetTrainingService.js` 提供：

- `get_dataset_registry(asset_class)`
- `get_feature_manifest_detailed(asset_class)`
- `get_label_manifest(asset_class)`
- `get_dataset_quality_snapshot(asset_class)`

## 验证

```bash
npm run snapshot:multi-asset
```

查看 `data/snapshots/multi-asset-status.sample.json` 中 `dataset_governance` 节点。
