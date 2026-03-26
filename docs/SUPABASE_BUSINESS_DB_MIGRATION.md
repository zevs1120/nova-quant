# Supabase Business DB Migration

## Current State

- Auth is already capable of using Supabase Postgres via `NOVA_AUTH_DATABASE_URL`.
- Business/runtime data is still served by local SQLite through `better-sqlite3`.
- A generic SQLite -> Postgres mirror pipeline now exists:
  - `npm run data:audit:postgres`
  - `npm run data:migrate:postgres`

## What Was Migrated

- Target schema: `novaquant_data`
- Source: local SQLite business tables from `data/quant.db`
- Default behavior:
  - excludes `auth_*` tables
  - creates tables in Postgres
  - truncates and reloads table data
  - recreates simple indexes

This is a data migration and mirror step. It does **not** switch the live runtime off SQLite yet.

Because the current SQLite database may still be receiving writes from local or EC2 workers during migration,
the mirror is a point-in-time copy unless you pause writers or rerun hot tables after the first full load.

## Why Runtime Cutover Is Not Instant

The current backend is tightly coupled to synchronous SQLite access:

- `src/server/db/repository.ts` is a `better-sqlite3` repository with thousands of lines of sync SQL access.
- `src/server/db/schema.ts` contains SQLite-oriented schema/bootstrap logic.
- `src/server/config.ts` / `src/server/types.ts` still model the business DB as `sqlite`.

Moving production runtime to Supabase safely requires:

1. introducing a business repository interface instead of direct `better-sqlite3` calls
2. adding an async Postgres implementation
3. porting API, worker, research, alpha, and training flows to the async store
4. validating parity before flipping EC2 runtime reads/writes

## Recommended Next Steps

1. Keep EC2 runtime on SQLite for now.
2. Continue mirroring business data into Supabase `novaquant_data`.
3. Port admin/control-plane reads to Postgres first.
4. Port write-heavy worker flows after read parity is proven.
5. Cut over EC2 runtime only after both read/write paths are validated.
