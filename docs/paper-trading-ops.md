# Paper Trading Ops

Last updated: 2026-03-08 (Asia/Shanghai)

## 目标
让 paper trading 从“展示结果”升级为“可日更运行、可审计、可诊断”的运营对象。

## 代码入口
- 构建器: `src/research/governance/paperOps.js`
- 调用: `src/quant/researchLoop.js`
- 输出: `research.paper_ops`

## 1) Daily Paper Run
`paper_ops.daily_runs[]` 按日期输出：
- `signals`（selected/filtered）
- `target_portfolio`
- `simulated_orders`
- `fills`
- `positions`
- `equity_snapshot`（realized/unrealized/equity/open positions）
- `safety_guards`

## 2) Paper Ledger
`paper_ops.ledger` 统一 schema：
- `orders[]`
- `fills[]`
- `positions[]`
- `daily_equity[]`
- `slippage_assumptions`
- `notes[]`

附加保留：`transactions[]`（open/close 事件）用于按日回放。

## 3) Paper vs Backtest Gap Diagnostics
`paper_ops.paper_vs_backtest_gap`：
- `consistent`
- `return_gap`
- `win_rate_gap`
- `aligned_dimensions[]`
- `deviated_dimensions[]`
- `likely_causes[]`

## 4) Paper Safety Guards
每个 daily run 包含：
- `max_exposure_cap_active`
- `liquidity_check_active`
- `liquidity_check_pass`
- `unavailable_data_skip_logic`
- `unavailable_data_skips`
- `extreme_move_filter_active`
- `market_closed_logic`
- `crypto_always_on_handling`

## 注意
- Paper 输出明确是模拟运营层，不宣称 live 交易执行。
- 当前目标是“持续可运行 + 可追溯 + 可回看”。

## 验证
```bash
npm run snapshot:backend-governance
```
查看 `data/snapshots/backend-governance.sample.json` 中 `paper_ops` 节点。

