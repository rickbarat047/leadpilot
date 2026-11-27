# Findings — Phase 1A Business Hours & Availability

## Verified pre-existing behavior (before changes)

- `src/lib/slots.ts`: legacy `Hours = Record<string, [string,string] | string[] | null>`; weekday keys from server-local `getDay()`; no timezone conversion; UTC ISO output.
- `src/lib/validation.ts:29`: `hours: z.record(z.string()).optional()` — only legacy `{summary}` shape accepted.
- `src/app/onboarding/page.tsx`: default free text `'Mon–Sat 10:00–20:00'`, PUT `{hours:{summary}}`.
- `src/app/app/settings/page.tsx`: no hours editing at all.
- `src/app/api/business/route.ts`: PUT stored `JSON.stringify(b.hours ?? current hours_json)` but used SQLite-incompatible `GREATEST(onboarding_step, 8)`.
- `db/schema.sqlite.sql:60` and `db/schema.postgres.sql:60`: `hours_json TEXT NOT NULL DEFAULT '{}'`.
- No business timezone field anywhere; only established model is `formatWhen()` in `src/lib/messaging.ts` using `Asia/Kolkata`.

## Implemented structure and behavior

- `src/lib/business-hours.ts`: zod v1 schema with `version`, IANA `timezone`, `status`, seven weekday keys, `open`/`start`/`end`, close > open, `legacySummary`; helpers `emptyBusinessHours`, `normalizeBusinessHours`, `hoursToForm`, `formToHours`, `legacyHoursMigrationValue`, timezone conversion helpers.
- `src/lib/business-hours-migration.ts`: server-only one-per-process idempotent migration; legacy text → needs-configuration; never invents days/times; uses generic DB `all`/`run` so SQLite and Postgres both work.
- `src/lib/business-update.ts`: `businessUpdateSql()` uses `CASE WHEN onboarding_step < 8 THEN 8 ELSE onboarding_step END` (SQLite+Postgres safe).
- `src/lib/slots.ts`: generate slots from structured hours in business-local calendar; iterative local→UTC conversion; duration/buffer/closing boundary/booked overlap honored; returns `[]` for missing/legacy/unconfigured.
- UI: `src/components/hours-editor.tsx` used by onboarding and settings; real API persistence; validation errors surfaced.

## Verification evidence (fresh, final commit 0305f39)

- `npm ci` exit 0; `npm run typecheck` exit 0; `npm test` exit 0 — 8 files / 52 tests (26 business-hours).
- `npm run build` exit 0 — 58 pages.
- `QA_BASE=http://localhost:3100 npm run qa:mobile` exit 0 — 10 PASS, overflow 0 px.
- Local API: seed 200, login 200, PUT hours 200, GET returns exact configured schedule, invalid PUT 400, slots total 13 only on configured Mon/Wed in IST.
- RED proof for GREATEST regression: temporarily restoring `GREATEST` made `tests/business-persistence.test.ts` fail with `expected ... not to contain 'GREATEST'`.

## Open items for later phases

- Customer slot acceptance / transactional booking / overlap protection (Phase 1B).
- RESCHEDULE/CANCEL handlers, webhook security, delivery changes, billing — out of scope.
- CI enforcement for typecheck/test/build/mobile QA — none exists yet.
