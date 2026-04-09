# Data Quality Governance

这份说明是给团队内部和 admin 运维使用的短 runbook，目标是快速回答三件事：

- 数据质量状态是什么
- `adjustment drift` / `corporate action conflict` 是什么
- admin 面板里应该怎么排查

## 1. 质量状态定义

`ohlcv_quality_state.status`

- `TRUSTED`
  - 当前序列可被运行时正常消费，没有已知阻断级问题。
- `SUSPECT`
  - 发现可疑问题，但不一定完全阻断；需要在 admin 中优先检查。
- `REPAIRED`
  - 序列曾有问题，但已通过 validation / repair 流程修复。
- `QUARANTINED`
  - 已确认存在高风险问题，应从可信运行时视角隔离。

`ohlcv_quality_state.reason`

- `PROVIDER_ADJUSTMENT_DRIFT`
  - 常见于不同 provider 在同一段历史上出现稳定比例偏移，典型情况是某一源已复权、另一源未复权。
- `CORPORATE_ACTION_SOURCE_CONFLICT`
  - 多个公司行为源对同一事件给出了互相冲突的 split / dividend 数值。
- `VALIDATION_REPAIR_APPLIED`
  - 代表序列已经被自动修复流处理。

## 2. Adjustment Drift 是什么

系统会对重叠历史做跨源比对。

如果新源和现有源在一段重叠区间上表现出稳定比例漂移，而不是随机噪声，就会被判成 `PROVIDER_ADJUSTMENT_DRIFT`。

admin drill-down 里重点看：

- `incoming_source`
- `existing_sources`
- `overlap_count`
- `median_ratio`
- `max_deviation_pct`

如何理解：

- `median_ratio` 明显偏离 `1.0`
  - 说明两源价格尺度不一致
- `overlap_count` 足够大
  - 说明不是偶然几根 bar 的噪声

常见处理：

- 暂时不要让低优先级源覆盖当前序列
- 检查该 symbol 是否刚经历 split / reverse split
- 检查 provider 是否存在复权口径差异

## 3. Corporate Action Conflict 是什么

系统会定时同步：

- Yahoo corporate actions
- Alpha Vantage corporate actions

然后按 `event_date + action_type` 做共识校验。

如果同一事件的 split ratio / dividend cash amount 明显不一致，就会记录：

- anomaly: `CORPORATE_ACTION_SOURCE_CONFLICT`
- quality_state: `SUSPECT`

admin drill-down 里重点看：

- `corporate_action_validation.mismatch_count`
- `corporate_action_validation.confirmed_count`
- `corporate_action_validation.mismatches`

常见处理：

- 先确认哪个 provider 和交易所公告更一致
- 如果短期无法确认，保持 suspect，不要强行信任

## 4. Admin 面板怎么看

`Data Status` 页现在分两层：

- 顶部 summary
  - 先看 `Suspect / Repaired / Quarantined`
  - 再看 `Adjustment Drift / Corp Action Conflicts`
- `Source Freshness` 表
  - 默认已经按严重度排序
  - `Inspect` 后可以看 symbol 级 drill-down

drill-down 重点内容：

- 基本统计
  - 更新时间
  - corp actions 数量
  - calendar exceptions 数量
  - anomaly 总数
- metrics
  - adjustment drift / corp validation 的证据对象
- `Recent Governance Runs`
  - 最近治理任务对这个 symbol 做了什么
- `Timeline`
  - split / dividend / halt / resume / holiday / half-day 等事件
- `Quality Lifecycle`
  - 该 symbol 的质量状态如何从 `SUSPECT` 变成 `REPAIRED` 或回到 `TRUSTED`

## 5. 手动停牌导入

当前支持脚本：

```bash
npm run data:halt -- --market US --symbol TSLA --date 2026-04-09 --action HALT --reason "Exchange halt"
```

恢复交易：

```bash
npm run data:halt -- --market US --symbol TSLA --date 2026-04-10 --action RESUME --reason "Trading resumed"
```

说明：

- `HALT` 会写入 corporate action，同时写入 trading calendar exception
- `RESUME` 目前只写 corporate action，用于时间线和上下文解释

## 6. 定时治理任务

当前治理数据由 `refreshGovernanceData` 定时同步，覆盖：

- corporate actions
- US trading calendar
- cross-provider validation

任务输出会进入：

- workflow runs
- admin data-quality drill-down

## 7. 推荐排查顺序

当 admin 出现 suspect symbol 时，建议按这个顺序看：

1. 先看 `reason`
2. 再看 `metrics`
3. 再看 `Timeline`
4. 再看 `Recent Governance Runs`
5. 最后决定：
   - 保持 suspect
   - 触发 repair / backfill
   - 人工导入 halt / resume
   - 或确认恢复 trusted
