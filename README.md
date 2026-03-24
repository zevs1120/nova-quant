# Nova Quant

Nova Quant is an AI-native quantitative **decision** platform for US equities and crypto.
Current app version: `10.3.1` (build `61`).
Versioning policy: `package.json` is canonical, `src/config/version.js` is the generated runtime mirror, and release history lives in `CHANGELOG.md` / `docs/VERSIONING.md`.
Auth supports two backends: **Postgres** (recommended for production, set `DATABASE_URL`) and **Upstash Redis** (legacy deployed path via `KV_REST_API_URL` + `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`). Local development uses SQLite auth by default. Without any remote auth backend configured, deployed `/api/auth/*` returns `AUTH_STORE_NOT_CONFIGURED`.
Browse search can now merge external market results into `/api/assets/search`. By default it augments local assets with the SEC company ticker universe and CoinGecko crypto search; set `ALPHA_VANTAGE_API_KEY` for broader stock / ETF lookup and `COINGECKO_DEMO_API_KEY` (or `COINGECKO_API_KEY` / `COINGECKO_PRO_API_KEY`) for higher-volume crypto search.

It is designed to help self-directed traders reduce emotional trading and execute with discipline.
It is **not** a blind auto-trading bot and does **not** fabricate live performance.

## Monorepo Deployment Layout

This repository now supports a strict four-part deployment layout:

- `app/`: user-facing H5 frontend on Vercel
- `server/`: pure API layer on Vercel
- `admin/`: internal control dashboard on Vercel (includes System Health + Research Ops dashboards)
- `model/`: EC2-side model boundary and signal contract

Production domains should be split as:

- `https://novaquant.cloud` -> `app/`
- `https://api.novaquant.cloud` -> `server/`
- `https://admin.novaquant.cloud` -> `admin/`

Runtime rules:

- `app/` and `admin/` call API only
- `server/` is the only layer allowed to read/write the database
- `model/` pushes standardized signals to `server/` and does not touch user data

## What This Repository Now Guarantees

- Fresh-environment friendly: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run verify`
- One canonical **Nova Assistant** path across Ask Nova / AI page / chat APIs
- Explicit thread persistence for multi-turn AI conversations
- Deterministic fallback guidance when no LLM provider is configured
- Runtime cache isolation by user + risk profile + market + asset class + timeframe + scope
- Strict runtime status labels for `DB_BACKED`, `MODEL_DERIVED`, `INSUFFICIENT_DATA`, `DISCONNECTED`, `DEMO_ONLY`, and related states
- Ranked action cards backed by decision snapshots, evidence bundles, and audit history
- Morning Check / wrap-up / widget / notification summaries grounded in backend engagement state
- A unified copy operating system so homepage, action cards, notifications, widgets, wrap-up, and Nova Assistant all speak with one voice
- A perception-layer system that makes NovaQuant feel like a judgment surface, not a traditional finance dashboard
- A professional backend backbone that unifies research, risk, decision, portfolio, evidence, local Nova LLM ops, workflows, registries, and observability
- A single-machine **local Nova** runtime on Apple Silicon via Ollama, with model routing, task logging, review labels, and MLX-LM export
- Session-scoped authentication with Postgres-backed user/session/role store, RBAC guards, and password reset email flow
- Holdings import from CSV files, broker screenshots (vision-model), and read-only exchange sync
- Admin Research Ops dashboard for daily workflow, data intake, Alpha evaluation, and training monitoring
- Clean handoff tooling that excludes local databases, build artifacts, cached node modules, and platform junk

## What Changed In This Runtime-Realism Upgrade

- Runtime now derives from **SQLite + ingested bars + derived state**.
- Frontend default path is now **API-first** (not local pipeline-first).
- Chat tools no longer read `public/mock/*` in runtime path.
- Connectors no longer return fake balances/positions by default.
- Performance outputs now carry source/sample transparency and withhold low-sample metrics.
- Backtest / Replay / Paper now have a shared **Evidence Engine** path with run registry and reconciliation APIs.

## Core Architecture

Primary application layers:

- `src/App.jsx`: mobile-first product shell and tab orchestration
- `src/server/api/app.ts`: canonical API surface for frontend + evidence + assistant (109 routes)
- `src/server/auth/postgresStore.ts`: Postgres-backed auth store (users, sessions, roles, password resets, user state sync)
- `src/server/auth/service.ts`: authentication service with session-scoped middleware and RBAC
- `src/server/decision/engine.ts`: decision engine for risk-adjudicated, portfolio-aware action cards
- `src/server/chat/service.ts`: canonical Nova Assistant service with threads, fallback, and evidence-aware prompt assembly
- `src/server/chat/tools.ts`: deterministic internal tool layer (signals, market state, performance, risk, retrieval fallback)
- `src/server/quant/service.ts`: quant runtime synchronization + cache isolation
- `src/server/quant/runtimeDerivation.ts`: DB-backed runtime derivation
- `src/server/evidence/engine.ts`: replay / backtest / evidence engine
- `src/server/holdings/import.ts`: CSV / screenshot holdings import with auto-detection and normalization
- `src/server/admin/liveOps.ts`: admin Research Ops aggregation (workflows, data intake, Alpha eval, training)
- `src/server/backbone/service.ts`: unified backend backbone summary spanning research, risk, decision, registries, workflows, observability, portfolio, and review
- SQLite (`data/quant.db` at runtime, excluded from handoff packages)
- Postgres (auth store, optional, recommended for production)

## Backend Backbone

NovaQuant now exposes a proper backend backbone rather than a loose collection of subsystems.

Canonical inspection surface:

- `GET /api/backbone/summary`

New backbone modules:

- `src/server/domain/contracts.ts`
- `src/server/feature/platform.ts`
- `src/server/research/kernel.ts`
- `src/server/registry/service.ts`
- `src/server/ai/llmOps.ts`
- `src/server/workflows/durable.ts`
- `src/server/observability/spine.ts`
- `src/server/risk/governance.ts`
- `src/server/portfolio/allocator.ts`
- `src/server/evals/scorecards.ts`
- `src/server/nova/router.ts`
- `src/server/nova/client.ts`
- `src/server/nova/service.ts`
- `src/server/nova/training.ts`

Reference docs:

- `docs/OPEN_SOURCE_BORROW_MAP.md`
- `docs/NOVAQUANT_BACKEND_ARCHITECTURE_AFTER_REFACTOR.md`
- `docs/WHAT_WAS_ACTUALLY_IMPLEMENTED.md`
- `docs/LICENSE_AND_COMPLIANCE_NOTES.md`
- `docs/NOVA_LOCAL_STACK.md`
- `docs/NOVA_TRAINING_LOOP.md`

## Local Marvix Runtime

Nova Assistant now defaults to the **Marvix** model family on a local-only Ollama runtime for macOS / Apple Silicon.

Endpoint:

- `http://127.0.0.1:11434/v1`

Default routing:

- `Marvix-Core` -> decision reasoning / action cards / grounded assistant answers
- `Marvix-Scout` -> fast classification / state tagging
- `Marvix-Retrieve` -> embeddings / retrieval

Primary APIs:

- `GET /api/nova/runtime`
- `GET /api/nova/health`
- `GET /api/nova/runs`
- `POST /api/nova/review-label`
- `GET /api/nova/training/export`

Local operator commands:

- `npm run nova:health`
- `npm run nova:export-mlx`
- `npm run nova:train:lora`

This keeps the product grounded:

- structured decision / risk / evidence objects remain canonical
- local Marvix generates concise language and explanations on top of those objects
- if Ollama is unavailable, the runtime falls back to deterministic copy instead of fabricating output

Compatibility note:

- public model aliases now surface as `Marvix-*`
- existing `/api/nova/*` paths stay in place so current clients do not break

VPS deployment:

- see `docs/AWS_EC2_DEPLOYMENT.md` for the recommended EC2 single-host setup using `SERVE_WEB_DIST=1` + `npm run start:api`
- `docs/VULTR_DEPLOYMENT.md` remains available if you want a generic VPS path later

## Autonomous Alpha Discovery

MARVIX now includes an autonomous alpha discovery loop for controlled research deployment on EC2.

What it does:

- generates candidate alpha ideas from seeded hypotheses + templates
- mutates/refines them with a simplicity and robustness bias
- runs proxy backtest evaluation and hard rejection gates
- registers every candidate with lifecycle + evaluation history
- promotes accepted candidates to `SHADOW` only
- logs shadow outcomes and only promotes to `CANARY` if shadow thresholds pass
- never auto-promotes newly discovered alpha straight to full production capital

Primary modules:

- `src/server/alpha_discovery/index.ts`
- `src/server/alpha_registry/index.ts`
- `src/server/alpha_evaluator/index.ts`
- `src/server/alpha_mutation/index.ts`
- `src/server/alpha_shadow_runner/index.ts`
- `src/server/alpha_promotion_guard/index.ts`

Operator commands:

- `npm run alpha:discover`
- `npm run marvix:ops`
- `npm run auto:backend`

Key environment variables:

- `NOVA_ALPHA_DISCOVERY_ENABLED`
- `NOVA_ALPHA_DISCOVERY_INTERVAL_HOURS`
- `NOVA_ALPHA_DISCOVERY_MAX_CANDIDATES`
- `NOVA_ALPHA_DISCOVERY_SEARCH_BUDGET`
- `NOVA_ALPHA_DISCOVERY_MIN_ACCEPTANCE_SCORE`
- `NOVA_ALPHA_SHADOW_MIN_SAMPLE_SIZE`
- `NOVA_ALPHA_SHADOW_MIN_SHARPE`
- `NOVA_ALPHA_SHADOW_MIN_EXPECTANCY`
- `NOVA_ALPHA_RETIRE_MAX_DRAWDOWN`
- `NOVA_ALPHA_ALLOW_PROD_PROMOTION`

Results live in SQLite tables:

- `alpha_candidates`
- `alpha_evaluations`
- `alpha_shadow_observations`
- `alpha_lifecycle_events`

Private inspection:

- `GET /api/internal/marvix/ops`
- loopback-only, intended for EC2 operator access rather than end-user UI

## Source of Truth

Primary backend source of truth:

- `src/server/api/app.ts`
- `src/server/api/queries.ts`
- `src/server/decision/engine.ts`
- `src/server/quant/service.ts`
- `src/server/quant/runtimeDerivation.ts`
- `src/server/auth/postgresStore.ts` (auth store schema + queries)
- SQLite (`data/quant.db`) for business data
- Postgres (auth store, when `DATABASE_URL` is set)

## Decision Engine

Nova Quant now behaves as a decision system rather than a raw signal feed.

Canonical chain:

```text
raw observations
-> features / factors
-> research signals
-> eligible signals
-> risk state + policy filter
-> portfolio intent
-> personalized action cards
-> evidence bundle
-> grounded assistant explanation
```

Key runtime surfaces:

- `GET /api/runtime-state` includes a baseline `data.decision`
- `POST /api/decision/today` builds a personalized decision snapshot using user holdings context
- `GET /api/decision/audit` exposes persisted recommendation history for replay and review

## Engagement System

Nova Quant now also exposes a lightweight engagement layer built around calm decision rituals rather than high-frequency trading prompts.

Core engagement surfaces:

- `POST /api/engagement/state`
- `POST /api/engagement/morning-check`
- `POST /api/engagement/boundary`
- `POST /api/engagement/wrap-up`
- `POST /api/engagement/weekly-review`
- `GET /api/widgets/summary`
- `GET /api/notifications/preview`

These objects drive:

- Morning Check state
- discipline / habit state
- evening wrap-up
- widget preview summaries
- notification reasons and cadence

## Copy Operating System

NovaQuant now includes a structured copy/persona layer rather than scattered UI strings.

Primary resources:

- `src/copy/novaCopySystem.js`
- `src/copy/novaCopySystem.d.ts`
- `docs/COPY_OPERATING_SYSTEM.md`

This layer defines:

- brand voice constitution
- tone matrix by posture and user state
- state-to-copy selectors
- notification/widget guardrails
- assistant voice rules
- no-action completion language

## Perception Layer

NovaQuant now includes a dedicated perception layer designed to make the product feel like a new AI-native decision category rather than a better finance tool.

Primary resources:

- `docs/PERCEPTION_LAYER_DIFFERENTIATION.md`
- `src/server/engagement/engine.ts`
- `src/copy/novaCopySystem.js`
- `src/components/TodayTab.jsx`

This layer defines:

- system-first judgment arrival lines
- decision-presence summaries for the Today surface
- state-driven emotional tone without hype
- a stricter separation from dashboard-like finance product behavior

## Versioning

NovaQuant now uses a single SemVer source synchronized across package metadata, runtime config, About, and changelog.

Commands:

- `npm run version:major`
- `npm run version:minor`
- `npm run version:patch`

Version metadata source:

- `package.json`
- `src/config/version.js`
- `CHANGELOG.md`

## Runtime Status Labels

Nova Quant uses explicit status labels in API/runtime outputs:

- `DB_BACKED`
- `REALIZED`
- `PAPER_ONLY`
- `BACKTEST_ONLY`
- `MODEL_DERIVED`
- `EXPERIMENTAL`
- `DISCONNECTED`
- `INSUFFICIENT_DATA`
- `DEMO_ONLY` (only for explicit demo paths)

## Quick Start (Fresh Clone)

```bash
npm ci
npm run db:init
npm run backfill -- --market CRYPTO --tf 1h
npm run validate:data -- --tf 1h --lookbackBars 800
npm run derive:runtime
npm run api:data
```

In another terminal:

```bash
npm run dev
```

Quality gates:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run verify
```

## Notes On Data

- **Primary API data source**: Massive.com (formerly Polygon.io) REST API for both US equities and crypto OHLCV. Module: `src/server/ingestion/massive.ts`. Requires `MASSIVE_API_KEY` in `.env`. Basic (free) tier enforces 12s delay between requests.
- US data: Stooq bulk ingestion (`src/server/ingestion/stooq.ts`) with configured symbol whitelist (legacy fallback).
- Crypto data: Binance public bulk + incremental REST ingestion (legacy fallback).
- If data is stale/insufficient, APIs return honest degraded states (`INSUFFICIENT_DATA`) instead of synthetic beautification.

## Key Commands

- `npm run clean`
- `npm run lint`
- `npm run db:init`
- `npm run backfill`
- `npm run validate:data`
- `npm run derive:runtime`
- `npm run evidence:run`
- `npm run api:data`
- `npm run dev`
- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run verify`
- `npm run package:source` (build a diligence-ready clean source archive)

## Nova Assistant

Nova Quant now exposes a single canonical assistant stack:

- Frontend AI page and Ask Nova entry both use `/api/chat`
- Conversation threads persist in SQLite (`chat_threads`, `chat_messages`)
- Recent thread memory is fed into the assistant for multi-turn continuity
- Internal context is selected through tools, not by dumping raw runtime JSON into the prompt
- If no provider is configured or a provider fails, Nova degrades honestly to deterministic internal guidance instead of pretending the LLM succeeded

Assistant boundaries:

- It may explain signals, risk posture, positions, and evidence
- It does **not** claim live fills, broker access, or realized performance when those do not exist

## AI-Native Research Layer

Nova Assistant now also supports a research mode aimed at quant research tasks rather than only
signal explanation.

Current research capabilities include:

- factor taxonomy and definition retrieval
- factor interaction lookup
- measured factor evaluation for OHLCV-supported factors
- strategy family registry lookup
- regime diagnostics
- factor diagnostics for current signals
- factor-by-regime comparison
- strategy evaluation reports
- validation report objects
- experiment registry memory
- research workflow planning
- backtest integrity and overfit-risk style checks
- turnover / cost drag review
- failed experiment surfacing
- research topic summarization

This means Nova can now help with:

- "Why does this signal exist?"
- "Why is there no signal right now?"
- "How does momentum usually behave across regimes?"
- "Is this result likely to be overfit?"
- "Does turnover erase the edge after costs?"
- "What should the next research workflow look like?"
- "Which experiments were rejected, and why?"

## Vercel Deploy Notes

- Frontend build: `npm run build`
- Static output: `dist/`
- API runtime: `api/[...route].ts` delegates to `src/server/api/app.ts`
- On Vercel, SQLite defaults to `/tmp/nova-quant/quant.db` unless `DB_PATH` is explicitly provided
- The Vercel runtime will auto-create schema on first cold start, but it will start with an empty ephemeral database unless you connect a persistent backend later
- For investor walkthroughs, use the in-app `Demo Mode / 体验 Demo` switch after deploy

## Clean Source Package (For Advisors / DD)

Create a clean source package:

```bash
npm run package:source
```

Dry run (show exclusion policy only):

```bash
node scripts/package-source.mjs --dry-run
```

Default exclusions include local/runtime artifacts:

- `node_modules/`, `dist/`, `build/`, `coverage/`
- `data/*.db`, `data/*.db-wal`, `data/*.db-shm`, `*.sqlite*`, `*.wal`, `*.shm`
- `__MACOSX/`, `.DS_Store`, local logs/tmp artifacts
- `.vercel/`, `artifacts/`, `release/`

## Documentation

**Start here for repo layout and commands:** [`docs/REPOSITORY_OVERVIEW.md`](docs/REPOSITORY_OVERVIEW.md), [`docs/REPO_RUNBOOK.md`](docs/REPO_RUNBOOK.md), [`docs/VERSIONING.md`](docs/VERSIONING.md).

- [`architecture.md`](architecture.md) — comprehensive architecture overview (project root)

- [`docs/SYSTEM_ARCHITECTURE.md`](docs/SYSTEM_ARCHITECTURE.md)
- [`docs/NOVA_ASSISTANT_ARCHITECTURE.md`](docs/NOVA_ASSISTANT_ARCHITECTURE.md)
- [`docs/DECISION_ENGINE.md`](docs/DECISION_ENGINE.md)
- [`docs/ENGAGEMENT_SYSTEM.md`](docs/ENGAGEMENT_SYSTEM.md)
- [`docs/PLAYFUL_INTERACTION_SYSTEM.md`](docs/PLAYFUL_INTERACTION_SYSTEM.md)
- [`docs/QUANT_RESEARCH_DOCTRINE.md`](docs/QUANT_RESEARCH_DOCTRINE.md)
- [`docs/RESEARCH_ASSISTANT_TOOLS.md`](docs/RESEARCH_ASSISTANT_TOOLS.md)
- [`docs/TECHNICAL_DUE_DILIGENCE_GUIDE.md`](docs/TECHNICAL_DUE_DILIGENCE_GUIDE.md)
- [`docs/RUNTIME_DATA_LINEAGE.md`](docs/RUNTIME_DATA_LINEAGE.md)
- [`docs/REALISM_UPGRADE_SUMMARY.md`](docs/REALISM_UPGRADE_SUMMARY.md)
- [`docs/REPO_RUNBOOK.md`](docs/REPO_RUNBOOK.md)
- [`docs/BACKTEST_REPLAY_PAPER_EVIDENCE_ENGINE.md`](docs/BACKTEST_REPLAY_PAPER_EVIDENCE_ENGINE.md)
- [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md)
- [`docs/SIGNAL_FUNNEL.md`](docs/SIGNAL_FUNNEL.md)

Historical reviews were archived under:

- [`docs/archive/`](docs/archive/)
