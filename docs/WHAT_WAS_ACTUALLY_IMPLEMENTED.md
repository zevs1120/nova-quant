# What Was Actually Implemented

This is not a roadmap. It is the implementation truth for the current refactor.

## Implemented Now

### 1. Unified backend backbone endpoint

- `GET /api/backbone/summary`
- Returns a structured snapshot containing:
  - research kernel
  - decision engine
  - risk governance
  - feature platform
  - registries
  - Nova LLM ops
  - durable workflows
  - observability
  - portfolio allocator
  - evidence/review scorecards

### 2. Canonical domain contracts

- Added explicit shared contracts for:
  - research tasks
  - strategy candidates
  - risk state
  - portfolio intent
  - action cards
  - evidence bundles
  - validation results
  - experiment runs
  - model/prompt/workflow/review objects

### 3. New registry persistence

- Added database tables plus repository methods for:
  - `model_versions`
  - `prompt_versions`
  - `eval_registry`
  - `workflow_runs`
  - `audit_events`
  - `recommendation_reviews`

### 4. Local Nova LLM ops layer

- Added local-first Nova model routing summary:
  - Nova-Core
  - Nova-Scout
  - Nova-Retrieve
  - Nova-Challenger
- Added prompt pack definitions
- Added registry seeding for model/prompt versions
- Shifted provider preference to local Ollama first

### 5. Observability spine foundation

- Added trace id generation
- Added decision audit-event recording
- Added audit / workflow / chat observability summary

### 6. Feature platform foundation

- Added feature registry
- Added point-in-time contract description
- Added validation gates
- Added cache isolation dimensions
- Added repository read paths for dataset / feature / universe snapshots

### 7. Research kernel summary

- Added experiment lineage summary
- Added candidate / challenger / champion visibility
- Added research task abstractions and promotion flow summary

### 8. Portfolio allocator summary

- Added explicit universal-vs-personalized separation
- Added overlap and concentration checks
- Added rebalance / hedge / rotate semantics

### 9. Scorecard layer

- Added first structured proof layer for:
  - decision quality
  - no-action value
  - explanation effectiveness
  - risk call quality proxy
  - user alignment placeholder

### 10. Documentation and provenance

- Added borrow map
- Added backend architecture doc
- Added license/compliance notes

## Skeleton Built, But Still Needs Depth

### 1. Durable workflow runtime

Implemented:

- workflow blueprints
- workflow run persistence
- retry/resume/replay contract

Still limited by current repo:

- no Temporal-like executor
- workflows are represented and auditable, but not yet independently scheduled/orchestrated inside this repo

### 2. Feature platform

Implemented:

- feature registry
- parity contract
- validation gates

Still limited by current repo:

- not every runtime feature is yet snapshot-backed
- some features remain derived on demand instead of through a full online feature service

### 3. LLM ops

Implemented:

- local model routing
- prompt/model registry
- provider preference shift to Ollama

Still limited by current repo:

- prompt eval storage is scaffolded through registry and scorecards, not a full annotation UI
- trace replay exists as data structure, not a standalone review console

### 4. Scorecards / self-proof

Implemented:

- scorecard computation structure
- recommendation review persistence

Still limited by current repo:

- historical review volume is still sparse
- some score dimensions return `null` until more real review data accumulates

## Deliberately Not Implemented In This Refactor

- full cloud orchestration
- distributed workflow execution
- hosted feature store
- external observability stack deployment
- direct code import from public OSS repos
- turning the frontend into a dashboard

## Why This Still Counts As Real Progress

The important change is not “more endpoints”.
The important change is that NovaQuant now has a clearer professional backend skeleton:

- one backbone
- one set of contracts
- one registry mindset
- one local Nova routing layer
- one inspectable summary of the system state

That is what makes future depth additive instead of chaotic.
