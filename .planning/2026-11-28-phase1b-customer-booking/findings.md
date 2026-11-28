# Findings & Decisions — Phase 1B

## Requirements

- User authorized Phase 1B after Phase 1A: implement real customer slot acceptance → exactly one atomic appointment → confirmation, with test-first discipline.
- User later requested independent-review fixes: offer replay/double booking, PATCH abuse, transaction cleanup, notification isolation; update the existing Phase 1B report and planning files; commit/push; stop for review.
- Hard boundaries: branch `phase-1b-customer-booking` only; no merge, no main changes, no Phase 1C/1D, no production DB/env/Vercel changes, no real email/WhatsApp/payment calls, never print secrets.

## Research Findings

- Original bug: `/api/conversations/[id]/messages` offered three slots but never created an appointment; `/api/appointments` inserted directly with client `ends_at`, no overlap check, no transaction and lead ownership checked after INSERT.
- `src/lib/db.ts` had no transaction abstraction; `getPool()` was private and had to be exported for dedicated PG clients.
- Vitest 2.1 cannot resolve Node 24 `node:sqlite`, so DB round-trip coverage lives in the local E2E script; SQLite was the only backend available in the sandbox.
- Review finding 1: a stored offer had no stable identity and could be replayed; a fresh selection could create a second appointment.
- Review finding 2: `PATCH /api/appointments/[id]` could change `starts_at` or reactivate a cancelled/no-show appointment.
- Review finding 3: `withTransaction()` did not release when `begin()` failed and was hard to unit-test.
- Review finding 4: booking notifications were inside the post-commit block without deterministic dedupe/isolated audit logging.

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Pure `booking-core.ts` plus stateful `booking.ts` | Deterministic parsing/validation is unit-testable; DB/notification side effects stay in one service. |
| Transaction adapters injected into `withTransaction` | Makes begin/commit/rollback/release cleanup testable without importing `node:sqlite` or `pg`. |
| SQLite `BEGIN IMMEDIATE` with busy timeout; PG `SELECT ... FOR UPDATE` business lock | Serializes booking checks per business on both supported backends. |
| Atomic offer consumption inside the transaction | Prevents concurrent/replayed selections of the same offer from creating duplicate appointments. |
| PATCH validator rejects `starts_at` and reactivation | Prevents reschedule-by-PATCH bypass while leaving existing safe status transitions intact. |
| Notifications isolated in `booking-notifications.ts` with deterministic automation_runs claim | Post-commit only, no duplicate alerts, no rollback of a successful booking. |
| QA_BASE restricted to localhost/127.0.0.1 in E2E | Guarantees no production writes during verification. |
| PostgreSQL left unverified | No disposable PG credentials or binaries; no SQL-string substitution accepted as evidence. |

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| RED tests missing modules | Committed RED at `85eb9fe`, confirmed failure before implementation. |
| `getPool` not exported / async connect misuse | Exported `getPool()` and awaited it before `.connect()`. |
| SQLite `NOT NULL constraint failed: appointments.notes` | Passed `''` instead of `null`. |
| Offer metadata stored only as text, never parsed from JSON string | `parseSlotOffer()` now JSON-parses strings; RED at `31677ee`. |
| E2E lead creation assumed `leadId`/`conversationId` from `/api/leads` | Uses `PUT /api/conversations {leadId}` to resolve conversation id. |
| `Unknown named parameter '0'` on manual conflict path | `findConversationForLead()` passed an array as one param; fixed to positional args. |
| Past appointment returned 409 | `normalizeBookingTimes()` failure now maps to `invalid_selection` (400). |
| Stale next-server on port 3100 gave false failures | Killed by PID; never used `pkill -f 'next start'` (kills the shell). |
| Review regressions failed as expected at `a730a93` | Implemented four fixes test-first; full suite green at final revision. |
| PostgreSQL unavailable in sandbox | Documented explicitly as unverified; no substitute checks claimed. |

## Resources

- `docs/LEADPILOT_AUDIT.md`
- `docs/LEADPILOT_PHASE_1B_REPORT.md`
- `src/lib/booking-core.ts`, `src/lib/booking.ts`, `src/lib/transaction.ts`, `src/lib/transaction-adapters.ts`, `src/lib/db-transaction.ts`, `src/lib/appointment-patch.ts`, `src/lib/booking-notifications.ts`
- `src/app/api/conversations/[id]/messages/route.ts`, `src/app/api/appointments/route.ts`, `src/app/api/appointments/[id]/route.ts`
- `tests/booking.test.ts`, `tests/transaction.test.ts`, `tests/appointment-patch.test.ts`, `tests/booking-offer-policy.test.ts`, `tests/transaction-cleanup.test.ts`, `tests/booking-notifications.test.ts`, `tests/booking-e2e.mjs`
- PR #2: https://github.com/rickbarat047/leadpilot/pull/2 (targets `phase-1a-business-hours`)

## Visual/Browser Findings

- Mobile QA (390×844) passed 10 checks with 0 px overflow at final revision after installing Chromium host libraries in the sandbox.
- No visual redesign was attempted; existing CRM pages and onboarding/settings from Phase 1A remain unchanged by review fixes.

## Verification Evidence

- RED at `85eb9fe`: booking/transaction suites failed to load (missing modules).
- RED at `31677ee`: `parseSlotOffer(JSON.stringify(offer))` returned null.
- RED at `a730a93`: 4 review suites failed, 13 tests, missing modules/functions.
- GREEN at `cf0ee3dfb749bb5b089e2df304de09688bbf0665`, sandbox `sbx_4L7bd4LFEV7TeS5AGxonyE3jea4m`: npm ci 0; typecheck 0; npm test 0 (14 files / 97 tests); build 0; qa:booking 0 (60 PASS); qa:mobile 0 (10 PASS).

---

*Durable record for Phase 1B; no Phase 1C work started.*
