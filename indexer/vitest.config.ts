import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Integration tests need a live Postgres (DATABASE_URL) and run via
    // `npm run test:integration` / vitest.integration.config.ts instead.
    exclude: ['test/integration/**', 'node_modules/**'],
  },
});
