# System Architecture

## Target layers

### 1) Data Layer
Inputs:
- OHLCV bars
- corporate actions / splits / dividends
- market regime features
- cross-sectional features
- crypto funding / basis / open interest / liquidations / depth proxies
- execution cost models

Outputs:
- clean canonical feature tables
- event tables
- universe membership snapshots

### 2) Research Layer
Modules:
- feature registry
- strategy template registry
- candidate generator
- parameter search / constrained optimization
- validation engine
- experiment tracker

### 3) Portfolio Decision Layer
Modules:
- regime classifier/state machine
- signal scorer
- conflict resolver
- position sizing engine
- risk budget allocator
- action queue generator

### 4) Release / Governance Layer
Lifecycle:
- DRAFT
- SHADOW
- CANARY
- PROD
- DEGRADE
- RETIRE

### 5) Product Layer
Surfaces:
- opportunity cards
- market regime card
- risk guardrails
- portfolio action queue
- AI Copilot Console
- evidence drawer
- performance / audit pages

## Design principle
The user sees a simple plan.
The system contains the complexity.
