# Phase 1B — Real Customer Appointment Booking

## Goal

Allow a customer to accept a numbered slot offered in conversation and create exactly one appointment atomically, with conflict protection, tenant isolation, confirmation and owner notification. Include the independent-review fixes for offer consumption/replay, PATCH hardening, transaction cleanup, notification isolation and context-sensitive offer reply classification. No Phase 1C work.

## Constraints

- Branch `phase-1b-customer-booking` only; never push to `main`; do not modify Phase 1A branch or merge PR #1.
- TDD: every new behavior has a test watched RED before implementation.
- No production DB/env/Vercel changes; no real email/WhatsApp/payment calls.
- No reschedule/cancel, webhook security, AI provider, billing, calendar or redesign work.
- Verification via disposable Vercel Sandbox (local Windows has no Node/npm).
- PostgreSQL runtime remains unverified; no SQL-string substitution for real DB checks.

## Phases

### Phase 1: RED tests for slot offers, selection and booking outcomes
**Status:** complete

Wrote `tests/booking.test.ts` and `tests/transaction.test.ts`; watched them fail in sandbox because modules were missing. Covered numbered offer metadata, deterministic selection, ambiguous/stale/unoffered cases, booking outcomes, overlap/concurrency/duplicate/past/invalid durations and transaction commit/rollback/release.

### Phase 2: Transaction abstraction for SQLite and PostgreSQL
**Status:** complete

Added `src/lib/transaction.ts` (withTransaction with guaranteed release, including begin failure), injectable `src/lib/transaction-adapters.ts`, and `src/lib/db-transaction.ts` using SQLite dedicated `DatabaseSync` with `BEGIN IMMEDIATE`/busy timeout and PostgreSQL dedicated pooled client with `SELECT ... FOR UPDATE`. Exported `getPool()` from `src/lib/db.ts`.

### Phase 3: Central booking service
**Status:** complete

Created `src/lib/booking-core.ts` and `src/lib/booking.ts::createBooking()` with validated business/lead/time/duration, service duration from `services.duration_min`, in-transaction availability revalidation, overlap/duplicate detection, atomic offer consumption, insert, lead update, conversation confirmation, and structured outcome mapping including `offer_outdated`/`offer_consumed`.

### Phase 4: Persist slot offers and deterministic selection in messages route
**Status:** complete

Stored numbered `SlotOffer` JSON (with stable id, createdAt, timezone, duration, service and consumed markers) in `messages.meta_json`; exposed meta_json through GET messages; replaced weak intent regex selection with last-offer parsing; JSON-string metadata parsing regression fixed; expired/outdated/consumed/ambiguous replies handled distinctly; service-specific durations used for offers.

### Phase 5: Route all appointment creation through booking service
**Status:** complete

Rewrote manual `POST /api/appointments` through `createBooking({source:'manual',ownerOverrideHours:true})` with outcome mapping and no direct INSERT. Hardened `PATCH /api/appointments/[id]` with `src/lib/appointment-patch.ts`: tenant-scoped update, rejects `starts_at` changes and reactivation of cancelled/no-show bookings.

### Phase 6: Post-commit confirmations and owner notification
**Status:** complete

Added `src/lib/booking-notifications.ts`: isolated post-commit `recordRun()` calls and deterministic `automation_runs` claim via `INSERT ... ON CONFLICT DO NOTHING RETURNING id`. Customer email queued only when configured and after commit; owner notification gated by existing settings; failures logged without rollback or duplicate alerts.

### Phase 7: Safe local integration/concurrency test script
**Status:** complete

Added `tests/booking-e2e.mjs` and `qa:booking` npm script. It refuses non-local QA_BASE, uses seeded demo data, and verifies 60 checks including offer persistence, numbered selection, 90/45-minute services, exact appointment times, lead/conversation updates, conflicts, replayed selections, concurrent selections of one offer, duplicate retries, PATCH guard, manual API conflicts and past appointment rejection.

### Phase 8: Full verification, report and stacked PR
**Status:** complete

Fresh sandbox verification at review-fix revision `cf0ee3dfb749bb5b089e2df304de09688bbf0665`: npm ci 0, typecheck 0, npm test 0 (14 files / 97 tests), build 0, qa:booking 0 (60 PASS), qa:mobile 0 (10 PASS). Report and planning files updated. Stacked PR #2 targeting `phase-1a-business-hours` is open and unmerged. Review fixes documented; no merge, no Phase 1C.

### Phase 9: Final review fix — context-sensitive offer reply classification
**Status:** complete

Root cause: `classifyOfferReply()` checked consumed/expired state before deciding whether the reply was a slot selection, so ordinary questions after booking/expiry received replay/expiry replies and fresh offers. RED at `a2bfff191695a762824c5921fdbcd4a5b61bce1a` (policy 17 tests / 8 failed; E2E 3 new classification failures). Implemented `detectSelectionIntent()` in `src/lib/booking-core.ts` and reordered classification: selection intent → consumed → expired → accept. GREEN implementation `05f8e13fc25c21ccbb461640575d82956ca3ab3a`: typecheck 0, npm test 0 (14 files / 101 tests), build 0, qa:booking 0 (88 PASS), qa:mobile 0 (10 PASS). PostgreSQL runtime remains unverified.

## Next Step

Stop and present the final Phase 1B review-fix results for the user's review. Do not start Phase 1C or merge any PR.
