import { defineConfig } from 'vitest/config';

// Requires a live Postgres reachable at DATABASE_URL with
// scripts/ci/*.sql and supabase/migrations/*.sql already applied.
// See scripts/ci/apply-migrations.sh, which CI runs before this.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 20_000,
    // These tests share one Postgres instance and take turns using
    // SET LOCAL session state (see test/integration/db.ts) — running them
    // concurrently would let one test's transaction leak into another's.
    fileParallelism: false,
  },
});
