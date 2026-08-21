## What this PR does



## Related issue

Closes #

## Checklist

- [ ] `npm run lint` passes locally
- [ ] `npm run typecheck` passes locally
- [ ] `npm test` passes locally, and I added/updated tests for the behavior this PR changes
- [ ] If this adds/changes a table or column, I added a new migration file (never edited an already-applied one)
- [ ] If this changes an RLS policy, I confirmed with a test that the intended wallet can access the row and an unrelated wallet cannot
- [ ] If this touches the indexer, I confirmed `indexer_state.last_processed_ledger` handling still resumes correctly on restart
- [ ] If this adds a new environment variable, I updated `.env.example`

## How this was tested

<!-- Describe manual/local verification if applicable, beyond the automated test suite -->
