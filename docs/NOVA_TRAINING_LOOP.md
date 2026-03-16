# Nova Training Loop

Nova now keeps a lightweight local growth loop designed for a single-machine Apple Silicon setup.

## What Gets Recorded

Every local Nova task can be recorded as a `nova_task_run`:

- task type
- model alias
- model name
- endpoint
- prompt version
- input
- grounded context
- output
- trace id
- thread id when applicable
- success / failure / skipped status

This covers:

- risk/regime explanation
- daily stance generation
- action card generation
- wrap-up generation
- grounded assistant answers
- retrieval embeddings

## Human Review Layer

Manual labels are stored as `nova_review_labels`.

Typical use:

- mark a response as `high_quality`
- attach score / notes
- flag `include_in_training=true`

API:

- `GET /api/nova/runs`
- `POST /api/nova/review-label`
- `GET /api/nova/training/export`

## MLX-LM Export

Export command:

```bash
npm run nova:export-mlx
```

By default, the export now stays inside the first-wave local fine-tune scope:

1. risk / regime explanation
2. action card generation
3. grounded assistant answers

Manual export variants:

```bash
tsx scripts/export-nova-mlx-data.ts --only-included --limit 500
tsx scripts/export-nova-mlx-data.ts --limit 1000 --out artifacts/training/nova.jsonl
```

Export format:

- `mlx-lm-chat-jsonl`
- each record contains:
  - `messages`
  - `metadata`

The exported `messages` follow a chat-tuning shape:

- `system`
- `user`
- `assistant`

## First Fine-tune Scope

The initial LoRA / low-rank tuning set should focus only on:

1. risk / regime explanation
2. action card generation
3. grounded assistant answers

This keeps the first local Nova iteration narrow, stable, and aligned with the product.

## MLX-LM Execution Entry

Dry-run the local LoRA training plan:

```bash
npm run nova:train:lora
```

Actually execute the local MLX-LM run once `mlx-lm` is installed:

```bash
npm run nova:train:lora -- --execute
```

Useful flags:

```bash
npm run nova:train:lora -- --allow-unlabeled --limit 800
npm run nova:train:lora -- --include-task assistant_grounded_answer --execute
```

The training runner:

- exports a chat-format dataset to `artifacts/training/`
- keeps the default task scope aligned with the first three training tasks
- builds a LoRA command around the current local Nova core model tier
- runs only when `python3` and `mlx_lm` are available locally

## Why This Matters

Nova’s local loop is not just model logging.

It creates a growing asset of:

- grounded decision-language samples
- user follow-up chains
- manually curated high-quality examples
- reusable training data for MLX-LM

That is the practical path to making Nova better on a single M3 Pro machine without pretending we already need a cloud training stack.
