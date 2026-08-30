# Project state — 2026-08-30

## Working now

- Mobile-first owner-only dashboard
- Manual problem capture from Codeforces, 牛客, AtCoder, 洛谷, or another platform
- Deterministic evidence-aware scheduling on Shanghai calendar days
- Failed, editorial-assisted, and hinted attempts reset the clean streak
- Consecutive independent schedule: 3 / 7 / 21 / 45 days
- Separate upsolve, unseen-transfer, and blind-review queues with debt-first priority
- Same-problem retention without permanent graduation
- Linked unseen transfer tasks; only a first-attempt independent AC creates stable evidence
- Exposed transfer tasks cannot later validate transfer
- Stable/retained problem reactivation from later non-independent evidence
- Training quality metrics based only on blind and transfer attempts
- Normal, recovery, and low-energy daily caps
- Contest sessions linked to exposed problems
- Codeforces public-submission preview, evidence confirmation, and eligible reactivation
- Versioned JSON export v4 with v1–v4 merge-import compatibility
- D1 schema with five generated, append-only migrations
- Deduplicated reminder jobs and provider-neutral notification contract
- Auth-gated Agent API and OpenAPI contract, including transfer candidates and creation

## Verification baseline

- `npm test`: production build plus 25 passing tests
- `npm run lint`: clean
- Scheduling counterexamples, transfer integrity, legacy imports, queue priority, hidden fields, and reactivation have deterministic tests
- No model API key is required for the current feature set
- No notification credential is stored

## First desktop session

1. Download and extract `xcpc-trainer-source.zip`, or clone the GitHub repository after it is created.
2. Install Node.js 22 or newer.
3. Open the extracted `xcpc-trainer` directory in VS Code.
4. Run `npm ci`.
5. Run `npm test` and `npm run lint` before changing behavior.
6. Start locally with `npm run dev`.
7. Read `AGENTS.md` before asking another coding agent to edit the project.
8. Do not rewrite existing files under `drizzle/`; future schema changes append a new migration.

The hosted Site remains the authoritative deployed copy. Local D1 data is separate from hosted data; use the dashboard JSON export/import flow when moving records between environments.

## GitHub handoff

The current environment has a managed Site source repository but cannot create a repository in the user's GitHub account. Create an empty GitHub repository named `xcpc-trainer`, then run from the extracted project directory:

```bash
git remote add github https://github.com/YOUR_NAME/xcpc-trainer.git
git push -u github HEAD:main
```

If the downloaded archive has no `.git` directory, initialize it first:

```bash
git init
git add .
git commit -m "Initial XCPC Trainer"
git branch -M main
```

## Next implementation order

1. Run the current personal loop long enough to collect at least 30–50 blind attempts before changing intervals.
2. Add weakness clusters and model-assisted transfer recommendations without exposing labels in the due queue.
3. Add contest-level strategy review: selection error, time loss, implementation error, and next action.
4. Add a scheduled trigger and one official reminder provider after credentials are available.
5. Add a small MCP adapter around `/api/openapi` after the hosted private connection is configured.
6. Add user isolation before any public writable deployment.

## Deliberately not done

- No FSRS or model-chosen dates before enough personal evidence exists
- No automated scraping or cookie relay for GPT or other chat webpages
- No unofficial QQ or personal WeChat login/session automation
- No automatic claim that an online judge AC was independent
- No public multi-user writes
- No destructive backup restore
