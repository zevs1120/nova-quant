# AWS EC2 Deployment Guide

This repository can run on a single AWS EC2 instance by letting the Node API process also serve the built web app.

It can also run in backend-only mode while the public site stays on Vercel. That is the recommended shape when EC2 is mainly for Marvix research, training flywheels, and long-running automation.

## Good Fit For This Repo

- You already have AWS credits
- You want one machine first, not a split frontend/API/model architecture
- You want to avoid Vercel serverless limits for stateful API work
- You want to keep `/api/nova/*` compatibility while exposing Marvix model aliases in runtime responses

## Backend-Only Mode

Recommended when:

- Vercel remains the public frontend
- EC2 is the Marvix backend machine for backfills, research loops, training flywheels, and local API supervision
- Gemini is used for explanation/news-analysis surfaces rather than as the public website runtime

Typical shape:

- keep `marvix-backend.service` running `npm run auto:backend`
- keep `marvix.service` available for localhost-only API checks on `127.0.0.1:8787`
- close inbound `80` and `443` in the Security Group
- keep only inbound `22` from your IP
- use EC2 to refresh Marvix training inputs from free market/news/reference feeds

See also `docs/MARVIX_SYSTEM_ARCHITECTURE.md`.

Backend-only assets included in this repo:

- `deployment/aws-ec2/marvix-backend.env.example`
- `deployment/aws-ec2/marvix-backend.service`

## Recommended EC2 Shape

- Ubuntu 24.04 LTS
- `t3.small` or `t3.medium` to start
- 30 GB gp3 root volume minimum
- 1 Elastic IP
- Security Group:
  - inbound `22` from your IP
  - inbound `80` from `0.0.0.0/0`
  - inbound `443` from `0.0.0.0/0`

## What Runs On The Box

- frontend build from `dist/`
- Express API on `127.0.0.1:8787`
- nginx reverse proxy
- `SERVE_WEB_DIST=1` so one Node process serves both SPA routes and `/api/*`

## First Boot

```bash
sudo apt update
sudo apt install -y git nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Clone and build:

```bash
git clone <your-repo-url> /opt/nova-quant
cd /opt/nova-quant
npm ci
npm run build
```

## Environment File

Use the template at `deployment/aws-ec2/marvix.env.example`.

For backend-only Marvix worker mode, use:

- `deployment/aws-ec2/marvix-backend.env.example`

Typical location:

```bash
sudo mkdir -p /etc/novaquant
sudo cp deployment/aws-ec2/marvix.env.example /etc/novaquant/marvix.env
sudo nano /etc/novaquant/marvix.env
```

Backend-only variant:

```bash
sudo mkdir -p /etc/novaquant
sudo cp deployment/aws-ec2/marvix-backend.env.example /etc/novaquant/marvix-backend.env
sudo nano /etc/novaquant/marvix-backend.env
```

Minimum values to set for backend-only Marvix:

- `NOVA_RUNTIME_MODE=deterministic-fallback`
- `NOVA_DISABLE_LOCAL_GENERATION=1`
- `NOVA_DISABLE_GROQ=1`
- `NOVA_DATA_DATABASE_URL=postgresql://...`
- `NOVA_DATA_PG_SCHEMA=novaquant_data`
- `GEMINI_API_KEY`
- `NOVA_ADMIN_EMAILS=admin@your-domain.com` when you need admin console access

Admin auth note:

- `POST /api/admin/login` and `GET /api/admin/session` treat `NOVA_ADMIN_EMAILS` and `NOVA_OWNER_EMAIL` as the configured-admin source of truth.
- If your runtime env file omits both values, the admin console can reject a valid account with `ADMIN_ACCESS_DENIED` even when the user previously existed in auth storage.
- After editing `/etc/novaquant/marvix.env` or `/etc/novaquant/marvix-backend.env`, restart the API service before retesting admin login.

Important note:

- `NOVA_DATA_DATABASE_URL` is required because Supabase/Postgres is the only supported business runtime.
- `NOVA_PG_PRIMARY_READ_FAILURE_COOLDOWN_MS` and `NOVA_ALLOW_SYNC_HOT_PATH_FALLBACK=0` can keep public hot paths responsive when Supabase is slow.
- `NOVA_AUTO_BACKEND_SKIP_INIT=1` can be used on warm hosts to suppress startup-time worker initialization if deploy-time restarts are still causing I/O pressure.

Optional but recommended free-data keys for the new Marvix training-input pipeline:

- `ALPHA_VANTAGE_API_KEY`
- `FINNHUB_API_KEY`
- `NEWSAPI_API_KEY`

Those keys now enable:

- US daily fallback bars from Alpha Vantage when other free equity backfills fail
- US fundamentals snapshots from Alpha Vantage + Finnhub
- multi-source finance news from Google News RSS + Finnhub News + NewsAPI
- US option-chain summaries from Yahoo Finance public options endpoints

Autonomous alpha discovery controls:

- `NOVA_ALPHA_DISCOVERY_ENABLED=1`
- `NOVA_ALPHA_DISCOVERY_INTERVAL_HOURS=12`
- `NOVA_ALPHA_DISCOVERY_MAX_CANDIDATES=18`
- `NOVA_ALPHA_DISCOVERY_SEARCH_BUDGET=8`
- `NOVA_ALPHA_DISCOVERY_MIN_ACCEPTANCE_SCORE=0.74`
- `NOVA_ALPHA_SHADOW_MIN_SAMPLE_SIZE=16`
- `NOVA_ALPHA_SHADOW_MIN_SHARPE=0.45`
- `NOVA_ALPHA_SHADOW_MIN_EXPECTANCY=0.0015`
- `NOVA_ALPHA_RETIRE_MAX_DRAWDOWN=0.22`
- `NOVA_ALPHA_ALLOW_PROD_PROMOTION=0`

## Systemd Service

```bash
sudo cp deployment/aws-ec2/marvix.service /etc/systemd/system/marvix.service
sudo systemctl daemon-reload
sudo systemctl enable marvix
sudo systemctl start marvix
sudo systemctl status marvix
```

The service uses:

- `npm run start:api`
- `SERVE_WEB_DIST=1`
- port `8787`

Backend-only worker service:

```bash
sudo cp deployment/aws-ec2/marvix-backend.service /etc/systemd/system/marvix-backend.service
sudo systemctl daemon-reload
sudo systemctl enable marvix-backend
sudo systemctl start marvix-backend
sudo systemctl status marvix-backend
```

## Nginx

```bash
sudo cp deployment/aws-ec2/nginx.marvix.conf /etc/nginx/sites-available/marvix
sudo ln -sf /etc/nginx/sites-available/marvix /etc/nginx/sites-enabled/marvix
sudo nginx -t
sudo systemctl reload nginx
```

Update the config with:

- your EC2 public DNS or domain in `server_name`
- TLS certificate paths if you terminate SSL on the instance

## Deploy Update Flow

```bash
cd /opt/nova-quant
git pull
npm ci
npm run build
sudo systemctl restart marvix
```

Backend-only worker refresh:

```bash
sudo systemctl restart marvix-backend
```

## Autonomous Alpha Discovery On EC2

Run a one-shot discovery cycle:

```bash
cd /opt/nova-quant
npm run alpha:discover -- --user guest-default
```

The long-running worker path is still:

```bash
sudo systemctl status marvix-backend --no-pager
```

`marvix-backend.service` now does three related jobs:

- refreshes free market/reference/news data
- refreshes runtime state and research evolution
- advances the autonomous alpha discovery + shadow monitoring loop

Results are stored in the main business-data schema:

- `alpha_candidates`
- `alpha_evaluations`
- `alpha_shadow_observations`
- `alpha_lifecycle_events`

Inspect SHADOW candidates and lifecycle state from the box itself:

```bash
curl -s http://127.0.0.1:8787/api/internal/marvix/ops | head -c 12000
```

Look for:

- `alpha_inventory`
- `alpha_top_candidates`
- `alpha_decaying_candidates`
- `alpha_state_transitions`

## Quick Checks

```bash
curl -i http://127.0.0.1:8787/healthz
curl -i http://127.0.0.1:8787/api/nova/runtime
```

Expected:

- `/healthz` returns `200`
- `/api/nova/runtime` shows Marvix aliases such as `Marvix-Core`
- `/` serves the built SPA when `SERVE_WEB_DIST=1`

## Optional Next Upgrade

When traffic grows, split into:

- CloudFront or S3 for static frontend
- EC2 or ECS for stateful API
- separate model inference endpoint behind `NOVA_CLOUD_OPENAI_BASE_URL`

## Notes

- If you already have AWS credits, EC2 is a cleaner first production home for this repo than forcing it into serverless.
- Keep the instance simple first. The current app shape benefits more from predictable process uptime than from early infra complexity.
