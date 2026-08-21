# trustpay-api

Off-chain support layer for TrustPay, built on Supabase (Postgres + Row Level
Security + Realtime) plus a standalone indexer worker.

## Boundary

This service does **not** custody funds, does **not** approve or release
milestones, and does **not** gate any state transition — the deployed Soroban
contract (`CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2` on
testnet) does all of that. `trustpay-api` only:

- Stores rich off-chain metadata (milestone titles, full descriptions) that
  the contract intentionally keeps out of chain state, integrity-checked
  against a `description_hash` column so a description can't silently drift
  from what the contract actually committed to.
- Mirrors on-chain event history into Postgres so the frontend can query
  state (and subscribe to changes via Supabase Realtime) without hitting
  Soroban RPC on every read.
- Handles wallet-signature auth, notifications, and reputation — none of
  which belong on-chain.

Enforcement of *who can read/write what* lives in Postgres Row Level Security
policies (`supabase/migrations/0002_rls_policies.sql`), not in application
code. The only writer of chain-derived columns (`projects.status`,
`projects.confirmed`, `milestones.status`, timestamps) is the indexer worker,
connecting with the Postgres **service role** key, which bypasses RLS. That
key must never be shipped to a frontend client.

A project row starts `confirmed = false` when a client submits it directly
(RLS-scoped insert). It only flips to `true` once the indexer observes the
matching `escrow_created` event on-chain — client-submitted metadata is never
treated as authoritative on its own.

## Repo layout

```text
supabase/
  migrations/         # schema + RLS policies (0001, 0002)
  functions/          # Edge Functions: auth-challenge, auth-verify, reputation
  tests/database/     # pgTAP tests for RLS and the description-hash trigger
  seed.sql            # fixture data for local dev
indexer/              # standalone Node/TypeScript worker; polls Soroban RPC,
                       # mirrors events into Postgres via the service role key
scripts/ci/            # CI-only Postgres bootstrap (see "Continuous integration" below)
```

## Setup

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker
for local development, plus Node.js 20+ for the indexer.

```bash
# 1. Start local Supabase (Postgres, Auth, Realtime, Edge Functions runtime)
supabase start

# 2. Apply migrations + seed fixture data
supabase db reset

# 3. Run the pgTAP RLS/trigger tests
supabase test db

# 4. Serve Edge Functions locally
supabase functions serve
```

Edge Functions need these secrets set (via `supabase secrets set` or
`.env` for local `functions serve`):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — from `supabase status`
- `SUPABASE_JWT_SECRET` — from `supabase status`, used to sign wallet-auth JWTs

### Indexer worker

```bash
cd indexer
cp .env.example .env   # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RPC URL
npm install
npm run dev            # polls Soroban testnet RPC and mirrors events into Postgres
npm test                # unit tests: hash.ts + event handler logic against a fake store
```

The indexer is the only long-running process this repo needs to operate —
Supabase does not poll external chains on its own. It resumes from
`indexer_state.last_processed_ledger` on restart rather than re-scanning from
genesis.

## Continuous integration

This repo uses npm workspaces at the root (`indexer` is the one workspace)
so a single `npm ci`/`npm run <script>` at the repo root covers lint,
typecheck, and tests:

```bash
npm ci
npm run lint         # eslint over indexer/src, indexer/test
npm run typecheck    # tsc --noEmit against indexer/tsconfig.json
npm test             # unit tests (fake in-memory store, no DB needed)
npm run test:integration   # needs DATABASE_URL — see below
```

`.github/workflows/ci.yml` runs three jobs on every PR/push to `main`:

1. **test** — the lint/typecheck/unit-test trio above.
2. **migrations** — applies every file in `supabase/migrations/` in order
   against a throwaway `postgres:15` service container, then checks the
   expected tables exist. This is what catches migration drift (a migration
   that only works against an already-partially-migrated database).
3. **integration** — re-applies migrations, then runs `test:integration`:
   real Postgres tests (not mocks) covering RLS enforcement, the
   description-hash trigger, and the indexer's event-processing path
   end-to-end, using `SET LOCAL ROLE` + `request.jwt.claims` the same way
   PostgREST evaluates a real request.

A bare `postgres:15` container doesn't have the `authenticated`/`anon`/
`service_role` roles or the `auth.jwt()` function a real Supabase project
provisions for you — `supabase/migrations/0002_rls_policies.sql` needs both
to apply at all. `scripts/ci/apply-migrations.sh` bridges that gap by
running `scripts/ci/00-roles-and-auth-shim.sql` before the real migrations
and `scripts/ci/99-grants-shim.sql` after. **Those two shim files are
CI-only** — never run them against a real Supabase project, which already
has better versions of everything they stand in for; that's also why they
live outside `supabase/migrations/` where `supabase db push` would never
pick them up.

To run the same thing locally against a scratch container:

```bash
docker run -d --name trustpay-ci-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=trustpay_ci -p 5432:5432 postgres:15

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trustpay_ci \
  ./scripts/ci/apply-migrations.sh

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trustpay_ci \
  npm run test:integration
```

## Known assumptions to confirm against the deployed contract

These were called out as unconfirmed in the spec and are marked inline in
code where relevant:

- Exact event names/payload shapes emitted by `events.rs`
  (`indexer/src/types.ts`, `indexer/src/eventHandlers.ts`).
- The hash function backing `description_hash`, assumed to be `sha256` hex
  (`indexer/src/hash.ts`, the Postgres trigger in
  `supabase/migrations/0001_initial_schema.sql`).
- "On-time" for the reputation endpoint has no explicit deadline column in
  this schema, so it's approximated as approval within 7 days of submission
  (`supabase/functions/reputation/index.ts`) — revisit if the contract
  exposes a real per-milestone deadline.
