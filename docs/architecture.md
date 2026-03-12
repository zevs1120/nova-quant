# Nova Quant v1 Architecture

## 1. Scope
Nova Quant v1 is a **front-end runnable prototype** of an AI quant trading system. It is not a news portal and not a generic chat shell.

This version is designed to be:
- runnable in current H5 mobile UI
- logically consistent across Today / Performance / Safety / Insights / AI
- transparent about data provenance (`sample`, `derived`, `simulated`, `upcoming`)
- able to run a controlled self-improving research loop

## 2. Layered System

### Layer A. Data Layer
- Source: deterministic local sample dataset (`src/quant/sampleData.js`)
- Includes:
  - `ticker`, `name`, `sector`, `industry`, `market_cap`
  - daily `OHLCV`, `vwap`, `returns`
  - `adv_20`, `volatility_20`
  - benchmark/index series (`SPY`, `QQQ`, `IWM`, `BTC-USDT`)

### Layer B. Feature Layer
- Source: derived from Data Layer (`computeFeatureLayer`)
- Features include:
  - Trend: 1/5/10/20/60D return, MA deviation, breakout
  - Mean Reversion: z-score, RSI14, VWAP deviation
  - Volume/Price: volume/ADV, turnover shock
  - Volatility: ATR%, HV20, downside volatility
  - Cross-sectional: overall rank, industry rank
  - Market-state inputs: breadth, index trend, style spread, risk appetite

### Layer C. Alpha Layer
- Source: rule alpha library (`ALPHA_LIBRARY`)
- 16 alphas across families:
  - Trend
  - Mean Reversion
  - Volume/Price
  - Market State
  - Risk Filter
- Every alpha has id/name/family/description/inputs/regime/holding period/risk tags/active+score.

### Layer D. Model Layer
- Deterministic model stack:
  1. Signal scoring
  2. Regime model
  3. Risk model
  4. Ranking model
- Outputs per ticker:
  - `opportunity_score`
  - `confidence`
  - `regime_tag`
  - `risk_score`
  - `rank_order`
  - `suggested_action`

### Layer E. Portfolio Layer
- Converts model outputs into executable candidates.
- Constraints:
  - max holdings
  - max single weight
  - sector exposure cap
  - regime-dependent gross/net target
- Outputs:
  - `long/short/avoid`
  - A/B/C grading
  - `target_weight_pct`
  - entry logic
  - filtered-out list + reason

### Layer F. Risk & Safety Layer
- Three-level risk:
  1. Market-level
  2. Portfolio-level
  3. Instrument-level
- Outputs:
  - `safety_score`
  - suggested gross/net exposure
  - risk mode (`do not trade`, `trade light`, `normal risk`, `aggressive risk`)
  - primary risk drivers
  - rulebook cards

### Layer G. Performance / Proof Layer
- Explicit source partition:
  - `Backtest` (sample historical simulation)
  - `Simulated/Paper`
  - `Live` (upcoming; not fabricated)
- Metrics include:
  - monthly return
  - equity curve
  - drawdown
  - win rate / Sharpe / Sortino / avg holding

### Layer H. Insights Layer
- Quant-focused market context:
  - current regime
  - breadth
  - sector leadership
  - volatility environment
  - style rotation
  - risk-on/off interpretation
  - why today’s signal structure looks this way

### Layer I. AI Layer
- Front-end retrieval-based explanation layer (`src/quant/aiRetrieval.js`)
- Uses current system outputs (Today/Safety/Insights/Portfolio) instead of static generic chat.
- Supports preset analytical questions and structured answers with evidence lines.

### Layer J. Self-Improving Research Loop
- Daily loop engine (`src/quant/researchLoop.js`) with date-based snapshots.
- Local research store (`src/quant/researchStore.js`) for merged history:
  - daily snapshots
  - alpha daily stats
  - model/risk/portfolio history
  - experiments and promotion decisions
- Champion/challenger comparison and governance rules are first-class objects.

### Layer K. Multi-Asset Data & Training Pipeline
- Pipeline engine (`src/research/multiAssetPipeline.js`) covers:
  - US equities
  - US equity options
  - crypto spot
- Structured source adapters (`src/data_sources/...`) with explicit mode labels (`sample_fallback` vs `live_path_available`).
- Normalizers (`src/normalizers/...`) preserve both unified provenance and asset-specific fields.
- Feature factories (`src/feature_factories/...`) are asset-specific by design.
- Dataset builders (`src/dataset_builders/...`) generate `TrainingDataset` objects with split metadata.
- Interface layer (`src/training/multiAssetTrainingService.js`) exposes:
  - `get_training_dataset`
  - `list_available_assets`
  - `get_dataset_snapshot`
  - `get_feature_manifest`
  - `get_source_health`
  - `get_latest_data_status`

## 3. UI Mapping
- `Today` -> Data/Feature/Alpha/Model/Portfolio summary
- `Safety` -> Risk layer center
- `Insights` -> Market-state and signal-context layer
- `Performance` -> Proof layer with source transparency
- `AI` -> Retrieval and explanation layer
- `Research` -> Internal diagnostics, challenger comparison, and governance
- `Research/Data Hub` -> Multi-asset coverage, source health, dataset snapshots, quality report

## 4. Extensibility Path
Current implementation is deterministic and local. To migrate toward production:
1. replace Data Layer with real market feed API
2. replace rule model with trainable model services
3. replace simulated paper/live with broker-integrated execution logs
4. preserve UI contract; replace only adapters and layer engines
