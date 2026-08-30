# Repository instructions

## Product invariants

- The backend scheduler is the source of truth. AI clients may explain a decision or submit structured evidence, but must not choose arbitrary review dates.
- Never reveal algorithm tags, previous notes, hints, or editorials in the due-card UI before the user records a blind attempt.
- Keep `failed`, `editorial_understood`, `hinted_ac`, and `independent_ac` distinct. Do not collapse them into a boolean AC field.
- Failed, editorial-assisted, and hinted attempts reset the consecutive independent streak.
- Repeating the same problem can reach `retained` but never `stable`; stability requires a first-attempt independent AC on a linked unseen transfer problem.
- Once a transfer problem is exposed, later ACs on it cannot validate transfer. A new unseen problem is required.
- New non-independent evidence on a retained or stable problem reactivates it.
- Preserve data portability. New durable user data must be included in the versioned export format.
- Imports are merge-only unless a future destructive restore flow has an explicit confirmation and rollback plan.
- Platform AC records are not automatically `independent_ac`; the user must confirm evidence after any external sync.

## Architecture

- Pages and route handlers live in `app/`.
- Structured durable state lives in D1 and is defined only in `db/schema.ts`.
- Generate Drizzle migrations with `npm run db:generate`; inspect and commit generated SQL.
- Pure policy code lives under `lib/training/` and must not import framework or database modules.
- Notification and model integrations are adapters. Core scheduling must not depend on a provider SDK.
- Agent-facing queue reads must omit notes, algorithm tags, editorials, and previous solutions.
- Do not create tables at runtime or hide schema changes inside route handlers.

## Required verification

Run these before handing off a change:

```bash
npm test
npm run lint
```

Add or update deterministic tests whenever scheduling stages, intervals, evidence semantics, or mode limits change.

## UX

- Design mobile-first; primary actions must be comfortable at phone width.
- Use the vendored shadcn/ui primitives for dialogs, selects, loading, empty states, and notifications.
- Keep the interface serious and information-dense, but do not expose stored hints in the blind-resolve flow.
- Chinese is the primary interface language; internal identifiers and code remain English.
