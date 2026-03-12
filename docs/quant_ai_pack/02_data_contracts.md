# Canonical Data Contracts

## 1. Instrument master
Fields:
- instrument_id
- symbol
- market (equity|crypto|futures|options)
- venue
- sector/theme
- quote_ccy
- base_ccy
- tick_size
- lot_size
- active_from
- active_to
- tradable_flag

## 2. Bar data
Fields:
- ts
- instrument_id
- timeframe
- open
- high
- low
- close
- volume
- vwap(optional)
- trade_count(optional)
- source
- adjusted_flag

Rules:
- timestamps normalized to UTC internally
- explicitly mark adjusted vs raw
- never mix adjusted and raw prices in one backtest silently

## 3. Feature table
Primary key:
- ts
- instrument_id

Fields examples:
- ret_1d
- ret_5d
- atr_14
- vol_pct_20d
- rel_strength_20d
- regime_score_trend
- regime_score_vol
- cs_rank_mom
- funding_rate
- basis_annualized
- oi_change
- velocity_score

## 4. Signal candidate table
Fields:
- signal_id
- ts_generated
- instrument_id
- strategy_family
- strategy_variant
- side
- alpha_score
- regime_required
- entry_type
- entry_low
- entry_high
- stop
- tp1
- tp2
- trail_rule_json
- est_holding_days
- suggested_risk_bucket
- expected_cost_bps
- invalidation_rule_json

## 5. Order simulation table
Fields:
- order_id
- signal_id
- submitted_ts
- expiry_ts
- order_type
- limit_price
- stop_price
- size_notional
- size_units
- fill_status
- fill_ts
- fill_price
- est_slippage_bps
- actual_slippage_bps
- reject_reason

## 6. Position table
Fields:
- position_id
- instrument_id
- side
- entry_ts
- entry_px
- current_size
- stop_px
- tp_rule
- current_risk_used
- strategy_id
- risk_bucket
- regime_at_entry

## 7. Audit log table
Fields:
- audit_id
- ts
- entity_type
- entity_id
- decision_stage
- input_snapshot_hash
- code_version
- model_version
- explanation_json
- changed_by

## Conventions
- All assumptions versioned
- Every dataset has source + freshness metadata
- Every production metric must be reproducible from raw logs
