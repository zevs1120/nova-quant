# Repository Overview

Last updated: 2026-03-23

This document explains the purpose of each major Nova Quant module for rapid onboarding and technical diligence.

## Deployment layout (monorepo)

See root [`README.md`](../README.md) for full detail. Summary:

| Path      | Role                                                                                       |
| --------- | ------------------------------------------------------------------------------------------ |
| `landing/`| Brand landing page (e.g. `novaquant.cloud`)                                                |
| `app/`    | User-facing H5 frontend (e.g. `app.novaquant.cloud`)                                       |
| `server/` | API-focused deploy package; implementation lives in root `src/server/` + [`api/`](../api/) |
| `admin/`  | Internal control dashboard (e.g. `admin.novaquant.cloud`)                                  |
| `model/`  | EC2-side model boundary; pushes signals to `POST /api/model/signals/ingest` only           |

**Local dev** usually runs from the **repo root** (`npm run dev` → API on `8787` + Vite). Database defaults to `data/quant.db` (see `src/server/config.ts` / `DB_PATH`).

## Top-Level Review Modules

- `ui/`: UI-facing review entrypoints and docs
- `api/`: API surface and service docs
- `data/`: normalized/derived data artifacts + reference seeds
- `strategies/`: strategy layer review entrypoints
- `regime/`: regime engine review entrypoint
- `risk/`: risk bucket review entrypoint
- `diagnostics/`: funnel/shadow diagnostics entrypoint
- `backtest/`: validation and walk-forward review entrypoint
- `copilot/`: product/assistant entrypoint
- `research/`: evidence/copilot/weekly-cycle review entrypoints
- `portfolio_simulation/`: portfolio simulation review entrypoint
- `tests/`: credibility-focused automated checks
- `docs/`: architecture, contracts, governance, due diligence docs

## Runtime Source Modules (`src/`)

## Core research

- `src/research/core/`: strategy families, regime, risk, funnel, shadow, validation, governance, discovery integration

## Discovery

- `src/research/discovery/`: hypothesis registry, template registry, candidate generation/validation/scoring/diagnostics

## Evidence

- `src/research/evidence/`: strategy evidence chain and lineage objects
- `src/server/evidence/`: canonical backtest/replay/paper evidence orchestration and API-facing evidence views

## Portfolio simulation

- `portfolio_simulation/`: review README and entrypoints for portfolio simulation
- `src/portfolio_simulation/`: multi-strategy portfolio simulation engine implementation

## AI research copilot

- `src/research/copilot/`: diagnostics-aware research action suggestions

## Weekly cycle

- `src/research/weekly_cycle/`: weekly research cycle object + markdown report builder

## Pipeline orchestration

- `src/engines/pipeline.js`: end-to-end integration point producing current decision state plus research-core outputs

## Data and training

- `src/normalizers/`, `src/feature_factories/`, `src/dataset_builders/`, `src/training/`: ingestion and model-data preparation stack

## Server

- `src/server/`: API, ingestion jobs, storage, chat service, delivery hooks

## Key Documentation

- `docs/REPO_RUNBOOK.md`
- `docs/VERSIONING.md`
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/DATA_CONTRACTS.md`
- `docs/STRATEGY_REGISTRY.md`
- `docs/SIGNAL_FUNNEL.md`
- `docs/STRATEGY_DISCOVERY_ENGINE.md`
- `docs/RESEARCH_EVIDENCE_SYSTEM.md`
- `docs/BACKTEST_REPLAY_PAPER_EVIDENCE_ENGINE.md`
- `docs/PORTFOLIO_SIMULATION_ENGINE.md`
- `docs/AI_RESEARCH_COPILOT.md`
- `docs/TECHNICAL_DUE_DILIGENCE_GUIDE.md`
- `docs/research_materials/RESEARCH_MATERIALS_INDEX.md`
