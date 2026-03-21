# Vultr Deployment Guide

This repository can now run on a single Vultr VPS without Vercel by letting the Node API process also serve the built web app.

## What This Setup Uses

- Frontend build from `dist/`
- Express API on `127.0.0.1:8787`
- Optional nginx reverse proxy in front
- `SERVE_WEB_DIST=1` so one Node process can serve both the SPA shell and `/api/*`
- Marvix model-family naming in runtime responses, while `/api/nova/*` stays unchanged for compatibility

## Recommended Shape

- Ubuntu 24.04 LTS on Vultr
- 1 small cloud instance for app + API
- external inference provider via `NOVA_CLOUD_OPENAI_BASE_URL`, unless you intentionally run a local model server on the same host

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

Use the template at `deployment/vultr/marvix.env.example`.

Typical location:

```bash
sudo mkdir -p /etc/novaquant
sudo cp deployment/vultr/marvix.env.example /etc/novaquant/marvix.env
sudo nano /etc/novaquant/marvix.env
```

Minimum values to set:

- `NOVA_RUNTIME_MODE=cloud-openai-compatible`
- `NOVA_CLOUD_OPENAI_BASE_URL`
- `NOVA_CLOUD_API_KEY`
- `DB_PATH=/opt/nova-quant/data/quant.db`
- any auth/Redis secrets you use in production

## Systemd Service

Copy the service file:

```bash
sudo cp deployment/vultr/marvix.service /etc/systemd/system/marvix.service
sudo systemctl daemon-reload
sudo systemctl enable marvix
sudo systemctl start marvix
sudo systemctl status marvix
```

The service uses:

- `npm run start:api`
- `SERVE_WEB_DIST=1`
- port `8787`

## Nginx

Copy the sample config:

```bash
sudo cp deployment/vultr/nginx.marvix.conf /etc/nginx/sites-available/marvix
sudo ln -sf /etc/nginx/sites-available/marvix /etc/nginx/sites-enabled/marvix
sudo nginx -t
sudo systemctl reload nginx
```

Update:

- `server_name`
- TLS certificate paths if you terminate SSL on the box

## Deploy Update Flow

```bash
cd /opt/nova-quant
git pull
npm ci
npm run build
sudo systemctl restart marvix
```

## Quick Checks

```bash
curl -i http://127.0.0.1:8787/healthz
curl -i http://127.0.0.1:8787/api/nova/runtime
```

Expected results:

- `/healthz` returns `200`
- `/api/nova/runtime` shows Marvix aliases such as `Marvix-Core`
- `/` serves the built SPA when `SERVE_WEB_DIST=1`

## Notes

- If you want cleaner scaling later, split the stack into:
  - static frontend
  - stateful API
  - model inference endpoint
- The current single-host setup is optimized for getting onto Vultr credits quickly with minimal moving parts.
