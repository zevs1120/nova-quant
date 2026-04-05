# Environment Contract

Last updated: 2026-04-05

## Goal

Every environment variable in Nova Quant should belong to exactly one layer:

- platform URL layer
- frontend public layer
- backend private layer

This keeps local development, Vercel, Stripe, and Supabase configuration aligned.

## Platform URL Layer

These values define the canonical product surfaces and should be the source of truth for redirects, CORS, and callback URLs.

- `NOVA_PUBLIC_SITE_URL`
- `NOVA_PUBLIC_APP_URL`
- `NOVA_PUBLIC_ADMIN_URL`
- `NOVA_PUBLIC_API_URL`

Compatibility:

- `NOVA_APP_URL` remains supported for older server paths, but `NOVA_PUBLIC_APP_URL` is preferred.

## Frontend Public Layer

These values are safe to inject into browser builds.

### `app/`

- `VITE_PUBLIC_SITE_URL`
- `VITE_PUBLIC_APP_URL`
- `VITE_PUBLIC_API_BASE_URL`
- `VITE_PUBLIC_SUPABASE_URL`
- `VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `VITE_PUBLIC_SUPABASE_AUTH_REDIRECT_URL`
- `VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY`

### `landing/`

- `VITE_PUBLIC_SITE_URL`
- `VITE_PUBLIC_APP_URL`
- `VITE_PUBLIC_API_BASE_URL`
- `VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY`

### `admin/`

- `VITE_PUBLIC_ADMIN_URL`
- `VITE_PUBLIC_API_BASE_URL`

Compatibility:

- legacy `VITE_API_BASE_URL`, `VITE_SUPABASE_*`, and `VITE_ADMIN_API_BASE` are still read as fallbacks during migration

## Backend Private Layer

These values must never be committed into tracked example files with real secrets.

- `NOVA_AUTH_DATABASE_URL`
- `NOVA_DATA_DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `MASSIVE_API_KEY`
- `ALPHA_VANTAGE_API_KEY`
- `COINGECKO_DEMO_API_KEY`
- broker / exchange API keys
- ingest and operator tokens

## Stripe Rules

- publishable key belongs to the frontend public layer
- secret key and webhook secret belong to the backend private layer
- checkout / portal return URLs derive from `NOVA_PUBLIC_APP_URL`

## Supabase Rules

- browser-safe URL and publishable key can exist in the frontend public layer
- runtime `/api/auth/provider-config` may also expose those public values from the server
- database URLs always stay in backend private env only

## Local Development Notes

- root `.env` is the local source of truth and is git-ignored
- tracked `*.env.example` files should mirror key names and safe defaults only
- sub-project frontends should not invent their own secret-bearing env schema
