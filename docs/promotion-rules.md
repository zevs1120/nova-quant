# Promotion Rules (Champion / Challenger)

Last updated: 2026-03-08 (Asia/Shanghai)

## 目标

把模型成长从“跑结果”变成“有门槛、有决策记录、有失败归因”的治理流程。

## 代码入口

- 比较逻辑: `src/quant/researchLoop.js` (`compareChampionChallenger`)
- 晋级规则与决策对象: `src/research/governance/promotionLoop.js`

## 标准比较维度（同资产/同任务/同窗口）

- `return`
- `drawdown`
- `hit_rate`
- `turnover`
- `stability`
- `regime_robustness`
- `paper_feasibility`
- `overlap_with_champion`
- `uniqueness_vs_champion`

## Promotion Stages

- `draft -> testing`
- `testing -> paper`
- `paper -> candidate`
- `candidate -> champion`
- `champion -> retired`

规则对象定义在 `PROMOTION_RULES`，每条规则包含：

- `rule_id`
- `from_stage`
- `to_stage`
- `checks[]`

## Promotion Decision Object

每次判断都会输出结构化对象：

- `experiment_id`
- `compared_entities`
- `metrics_summary`
- `decision` (`approved`, `from_stage`, `to_stage`)
- `rationale`
- `reviewer` (`system-generated`)
- `created_at`
- `failure_reasons[]`

## 失败原因（结构化）

当前支持：

- `unstable_across_regimes`
- `too_correlated`
- `drawdown_too_high`
- `too_little_incremental_value`
- `data_quality_insufficient`
- `turnover_too_high`
- `paper_feasibility_too_low`
- `backtest_stability_too_low`

## 输出位置

- `research.comparisons[]`
- `research.promotion_decisions[]`
- `research.governance.promotion_rules[]`

## 验证

```bash
npm run snapshot:backend-governance
```

查看 `data/snapshots/backend-governance.sample.json` 中 `promotion` 节点。
