# LeadPilot — Phase 0 Product & Code Audit

**Date:** 2026-11-26
**Scope:** Read-only audit of `https://github.com/rickbarat047/leadpilot` (local workspace `G:\Default Project\leadpilot`, commit `a0ff3ae`).
**Constraints honoured:** No application code was changed. No production API calls, cron triggers, test leads, emails, payments, seed runs or user changes were made. No secret value was printed or persisted; production environment inspection was limited to **variable names only** via Vercel MCP. All verification commands ran against a disposable Vercel Sandbox cloned from `main`.

---

## 1. Executive summary

LeadPilot is a **well-structured prototype with a functioning CRM shell**, but the core commercial promise — *a real lead sends a message, is qualified by AI, is booked into a real calendar, and is followed up until conversion* — is **not closed end to end**.

**Overall assessment: 5/10** (engineering foundation ~7/10, CRM feature shell ~6/10, core promise delivered to a real business ~2–3/10).

What genuinely works: authentication, multi-tenant CRM screens, lead/conversation/appointment persistence, a cron ticker, an email outbox with retries, Resend delivery when configured, Razorpay/Stripe webhook handlers, tenant-scoped reads, SEO/mobile basics, and a clean build with 25 passing unit tests.

What does **not** work as advertised:

- The "AI" classification is **regex delegation to the mock provider even when a live key is configured** (`src/lib/ai.ts:70-75`). Only reply phrasing calls an LLM, with a silent mock fallback (`:76-99`).
- AI replies are **stored in `messages` but not delivered back to the lead** on website/manual/API/webhook paths (`src/lib/automation.ts:161-163`; `src/app/api/conversations/[id]/messages/route.ts:73`); only the WhatsApp instant-reply path has an explicit outbound twin (`:169-173`).
- The bot can **offer real slots but never converts the lead's chosen time into an appointment** (`src/app/api/conversations/[id]/messages/route.ts:55-72`). Booking exists only as a manual dashboard/API POST (`src/app/api/appointments/route.ts:18-63`).
- **No overlap/double-booking check** exists in booking or in the DB schema (`src/app/api/appointments/route.ts:27-29`; `db/schema.sqlite.sql:245`).
- **RESCHEDULE / CANCEL are inert strings** in emails and knowledge base; no parser or status handler exists (`src/lib/automation.ts:248-255`, `src/lib/text.ts:1-3`).
- Business hours are stored as a plain-text summary, while the slot generator expects structured day arrays — **every onboarded business therefore gets zero slots** (`src/lib/validation.ts:29`, `src/app/onboarding/page.tsx:10,29,54`, `src/lib/slots.ts:56-60`).
- The lead webhook accepts an **unsigned `?businessId=` fallback even when `WEBHOOK_SECRET` is configured** (`src/app/api/webhooks/lead/route.ts:17-29`); the WhatsApp webhook has **no POST signature check** and creates a new lead per message (`src/app/api/webhooks/whatsapp/route.ts:13-16,57-83`).
- Opt-out is detected by one narrow regex in one path and is **never enforced at send time** (`src/lib/text.ts:1-3`, `src/lib/automation.ts:248-254`, `src/lib/messaging.ts:91-106`).
- The Automations UI persists settings that the engine **never reads** (`src/app/api/automations/route.ts:13-25` vs `src/lib/automation.ts:18-134`).
- Production environment lacks `WEBHOOK_SECRET`, `UPI_ID`, gateway credentials and WhatsApp tokens (names checked, values not read), so billing falls back to **mock activation** and WhatsApp is effectively offline.
- There is **no CI**, no aggregate verification script, and no E2E test covering the money path. `docs/PRODUCTION.md` and `docs/testing.md` materially overstate verification.

**Bottom line:** do not treat this as production-ready. The highest-value next work is to close the **inbound reply → qualification → auto-booking → reschedule/cancel** loop and make replies actually reach the lead.

---

## 2. Architecture

| Layer | Implementation | Evidence |
|---|---|---|
| Framework | Next.js 14.2.5 App Router, React 18, TypeScript, port 3100 | `package.json:9-16`; `npm run build` route table |
| Routes | 42 exported handlers across 29 route files; all wrapped by `guard()` | `src/lib/api.ts:34-55`; build output |
| Auth | bcrypt cost 10; HS256 JWT in `lp_session` httpOnly cookie (14 d role/business payload); `requireUser`/`requireBusiness` helpers; admin role checks | `src/lib/auth.ts:13-44`, `src/lib/api.ts:5-22` |
| Data | SQLite (file) or Postgres selected by URL prefix; generic prepared-statement helpers; 19 tables; inline PG migrations | `src/lib/db.ts:11-14,55-100,129-177`; `db/schema.*.sql` |
| AI | `AIProvider` interface, `MockProvider` (regex), `OpenAICompatibleProvider` (LLM draft only) | `src/lib/ai.ts:15-107`; `src/lib/config.ts:7-10` |
| Automation | `runAutomationTick()` — 5 phases: instant replies, follow-ups, reminders, reviews, outbox retry | `src/lib/automation.ts:18-134` |
| Messaging | Email outbox (max 3 attempts), Resend adapter, WhatsApp adapter, SMS log stub | `src/lib/messaging.ts:28,58-122,141-150`; `src/lib/whatsapp.ts:10-40` |
| Billing | Manual UPI invoice + admin verification; Razorpay/Stripe adapters and webhooks | `src/app/api/billing/route.ts:37-104`; `src/app/api/admin/billing/verify/route.ts:7-32` |
| Scheduling | `freeSlotsForBusiness()` generates 60-min slots from `hours_json` minus booked appointments | `src/lib/slots.ts:7-89`; `src/app/api/appointments/slots/route.ts:9-13` |
| Ops | `POST /api/cron/tick` (+ GET alias), `vercel.json` daily `0 2 * * *`, health, logs, rate limits | `src/app/api/cron/tick/route.ts:9-34`; `vercel.json:2-7` |
| Deployment | Vercel project `leadpilot` (team `team_3aTSImdsOt29n36JePqZTvQR`), READY production deployments, SSO protection enabled | Vercel MCP `get_project`, `list_aliases`, `list_deployments` |

Notably absent: `middleware.ts`, `.github/` workflows, any test-runner config beyond `package.json`, any E2E harness, any inbound email provider.

---

## 3. Implementation status

| Subsystem | Status | Evidence / note |
|---|---|---|
| Marketing site, FAQ, pricing, contact | Built, but claims exceed implementation | `src/app/page.tsx:59,103,126-129,244,272`; `src/app/contact/page.tsx:10-16` ("Demo form, no email sent") |
| Signup / login / verify / reset / logout | Implemented | `src/app/api/auth/*`; login does not check `email_verified` (`login/route.ts:41-49`) |
| Onboarding (14 steps) | Persists profile, services, settings, hours summary | `src/app/onboarding/page.tsx:24-37`; `src/app/api/business/route.ts:23-38` |
| Multi-tenant CRM pages | Implemented (leads, conversations, appointments, automations, analytics, reviews, billing, settings, integrations) | `src/app/app/**`; `requireBusiness` on all CRM APIs |
| AI qualification | **Mock/rule-based in all modes** | `src/lib/ai.ts:70-75` |
| AI first reply | LLM phrasing + silent mock fallback; stored, not delivered on web path | `src/lib/automation.ts:137-189`; `messages/route.ts:73` |
| Inbound channels | WhatsApp webhook (unauthenticated POST); no inbound email; `sender:'lead'` API requires owner session | `webhooks/whatsapp/route.ts:34-88`; `messages/route.ts:27-33` |
| Follow-ups | 3 hardcoded templates, 360/1440 min intervals, max 4 then "No Response" | `src/lib/automation.ts:191-223,42-67` |
| Slot disclosure | Real generator, but hours format mismatch yields no slots for onboarded businesses | `src/lib/slots.ts:56-60`; `validation.ts:29` |
| Booking | Manual POST only; no acceptance of offered slot; no overlap check | `src/app/api/appointments/route.ts:18-63` |
| Reminders | 24h/2h email rows, no owner/WhatsApp | `src/lib/automation.ts:69-93` |
| Reschedule / cancel / auto-complete / reviews delay | Not implemented | `src/lib/automation.ts:95-121,248-255` |
| Email delivery | Real Resend when key + non-mock provider; outbox with retries; no inbound listener | `src/lib/messaging.ts:58-122` |
| SMS | Log-only stub, never called | `src/lib/messaging.ts:141-150` |
| WhatsApp | Adapter exists; production keys absent; no inbound dedupe/signature | `src/lib/whatsapp.ts:10-40`; env keys names only |
| Calendar integrations | Hardcoded disconnected; no provider code | `src/app/app/integrations/page.tsx:11`; `src/lib/auth.ts:158-160` |
| Billing | Manual UPI flow coded; production keys absent → mock activation | `src/app/api/billing/route.ts:37-104`; Vercel env key names |
| Analytics | Recovered-revenue SQL real; response time hardcoded 42 s | `src/lib/analytics.ts:20-22,30` |
| Tests / CI | 25 unit tests, 10 mobile checks; no E2E, no CI | `package.json:9-16`; no `.github/` found |

---

## 4. Customer journey analysis

| Step | Promised | Actual | Evidence |
|---|---|---|---|
| 1. Capture | Website form, widget, import, webhook/API, missed-call event (`page.tsx:126`) | Widget/import/missed-call absent; contact form is a no-op; webhook needs a developer and has an unsafe demo auth path | `src/app/contact/page.tsx:10-16`; `webhooks/lead/route.ts:17-29`; no widget files found |
| 2. Instant reply | "<60 s" (`page.tsx:103,128`) | Reply generated and stored; **not sent** on web/API/webhook/owner paths; no SLA measurement; run log says `~10s (mock)` | `automation.ts:161-163,187`; `analytics.ts:30`; `messages/route.ts:73` |
| 3. Qualification | AI qualification (`page.tsx:127,175`) | Regex keyword scoring; fabricated value guesses; fixed 0.8 confidence for LLM drafts | `ai.ts:24-45,60-64,94` |
| 4. Conversation | Lead replies continue the thread | Inbound text only via owner-session API or WhatsApp; no inbound email; low-confidence inbound is logged but owner is not notified | `messages/route.ts:27-53`; `webhooks/whatsapp/route.ts:57-83` |
| 5. Booking | "Real availability… bookings" (`page.tsx:129,177`) | Slots *offered* but no parser for the lead's chosen time; no appointment INSERT in that route; UI "Owner reply sent" only writes a DB row | `messages/route.ts:55-73`; `app/app/conversations/page.tsx:38,84-85` |
| 6. Attendance | Reminders + reschedules handled | 24h/2h email reminders exist; RESCHEDULE/CANCEL are text only; no conflict checks; no auto-completion | `automation.ts:69-93,248-255`; `appointments/[id]/route.ts:5-15` |
| 7. Review | Review requests | Fires for completed leads but ignores configured `reviewDelayH` | `automation.ts:95-121`; `auth.ts:85` |
| 8. Billing | "UPI Autopay billing is live" (`page.tsx:59`) | Manual UPI invoice/admin verify coded; gateway/UPI keys absent in production → mock activation | `billing/route.ts:37-104`; Vercel env key names |
| 9. Retention | Recovered-revenue analytics | SQL is real but response metric is a hardcoded 42 s; testimonials/ROI explicitly labelled samples | `analytics.ts:20-22,30`; `page.tsx:218-225` |

**Net:** the loop is *one-way and mock-driven*. A real lead can be stored and scored, but cannot reliably receive a reply, confirm a booking from offered slots, reschedule, or trigger a verified payment.

---

## 5. Critical bugs and security issues

### 5.1 The ten suspected problems (evidence-based verdicts)

| # | Suspected problem | Verdict | Evidence |
|---|---|---|---|
| 1 | AI classification is rule-based even with a live key | **CONFIRMED** | `src/lib/ai.ts:70-75` explicitly delegates to `MockProvider`; `config.ts:7-10` selects live provider but classification still mock |
| 2 | AI reply stored but not delivered on the original channel | **CONFIRMED** (except WhatsApp text inbound, which has an explicit mirror but is a mock when unconfigured) | `automation.ts:161-163`; `messages/route.ts:73`; `webhooks/whatsapp/route.ts:75-79`; `whatsapp.ts:13-17` |
| 3 | Slots offered without booking | **CONFIRMED** | `messages/route.ts:55-72` only inserts a `messages` row; no appointment INSERT; `book_offer` step stored at `auth.ts:130` is never executed (`api/automations/route.ts:24`) |
| 4 | No reschedule/cancel handler | **CONFIRMED** | Strings only at `appointments/route.ts:41,48`, `automation.ts:83,87`, `auth.ts:150,152`; inbound handler only checks opt-out (`automation.ts:248-255`) |
| 5 | No double-booking protection | **CONFIRMED** | `appointments/route.ts:25-29` inserts unconditionally; `db/schema.sqlite.sql:245` index is non-unique; no UNIQUE/EXCLUDE constraint |
| 6 | Business-hours format mismatch empties the slot generator | **CONFIRMED** | `slots.ts:56-60` needs `Record<day,[HH:MM,HH:MM]>`; `validation.ts:29` accepts only `Record<string,string>`; onboarding stores `hours:{summary:'Mon–Sat 10:00–20:00'}` (`onboarding/page.tsx:10,29,54`) |
| 7 | Lead webhook unsafe unsigned fallback | **CONFIRMED** | `webhooks/lead/route.ts:17-29`: if signature header omitted, any existing `?businessId=` is accepted **even when a secret is configured**; default secret `''` at `config.ts:23` |
| 8 | WhatsApp webhook unauthenticated and creates duplicate leads | **CONFIRMED** | `webhooks/whatsapp/route.ts:34` verifies only GET; POST at `:57-83` has no signature, tenant from caller-supplied `businessId` (`:13-16,62`), unconditional `uid('lead')` + INSERT (`:68-70`) |
| 9 | Opt-out (STOP/CANCEL) inconsistent and not enforced on send | **CONFIRMED** | `text.ts:1-3` regex does not match STOPALL or bare CANCEL; only caller `automation.ts:248-254` sets lead Lost; `opted_out` column (`schema.sqlite.sql:82`) never read/written; `messaging.ts:91-106` and `whatsapp.ts:10-35` do not suppress sends |
| 10 | Automations UI/config is decorative | **CONFIRMED** | `api/automations/route.ts:13-25` persists `enabled`/`steps_json`; engine `automation.ts:18-134` never queries that table and uses hardcoded templates/intervals (`194-203`) |

### 5.2 Additional critical findings

| Severity | Finding | Evidence |
|---|---|---|
| **High** | Postgres schema drift: `email_outbox` exists in SQLite migrations and runtime PG migrations but **not in `db/schema.postgres.sql`** (ends at :263); `db/gen-schema.mjs:8-25,135-136` appends SQLite-syntax SQL to both outputs | `db.ts:56-69`; `schema.sqlite.sql:265-280`; `schema.postgres.sql:263` |
| **High** | Weak defaults: JWT secret, admin password and demo credentials are hardcoded; login does not check `email_verified`; admin password compared in plaintext | `config.ts:4,18`; `auth/login/route.ts:20,28,41-49`; `components/authform.tsx:38` |
| **High** | Cron is unauthenticated when `CRON_SECRET` is unset (only IP rate limit); `GET` alias also triggers work. Production *does* have `CRON_SECRET` (name confirmed) | `cron/tick/route.ts:13-21,32-34`; Vercel env key names |
| **Medium** | `/api/demo/seed` is unauthenticated when `DEMO_ENABLED` (default true) and returns tenant id + credentials | `demo/seed/route.ts:4-7`; `config.ts:19`; production has `DEMO_ENABLED` (name confirmed) |
| **Medium** | Cross-tenant write via client-supplied `lead_id` **NOT CONFIRMED**: ownership is rechecked (`appointments/route.ts:34-38`), though the foreign id is still retained in the attacker's row | `appointments/route.ts:27-29,34-38` |
| **Medium** | Tenant resolution picks the **first** membership; client `?businessId=` is honoured only for admins. Several writes lack a `business_id` predicate after a scoped lookup | `auth.ts:51-53`; `api.ts:17-20`; `appointments/[id]/route.ts:13-14` |
| **Medium** | Billing mock fallback: production env has no `UPI_ID`, `RAZORPAY_*` or `STRIPE_*` names, so checkout takes mock activation branches | `billing/route.ts:58-104`; Vercel env key names (values not read) |
| **Medium** | Webhook signature failures can be silently treated as mock (`{ok:true,mock:true}`) | `webhooks/stripe/route.ts:9-13`; `webhooks/razorpay/route.ts:18-22` |
| **Low** | Docs overstate verification: 14/14 vs 20/20 vs 25/25, "16/16 tenant isolation" while the script expects foreign-lead booking to return 201, "4/4 guard probe" while the script skips when the route is absent, claim of commit `ccb7b52` that does not exist | `docs/testing.md:5`; `docs/ops.md:23`; `PRODUCTION.md:16,28,40,53,68,87`; `tests/tenant-isolation.mjs:68-72`; `tests/guard-verify.mjs:20-30` |
| **Low** | Marketing claim drift: UPI Autopay live, widget/import/missed-call capture, WhatsApp "not in v1", Stripe subscriptions | `page.tsx:59,126,244,272`; `faq/page.tsx:17`; `features/page.tsx:21`; `privacy/page.tsx:18` |

---

## 6. Mock vs. real — capability map

| Capability | Real | Mock / inert | How to tell |
|---|---|---|---|
| Lead persistence, CRM CRUD, tenant-scoped reads | ✅ | — | Prepared statements, `requireBusiness` |
| Email delivery | ✅ when `EMAIL_PROVIDER != mock` and `RESEND_API_KEY` set | ❌ otherwise: logs only | `messaging.ts:58-87`; production has both names |
| SMS | — | ❌ log stub | `messaging.ts:141-150` |
| WhatsApp outbound | Adapter implemented | ❌ production token names absent → mock returns ok | `whatsapp.ts:13-32`; env key names |
| Lead classification | — | ❌ regex in every mode | `ai.ts:70-75` |
| Reply phrasing | ✅ LLM call when configured | ❌ silent mock fallback on any error | `ai.ts:76-99` |
| Follow-up content | — | ❌ 3 hardcoded templates | `automation.ts:194-199` |
| Slot generation | ✅ algorithm real | ⚠️ empty in practice due to hours format | `slots.ts:56-60` + `validation.ts:29` |
| Appointment creation | ✅ manual POST | ❌ no auto-booking from conversation | `appointments/route.ts:18-63`; `messages/route.ts:73` |
| Reminders | ✅ DB rows + emails | ⚠️ no owner/WhatsApp/12h rule | `automation.ts:69-93` |
| Reschedule/cancel | — | ❌ text only | §5.1 #4 |
| Billing | Manual UPI + admin verify coded | ❌ mock activation in production (keys absent) | `billing/route.ts:37-104`; env key names |
| Calendar integrations | — | ❌ hardcoded disconnected | `integrations/page.tsx:11` |
| Analytics | Revenue SQL real | ❌ response time hardcoded 42 s | `analytics.ts:20-22,30` |
| Contact form | — | ❌ no backend | `contact/page.tsx:10-16` |
| Tests/CI | 25 unit + 10 mobile checks | ❌ no E2E, no CI gate | §7 |

---

## 7. Test results (fresh, reproducible)

All commands were executed in a disposable Vercel Sandbox (`sbx_bbd7ZrNwHaZdp6TRzxzWifGNEeO9`, Amazon Linux 2023, Node v24.22.3, npm 11.19.1) cloned from `main` at `a0ff3ae`. Local Windows shell had no Node/npm on PATH, so local execution was not possible. **No command targeted production.**

| Command | Exit | Result |
|---|---|---|
| `npm ci --no-audit --no-fund` | 0 | 131 packages in 8 s. Warnings: `next@14.2.5` security advisory; `esbuild@0.21.5` install script not approved |
| `npm run typecheck` (`tsc --noEmit`) | 0 | No TypeScript errors |
| `npm test` (`vitest run`) | 0 | **6 files / 25 tests passed** — guard 5, email 6, dialect 4, ai 3, billing 4, razorpay 3. Duration 1.90 s. `guard.test.ts` emitted expected api-error logs on stderr |
| `npm run build` (`next build`) | 0 | Compiled successfully; 58 static pages; 42 API/dynamic handlers; instrumentationHook experiment enabled |
| `npm run start` + `curl http://localhost:3100/` | 0 | HTTP 200, ready in 423 ms |
| `npx playwright install chromium` | 0 | Browser downloaded but host libs missing |
| `dnf install -y nss nspr dbus-libs atk at-spi2-atk cups-libs libdrm libX11 libXcomposite libXdamage libXext libXfixes libXrandr mesa-libgbm libxcb libxkbcommon pango cairo alsa-lib` (sudo) | 0 | Missing Chromium dependencies resolved in sandbox |
| `QA_BASE=http://localhost:3100 npm run qa:mobile` | 0 | **10 PASS** — m-home-top, hamburger toggle + nav, pricing, login, app, leads, automations, conversations, onboarding; all `overflow=0px` |

**Failures:** none of the executed commands failed. `apt-get` was attempted first and failed with `command not found` (exit 127 from the chained probe); the sandbox is Amazon Linux, so `dnf` was used instead.

**Not executed (deliberately):** standalone `.mjs` check scripts. `tests/seo-check.mjs:6` defaults `ORIGIN` to the production URL, and `tests/email-flow.mjs`, `tests/billing-check.mjs`, `tests/tenant-isolation.mjs`, `tests/ai-live-check.mjs` can create leads/users/email/invoices against whatever `QA_BASE` points to. Running them here would risk production data changes. Their existence and behaviour were inspected statically.

**Coverage gaps (no E2E for):**
- inbound `sender:'lead'` message → AI reply actually delivered
- slot acceptance → appointment creation → confirmation
- double-booking / overlap rejection
- RESCHEDULE / CANCEL lifecycle and 12h rule
- STOP/opt-out suppression at send time
- webhook auth negative cases (missing/strong signature, forged businessId)
- reminder and review timing; WhatsApp inbound dedupe
- live LLM and live Resend delivery (the `ai-live-check.mjs` script exits 0 when the provider is mock, `:24-40`)

**CI enforcement:** **none**. No `.github/` directory, no YAML workflows, no lint script, no aggregate `verify` script. `typecheck`, `test`, `build` and `qa:mobile` are manual only. Single local commit `a0ff3ae`; only untracked `.planning/` files are outside the repo.

---

## 8. Production / deployment assessment

- Vercel project `leadpilot` exists (id `prj_l0h8ElW3W8BKnXpypDdWdjXc3klE`, team `team_3aTSImdsOt29n36JePqZTvQR`), latest production deployment `dpl_3xLrj4xeivxod1wtBkd1e3y8Cx4Q` is **READY**, with aliases `leadpilot-rick-e181.vercel.app` and `leadpilot-sepia-six.vercel.app`. SSO protection is enabled (`all_except_custom_domains`).
- `vercel.json:2-7` schedules the ticker daily at `02:00`; cron auth is only active when `CRON_SECRET` is present (it is present by name in production).
- Environment **variable names present** in production (values never read): `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_PROVIDER`, `APP_URL`, `CRON_SECRET`, `DATABASE_URL`, `DEMO_ENABLED`, `EMAIL_FROM`, `EMAIL_PROVIDER`, `JWT_SECRET`, `RESEND_API_KEY`.
- Environment **names absent**: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `UPI_ID`, `WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL`, `RAZORPAY_*`, `STRIPE_*`. Consequences: WhatsApp offline, webhook HMAC unavailable (unsigned fallback active), billing mock, no custom-site canonical URL in env.
- Several secrets are flagged by Vercel as readable secrets; rotation and least-privilege review is advised (names only, no values inspected).
- `DATABASE_URL` is present, but the Postgres schema file omits `email_outbox` while runtime migrations include it (§5.2) — fresh environment provisioning from the static SQL alone would break the outbox.
- The GitHub repo and Vercel project linkage was not verified during this audit; a push to GitHub should not be assumed to auto-deploy until the Git integration is confirmed in the dashboard.
- `docs/PRODUCTION.md` is stale (dated 2026-11-06): wrong commit, inconsistent test counts, stale handler count, claim that `ai-live-check.mjs` is "to be added" although the file exists, and contradictory email-live statements. It should not be used as a release gate.

**Production readiness verdict: NOT READY.** Blocking items are in §9 (P0).

---

## 9. Prioritized work list

### P0 — Blocking (core product promise)

1. **Close the conversation→booking loop.** Parse the lead's chosen/rephrased slot, create the appointment atomically with overlap check, send confirmation, and handle RESCHEDULE/CANCEL. (`messages/route.ts:55-73`, `appointments/route.ts:18-63`, `automation.ts:248-255`)
2. **Deliver AI replies to the lead on the channel they used.** Add email inbound/outbound delivery for web/API/webhook paths and owner replies; suppress sends for opt-outs at send time. (`automation.ts:161-163`, `messaging.ts:91-106`)
3. **Fix business-hours persistence so slots exist.** Store structured day ranges end-to-end (validation, onboarding, settings) and migrate existing `hours:{summary}` rows. (`validation.ts:29`, `slots.ts:56-60`, `onboarding/page.tsx:29`)
4. **Harden inbound auth.** Require HMAC when `WEBHOOK_SECRET` is set (remove unsigned fallback), verify WhatsApp POST signatures, dedupe leads by phone/wa_id, and stop trusting caller-supplied `businessId`. (`webhooks/lead/route.ts:17-29`, `webhooks/whatsapp/route.ts:34-88`)
5. **Prevent double bookings** with a transaction + DB uniqueness/exclusion constraint and re-check availability at booking time. (`appointments/route.ts:27-29`, `db/schema.sqlite.sql:245`)
6. **Add E2E tests for the full journey** (inbound message → delivered reply → slot → appointment → reschedule/cancel → STOP) and a CI job that runs typecheck, tests, build and mobile QA on every push.

### P1 — High value

7. **Real structured AI classification** (JSON/function calling with confidence and explicit escalation), removing mock delegation. (`ai.ts:70-75`)
8. **Real public capture channel**: embeddable form/widget with signed tenant resolution; remove the no-op contact form. (`contact/page.tsx:10-16`)
9. **Tenant/auth hardening**: remove weak default secrets, enforce email verification, avoid first-membership ambiguity, add `business_id` predicates, rotate Vercel secrets. (`config.ts:4,18`, `auth.ts:51-53`, `login/route.ts:41-49`)
10. **Sync Postgres schema** (`email_outbox`, generated file parity) and pin dependency/advisory updates (`next@14.2.5`). (`db/schema.postgres.sql:263`, `db.ts:56-69`)
11. **Honour configuration**: wire automation steps/toggles, `reviewDelayH`, assistant name/tone, and per-business WhatsApp number into the engine. (`api/automations/route.ts`, `automation.ts:95-121,194-203`)
12. **Align marketing/docs with reality** and add measured SLA/response-time metrics instead of hardcoded values. (`page.tsx:59,103,126-129`, `analytics.ts:30`, `PRODUCTION.md`)

### P2 — Growth / polish

13. Billing: enable real manual UPI (`UPI_ID`) or a gateway with verified webhooks; implement trial expiry via `trialActive()`. (`billing.ts:37-40`, `billing/route.ts:37-104`)
14. Calendar integration, SMS provider, inbound-email capture, missed-call/import channels — or remove their claims.
15. Run 2–3 concierge pilots with real leads, replace sample testimonials/ROI, measure recovered bookings and <60 s replies.
16. Custom domain + `NEXT_PUBLIC_SITE_URL`, Vercel Git linkage, deployment protection review, stale-doc cleanup.

---

## 10. Implementation sequence

1. **Write failing E2E tests first** for the P0 journey (inbound reply delivered, slot accepted → appointment, overlap rejected, RESCHEDULE/CANCEL, STOP suppression, webhook signature negative cases). Keep them pointed at `QA_BASE=http://localhost:3100` only.
2. **Fix hours storage** (structured schema + migration) so the slot generator returns real slots; add a unit test for the day-key format.
3. **Implement atomic booking** from a parsed slot choice with an overlap guard and DB constraint; add confirmation + owner alert; add E2E green.
4. **Implement RESCHEDULE/CANCEL** handlers with the same overlap guard and a 12-hour rule; add tests.
5. **Wire reply delivery** to the original channel and send-time opt-out suppression; add a test that asserts the outbound provider was called.
6. **Harden webhooks** (HMAC required, WhatsApp signature, dedupe, tenant from verified identity); add negative tests.
7. **Add CI** running `typecheck`, `test`, `build`, `qa:mobile`; make it a required status check. Only then begin P1 items.
8. **P1/P2 in dependency order**: structured AI → capture widget → auth/tenant hardening → schema sync → config wiring → billing → docs/pilots.

Each step should keep the existing 25 unit tests and 10 mobile checks green and add coverage before claiming completion.

---

## 11. Production-ready acceptance criteria

LeadPilot should be considered production-ready only when **all** of the following are demonstrably true:

1. A real lead can submit their details through a public, signed capture endpoint and receive an AI reply on the same channel within a measured 60 s SLA (evidence: E2E trace + metric, not a hardcoded number).
2. The lead's chosen time creates exactly one appointment with no overlap; double-booking attempts are rejected by both application and database constraints.
3. RESCHEDULE and CANCEL work end to end, respect the 12-hour rule, notify the owner, and are covered by E2E tests.
4. STOP/opt-out is parsed consistently, persisted, and enforced at every send point, with an E2E test.
5. Classification uses structured LLM output with confidence and escalation; a live-key run is verified (not skipped when the provider is mock).
6. Webhooks require valid signatures, resolve tenant from verified identity, and dedupe leads; negative tests exist for forged/missing signatures.
7. Business hours are structured end to end; a newly onboarded business sees real slots immediately.
8. Production has required env names (`WEBHOOK_SECRET`, `UPI_ID` or gateway keys, WhatsApp tokens if advertised, `NEXT_PUBLIC_SITE_URL`), secrets rotated, and `email_outbox` present in the Postgres schema.
9. CI runs typecheck + 25+ unit tests + build + mobile QA on every push; checks are required; no undocumented manual-only gate.
10. `docs/PRODUCTION.md`, `docs/testing.md`, `docs/ops.md` and marketing pages match observed behaviour; no fabricated test counts, commits, SLA numbers, testimonials or "live" claims.
11. At least one real pilot produces verified recovered bookings and response-time data; analytics no longer hardcode response metrics.
12. A final read-only audit re-run in a clean sandbox reproduces every command in §7 with exit 0 and no production writes.

---

## Terminal report

**Phase 0 status: COMPLETE (read-only).** Evidence gathered from source, routes, DB, auth, tests and docs; fresh verification in a disposable sandbox produced typecheck 0, 25/25 unit tests, build 0, HTTP 200 and 10/10 mobile checks. The ten suspected problems are confirmed with the caveats recorded above; the core journey is a one-way mock loop.

**Recommended first implementation task:** close the highest-value break in the money path — **implement inbound-slot acceptance → atomic, overlap-safe appointment creation with confirmation, plus RESCHEDULE/CANCEL handling**, with E2E tests written first. This is P0 item 1 and the single change that moves LeadPilot from "prototype" to "does its job."

No Phase 1 implementation has been started; findings are presented here for review and approval.
