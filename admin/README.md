# NovaQuant Admin

Last updated: 2026-03-23

This directory is the dedicated control dashboard for `admin.novaquant.cloud`.

## Deployment model

- User app: `app.novaquant.cloud`
- Admin app: `admin.novaquant.cloud`
- Backend API: `api.novaquant.cloud`
- Model service: AWS EC2
- Frontend hosting: separate Vercel project with root directory set to `admin`

## Current scope

This project is the internal dashboard surface. It provides:

- a separate deployable Vite app (root directory **`admin/`** on Vercel)
- implemented pages: **Overview**, **Users**, **Alpha Lab**, **Signals & Execution**, **System Health**
- live **`/api/admin/*`** integration against the shared backend (`src/server/api/app.ts`)

## Admin API contracts (implemented)

Session and data routes used by the dashboard:

- `GET /api/admin/session`
- `POST /api/admin/login` / `POST /api/admin/logout`
- `GET /api/admin/overview`
- `GET /api/admin/users`
- `GET /api/admin/alphas`
- `GET /api/admin/signals`
- `GET /api/admin/system`

Do not point the public admin UI directly at `/api/internal/marvix/ops`. That route is loopback-only on EC2 and should remain private.

## Vercel setup

1. Create a second Vercel project from the same GitHub repo.
2. Set Root Directory to `admin`.
3. Bind the project to `admin.novaquant.cloud`.
4. Add admin-specific environment variables.
5. Protect admin access with app-level admin auth and Vercel deployment protection.

## Admin auth environment

The admin frontend is hosted on `admin.novaquant.cloud`, and all reads/writes go through `https://api.novaquant.cloud`.

Main project environment variables:

- `NOVA_ADMIN_EMAILS=you@example.com,operator@example.com`
- `NOVA_OWNER_EMAIL=you@example.com` (optional single-owner fallback)
- `NOVA_ADMIN_ALLOWED_ORIGINS=https://admin.novaquant.cloud`
- `NOVA_APP_ALLOWED_ORIGINS=https://app.novaquant.cloud,https://novaquant.cloud`

Admin frontend environment variables:

- `VITE_ADMIN_API_BASE=https://api.novaquant.cloud`
