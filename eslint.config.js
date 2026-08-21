// Flat config (ESLint 9). Scoped to the indexer package explicitly via the
// `lint` script's file args — supabase/functions/** is Deno TypeScript
// (different globals/runtime) and is intentionally not linted by this config.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Event payloads and Supabase rows are asserted via shared types
      // rather than re-derived per call site; revisit if that stops holding.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
