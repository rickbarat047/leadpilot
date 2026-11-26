# LeadPilot — Production Readiness Roadmap

Status legend: ✅ done · 🔄 in progress · ⛔ blocked on user input · ⬜ not started

Last updated: 2026-11-06

---

## P0 — Project recovery ✅
*Root config files were lost from disk (2026-11-05). Reconstructed and verified.*

- [x] `package.json`, `tsconfig.json`, `next.config.js`, `vercel.json` (daily cron), `.gitignore`
- [x] `.env` restored from Vercel (`vercel env pull`); production copy kept as `.env.neon`
- [x] `.env.example` fully documented
- [x] `db/` schema regenerated from live Neon (via temporary admin dump route, removed after use)
- [x] Verified: `tsc --noEmit` clean · vitest 14/14 · `next build` 49 routes · mobile QA 10/10 (local) · prod smoke 12/12 (`db/prod-check.mjs`)

## P1 — Real message delivery ✅
*Follow-ups/reminders/reviews were written to the conversation + logs but never actually emailed — now every send goes through an outbox with retries.*

- [x] Email wired into follow-ups, booking reminders, review requests (`queueEmail` in `src/lib/messaging.ts`)
- [x] Owner notifications: new lead, new booking, low-confidence escalation (`notifyOwner`)
- [x] Per-business email toggles in Settings (5 gates, default ON) + STOP opt-out line in every outbound email
- [x] Failed sends recorded (`email_outbox.last_error`, `automation_runs.error`) and retried on next tick, max 3 attempts — no silent drops
- [x] Resend goes live automatically when `RESEND_API_KEY` is set; without it, every send logs as `email (mock)` (current state)
- [x] SMS is a logged stub (no fake send buttons) until a provider is configured
- [x] E2E test: `tests/email-flow.mjs` 6/6 (mock mode) · unit `tests/email.test.ts` 6/6 · `/api/health` reports `emailOutbox` queue depth
- [x] Verified: tsc clean · vitest 20/20 · build OK · local email-flow 6/6 + mobile QA 10/10 · deployed · prod smoke 12/12 + prod mobile QA 10/10

*Note (2026-11-06): a bulk file restore reverted all P1 source files mid-session; everything was re-applied and the whole workspace is now committed to git (`ccb7b52`) so this can't be silently lost again.*

## P2 — Payments (manual UPI for pilots; gateway deferred) 🔄
*Decision: no payment gateway for now — billing runs on manual UPI verification (owner pays via any UPI app, admin marks paid). Razorpay/Stripe code paths are retained for later automation but are not required to go live.*

- [x] Manual UPI flow: `UPI_ID`/`UPI_NAME` env → checkout creates a `pending_verification` invoice + UPI instructions + owner alert; `/admin` lists pending invoices with **Mark paid** → activates subscription. Falls back to mock activation when `UPI_ID` is unset (dev/demo).
- [x] `invoices` table gained a `plan` column (migration in `db.ts` + schema files) so verification activates the right plan.
- [ ] **User action (deferred):** set `UPI_ID` (+ optional `UPI_NAME`) to enable manual UPI billing. Until set, checkout uses mock activation (instant) — fine for pilots/demo.
- [ ] Razorpay/Stripe remain optional — wire up later if/when automated recurring charges are needed (keys + plan IDs + webhook verification already scaffolded).

*Verified: tsc clean · vitest 25/25 · build OK.*

## P3 — Security hardening 🔄
- [x] **User action done:** `CRON_SECRET` set + cron-job.org URL updated with `?secret=` — verified: with secret → 200, without → 401, heartbeat still `ok`.
- [x] Security headers on every response: `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS, `Permissions-Policy`, strict `Content-Security-Policy` (`frame-ancestors 'none'`, no external assets) — verified live in prod, hydration passes under CSP
- [x] Rate limits: signup (10/min, pre-existing) + lead webhook (60/min, new) + login (20/min) + cron tick (10/min when no secret)
- [x] **User action done:** `ADMIN_PASSWORD` rotated (new password shared with owner out-of-band). Old password `LeadPilot-Admin-7913` is invalid.
- [ ] **User action (optional):** revoke the Vercel deploy token once deploys move to CI/Git (Vercel dashboard → Settings → Tokens).
- [x] Destructive actions use confirm dialogs (knowledge delete — the app's only DELETE endpoint — now confirms by title and reports failures)

## P4 — Observability & reliability ✅
- [x] Cron heartbeat: `/api/cron/tick` writes a `system_logs` row (`scope='cron'`); `/api/health` reports staleness — `ok (Nm ago)` vs `STALE (Nm ago)` (>15 min) — verified dynamic locally (`ok (5m ago)` from the live external cron-job.org job); first prod heartbeat appears on the next tick after deploy
- [x] Global `error.tsx` + `not-found.tsx` log to `system_logs` (no blank white pages) — 404s render and log; `log404.tsx` shows the friendly page
- [x] API route wrapper: `guard()` in `src/lib/api.ts` wraps all 35 handlers in 24 route files (codemod `db/codemod-guard.mjs`) — unexpected throws become a structured one-line `[api-error]` JSON log + friendly JSON 500; verified with a throw probe (`tests/guard-verify.mjs` 4/4) then the probe route was deleted
- [x] Email retry queue depth visible in admin overview (`emailPending`/`emailFailed`)
- [x] `/api/logs` endpoint (rate-limited 20/min) for client-side error reporting
- [x] `src/instrumentation.ts` present but console-only — Next 14.2 has **no** `onRequestError` hook (Next 15+), so route-level `guard()` is the error boundary instead; documented here honestly rather than leaving dead code that looks like it reports

*Verified: tsc clean · vitest 20/20 · build OK (prerender manifest intact) · local mobile QA 10/10 · local email-flow 7/7 · guard-verify 4/4 · deployed · prod smoke 12/12 · prod mobile QA 10/10.*

## P5 — Data safety ✅
- [x] `docs/ops.md`: Neon backup/restore runbook (PITR, branch, schema-only), health/monitoring guide, day-2 commands
- [x] **Backup decision (free tier):** staying on Neon free tier — daily snapshots (~7 days). PITR deferred (paid). Off-site protection via weekly `/api/business/export` per tenant + the existing data-export endpoint. Documented in `docs/ops.md`.
- [x] Data-export endpoint: `GET /api/business/export` — full tenant JSON (profile, services, leads, conversations, messages, appointments, knowledge, automations, runs, subscriptions, invoices, outbox) with `Content-Disposition: attachment`; every query scoped by `business_id`
- [x] `ensureDemoBusiness` isolation audit → **found and fixed 2 real cross-tenant bugs:**
  - `POST /api/appointments` accepted any `lead_id` → could flip another tenant's lead status, inject a message into their conversation, and email their contact. Now lead is ownership-checked first (all follow-up queries scoped).
  - `ensureConversation` looked up conversations by `lead_id` only and never validated the lead's owner → could link to a foreign conversation or attach a conversation to a foreign lead. Now validates + scopes; `PUT /api/conversations` returns 404 for foreign leads.
  - Also fixed: `PUT` conversation-create handler was misrouted under `/api/conversations/[id]/messages` (405 at its documented path) — moved to `/api/conversations`.
- [x] Regression test `tests/tenant-isolation.mjs` **16/16**: cross-tenant booking, conversation read/write, lead PATCH, and export scoping all verified (local-only; creates a throwaway tenant and cleans it from sqlite)

*Verified: tsc clean · vitest 25/25 (incl. 5 new `guard()` unit tests) · build OK · local mobile QA 10/10 · email-flow 7/7 · guard-verify pass · tenant-isolation 16/16.*

## P6 — Launch readiness 🔄
- [x] SEO basics: `src/app/robots.ts` (allows marketing, disallows `/app` `/admin` `/api` `/login` `/signup` `/onboarding`, points at sitemap), `src/app/sitemap.ts` (10 marketing pages, absolute URLs), `metadataBase` + title template + OpenGraph/Twitter + **per-page titles & canonicals** (client pages `contact`/`demo` get metadata via segment `layout.tsx`; `/app` + `/admin` are `noindex`) — verified 32/32 by `tests/seo-check.mjs` locally **and in prod**
- [x] `DEMO_ENABLED` decision: **keep on** in production (self-serve trial path — `/demo` seeds a clearly-labeled sample tenant, isolated per P5)
- [ ] **User action (deferred):** custom domain → set `NEXT_PUBLIC_SITE_URL` (robots/sitemap/canonicals pick it up with no code change; HTTPS is Vercel default). Until then, canonicals point at the Vercel URL.
- [ ] Real testimonials/ROI replacing labeled samples after first pilots (business work)
- [ ] 2–3 concierge pilots → proof → then charge (business work, see below)

*Verified: tsc clean · vitest 25/25 · build OK · local seo 32/32 + mobile 10/10 + email-flow 7/7 + tenant-isolation 16/16 + export 8/8 · deployed · prod seo 32/32 + prod smoke 12/12 + prod mobile 10/10 + prod export 8/8.*

---

## P7 — Actually solving the purpose (in progress)

*Beyond the original roadmap: making the product deliver its headline promise (instant AI reply + automated follow-up → booked appointment) for real businesses.*

- [x] **Step 1 (prep)**: AI provider abstraction supports OpenAI-compatible (OpenAI/Azure/Ollama) via `AI_PROVIDER`/`AI_API_KEY`/`AI_MODEL`/`AI_BASE_URL`; email via `RESEND_API_KEY`. **User action:** set those env vars + run a real lead through the loop. Verification script: `tests/ai-live-check.mjs` (to be added) — for now, create a lead via the chat widget and watch the conversation + inbox.
- [x] **Step 2**: Real availability — `src/lib/slots.ts` derives free slots from configured business hours + existing appointments; `GET /api/appointments/slots`; AI booking offers now list 3 real slots instead of "3 slots (mock)".
- [x] **Step 3**: WhatsApp channel — `src/lib/whatsapp.ts` (Meta Cloud API, mock when unset), inbound webhook `/api/webhooks/whatsapp` (verify + lead creation + instant reply + WhatsApp mirror), WhatsApp twins in `instantReply` and follow-ups. **User action:** set `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_VERIFY_TOKEN`, point Meta webhook.
- [x] **Step 4**: Email verification + password reset — `verify_token`/`reset_token` columns, `/api/auth/verify`, `/api/auth/forgot`, `/api/auth/reset`, `/forgot`, `/reset` pages, "verify your email" banner in app shell, signup sends verification email.
- [x] **Step 5**: Concierge pilot playbook — `docs/pilots.md`.

*Verified: tsc clean · build OK · vitest 25/25 · mobile 10/10 · email-flow 7/7 · tenant-isolation 16/16 · seo 32/32 · export 8/8 · guard 2/2 · billing 4/4 (mock) + 10/10 (UPI pending, earlier).*
```
npx tsc --noEmit
npx vitest run
npm run build
node ./tests/mobile-qa.mjs            # local
node ./tests/email-flow.mjs           # local
node ./tests/tenant-isolation.mjs     # local ONLY (creates + cleans a throwaway tenant)
node ./tests/billing-check.mjs        # local ONLY (mutates demo subscription; needs UPI_ID for full path)
node ./tests/ai-live-check.mjs        # local/prod: reports mock vs live; full loop check when keys set
node ./tests/seo-check.mjs            # robots/sitemap/canonicals (local; QA_BASE for prod)
$env:QA_BASE='https://leadpilot-sepia-six.vercel.app'; node ./tests/mobile-qa.mjs
node ./db/prod-check.mjs              # prod smoke (health + login + key pages)
# with a local server running on :3100 — asserts friendly JSON 500 on a throw probe:
node ./tests/guard-verify.mjs
```

## Known external dependencies (user actions)
1. `RESEND_API_KEY` — live email ✅ (set; domain verification pending for real recipients)
2. `CRON_SECRET` + cron-job.org URL update ✅ (done this session)
3. Neon backups — free tier daily snapshots ✅ (documented; PITR optional/paid)
4. `ADMIN_PASSWORD` rotated ✅ (done this session)
5. (Pending) Revoke Vercel deploy token once deploys move to CI/Git (dashboard → Settings → Tokens)
6. (Optional) `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_VERIFY_TOKEN`
7. (Deferred) `UPI_ID` — manual UPI billing
8. (Deferred) Custom domain + `NEXT_PUBLIC_SITE_URL`
9. (Business) 2–3 concierge pilots (`docs/pilots.md`)
