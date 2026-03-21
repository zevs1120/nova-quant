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

Minimum values to set:

- `NOVA_RUNTIME_MODE=cloud-openai-compatible`
- `NOVA_CLOUD_OPENAI_BASE_URL`
- `NOVA_CLOUD_API_KEY`
- `DB_PATH=/opt/nova-quant/data/quant.db`
- your auth/session persistence secrets

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
