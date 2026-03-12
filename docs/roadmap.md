# Nova Quant Roadmap (From Demo to Real System)

## Phase 1: Real Data Foundation
Goal: replace sample market data with production-grade feeds.

1. Integrate real OHLCV/volume/benchmark feed adapters.
2. Introduce data quality checks (missing bars, stale feed, split adjustments).
3. Add feature-store persistence with versioned schema.

## Phase 2: Backtest Engine Upgrade
Goal: make proof layer research-grade.

1. Event-driven backtest core with fill/slippage/fees model.
2. Walk-forward evaluation and train/test regime segmentation.
3. Strategy-level and alpha-level attribution reports.

## Phase 2.5: Research Store and Governance
Goal: make model evolution auditable and controlled.

1. Move local research store to external DB/object storage.
2. Add immutable experiment/version records with signed approvals.
3. Add rollback-ready promotion workflow and gate automation.

## Phase 3: Robust Paper Trading
Goal: map signals to executable paper portfolio state.

1. Real-time signal snapshotting + order simulation queue.
2. Portfolio state machine (pending/filled/partial/closed).
3. Paper-vs-model deviation monitoring.

## Phase 4: Broker API Integration
Goal: controlled path to live execution.

1. Broker adapters (order submit/cancel/position sync).
2. Execution risk guardrails with hard kill-switch.
3. Live audit trail: intent -> order -> fill -> pnl -> post-trade review.

## Phase 5: AI Co-Pilot Upgrade
Goal: from retrieval QA to operator-grade assistant.

1. Tool-driven AI access to data/feature/alpha/risk/proof APIs.
2. Explainability contracts tied to model versions.
3. Automated post-market summary and anomaly diagnosis.

## Deployment Principles
- Never label simulated metrics as live.
- All assumptions must be versioned and auditable.
- UI contracts should remain stable while engines become replaceable.
