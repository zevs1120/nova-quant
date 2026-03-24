# Registry System (Alpha / Model / Strategy)

Last updated: 2026-03-08 (Asia/Shanghai)

## 目标

把散落在研究代码里的 alpha/model/strategy 定义收敛成统一注册体系，支持版本、状态与历史治理。

## 代码与输出

- 构建器: `src/research/governance/registrySystem.js`
- 产出: `research.registry_system`
  - `alpha_registry[]`
  - `model_registry[]`
  - `strategy_registry[]`

## Alpha Registry

关键字段：

- `alpha_id`
- `family`
- `description`
- `inputs`
- `regime_fit`
- `expected_holding_period`
- `active_status`
- `version`
- `last_eval_summary`

## Model Registry

关键字段：

- `model_id`
- `model_type`
- `asset_class`
- `training_dataset_id`
- `feature_set_name`
- `label_definition`
- `hyperparams_summary`
- `created_at`
- `current_stage`
- `evaluation_summary`

## Strategy Registry

关键字段：

- `strategy_id`
- `asset_scope`
- `enabled_alpha_ids`
- `enabled_model_ids`
- `portfolio_logic`
- `risk_profile`
- `execution_mode`
- `current_stage`
- `change_log`

## 统一命名与 ID

统一 taxonomy 位于 `src/research/governance/taxonomy.js`：

- stage: `draft/testing/paper/candidate/champion/challenger/retired`
- execution mode: `backtest/paper/live`

统一 ID 生成：`registryId(prefix, ...parts)`，例如：

- `alpha::{alpha_id}__{version}`
- `model::{strategy_id}__{version}`
- `strategy::{strategy_id}__{version}`

## 使用价值

- UI 可直接读取 registry 展示当前治理状态
- AI explanation 可引用 registry 与 eval summary
- 内部诊断可按 registry_id 做时间序列追踪
