# Phase 1B — Real Customer Appointment Booking

## Goal

Allow a customer to accept a numbered slot offered in conversation and create exactly one appointment atomically, with conflict protection, tenant isolation, confirmation and owner notification. No Phase 1C work.

## Constraints

- Branch `phase-1b-customer-booking` only; never push to `main`; do not modify Phase 1A branch or merge PR #1.
- TDD: every new behavior has a test watched RED before implementation.
- No production DB/env/Vercel changes; no real email/WhatsApp/payment calls.
- No reschedule/cancel, webhook security, AI provider, billing, calendar or redesign work.
- Verification via disposable Vercel Sandbox (local Windows has no Node/npm).
- PostgreSQL runtime remains unverified unless disposable credentials are provided.

## Phases

### Phase 1: RED tests for slot offers, selection and booking outcomes
**Status:** in_progress

Write failing tests for numbered offer metadata, deterministic selection (1/2/3, option/first/second/third), ambiguous/stale/unoffered/yes-without-offer cases, created/already_booked/slot_unavailable/invalid_selection/lead_not_found/business_not_found results, lead/conversation updates, overlap/cancelled-release/concurrency/duplicate/past/zero/negative duration, tenant isolation. Run and record RED.

### Phase 2: Transaction abstraction for SQLite and PostgreSQL
**Status:** pending

Add strongly typed `withTransaction` using SQLite `BEGIN IMMEDIATE` on a dedicated connection with busy timeout, and PostgreSQL pooled client with `SELECT ... FOR UPDATE` business lock. All reads/writes in one client; commit/rollback/release guaranteed; no external calls inside transactions.

### Phase 3: Central booking service
**Status:** pending

Create `src/lib/booking.ts` with validated business/lead/time/duration, service duration from `services.duration_min`, in-transaction availability revalidation, overlap query, duplicate detection, insert, lead update, conversation confirmation, and structured outcome mapping.

### Phase 4: Persist slot offers and deterministic selection in messages route
**Status:** pending

Store numbered offers with exact ISO starts/duration/service/label/version/createdAt in `messages.meta_json`; replace weak intent regex selection with last-valid-offer parsing; regenerate fresh offers for stale choices; ask for clarification when ambiguous.

### Phase 5: Route all appointment creation through booking service
**Status:** pending

Rewrite manual `POST /api/appointments` to use the service while preserving owner capability; harden `PATCH /api/appointments/[id]` scoping/status handling; ensure no other direct INSERT paths bypass the service.

### Phase 6: Post-commit confirmations and owner notification
**Status:** pending

Queue customer email only after commit when configured; insert confirmation message in the transaction; notify owner after commit through existing infrastructure; no duplicate notifications on retries; record failures via run logs without rolling back.

### Phase 7: Safe local integration/concurrency test script
**Status:** pending

Create integration script that refuses non-local QA_BASE, uses only seeded demo data, verifies the 14 journey checks including conflict, concurrent attempts and duplicate retries, plus manual API conflict path. Run it locally in sandbox only.

### Phase 8: Full verification, report and stacked PR
**Status:** pending

Run new tests, full suite, typecheck, build, mobile QA, integration/concurrency script; write `docs/LEADPILOT_PHASE_1B_REPORT.md`; update planning; inspect diff; commit/push branch; open stacked PR targeting `phase-1a-business-hours`; stop for review.

## Next Step

Write and run the Phase 1B RED tests before any implementation.
