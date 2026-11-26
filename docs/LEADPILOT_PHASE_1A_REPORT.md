# LeadPilot — Phase 1A Report: Business Hours & Availability

**Status:** implemented and verified on branch `phase-1a-business-hours`; **not merged to `main`**; no production systems, environment variables, databases or live customer data were touched. Phase 1B was not started.

## 1. Original issue and root cause

Phase 0 (`docs/LEADPILOT_AUDIT.md`) confirmed that onboarding collected hours as one ambiguous free-text string (`"Mon–Sat 10:00–20:00"`), stored it as `hours_json: {"summary": "..."}`, while the slot generator expected a day-keyed array of `[open, close]` pairs. The generator therefore returned no slots for every onboarded business, unless a developer had hand-written the expected shape directly into the database. It also used server-local `getDay()` and emitted UTC ISO strings without any business timezone.

Root causes:

- `src/lib/validation.ts` accepted `hours: z.record(z.string()).optional()` — only the legacy free-text shape.
- `src/app/onboarding/page.tsx` submitted `{ hours: { summary: form.hours } }`; `src/app/app/settings/page.tsx` had no hours UI.
- `src/lib/slots.ts` silently skipped any hours entry that was not a two-element array and had no timezone model.
- A pre-existing SQLite-incompatible `GREATEST(onboarding_step, 8)` in the business PUT path made *any* business save fail with `no such function: GREATEST` on local SQLite, blocking hours persistence there.

Scope decision (ledgered): Phase 0 recommended booking-loop work first, but the user explicitly directed Phase 1A (hours/availability) before Phase 1B. This report covers only that direction.

## 2. Files changed

New:

- `src/lib/business-hours.ts` — zod schemas, normalization, form mapping, legacy migration value, timezone helpers.
- `src/lib/business-hours-migration.ts` — server-only idempotent legacy-row migration.
- `src/lib/business-update.ts` — dialect-neutral business UPDATE builder.
- `src/components/hours-editor.tsx` — reusable weekday hours editor.
- `tests/business-hours.test.ts` — 22 tests.
- `tests/business-persistence.test.ts` — 1 test for SQLite-compatible update SQL.
- `docs/LEADPILOT_PHASE_1A_REPORT.md` — this report.

Modified:

- `src/lib/slots.ts` — structured-hours slot generation with timezone conversion.
- `src/lib/validation.ts` — `hours: businessHoursSchema.optional()`.
- `src/app/api/business/route.ts` — GET returns normalized `businessHours`; PUT persists structured hours using the dialect-neutral update.
- `src/app/onboarding/page.tsx` — hours step uses the weekday editor and persists structured values.
- `src/app/app/settings/page.tsx` — new "Opening hours" card with save via API.
- `db/schema.sqlite.sql`, `db/schema.postgres.sql` — documentation comment on `hours_json` (no column type change required; both already use TEXT).
- Planning files under `.planning/2026-11-26-leadpilot-phase0-audit/` and `.planning/2026-11-26-2026-11-26-leadpilot-phase1a-business-ho/`.

Branch commits (oldest → newest): `8b0095f` (RED tests), `f21a454` (structured hours + slots), `f47f462` (timezone conversion), `eba4360` (RED form-mapping tests), `6badbed` (hours editor + schema comments), `fa8d1ed` (client-safe split/typecheck fixes), `0a54ec2` (RED business-update test), `1f97fef` (dialect-neutral update), `a6ef985` (attempted Vite annotation — ineffective), `b586f0b` (revert annotation + runner-safe SQL assertion test).

## 3. Database and migration changes

- No new table or column type change: `businesses.hours_json` is already TEXT in both SQLite and PostgreSQL. It now holds version-1 structured JSON.
- Both schema files document the new structure inline.
- `migrateLegacyBusinessHours()` runs once per process when availability is first requested. It reads `hours_json` via the existing generic `all()`/`run()` DB layer (works on both backends). For rows that are not valid structured v1 hours, it writes `normalizeBusinessHours(raw)`: `status: "needs-configuration"`, all seven days closed, and the original free text preserved in `legacySummary`. It never parses or invents days/times, and it leaves already-structured rows untouched.
- `businessUpdateSql()` replaces `GREATEST(onboarding_step, 8)` with `CASE WHEN onboarding_step < 8 THEN 8 ELSE onboarding_step END`, which works on SQLite and Postgres. COALESCE-based preservation of other profile fields is unchanged.
- No production database was modified. Existing rows remain intact; only their legacy hours description gets wrapped in an explicit unconfigured structure on first local read.

## 4. New business-hours data structure

```json
{
  "version": 1,
  "timezone": "Asia/Kolkata",
  "status": "configured",
  "days": {
    "mon": { "open": true, "start": "10:00", "end": "20:00" },
    "tue": { "open": false },
    "...": "sun..sat, all seven keys always present"
  },
  "legacySummary": "optional original free text"
}
```

Validation rules (zod): version must be `1`; timezone must be a valid IANA name (`Intl.DateTimeFormat` check); `status` is `configured` or `needs-configuration`; each weekday has an `open` boolean; an open day requires `HH:MM` `start`/`end` with `end > start`; a closed day cannot carry times; unknown keys are rejected. `normalizeBusinessHours()` maps any legacy/unstructured input to an explicit needs-configuration object without inventing availability.

Timezone default: the repository has no existing business timezone field; the only established model is `formatWhen()` in `src/lib/messaging.ts`, which assumes `Asia/Kolkata`. The structured model therefore stores an explicit IANA timezone and defaults migrated/unconfigured businesses to `Asia/Kolkata`, matching the product's existing India-first behavior. This is a timezone default only, never an invented opening hour.

## 5. Onboarding and settings changes

- Onboarding step 6 no longer asks for a free-text summary. It renders `HoursEditor`: a row per weekday with open/closed selection and time inputs, plus an IANA timezone field. Structured values are validated with `formToHours()` before Continue and before Finish, with the first zod error surfaced to the user.
- Onboarding loads saved hours from `GET /api/business` (`businessHours`) when editing an existing business.
- Settings adds an "Opening hours" card using the same editor; **Save opening hours** PUTs the real structured object to `/api/business`. Loading/saving uses the API/database, not local-only state.
- Layout uses CSS grid/flex wrapping so the editor is usable on mobile; no unrelated dashboard or marketing-page styling was changed.

## 6. Slot-generation changes

`generateSlots(hours, booked, { now, days, duration, bufferMin })` now:

- normalizes/validates input and returns `[]` for missing, legacy or `needs-configuration` hours;
- derives the local calendar date from `now` in the business timezone, so weekday selection and day boundaries follow the owner's timezone;
- iterates each configured day, converts local wall-clock start times to UTC instants (iterative offset correction for DST-capable zones), and emits `HH:MM` slots;
- enforces `start + duration <= end`, applies `bufferMin` between slot starts, and excludes appointments overlapping a candidate slot;
- preserves the existing defaults (`days: 7`, `duration: 60`, `bufferMin: 0`) and the existing `/api/appointments/slots` limits (1–14 days, 15–240 minutes, first 12 returned).

`freeSlotsForBusiness()` runs the legacy migration first, then reads `hours_json` and booked/confirmed appointments as before. No appointment creation was added.

## 7. Tests added

- `tests/business-hours.test.ts` (22 tests): structured schema acceptance/rejection (missing times, `end <= start`, bad times, unknown timezone), legacy normalization preserving text without invented days, migration-value behavior, business API schema acceptance/rejection, form↔structured mapping, weekday-only generation, closed days, per-day times, closing-time boundary, 90-minute duration and 30-minute buffer, no availability for legacy/missing hours, booked-slot exclusion, Asia/Kolkata vs UTC conversion, and a timezone day-boundary case.
- `tests/business-persistence.test.ts` (1 test): business UPDATE SQL contains no `GREATEST`, contains the CASE expression and `hours_json=?`, and binds hours JSON plus business id in the right positions. It was proved to fail (`RED_EXIT=1`, `expected ... not to contain 'GREATEST'`) when the SQL was temporarily reverted to the old expression in the sandbox.
- Existing 25 tests were retained unchanged.

TDD evidence: new tests failed before implementation (missing `business-hours` module; missing `business-update` module; form helpers missing). An early timezone implementation failed 8/18 availability tests with a 5.5-hour oscillation; root cause was a convergence comparison in `localWallTimeToUtc`, fixed by comparing against the target wall time. After fixes, all tests pass.

## 8. Test, typecheck and build results

Local Windows has no Node/npm; all checks ran in a disposable Vercel Sandbox (`node v24.22.3`, `npm 11.19.1`) at commit `b586f0b`. Sandbox session `sbx_dZmI8yLL5gnODF354enbgji7wfBl`; no production URL/secret was used.

| Command | Exit | Result |
|---|---|---|
| `npm ci --no-audit --no-fund` | 0 | 131 packages installed |
| `npm run typecheck` | 0 | `tsc --noEmit` clean |
| `npm test` | 0 | 8 files, **48/48 tests passed** (22 business-hours, 1 business-persistence, 5 guard, 6 email, 4 dialect, 3 AI, 4 billing, 3 Razorpay). Guard `api-error` stderr is expected test logging. |
| `npm run build` | 0 | Next 14.2.5 compiled successfully, 58 static pages generated |
| `QA_BASE=http://localhost:3100 npm run qa:mobile` | 0 | 10 PASS, all overflow 0 px (home, hamburger/nav, pricing, login, app, leads, automations, conversations, onboarding) |

Safe local API check against the sandbox's own `next start` server (seeded demo data only, no email/WhatsApp): `POST /api/demo/seed` 200; login 200; PUT structured hours 200; GET returned the exact configured schedule; invalid hours (`20:00`→`10:00`) returned 400 `{"error":"Invalid input"}`; `GET /api/appointments/slots?days=7` returned `total=13` with slots only on 2026-11-30 (Mon) and 2026-12-02 (Wed), first slot `2026-11-30T04:30:00.000Z` (10:00 IST) — closed days produced no slots.

Errors encountered and resolved: (1) build initially failed with `Can't resolve 'net'/'tls'` because a client component imported server-only DB code — migration was split into `business-hours-migration.ts`; (2) typecheck initially failed on a loosely typed JSON.parse and zod `Partial` days — fixed with typed `get` and `completeDays()`; (3) `tests/business-persistence.test.ts` initially failed to load because Vite/Vitest 2.1 cannot resolve Node 24's `node:sqlite` builtin (Vite filters `node:`-prefixed builtins) — the test was rewritten as a pure SQL assertion and real persistence was verified through the local API check instead; the ineffective `/* @vite-ignore */` experiment was reverted in `b586f0b`.

## 9. Known limitations and unresolved risks

- One operating interval per weekday; no split shifts, holidays, or per-service durations in hours configuration.
- No automatic completion of customer bookings: slot acceptance and overlap-safe transactional booking remain Phase 1B.
- `bufferMin` is supported by `generateSlots()` but not exposed by `/api/appointments/slots` (unchanged API surface).
- Legacy free-text hours are never parsed into structured hours: affected businesses are explicitly marked `needs-configuration` and must be edited in onboarding/settings. Their original text is preserved in `legacySummary`.
- Migration is one-per-process and value-based; it does not add a schema column or unique constraint. If a future deployment changes `hours_json` shape again, a new version/normalizer will be needed.
- No CI enforcement exists yet (no `.github/` workflows); the verification commands were run manually in a sandbox, not by an automated gate.
- Standalone `.mjs` check scripts were not run: several default to production or mutate demo data. No live email/WhatsApp/payment path was exercised.
- The Vercel production site remains on the old deployment; this branch is not linked/deployed to Vercel in this phase.

## 10. Manual action required before deployment

1. Review and merge/rebase the feature branch `phase-1a-business-hours` into `main` (or open a PR) when Phase 1A is approved.
2. After deployment, ask existing businesses with legacy free-text hours to configure weekdays in Settings → Opening hours (the system will show no invented availability until they do).
3. If the project is connected to a shared database later, confirm the standard runtime migration path still succeeds; no bespoke SQL repair is required for `hours_json`.
4. Add CI enforcement for `typecheck`, `test`, `build` and mobile QA before treating this as production-hardened (follow-up work, not part of Phase 1A).

## Acceptance assessment

- Structured, validated hours: **met** (zod schema + API validation + UI mapping).
- Existing records handled safely; both DB backends consistent: **met** (TEXT column unchanged, generic migration, dialect-neutral update tested on SQLite).
- Owners can configure and save real hours: **met** (onboarding + settings, verified via local API).
- Availability generated from hours: **met** (unit tests + local API slot check).
- Regression tests, existing suite, typecheck, build: **met** (48/48, exit 0, exit 0).
- Documented with actual evidence: **met** by this report.
- Phase 1B work: **not started**, by design.
