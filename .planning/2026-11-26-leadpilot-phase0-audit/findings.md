# Findings — LeadPilot Phase 0 Audit

Evidence log. All entries cite file paths and line numbers. Subagent reports were treated as claims; key items were spot-checked directly in source.

## Confirmed evidence

- AI classification is mock regex in every mode: `src/lib/ai.ts:70-75` delegates `OpenAICompatibleProvider.classify()` to `MockProvider`; only `draftReply()` uses LLM with silent fallback (`:76-99`). Spot-checked directly.
- AI replies are stored but not delivered on web/API/webhook/manual paths: `src/lib/automation.ts:161-163`, `src/app/api/conversations/[id]/messages/route.ts:73`. WhatsApp instant reply has an explicit outbound twin (`automation.ts:169-173`) but is mock when unconfigured (`src/lib/whatsapp.ts:13-17`).
- Slot offer without booking: `messages/route.ts:55-72` offers real slots and sets Qualified but only inserts a `messages` row; `book_offer` step stored at `src/lib/auth.ts:130` is never executed. Spot-checked directly.
- Business-hours format mismatch: `src/lib/slots.ts:56-60` needs structured day ranges; `src/lib/validation.ts:29` accepts only `Record<string,string>`; onboarding stores `hours:{summary:'Mon–Sat 10:00–20:00'}` (`src/app/onboarding/page.tsx:10,29,54`). Spot-checked directly.
- No double-booking protection: `src/app/api/appointments/route.ts:25-29` inserts unconditionally; `db/schema.sqlite.sql:245` index non-unique. Spot-checked directly.
- RESCHEDULE/CANCEL are strings only: `appointments/route.ts:41,48`, `automation.ts:83,87`, `auth.ts:150,152`; inbound handler only checks opt-out (`automation.ts:248-255`, `src/lib/text.ts:1-3`).
- Lead webhook unsafe fallback: `src/app/api/webhooks/lead/route.ts:17-29` accepts unsigned `?businessId=` even when `WEBHOOK_SECRET` set; default secret empty (`src/lib/config.ts:23`). Spot-checked directly.
- WhatsApp webhook: GET-only token verification (`webhooks/whatsapp/route.ts:34`), POST has no signature, tenant from caller `businessId` (`:13-16,62`), unconditional new lead + reply (`:57-83`), no dedupe.
- Opt-out inconsistent: `text.ts:1-3` misses STOPALL/bare CANCEL; only caller `automation.ts:248-254`; `opted_out` column (`schema.sqlite.sql:82`) never used; no send-time suppression (`messaging.ts:91-106`, `whatsapp.ts:10-35`).
- Automations UI inert: `src/app/api/automations/route.ts:13-25` persists config; engine `automation.ts:18-134` never reads it and uses hardcoded templates/intervals (`:194-203`).
- Postgres schema drift: `email_outbox` in `schema.sqlite.sql:265-280` and runtime `db.ts:56-69`, absent from `db/schema.postgres.sql` (ends :263). Spot-checked via grep (no match).
- Weak defaults: `config.ts:4,18`, plaintext admin compare and unverified login at `src/app/api/auth/login/route.ts:20,28,41-49`; demo creds published at `src/components/authform.tsx:38`.
- Cron auth conditional on `CRON_SECRET` (`api/cron/tick/route.ts:13-21`), GET alias triggers work (`:32-34`), daily schedule `vercel.json:2-7`.
- `/api/demo/seed` unauthenticated when `DEMO_ENABLED` default true (`api/demo/seed/route.ts:4-7`, `config.ts:19`).
- Cross-tenant write via client `lead_id` NOT CONFIRMED: ownership rechecked at `appointments/route.ts:34-38`, though foreign id is retained in attacker's row.
- Billing mock confirmed from code + env names: manual UPI/admin verify (`api/billing/route.ts:37-56`, `api/admin/billing/verify/route.ts:7-32`), mock fallbacks (`:58-104`); production env names lack `UPI_ID`, `RAZORPAY_*`, `STRIPE_*`.
- No CI: `.github/` glob returned no files; no YAML workflows; no aggregate script (`package.json:9-16`).
- Test/docs drift: `docs/testing.md:5` 14 tests vs actual 25; `docs/ops.md:23` 20/20; `PRODUCTION.md:16,28,40,53,68,87` inconsistent counts/claims; `tests/tenant-isolation.mjs:68-72` expects foreign-lead booking 201; `tests/guard-verify.mjs:20-30` skips probe when route absent.
- Marketing overclaims: `src/app/page.tsx:59,103,126-129,244,272`; `src/app/faq/page.tsx:17`; `src/app/features/page.tsx:21`; `src/app/privacy/page.tsx:18`; sample testimonials labelled honestly at `page.tsx:218-225`.
- Production env **names only** (no values read): present = ADMIN_EMAIL, ADMIN_PASSWORD, AI_API_KEY, AI_BASE_URL, AI_MODEL, AI_PROVIDER, APP_URL, CRON_SECRET, DATABASE_URL, DEMO_ENABLED, EMAIL_FROM, EMAIL_PROVIDER, JWT_SECRET, RESEND_API_KEY; absent = WHATSAPP_*, UPI_ID, WEBHOOK_SECRET, NEXT_PUBLIC_SITE_URL, RAZORPAY_*, STRIPE_*.
- Vercel project READY production deployment `dpl_3xLrj4xeivxod1wtBkd1e3y8Cx4Q`, aliases `leadpilot-rick-e181.vercel.app` / `leadpilot-sepia-six.vercel.app`, SSO protection enabled.

## Claims pending verification

- None blocking. Residual unknowns: actual production secret values were intentionally not inspected; Vercel Git-linkage to the new GitHub repo not verified; production runtime behaviour not exercised (no production writes allowed).

## Test environment

- Local Windows shell: no node/npm/npx. Verification performed in Vercel Sandbox `sbx_bbd7ZrNwHaZdp6TRzxzWifGNEeO9` (Amazon Linux 2023, Node v24.22.3, npm 11.19.1), cloned commit `a0ff3ae`, no production calls.
- `npm ci --no-audit --no-fund` exit 0; `npm run typecheck` exit 0; `npm test` exit 0 (6 files / 25 tests); `npm run build` exit 0 (58 static pages); local `npm run start` HTTP 200.
- Chromium host libs installed with `dnf install ...` (sudo) after `apt-get` failed; `QA_BASE=http://localhost:3100 npm run qa:mobile` exit 0, 10 PASS.
- Standalone `.mjs` check scripts not executed because several default to production or mutate data.

## Deliverable

- `docs/LEADPILOT_AUDIT.md` — 11 required sections verified by heading scan; no secret values, no fabricated results.
