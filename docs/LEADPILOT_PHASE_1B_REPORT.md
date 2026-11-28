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

New `src/lib/transaction.ts`: typed `withTransaction(adapter, work)` begins, commits on success, rolls back and rethrows on failure, always releases.

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
  createdAt: ISO string,
  timezone: IANA timezone,
  durationMin: number,
  serviceName: string | null,
  options: [{ index: 1|2|3, startsAt: ISO UTC, label: display string }]
}
```

`formatSlotOffers()` renders exactly `1. label`, `2. label`, `3. label` from stored labels. `offerSlots()` persists this JSON in `messages.meta_json` on the AI message; `GET /api/conversations/[id]/messages` now exposes `meta_json`. `parseSlotOffer()` accepts both objects and JSON strings (fixed after E2E exposed the string case). Offers expire after one hour.

## 5. Customer selection logic

`parseSlotSelection()` deterministically accepts `1`, `2`, `3`, `option/choice/slot N`, and `first/second/third` (with optional trailing `please/one/slot/option`). It rejects ambiguous input such as `2 or 3`, out-of-range numbers and `yes` without an active offer. The messages route loads only the newest valid non-expired offer for that conversation, never reconstructs an offer from text, and never books an arbitrary mentioned time. Stale/unavailable choices trigger a fresh offer and an explanation; ambiguous numeric-like replies ask the customer to choose 1/2/3.

## 6. Booking validation rules

`src/lib/booking.ts::createBooking()` returns `created | already_booked | slot_unavailable | invalid_selection | lead_not_found | business_not_found`. It verifies the authenticated business, lead (and conversation) ownership, uses `services.duration_min` (fallback 60), ignores client-supplied `ends_at`, rejects past/invalid/zero-length/negative durations (`invalid_selection` → 400), revalidates the offered start against current structured hours/business timezone via `generateSlots()` inside the transaction, rejects overlaps and duplicate active bookings for the same lead/start, then inserts the appointment, updates lead status `Appointment Booked`, clears `next_followup_at`, and inserts the conversation confirmation. All reads/writes in the operation use the transaction client.

## 7. Manual API changes

`POST /api/appointments` is routed through `createBooking({ source: 'manual', ownerOverrideHours: true })`, preserving owner capability. Lead ownership is checked before insertion. Outcome mapping: `created`→201, `slot_unavailable`/`already_booked`→409, `invalid_selection`→400, `lead_not_found`/`business_not_found`→404. No direct appointment INSERT remains in that route.

## 8. Notification behavior

The conversation confirmation is inserted inside the committed transaction. Only after commit, and only when `emailBookingConfirm` is enabled with a valid customer email, an email is queued via existing Resend outbox (mock/logged when unconfigured); owner notification uses `notifyOwner()` gated by `emailOwnerAlerts`. Notification failures are logged through `recordRun()` and never roll back the appointment or produce duplicate alerts on retries. The report does not claim an email was delivered when only queued/mocked.

## 9. Tests and exact results

Sandbox: `sbx_XpQWEWIvTH1eEwzinZUgjCJZAfFr`, Node 24, git revision `95edb714231b17b6622af1891908709b6a4b3c7e`. Local Windows has no Node/npm; all commands ran in the disposable sandbox. No production calls.

| Command | Exit | Result |
|---|---|---|
| `npm ci --no-audit --no-fund` | 0 | 131 packages |
| `npx vitest run tests/booking.test.ts tests/transaction.test.ts` (RED at `85eb9fe`) | 1 | Both suites failed to load — missing modules (expected RED) |
| `npx vitest run tests/booking.test.ts` (RED at `31677ee`) | 1 | `parseSlotOffer(JSON.stringify(offer))` returned null, 1 failed / 12 passed |
| `npm run typecheck` | 0 | `tsc --noEmit` clean |
| `npm test` | 0 | 10 files / **68 tests passed** |
| `npm run build` | 0 | Next 14.2.5 compiled, 58 pages |
| `QA_BASE=http://localhost:3100 npm run qa:booking` | 0 | **31 PASS** checks |
| `QA_BASE=http://localhost:3100 npm run qa:mobile` | 0 | 10 PASS, 0 px overflow |

RED→GREEN evidence: booking-core/transaction tests were watched failing before implementation; the JSON-string offer parse regression was watched failing at `31677ee` before the fix. E2E failures were likewise reproduced and fixed: notes NOT NULL, undefined customer name in conflict payloads, array-as-single-parameter in `findConversationForLead()`, and wrong 409 mapping for past appointments. The E2E script refuses any `QA_BASE` other than `http://localhost:3100` or `http://127.0.0.1:3100` and uses only seeded demo data.

## 10. Database backends actually exercised

- **SQLite:** exercised end-to-end (local file DB; no `DATABASE_URL` in sandbox env), including transaction commit/rollback paths via booking and conflict tests. The earlier Phase 1A report's SQLite-only caveat still applies.
- **PostgreSQL:** not exercised at runtime. The dedicated-client transaction code and `FOR UPDATE` lock are typechecked and build successfully, but no disposable PG credentials were available. Runtime behavior remains unverified.

## 11. Known limitations

- No reschedule/cancel/12-hour rule; no webhook security, AI provider replacement, billing, calendar integration or UI redesign (deferred to later phases).
- PostgreSQL runtime unverified; no cross-backend parity test was run.
- Vitest 2.1 cannot resolve Node 24 `node:sqlite`, so database round-trips are covered by the local E2E script rather than unit tests.
- Offer TTL is one hour; stale offers are re-generated rather than held indefinitely.
- Customer confirmation email may be queued/mocked depending on environment; no live delivery was exercised.
- `PATCH /api/appointments/[id]` still allows status/start-time changes without overlap validation; this was left unchanged to avoid out-of-scope dashboard behavior changes.

## 12. Manual deployment requirements

- Verify PostgreSQL booking transaction behavior with a disposable Neon/database instance before enabling PostgreSQL in production.
- Run the same safe E2E/mobile scripts against a local/staging server after deployment; never against production.
- Set `WEBHOOK_SECRET` and WhatsApp credentials only in later phases; no env changes were made here.
- Confirm no Vercel production deployment was triggered by this branch (stacked PR is unmerged).

## 13. Remaining work for Phase 1C and Phase 1D

- **Phase 1C:** reschedule/cancel handling, status transitions (including 12-hour rule), owner notifications for changes.
- **Phase 1D:** inbound channel hardening (webhook secret/WhatsApp signature), real email reply processing, and CI enforcement of typecheck/tests/build/mobile QA.

## Acceptance assessment

Phase 1B's definition of done is met on SQLite with the PostgreSQL caveat above: customers can choose an offered slot, availability is revalidated in a serialized transaction, exactly one appointment is created, overlaps/races/duplicates are rejected, lead/conversation are updated, confirmations and owner notifications are post-commit only, and manual booking cannot bypass conflict protection. All reported commands were executed with the exact exit codes shown.
