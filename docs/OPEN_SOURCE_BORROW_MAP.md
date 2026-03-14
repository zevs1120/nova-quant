# Open-source Borrow Map

This document records which public repositories informed the current NovaQuant backend refactor, what was borrowed conceptually, what was intentionally not adopted, and how license risk was avoided.

NovaQuant did **not** copy wholesale implementations from these repositories. The borrow pattern is:

- study architecture and abstractions
- re-express them inside NovaQuant's own domain boundaries
- keep NovaQuant aligned with its own product philosophy:
  - minimal frontend
  - heavy backend
  - risk as upper-layer adjudicator
  - decision before information display
  - Nova as explanation and learning flywheel

## White-list Sources

### Qlib
- Core problem solved:
  - research platform structure from data -> feature -> model -> backtest -> evaluation -> production.
- Borrowed patterns:
  - research kernel abstraction
  - experiment lineage
  - rolling / replay / evaluation continuity
  - risk / portfolio / execution separation in research outputs
- Direct NovaQuant mapping:
  - `/src/server/research/kernel.ts`
  - `/src/server/domain/contracts.ts`
  - `/src/server/backbone/service.ts`
- Not adopted:
  - Qlib's full data infrastructure and training runtime
- License note:
  - treated as conceptually borrowable; no direct code copy included in this repo

### RD-Agent
- Core problem solved:
  - research as an iterative loop, not a single pass.
- Borrowed patterns:
  - factor/model proposal -> evaluation -> refinement
  - structured research tasks
  - experiment memory and failed-idea retention
- Direct NovaQuant mapping:
  - research kernel task abstractions
  - experiment registry / workflow alignment
- Not adopted:
  - autonomous agent loop implementation
- License note:
  - conceptual borrow only

### Lean
- Core problem solved:
  - institutional event-driven trading engine decomposition.
- Borrowed patterns:
  - alpha / portfolio / risk / execution separation
  - risk model as upper-layer override
  - event-driven semantics for actions and reviews
- Direct NovaQuant mapping:
  - decision engine + risk governance + portfolio allocator separation
  - canonical semantics in `/src/server/backbone/service.ts`
- Not adopted:
  - order routing / brokerage execution engine implementation
- License note:
  - conceptual borrow only

### Feast
- Core problem solved:
  - point-in-time correct feature access and offline/online parity.
- Borrowed patterns:
  - feature registry
  - serving keys
  - training-serving skew avoidance
- Direct NovaQuant mapping:
  - `/src/server/feature/platform.ts`
- Not adopted:
  - full feature store service
- License note:
  - conceptual borrow only

### Great Expectations
- Core problem solved:
  - data contracts and expectations as tests.
- Borrowed patterns:
  - validation gates as structured outputs
  - data quality as productized contract
- Direct NovaQuant mapping:
  - feature platform validation gates
  - existing ingestion validation + documented contract spine
- Not adopted:
  - GX DSL / runtime integration
- License note:
  - conceptual borrow only

### MLflow
- Core problem solved:
  - experiment, model, prompt, artifact, and promotion lineage.
- Borrowed patterns:
  - registry mindset
  - run / artifact / version vocabulary
  - promotion history
- Direct NovaQuant mapping:
  - model_versions / prompt_versions / eval_registry / workflow_runs
  - `/src/server/registry/service.ts`
- Not adopted:
  - MLflow server/runtime
- License note:
  - conceptual borrow only

### Temporal
- Core problem solved:
  - durable workflows with retry / replay / resume.
- Borrowed patterns:
  - workflow blueprints
  - retry / resume / replay semantics
- Direct NovaQuant mapping:
  - `/src/server/workflows/durable.ts`
- Not adopted:
  - Temporal server / SDK runtime
- License note:
  - conceptual borrow only

### OpenTelemetry Collector
- Core problem solved:
  - structured telemetry spine across logs / metrics / traces.
- Borrowed patterns:
  - correlation ids
  - metrics catalog
  - trace spine thinking
- Direct NovaQuant mapping:
  - `/src/server/observability/spine.ts`
  - decision audit event recording
- Not adopted:
  - full collector pipeline deployment
- License note:
  - conceptual borrow only

### Langfuse
- Core problem solved:
  - LLM prompt/version/eval/trace lineage.
- Borrowed patterns:
  - prompt registry
  - LLM trace schema
  - offline review & replay mindset
- Direct NovaQuant mapping:
  - `/src/server/ai/llmOps.ts`
  - prompt/model registries
- Not adopted:
  - hosted Langfuse service or enterprise features
- License note:
  - only MIT-safe concepts referenced; no ee code or direct copy

### Riskfolio-Lib
- Core problem solved:
  - allocator abstraction, risk budgeting, and constraints.
- Borrowed patterns:
  - allocator as explicit layer
  - concentration / overlap / risk-budget semantics
- Direct NovaQuant mapping:
  - `/src/server/portfolio/allocator.ts`
  - risk governance overlay design
- Not adopted:
  - numerical optimizer implementation
- License note:
  - conceptual borrow only

## Gray-list Sources

### vectorbt
- Borrowed only:
  - fast research loop intuition
  - records-first result organization
- Not adopted:
  - implementation or dependency
- Reason:
  - Commons Clause constraints

### OpenBB
- Borrowed only:
  - provider normalization / adapter mindset
- Not adopted:
  - implementation or dependency
- Reason:
  - AGPL-3.0 constraints

## Explicit Non-adoption Principles

- No AGPL core code merged into NovaQuant backend
- No Commons Clause core code merged into NovaQuant backend
- No enterprise / ee directories referenced as implementation source
- No direct source copy from third-party repos into NovaQuant runtime paths

## Resulting NovaQuant Modules

The borrowed architecture patterns now surface as:

- `/src/server/domain/contracts.ts`
- `/src/server/research/kernel.ts`
- `/src/server/feature/platform.ts`
- `/src/server/registry/service.ts`
- `/src/server/ai/llmOps.ts`
- `/src/server/workflows/durable.ts`
- `/src/server/observability/spine.ts`
- `/src/server/risk/governance.ts`
- `/src/server/portfolio/allocator.ts`
- `/src/server/evals/scorecards.ts`
- `/src/server/backbone/service.ts`

The result is intentionally a NovaQuant-native backend spine, not a stitched-together clone of public projects.
