# Task Plan: LeadPilot Phase 1A — Business Hours & Availability

## Goal

Make LeadPilot store validated structured business hours end to end (onboarding + settings) and generate accurate appointment availability from them, on SQLite and Postgres, without inventing hours or changing unrelated features. Test-first, production-oriented.

## Next Step

Stop for user review. Do not start Phase 1B or merge to `main` until the user approves the evidence in `docs/LEADPILOT_PHASE_1A_REPORT.md`.

## Current Phase

Complete (all 8 phases)

## Global Constraints

- No production DB/env/Vercel/live-data changes; no real emails/WhatsApp/notifications.
- No Phase 1B work: no customer booking, overlap protection, reschedule/cancel, webhook/billing/delivery changes.
- Preserve existing Next.js/TS/DB/API architecture; no unnecessary dependencies; no guessed default hours.
- TDD: every production change has a test watched failing first; full suite, typecheck and build must be re-run fresh (Vercel Sandbox if local Node unavailable).
- Never print secrets. Work on a feature branch, not `main`.

## Phases

### Phase 1: Inspect current implementation

- [x] Read audit + Phase 0 planning files
- [x] Inspect slots, onboarding, business API, settings, validation, schemas, migrations, timezone model
- [x] Verify repository state (branch, commit, working tree)
- **Status:** complete

### Phase 2: Write failing regression tests

- [x] Add tests for structured hours validation, slot generation, closed days, boundaries, no invented hours, migration/legacy handling
- [x] Run new tests and confirm they fail for expected reasons (RED)
- **Status:** complete

### Phase 3: Implement structured hours + validation

- [x] Add validated hours model using existing zod conventions
- [x] Wire API/business validation to structured hours with explicit "unconfigured" state
- **Status:** complete

### Phase 4: Database migrations and compatibility

- [x] Update SQLite schema, Postgres schema, runtime migrations; preserve existing rows
- [x] Mark unconvertible legacy summaries as needing configuration (never parse/invent)
- **Status:** complete

### Phase 5: Onboarding and settings UI

- [x] Replace free-text hours with weekday open/closed + times controls
- [x] Load/save real structured hours via API; responsive layout
- **Status:** complete

### Phase 6: Fix slot generation

- [x] Consume structured hours; honour closed days, closing boundary, existing duration/buffer/booked exclusions, timezone model
- **Status:** complete

### Phase 7: Verification suite

- [x] Run new tests, full `npm test`, `npm run typecheck`, `npm run build`, safe additional checks
- [x] Record exact commands, exit codes and outputs; explain anything that cannot run
- **Status:** complete

### Phase 8: Documentation and completion report

- [x] Write `docs/LEADPILOT_PHASE_1A_REPORT.md` with all 10 required items
- [x] Update planning files with actual progress and evidence
- [x] Stop for review; do not start Phase 1B
- **Status:** complete

## Decisions Made

| Decision | Rationale |
|---|---|
| New isolated plan for Phase 1A; Phase 0 plan marked as handed off | Keeps audit record intact while tracking implementation separately |
| Feature branch instead of separate git worktree | Isolates `main` and avoids moving the session workspace; user wants changes visible in current workspace |
| Phase 1A hours work precedes audit's P0 booking recommendation | User explicitly authorized Phase 1A first; Phase 1B remains separate |
| No new DB column/table; structured v1 JSON in existing `hours_json` TEXT | Both backends already support TEXT; avoids unnecessary migration risk |
| Legacy free text is preserved but never parsed into hours | "Do not guess business hours" constraint; explicit needs-configuration state |
| Timezone stored explicitly, default `Asia/Kolkata` | Matches the only existing timezone model (`formatWhen` in messaging.ts); no business timezone field existed |
| Persistence test rewritten as pure SQL assertion; real persistence checked via local API | Vite/Vitest 2.1 cannot resolve Node 24 `node:sqlite`; avoids adding test-only runtime shims |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| Vite cannot resolve `node:sqlite` in Vitest 2.1 (Node 24 builtin filtered by Vite) | 1: `/* @vite-ignore */` annotation; 2: `server.deps.external`; 3: resolveId plugin | All three ineffective; root cause identified in Vite's builtin list. Test rewritten to assert SQL only; real DB persistence verified via local API check. Annotation reverted. |
| Build failed: `Can't resolve 'net'/'tls'` | 1 | Moved DB migration to server-only `business-hours-migration.ts`; client code no longer imports pg/sqlite |
| Typecheck: loosely typed JSON.parse and zod `Partial` days | 1 | Typed `get<{hours_json:string}>` and `completeDays()` |
| Timezone oscillation (8/18 availability tests failed) | 1 | Fixed convergence comparison in `localWallTimeToUtc` to compare against target wall time |
| `no such function: GREATEST` on SQLite business PUT | 1 | Replaced with CASE expression in `businessUpdateSql`; RED→GREEN test added |
| Vercel sandbox stopped at 900s timeout | 1 | Created fresh sandbox from current branch commit and re-ran full verification |
