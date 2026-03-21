# NovaQuant Admin

This directory is the dedicated admin-panel app shell for `admin.novaquant.cloud`.

## Deployment model

- User app: `novaquant.cloud`
- Admin app: `admin.novaquant.cloud`
- Backend compute: AWS EC2
- Frontend hosting: separate Vercel project with root directory set to `apps/admin`

## Current scope

This scaffold is the first repository split for the admin panel. It gives us:

- a separate deployable Vite app
- a visual information architecture for the first five admin surfaces
- a clean place to wire future `/api/admin/*` routes

## Planned first-release pages

1. `Overview`
2. `Users`
3. `Alpha Lab`
4. `Signals & Execution`
5. `System Health`

## Planned API contracts

The app should eventually read from dedicated admin-only endpoints:

- `GET /api/admin/session`
- `GET /api/admin/overview`
- `GET /api/admin/users`
- `GET /api/admin/alphas`
- `GET /api/admin/signals`
- `GET /api/admin/system`

Do not point the public admin UI directly at `/api/internal/marvix/ops`. That route is loopback-only on EC2 and should remain private.

## Vercel setup

1. Create a second Vercel project from the same GitHub repo.
2. Set Root Directory to `apps/admin`.
3. Bind the project to `admin.novaquant.cloud`.
4. Add admin-specific environment variables.
5. Protect admin access with app-level admin auth and Vercel deployment protection.

## Admin auth environment

The admin frontend is hosted on `admin.novaquant.cloud`, but the admin auth APIs live on the main project domain.

Main project environment variables:

- `NOVA_ADMIN_EMAILS=you@example.com,operator@example.com`
- `NOVA_OWNER_EMAIL=you@example.com` (optional single-owner fallback)
- `NOVA_ADMIN_ALLOWED_ORIGINS=https://admin.novaquant.cloud`

Admin frontend environment variables:

- `VITE_ADMIN_API_BASE=https://novaquant.cloud`
