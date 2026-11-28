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

`parseSlotSelection()` deterministically accepts `1`, `2`, `3`, `option/choice/slot N`, and `first/second/third` (with optional trailing `please/one/slot/option`). It rejects ambiguous input such as `2 or 3`, out-of-range numbers and `yes` without an active offer. `detectSelectionIntent()` now decides whether a reply is a genuine attempt to select an offered option **before** offer lifecycle state is considered: exact supported selections, explicit multi-option ambiguity, bare out-of-range digits, and option words without a number count as selection attempts; ordinary prose containing a digit does not. The messages route loads only the newest offer for that conversation and calls `classifyOfferReply()`, which checks selection intent first, then consumed/expired/active state. Ordinary questions continue through normal AI conversation regardless of whether the previous offer is active, expired or consumed. Only genuine selections against an expired/outdated offer trigger a fresh numbered offer; only genuine selections against a consumed offer are rejected as replay. Ambiguous numeric-like replies ask the customer to choose 1/2/3. The route never reconstructs an offer from text or books an arbitrary mentioned time.

## 6. Booking validation rules

`src/lib/booking.ts::createBooking()` returns `created | already_booked | slot_unavailable | invalid_selection | offer_outdated | offer_consumed | lead_not_found | business_not_found`. It verifies the authenticated business, lead (and conversation) ownership, uses `services.duration_min` (fallback 60), ignores client-supplied `ends_at`, rejects past/invalid/zero-length/negative durations (`invalid_selection` → 400), checks offer duration matches the service and rejects expired or already-consumed offers (`offer_outdated`/`offer_consumed`, both → 409), revalidates the offered start against current structured hours/business timezone via `generateSlots()` inside the transaction, rejects overlaps and duplicate active bookings for the same lead/start, then atomically marks the offer consumed, inserts the appointment, updates lead status `Appointment Booked`, clears `next_followup_at`, and inserts the conversation confirmation. All reads/writes in the operation use the transaction client.

## 7. Manual API changes

`POST /api/appointments` is routed through `createBooking({ source: 'manual', ownerOverrideHours: true })`, preserving owner capability. Lead ownership is checked before insertion. Outcome mapping: `created`→201, `slot_unavailable`/`already_booked`/`offer_outdated`/`offer_consumed`→409, `invalid_selection`→400, `lead_not_found`/`business_not_found`→404. No direct appointment INSERT remains in that route. `PATCH /api/appointments/[id]` now uses a dedicated `src/lib/appointment-patch.ts` validator and a tenant-scoped update: it rejects any `starts_at` change and any reactivation of a cancelled/no-show appointment, while preserving the existing allowed status transitions.

## 8. Notification behavior

The conversation confirmation is inserted inside the committed transaction. Notification work moved to `src/lib/booking-notifications.ts::notifyBookingParties()`, which runs only after commit, creates isolated `recordRun()` audit entries, and claims a deterministic `automation_runs` row with `INSERT ... ON CONFLICT DO NOTHING RETURNING id` so the same booking cannot double-notify. Email is queued via the existing Resend outbox only when `emailBookingConfirm` is enabled with a valid customer email (mock/logged when unconfigured); owner notification uses `notifyOwner()` gated by `emailOwnerAlerts`. Notification failures are logged and never roll back the appointment. The report does not claim an email was delivered when only queued/mocked.

## 9. Tests and exact results

Final verification sandbox: `sbx_VBJ2ZEMOzPoJdnzBtdoy3vzVPF8i`, Node 24, final implementation revision `05f8e13fc25c21ccbb461640575d82956ca3ab3a` (context-sensitive offer classification). Earlier review-fix verification at `cf0ee3dfb749bb5b089e2df304de09688bbf0665` used sandbox `sbx_4L7bd4LFEV7TeS5AGxonyE3jea4m`; RED evidence used `a730a93` and `a2bfff191695a762824c5921fdbcd4a5b61bce1a`. Local Windows has no Node/npm; all commands ran in disposable sandboxes. No production calls.

| Command | Exit | Result |
|---|---|---|
| `npm ci --no-audit --no-fund` | 0 | 131 packages |
| `npx vitest run tests/booking.test.ts tests/transaction.test.ts` (RED at `85eb9fe`) | 1 | Both suites failed to load — missing modules (expected RED) |
| `npx vitest run tests/booking.test.ts` (RED at `31677ee`) | 1 | `parseSlotOffer(JSON.stringify(offer))` returned null, 1 failed / 12 passed |
| `npx vitest run tests/appointment-patch.test.ts tests/booking-offer-policy.test.ts tests/transaction-cleanup.test.ts tests/booking-notifications.test.ts` (RED at `a730a93`) | 1 | 4 files failed / 13 tests failed — missing modules/functions (expected RED) |
| `npx vitest run tests/booking-offer-policy.test.ts` (RED at `a2bfff1`) | 1 | 17 tests / 8 failed — missing `detectSelectionIntent` and lifecycle applied to ordinary replies (expected RED) |
| `QA_BASE=http://localhost:3100 npm run qa:booking` (RED at `a2bfff1`) | 1 | 3 new classification failures — consumed question, expired question, `yes please` on expired offer |
| `npm run typecheck` | 0 | `tsc --noEmit` clean |
| `npm test` | 0 | 14 files / **101 tests passed** |
| `npm run build` | 0 | Next 14.2.5 compiled, 58 pages |
| `QA_BASE=http://localhost:3100 npm run qa:booking` | 0 | **88 PASS**, 0 fail |
| `QA_BASE=http://localhost:3100 npm run qa:mobile` | 0 | 10 PASS, 0 fail, 0 px overflow |

RED→GREEN evidence: booking-core/transaction tests were watched failing before implementation; the JSON-string offer parse regression was watched failing at `31677ee` before its fix; the four independent-review regression suites were watched failing at `a730a93` before implementation and are green at final revision. The final classification regression was watched failing at `a2bfff1` in both the policy unit suite (8 failures) and the booking E2E (3 new failures), then green at `05f8e13` (17/17 policy tests, 101/101 unit tests, 88/88 booking checks). Earlier E2E failures were likewise reproduced and fixed: notes NOT NULL, undefined customer name in conflict payloads, array-as-single-parameter in `findConversationForLead()`, and wrong 409 mapping for past appointments. The E2E script refuses any `QA_BASE` other than `http://localhost:3100` or `http://127.0.0.1:3100` and uses only seeded demo data.

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

E2E was extended to 60 checks, including 90/45-minute service durations, replayed option selections, concurrent selections of the same offer, the PATCH guard, and a 45-minute booking. A subsequent final review found the classification-priority bug described in Section 15; E2E was then extended to 88 checks. No production calls, no merge, and no Phase 1C/1D work were performed.

## 15. Final independent-review fix: context-sensitive offer reply classification

A final independent review found that `classifyOfferReply()` checked `consumedAt`/expiry before examining the customer's reply. After a successful booking, an ordinary question such as "What is your business address?" was answered with "That offer was already used"; after expiry, an unrelated question caused fresh slots to be offered. This incorrectly gave stale offer state priority over normal conversation.

The focused fix adds `detectSelectionIntent(input, offer)` to `src/lib/booking-core.ts`. It runs first and recognizes only strict, unambiguous selection attempts: exact `parseSlotSelection()` matches, explicit `2 or 3`-style ambiguity, bare out-of-range digits, and option words without a number. Ordinary prose containing a digit (for example, "I have 2 questions about pricing") is not a selection. `classifyOfferReply()` then applies lifecycle state only to genuine selection attempts: consumed offers reject replay, expired offers explain expiry and return fresh numbered options, and non-selection replies return `none` so the messages route continues the normal AI conversation. The messages route, booking transaction, replay protection and notification path were not otherwise changed.

RED evidence: `a2bfff191695a762824c5921fdbcd4a5b61bce1a` — policy suite 17 tests / 8 failed; booking E2E failed on the three ordinary-reply cases. GREEN implementation: `05f8e13fc25c21ccbb461640575d82956ca3ab3a` — policy 17/17, full suite 101/101, booking E2E 88/88, mobile QA 10/10. New E2E cases cover consumed ordinary question, expired ordinary question, `yes please` on an expired offer, ambiguous `2 or 3`, a number-containing question, a bare number with no offer, expired genuine selection, and replay of consumed options 1 and 2.

Implementation SHA: `05f8e13fc25c21ccbb461640575d82956ca3ab3a`. Documentation SHA: the final documentation commit at branch HEAD after this update is pushed (reported exactly in the final response and PR #2 description). PostgreSQL runtime remains unverified.

## Acceptance assessment

Phase 1B's definition of done is met on SQLite with the PostgreSQL caveat above: customers can choose an offered slot, availability is revalidated in a serialized transaction, exactly one appointment is created, overlaps/races/duplicates are rejected, lead/conversation are updated, confirmations and owner notifications are post-commit only, and manual booking cannot bypass conflict protection. All reported commands were executed with the exact exit codes shown.
