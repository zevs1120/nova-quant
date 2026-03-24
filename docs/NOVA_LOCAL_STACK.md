# Marvix Local Stack

Nova Assistant now runs on the **Marvix** model family on a single Apple Silicon Mac with a local-only inference path.

## Runtime Principles

- No Docker requirement for inference
- No cloud dependency in the default assistant path
- One local endpoint: `http://127.0.0.1:11434/v1`
- Structured decision objects remain the source of truth
- Local Marvix rewrites and explains grounded system state instead of inventing facts

## Model Routing

Unified memory aware defaults:

- Compact memory tier
  - `Marvix-Core = qwen3:4b`
  - `Marvix-Scout = qwen3:1.7b`
  - `Marvix-Retrieve = qwen3-embedding:0.6b`
- Full memory tier
  - `Marvix-Core = qwen3:8b`
  - `Marvix-Scout = qwen3:4b`
  - `Marvix-Retrieve = qwen3-embedding:0.6b`
  - optional challenger `qwen3:14b`

Task router:

- fast classification / tagging -> `Marvix-Scout`
- core reasoning / Today Risk / stance / wrap-up / action card language -> `Marvix-Core`
- retrieval embeddings -> `Marvix-Retrieve`

## Implemented Local Surfaces

Local Marvix now powers:

- Today Risk language
- one-line daily stance language
- action card `why now` / `caution` copy refinement
- AI assistant grounded answers
- daily wrap-up summary generation

The system still computes:

- risk posture
- ranked action cards
- evidence bundles
- portfolio context

deterministically first. Marvix is used as a grounded generation layer on top of those objects.

## Main Files

- `src/server/ai/llmOps.ts`
- `src/server/nova/router.ts`
- `src/server/nova/client.ts`
- `src/server/nova/service.ts`
- `src/server/nova/training.ts`
- `src/server/chat/providers/ollama.ts`
- `src/server/chat/providers/index.ts`

## Operational Notes

- If Ollama is unavailable, decision surfaces fall back to deterministic copy rather than failing the product.
- Vercel/serverless runtimes automatically bypass local Marvix generation because they cannot reach `127.0.0.1:11434`; they now fall back immediately instead of spending the function budget on doomed local retries.
- Cached decision snapshots are reused only when the same context has already been generated with Marvix or local generation is explicitly disabled.
- This avoids pinning the app to a weaker fallback if Ollama comes online later in the same session/day.

## Local Setup

Install Ollama on macOS, then pull the required models:

```bash
ollama pull qwen3:8b
ollama pull qwen3:4b
ollama pull qwen3:1.7b
ollama pull qwen3-embedding:0.6b
```

Optional challenger:

```bash
ollama pull qwen3:14b
```

Run Ollama locally, then start NovaQuant:

```bash
npm ci
npm run nova:health
npm run api:data
npm run dev
```

Health and readiness surfaces:

- `npm run nova:health`
- `GET /api/nova/runtime`
- `GET /api/nova/health`

`nova:health` checks:

- whether this runtime should use local Marvix or deterministic fallback
- whether `http://127.0.0.1:11434/v1` is reachable
- which required models are present
- which `ollama pull ...` commands are still missing
- which training/export commands are ready next

If you need to temporarily disable local Nova generation:

```bash
NOVA_DISABLE_LOCAL_GENERATION=1 npm run api:data
```
