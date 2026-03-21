# Marvix System Architecture

## Target Operating Model

This repo is now organized around a split of responsibilities:

- `Marvix`
  - owns strategy generation, decision logic, and training artifacts
  - trains on historical market/task data
  - runs on the EC2 backend machine
- `Gemini`
  - analyzes news into decision-ready context
  - explains Marvix trade instructions in plain language
- `AWS EC2`
  - runs backfills, free-data refresh, quant evolution, training flywheels, and local API supervision
- `Vercel`
  - keeps serving the public frontend and public web traffic

Target flow:

`market data + Gemini-analyzed news -> Marvix -> trade instruction -> Gemini explanation`

## What Is Already Implemented

- Marvix model aliases are exposed in runtime surfaces (`Marvix-Core`, `Marvix-Scout`, `Marvix-Retrieve`, `Marvix-Challenger`).
- `npm run auto:backend` runs unattended market-data refresh, free-data/news refresh, validation, API supervision, quant evolution, and the Nova training flywheel.
- The training flywheel exports MLX-LM style chat datasets and writes challenger training plans/manifests.
- Gemini is already available as the explanation/chat provider on the backend assistant surface.
- When `GEMINI_API_KEY` is configured, fetched news is now enriched into structured factor payloads before runtime derivation uses it.
- Strategy generation is now kept on the configured Marvix route instead of being silently hijacked by Gemini when a Gemini key is present.

## What Is Still Missing

- The training flywheel prepares data and plans, but it does not automatically mean a fully independent Marvix checkpoint is already trained, promoted, and serving live inference.
- A true self-hosted Marvix inference stack still needs an actual model-serving path for the trained weights.

## EC2 Reality Check

For a real self-owned Marvix model, training and high-quality inference depend on hardware:

- CPU-only EC2 is fine for orchestration, data refresh, evaluation, and dataset generation.
- GPU-backed training/inference is the practical path if you want Marvix to become a genuinely independent model rather than a provider-routed system.

## Code Anchors

- Runtime routing: `src/server/ai/llmOps.ts`
- Nova inference client: `src/server/nova/client.ts`
- Training dataset export: `src/server/nova/training.ts`
- Training flywheel: `src/server/nova/flywheel.ts`
- Free-data/news loop: `src/server/jobs/freeData.ts`
- Current news ingestion: `src/server/news/provider.ts`
