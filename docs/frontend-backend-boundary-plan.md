# Frontend / Backend Boundary Migration Plan

Last updated: 2026-04-05

## Goal

Treat Nova Quant as one repository with two runtime layers:

- Frontend layer: `landing/`, `app/`, `admin/`
- Backend layer: repository-root API + `qlib-bridge/`

The product should no longer be understood as several competing mini-repos with overlapping responsibilities.

## Directory Contracts

### `landing/`

Allowed:

- public homepage
- pricing, FAQ, brand narrative
- login/signup entry
- public data portal and campaign landing pages

Forbidden:

- logged-in user shell
- admin-only workflows
- direct database access
- private keys or server-only secrets

### `app/`

Allowed:

- logged-in user product
- `Today / Nova / Browse / My`
- membership/account surfaces for normal users

Forbidden:

- marketing homepage
- admin-only flows
- direct database access
- direct sidecar access

### `admin/`

Allowed:

- internal operations and reporting
- admin-only auth/session flows
- system health, research ops, membership operations

Forbidden:

- public marketing pages
- normal user product entry
- direct database access

### repository-root API

Allowed:

- auth/session APIs
- billing and Stripe webhooks
- Supabase/Postgres business reads and writes
- public read APIs and private admin APIs

Forbidden:

- acting as a homepage
- rendering frontend shells
- serving as a fallback user entrypoint

### `qlib-bridge/`

Allowed:

- quant factor computation
- model inference and training workloads

Forbidden:

- browser-facing product entry
- direct user session handling
- direct ownership of product billing/auth flows

## Domain Contracts

- `https://novaquant.cloud` -> `landing/`
- `https://app.novaquant.cloud` -> `app/`
- `https://admin.novaquant.cloud` -> `admin/`
- `https://api.novaquant.cloud` -> repository-root API

Rules:

- production frontends must not depend on `*.vercel.app` API hosts
- `api.novaquant.cloud` is API-only
- cross-surface routing should be explicit, not accidental

## Environment Contracts

Frontend public variables:

- `VITE_PUBLIC_SITE_URL`
- `VITE_PUBLIC_APP_URL`
- `VITE_PUBLIC_ADMIN_URL`
- `VITE_PUBLIC_API_BASE_URL`
- `VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `VITE_PUBLIC_SUPABASE_URL`
- `VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Backend private variables:

- database URLs
- Stripe secret and webhook secrets
- AI provider keys
- market data keys
- broker / exchange keys

Platform URL variables:

- `NOVA_PUBLIC_SITE_URL`
- `NOVA_PUBLIC_APP_URL`
- `NOVA_PUBLIC_ADMIN_URL`
- `NOVA_PUBLIC_API_URL`

Rules:

- frontends must not read backend-only secrets
- backend must not depend on `VITE_*` for private logic
- redirects, callback URLs, webhook URLs, and CORS allowlists should derive from the platform URL layer

## Migration Sequence

### P0

- freeze boundary contracts in docs
- align repo readmes and architecture language

### P1

- clean Vercel rewrites and deployment entry rules
- remove production dependence on temporary Vercel app domains

### P2

- define and sync env contract
- align local `.env` keys with tracked `.env.example` placeholders and public/private separation

### P3

- unify frontend API base resolution and shared API client rules

### P4

- unify login, billing, and cross-surface routing

### P5

- finish shared-layer slimming and move stray read/query responsibilities into clearer modules
