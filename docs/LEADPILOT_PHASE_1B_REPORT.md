# Phase 1B — Real Customer Appointment Booking Report

Branch: `phase-1b-customer-booking` (from Phase 1A `e6ad1ea`). PR #1 (Phase 1A → main) remains open and unmerged; `main` was never modified. Phase 1C/1D not started.

## 1. Original booking gap and root cause

Phase 0 audit (`docs/LEADPILOT_AUDIT.md`) confirmed: the bot offered real slots but never converted a customer choice into an appointment; there was no overlap check, no transaction, and manual booking inserted before ownership validation. Root causes found in source:

- Conversation slot offers were formatted from `freeSlotsForBusiness()` and appended to an AI reply, but only the reply text was stored; no `meta_json` offer was persisted, so a later reply could not be matched to a specific offered slot.
- `/api/appointments` inserted directly with a client-supplied `lead_id` and `ends_at`, without service duration, overlap checks, transaction or ownership validation.
- No transaction abstraction existed in `src/lib/db.ts`; `all/get/run` each used independent pool/shared connections.
- `parseSlotOffer()` rejected JSON strings, although `meta_json` is a string in the database, so every customer selection fell through to a generic AI reply.
- Several parameter-binding defects (`notes: null` violating NOT NULL; `get(sql, [a,b])` array-as-single-parameter) surfaced only in live E2E, not in unit tests.

## 2. Transaction design

New `src/lib/transaction.ts`: typed `withTransaction(adapter, work)` begins, commits on success, rolls back and rethrows on failure, and always releases the acquired resource — including when `begin()` itself fails. Rollback and release errors never mask the original exception. `src/lib/transaction-adapters.ts` holds injectable SQLite/PostgreSQL adapter factories so begin/commit/rollback/release cleanup is unit-testable without importing `node:sqlite` or `pg`.

New `src/lib/db-transaction.ts`:

- **SQLite:** dedicated `DatabaseSync` connection, `PRAGMA busy_timeout=5000`, `BEGIN IMMEDIATE`; reads use `.all()`, writes `.run()` on the same transaction connection; `COMMIT`/`ROLLBACK`; connection closed on release.
- **PostgreSQL:** dedicated client from exported `getPool()`, `BEGIN`/`COMMIT`/`ROLLBACK`, `SELECT id FROM businesses WHERE id=? FOR UPDATE` business lock, placeholder conversion via `toPgPlaceholders()`; client released in `release()`.

No external calls occur inside a transaction. Both paths serialize appointment creation for the same business. `getPool()` was exported from `src/lib/db.ts` to allow a dedicated client.

## 3. Concurrency guarantees and limitations

- SQLite `BEGIN IMMEDIATE` acquires the write lock before conflict checks and INSERT; concurrent attempts wait (busy timeout) or fail, never double-book.
- PostgreSQL `FOR UPDATE` business-row lock serializes all booking paths for that business; conflict check and INSERT share one transaction client.
- Overlap uses half-open intervals: `existing.starts_at < requested.ends_at AND existing.ends_at > requested.starts_at` for active (`booked`, `confirmed`) appointments. Adjacent bookings are allowed.
- E2E verified a two-way race: exactly one winner, loser rejected as conflict.
- **Limitation:** PostgreSQL runtime was not exercised (no disposable PG credentials); its transaction logic is typechecked but unverified at runtime. SQLite busy-timeout behavior was verified only for the tested concurrency level. No database-level exclusion constraint was added (would not be portable across both backends).

## 4. Slot-offer metadata structure

`src/lib/booking-core.ts` defines `SlotOffer`:

```ts
{
  version: 1,
  type: 'slot_offer',
  id: string,                  // stable offer identity
  createdAt: ISO string,
  timezone: IANA timezone,
  durationMin: number,
  serviceName: string | null,
  consumedAt?: ISO string,     // set once a valid selection wins
  consumedBy?: string,         // lead id that consumed the offer
  options: [{ index: 1|2|3, startsAt: ISO UTC, label: display string }]
}
```

`formatSlotOffers()` renders exactly `1. label`, `2. label`, `3. label` from stored labels. `offerSlots()` persists this JSON in `messages.meta_json` on the AI message; `GET /api/conversations/[id]/messages` now exposes `meta_json`. `parseSlotOffer()` accepts both objects and JSON strings (fixed after E2E exposed the string case). Offers expire after one hour and are marked consumed atomically, so replaying the same selection cannot create a second appointment.

## 5. Customer selection logic

`parseSlotSelection()` deterministically accepts `1`, `2`, `3`, `option/choice/slot N`, and `first/second/third` (with optional trailing `please/one/slot/option`). It rejects ambiguous input such as `2 or 3`, out-of-range numbers and `yes` without an active offer. The messages route loads only the newest offer for that conversation, classifies it as expired or consumed before parsing the reply, and never reconstructs an offer from text or books an arbitrary mentioned time. Expired or outdated choices trigger a fresh offer and an explanation; already-consumed replies are answered without creating a duplicate; ambiguous numeric-like replies ask the customer to choose 1/2/3.

## 6. Booking validation rules

`src/lib/booking.ts::createBooking()` returns `created | already_booked | slot_unavailable | invalid_selection | offer_outdated | offer_consumed | lead_not_found | business_not_found`. It verifies the authenticated business, lead (and conversation) ownership, uses `services.duration_min` (fallback 60), ignores client-supplied `ends_at`, rejects past/invalid/zero-length/negative durations (`invalid_selection` → 400), checks offer duration matches the service and rejects expired or already-consumed offers (`offer_outdated`/`offer_consumed`, both → 409), revalidates the offered start against current structured hours/business timezone via `generateSlots()` inside the transaction, rejects overlaps and duplicate active bookings for the same lead/start, then atomically marks the offer consumed, inserts the appointment, updates lead status `Appointment Booked`, clears `next_followup_at`, and inserts the conversation confirmation. All reads/writes in the operation use the transaction client.

## 7. Manual API changes

`POST /api/appointments` is routed through `createBooking({ source: 'manual', ownerOverrideHours: true })`, preserving owner capability. Lead ownership is checked before insertion. Outcome mapping: `created`→201, `slot_unavailable`/`already_booked`/`offer_outdated`/`offer_consumed`→409, `invalid_selection`→400, `lead_not_found`/`business_not_found`→404. No direct appointment INSERT remains in that route. `PATCH /api/appointments/[id]` now uses a dedicated `src/lib/appointment-patch.ts` validator and a tenant-scoped update: it rejects any `starts_at` change and any reactivation of a cancelled/no-show appointment, while preserving the existing allowed status transitions.

## 8. Notification behavior

The conversation confirmation is inserted inside the committed transaction. Notification work moved to `src/lib/booking-notifications.ts::notifyBookingParties()`, which runs only after commit, creates isolated `recordRun()` audit entries, and claims a deterministic `automation_runs` row with `INSERT ... ON CONFLICT DO NOTHING RETURNING id` so the same booking cannot double-notify. Email is queued via the existing Resend outbox only when `emailBookingConfirm` is enabled with a valid customer email (mock/logged when unconfigured); owner notification uses `notifyOwner()` gated by `emailOwnerAlerts`. Notification failures are logged and never roll back the appointment. The report does not claim an email was delivered when only queued/mocked.

## 9. Tests and exact results

Sandbox: `sbx_4L7bd4LFEV7TeS5AGxonyE3jea4m`, Node 24, final git revision `cf0ee3dfb749bb5b089e2df304de09688bbf0665` (review fixes). Local Windows has no Node/npm; all commands ran in the disposable sandbox. No production calls. Earlier RED evidence used revision `a730a93`.

| Command | Exit | Result |
|---|---|---|
| `npm ci --no-audit --no-fund` | 0 | 131 packages |
| `npx vitest run tests/booking.test.ts tests/transaction.test.ts` (RED at `85eb9fe`) | 1 | Both suites failed to load — missing modules (expected RED) |
| `npx vitest run tests/booking.test.ts` (RED at `31677ee`) | 1 | `parseSlotOffer(JSON.stringify(offer))` returned null, 1 failed / 12 passed |
| `npx vitest run tests/appointment-patch.test.ts tests/booking-offer-policy.test.ts tests/transaction-cleanup.test.ts tests/booking-notifications.test.ts` (RED at `a730a93`) | 1 | 4 files failed / 13 tests failed — missing modules/functions (expected RED) |
| `npm run typecheck` | 0 | `tsc --noEmit` clean |
| `npm test` | 0 | 14 files / **97 tests passed** |
| `npm run build` | 0 | Next 14.2.5 compiled, 58 pages |
| `QA_BASE=http://localhost:3100 npm run qa:booking` | 0 | **60 PASS** checks |
| `QA_BASE=http://localhost:3100 npm run qa:mobile` | 0 | 10 PASS, 0 px overflow |

RED→GREEN evidence: booking-core/transaction tests were watched failing before implementation; the JSON-string offer parse regression was watched failing at `31677ee` before its fix; the four independent-review regression suites were watched failing at `a730a93` before implementation and are green at final revision. Earlier E2E failures were likewise reproduced and fixed: notes NOT NULL, undefined customer name in conflict payloads, array-as-single-parameter in `findConversationForLead()`, and wrong 409 mapping for past appointments. The E2E script refuses any `QA_BASE` other than `http://localhost:3100` or `http://127.0.0.1:3100` and uses only seeded demo data.

## 10. Database backends actually exercised

- **SQLite:** exercised end-to-end (local file DB; no `DATABASE_URL` in sandbox env), including transaction commit/rollback paths via booking and conflict tests. The earlier Phase 1A report's SQLite-only caveat still applies.
- **PostgreSQL:** not exercised at runtime. The sandbox had no `DATABASE_URL`/PG/POSTGRES env names and no `postgres`, `psql`, `pg_ctl`, `initdb` or `docker` binaries. The dedicated-client transaction code, `FOR UPDATE` lock, and `INSERT ... ON CONFLICT DO NOTHING RETURNING` claim are typechecked and build successfully, but runtime behavior remains unverified; no SQL string was substituted for a real database check.

## 11. Known limitations

- No reschedule/cancel/12-hour rule; no webhook security, AI provider replacement, billing, calendar integration or UI redesign (deferred to later phases).
- PostgreSQL runtime unverified; no cross-backend parity test was run.
- Vitest 2.1 cannot resolve Node 24 `node:sqlite`, so database round-trips are covered by the local E2E script rather than unit tests.
- Offer TTL is one hour; stale offers are re-generated rather than held indefinitely. Offer replay is now rejected via atomic consumption, but a genuinely new enquiry after expiry gets a fresh offer.
- Customer confirmation email may be queued/mocked depending on environment; no live delivery was exercised.
- Reschedule/cancel, 12-hour status rules and owner change notifications remain Phase 1C work. `PATCH /api/appointments/[id]` now rejects `starts_at` changes and reactivation, but does not implement reschedule semantics.

## 12. Manual deployment requirements

- Verify PostgreSQL booking transaction behavior with a disposable Neon/database instance before enabling PostgreSQL in production.
- Run the same safe E2E/mobile scripts against a local/staging server after deployment; never against production.
- Set `WEBHOOK_SECRET` and WhatsApp credentials only in later phases; no env changes were made here.
- Confirm no Vercel production deployment was triggered by this branch (stacked PR is unmerged).

## 13. Remaining work for Phase 1C and Phase 1D

- **Phase 1C:** reschedule/cancel handling, status transitions (including 12-hour rule), owner notifications for changes.
- **Phase 1D:** inbound channel hardening (webhook secret/WhatsApp signature), real email reply processing, and CI enforcement of typecheck/tests/build/mobile QA.

## 14. Independent review fixes (final revisions)

A fresh-context review of the Phase 1B branch produced four important findings; each was fixed test-first:

1. **Appointment PATCH could move a booking or reactivate a cancellation.** Added `src/lib/appointment-patch.ts` and wired it into the PATCH route with a tenant-scoped update. `tests/appointment-patch.test.ts` RED→GREEN.
2. **Slot offers were not uniquely identified or consumed.** Added stable `id`, `consumedAt`, `consumedBy`, `offerConsumed`, `offerDurationMatches` and `classifyOfferReply()` in `src/lib/booking-core.ts`; the transaction marks an offer consumed before inserting the appointment, and `tests/booking-offer-policy.test.ts` covers replay/expiry/duration mismatch.
3. **Transaction cleanup was untestable and leaked on begin failure.** Added injectable `src/lib/transaction-adapters.ts` and hardened `withTransaction()` so release happens even when begin throws; `tests/transaction-cleanup.test.ts` RED→GREEN.
4. **Notification failures bypassed the isolated audit path and could duplicate alerts.** Added `src/lib/booking-notifications.ts` with isolated post-commit `recordRun()` calls and a deterministic `automation_runs` claim; `tests/booking-notifications.test.ts` RED→GREEN.

E2E was extended to 60 checks, including 90/45-minute service durations, replayed option selections, concurrent selections of the same offer, the PATCH guard, and a 45-minute booking. No production calls, no merge, and no Phase 1C/1D work were performed.

## Acceptance assessment

Phase 1B's definition of done is met on SQLite with the PostgreSQL caveat above: customers can choose an offered slot, availability is revalidated in a serialized transaction, exactly one appointment is created, overlaps/races/duplicates are rejected, lead/conversation are updated, confirmations and owner notifications are post-commit only, and manual booking cannot bypass conflict protection. All reported commands were executed with the exact exit codes shown.
