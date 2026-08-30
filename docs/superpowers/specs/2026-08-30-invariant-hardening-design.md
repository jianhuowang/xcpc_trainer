# XCPC Trainer Invariant Hardening Design

## Context

XCPC Trainer v0.4 already implements the personal contest-to-upsolve-to-blind-review-to-transfer loop. The first development phase will make the existing behavior reproducible and close invariant gaps before adding new learning-flow concepts.

The current scheduling evidence is not yet large enough to justify changing the 3/7/21/45-day intervals or the 6/4/2 daily caps. Contest triage, rescue queues, candidate pools, archives, and low-energy semantics will be designed separately after this hardening phase.

## Goals

- Make all documented npm workflows usable from native Windows and POSIX environments.
- Ensure a stable core problem cannot be reopened by a later independent AC.
- Make blind queue responses safe by construction through explicit field allowlists.
- Make queue order deterministic even when priority and due time are identical.
- Enforce merge-only behavior for singleton settings during backup import.
- Preserve the current database schema, migration history, scheduling parameters, and export contract.

## Non-goals

- No interval or daily-cap changes.
- No new training states, contest triage queues, or hint-level model.
- No D1 schema changes and no new migration.
- No edits to migrations `0000` through `0004` or their snapshots.
- No export version bump; export remains v4 and import remains compatible with v1-v4.
- No GitHub push or deployment.

## Design

### 1. Cross-platform command entry points

Add Node-based command wrappers under `scripts/` and route npm scripts through them. The environment wrapper will reproduce the existing isolated cache, Wrangler log, temporary directory, and project-root behavior without changing global environment configuration. The build wrapper will spawn Vinext with a three-minute default deadline, terminate it on timeout, and return the child exit code.

The existing shell scripts remain available for the managed hosting environment and for comparison during the transition. `build`, `test`, `lint`, `dev`, `start`, `db:generate`, and `install:ci` must no longer require a user-installed Bash when invoked through npm.

### 2. Central evidence transition guard

Add a pure training-policy function that receives the current projection and evidence before a route schedules the next review. A core problem already in `stable` that receives `independent_ac` remains `stable`, keeps `nextReviewAt` null, and records the attempt in the append-only attempt log. Failed, editorial-assisted, or hinted evidence still reactivates a stable or retained problem through the existing deterministic scheduler.

Transfer verification keeps its existing first-attempt integrity rules. Clients still cannot submit dates, stages, streaks, statuses, or transfer integrity.

All behavior is tested against the pure policy function before route integration.

### 3. Blind response projections

Add explicit serializers for user-facing blind problems and agent-facing due problems. A blind problem response may contain only the identity and action fields required to attempt it: `id`, `title`, `url`, `platform`, `origin`, a presentation-safe queue/status value, `cleanStreak` when needed for the current badge, and `nextReviewAt`.

It must not contain `notes`, `lastEvidence`, `validatesProblemId`, `transferIntegrity`, contest notes, prior solutions, editorials, or algorithm tags. Dashboard due queues and recent cards will use explicit projections instead of spreading database rows. Agent context retains its narrower existing contract.

Runtime object tests will verify exact keys rather than searching source text for redaction strings.

### 4. Deterministic queue ordering

Queue candidates will include a stable unique ID. Ordering remains:

1. upsolve debt;
2. unseen transfer checks;
3. blind review and retention;
4. oldest due time;
5. stable unique ID as the final tie-breaker.

Daily caps continue to apply only after prioritization. Identical inputs must produce identical results across dashboard, agent, and reminder consumers.

### 5. Merge-only settings import

Dry-run preview will report whether settings would be added or skipped. A merge import inserts settings only when the singleton row is absent; an existing row wins and is not overwritten. Contests, problems, attempts, transfer links, and v1-v4 normalization keep their current compatibility behavior.

Destructive settings restore is outside this endpoint and would require a future explicit restore flow with confirmation and rollback.

### 6. Migration and portability guard

Tests will verify that the migration journal still contains exactly the existing `0000`-`0004` sequence and that this phase produces no schema diff. They will not hash raw working-tree bytes because Windows line-ending conversion can create false failures.

The export route remains byte-shape compatible at version 4. New durable fields are prohibited in this phase; any future durable field requires a generated append-only migration and an export-version decision.

## Error handling

- Command wrappers propagate child exit codes and print a specific timeout or missing-executable message.
- Stable independent evidence returns a normal recorded result with an unchanged projection, not a fabricated new schedule.
- Blind serializers fail at compile time when consumers request unavailable hidden fields.
- Import preview and mutation return the same settings action so the user can see that existing settings were preserved.

## Test strategy

Implementation follows red-green-refactor for each behavior:

- command-wrapper unit tests plus native `npm test` and `npm run lint` verification;
- pure transition tests for stable independent evidence and non-independent reactivation;
- exact-key blind DTO tests for dashboard and agent projections;
- equal-priority/equal-date queue tie tests;
- import tests for add-versus-skip settings and v1-v4 fixtures;
- migration journal sequence test;
- final production build, full Node test suite, and ESLint run on Windows.

## Training-flow follow-up

A separate design will evaluate contest triage so that not every exposed problem becomes debt. It will compare a bounded rescue queue, a deadline-free candidate pool, and archive routing while preserving blind attempts and data portability. No such behavior is included in this hardening phase.
