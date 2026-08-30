# Contributing

XCPC Trainer is currently optimized for one real training loop before broader platform coverage.

Before opening a change:

1. Read `AGENTS.md` and preserve its product invariants.
2. Keep scheduling changes deterministic and add tests for every changed transition.
3. Generate and inspect a Drizzle migration for every schema change.
4. Run `npm test` and `npm run lint`.
5. Do not commit credentials, platform cookies, exported personal data, or local Wrangler state.

Small, reviewable changes are preferred. Provider integrations should implement an adapter instead of importing provider-specific behavior into the scheduler.
