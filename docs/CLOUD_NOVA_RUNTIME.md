# Cloud Marvix Runtime

Nova Assistant now runs on the Marvix model family in three modes:

- `local-ollama`
- `cloud-openai-compatible`
- `deterministic-fallback`

## Required env vars

For cloud inference:

```bash
NOVA_RUNTIME_MODE=cloud-openai-compatible
NOVA_CLOUD_OPENAI_BASE_URL=https://your-vllm-or-openai-compatible-endpoint/v1
NOVA_CLOUD_API_KEY=your-api-key
```

Optional model overrides:

```bash
NOVA_CORE_MODEL=Qwen/Qwen3-8B-Instruct
NOVA_SCOUT_MODEL=Qwen/Qwen3-4B-Instruct
NOVA_RETRIEVE_MODEL=BAAI/bge-m3
NOVA_CHALLENGER_MODEL=Qwen/Qwen3-14B-Instruct
```

Public model aliases surfaced by runtime APIs:

- `Marvix-Core`
- `Marvix-Scout`
- `Marvix-Retrieve`
- `Marvix-Challenger`

Compatibility note:

- existing runtime endpoints stay under `/api/nova/*`
- only the exposed model-family naming changes from `Nova-*` to `Marvix-*`

## Supported runtime surfaces

Client chat:

- `POST /api/chat`
- `POST /api/ai-chat`

Governed AI strategy generation:

- `POST /api/nova/strategy/generate`

Training flywheel:

- `POST /api/nova/training/flywheel`

Runtime inspection:

- `GET /api/nova/runtime`
- `GET /api/nova/health`

## CLI entry points

```bash
node --import tsx ./scripts/run-nova-strategy-lab.ts --prompt "Generate a conservative crypto strategy" --market CRYPTO
node --import tsx ./scripts/run-nova-flywheel.ts --trainer mlx-lora --limit 200
```

Package aliases:

```bash
npm run nova:strategy -- --prompt "Generate a conservative crypto strategy" --market CRYPTO
npm run nova:flywheel -- --trainer mlx-lora --limit 200
```

If `tsx` IPC is restricted in your runtime, prefer `node --import tsx ...`.

## Behavior

- Chat requests that clearly ask Nova to generate a strategy are automatically routed into the governed strategy lab.
- Strategy generation never publishes raw model ideas directly. Nova chooses from discovery candidates, applies bounded parameter overrides, then revalidates and rescoring happens before results are returned.
- The training flywheel exports labeled Nova runs into MLX-LM chat JSONL, writes a manifest, and registers a challenger plan when enough samples exist.

## Recommended cloud deployment

- For a single-host VPS setup, see `docs/VULTR_DEPLOYMENT.md`.
- Run the API separately from model inference when traffic grows.
- Point `NOVA_CLOUD_OPENAI_BASE_URL` at a vLLM or other OpenAI-compatible endpoint.
- Keep `Marvix-Core`, `Marvix-Scout`, and `Marvix-Challenger` on separate model aliases when traffic grows.
