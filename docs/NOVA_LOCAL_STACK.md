# Nova Local Stack

Nova now runs on a **single Apple Silicon Mac** with a local-only inference path.

## Runtime Principles

- No Docker requirement for inference
- No cloud dependency in the default assistant path
- One local endpoint: `http://127.0.0.1:11434/v1`
- Structured decision objects remain the source of truth
- Local Nova rewrites and explains grounded system state instead of inventing facts

## Model Routing

Unified memory aware defaults:

- Compact memory tier
  - `Nova-Core = qwen3:4b`
  - `Nova-Scout = qwen3:1.7b`
  - `Nova-Retrieve = qwen3-embedding:0.6b`
- Full memory tier
  - `Nova-Core = qwen3:8b`
  - `Nova-Scout = qwen3:4b`
  - `Nova-Retrieve = qwen3-embedding:0.6b`
  - optional challenger `qwen3:14b`

Task router:

- fast classification / tagging -> `Nova-Scout`
- core reasoning / Today Risk / stance / wrap-up / action card language -> `Nova-Core`
- retrieval embeddings -> `Nova-Retrieve`

## Implemented Local Surfaces

Local Nova now powers:

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

deterministically first. Nova is used as a grounded generation layer on top of those objects.

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
- Vercel/serverless runtimes automatically bypass local Nova generation because they cannot reach `127.0.0.1:11434`; they now fall back immediately instead of spending the function budget on doomed local retries.
- Cached decision snapshots are reused only when the same context has already been generated with Nova or local generation is explicitly disabled.
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
npm run api:data
npm run dev
```

If you need to temporarily disable local Nova generation:

```bash
NOVA_DISABLE_LOCAL_GENERATION=1 npm run api:data
```
