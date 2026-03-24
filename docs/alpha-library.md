# Alpha Library (Nova Quant v1)

## 1. Design

v1 alpha stack is rule-based and deterministic. It is intentionally simple but structured for replacement by model-driven alphas later.

## 2. Families and Components

### Trend

1. `ALP-T01` Momentum 20D

- Inputs: `ret_20d`, `ma_dev_20`
- Use: trend continuation scoring

2. `ALP-T02` MA Alignment 10/20/60

- Inputs: `ma10`, `ma20`, `ma60`
- Use: trend structure validation

3. `ALP-T03` 20D Breakout State

- Inputs: close vs 20D high/low
- Use: breakout/breakdown trigger support

4. `ALP-T04` Sector Relative Strength

- Inputs: cross rank, industry rank
- Use: prefer leaders inside winning sectors

### Mean Reversion

5. `ALP-M01` RSI Reversion

- Inputs: `rsi14`
- Use: oversold rebound / overbought fade

6. `ALP-M02` Short Z-Score Reversion

- Inputs: short z-score
- Use: fade stretched short-term dislocations

7. `ALP-M03` VWAP Deviation Reversion

- Inputs: price-vwap deviation
- Use: intraday/short-window re-anchor signal

### Volume / Price

8. `ALP-V01` Volume Expansion With Direction

- Inputs: volume/ADV + short return
- Use: confirm directional move quality

9. `ALP-V02` Quiet Pullback Quality

- Inputs: 20D trend + 5D pullback + volume ratio
- Use: identify healthy pullbacks in uptrend

10. `ALP-V03` Turnover Shock Follow-through

- Inputs: turnover shock + 1D return
- Use: exploit abnormal participation events

### Market State

11. `ALP-S01` Regime Trend Bias

- Inputs: regime tag
- Use: market-level directional prior

12. `ALP-S02` Breadth Confirmation

- Inputs: breadth ratio
- Use: support/discount directional conviction

13. `ALP-S03` Style Rotation Fit

- Inputs: style preference + sector
- Use: align symbol with style leadership

### Risk Filter

14. `ALP-R01` Liquidity Filter

- Inputs: ADV notional
- Use: block low-liquidity candidates

15. `ALP-R02` Volatility Cap

- Inputs: HV20/downside volatility
- Use: penalize unstable names

16. `ALP-R03` Gap Chase Guard

- Inputs: opening gap pct
- Use: avoid overextended entries

## 3. Alpha Contract Fields

Each alpha includes:

- `id`
- `name`
- `family`
- `short_description`
- `inputs`
- `applicable_market_regime`
- `expected_holding_period`
- `risk_tags`
- `status` (`active` / `disabled` / `paper` / `retired`)
- `version`
- runtime `score`

## 4. Daily Alpha History (Research Loop)

Per alpha/day, the system records:

- `date`
- `score_summary`
- `number_of_triggers`
- `average_confidence_contribution`
- `regime_match`
- `pnl_contribution_proxy`
- `hit_rate_proxy`
- `decay_flag`
- `correlation_cluster_tag`

These objects are used by:

- alpha health diagnostics
- challenger comparisons
- AI explanation for alpha down-weighting

## 5. How Alphas Drive Execution

- alpha scores -> model scoring/ranking
- model output -> A/B/C grading
- grading + risk filters -> portfolio candidates
- candidates + safety mode -> Today plan and AI explanation evidence
