# LeadPilot — Concierge Pilot Playbook (P6 step 5)

Run 2–3 real service businesses through LeadPilot by hand, collect their actual
recovered-lead numbers, then replace the labeled sample figures with real ones.

## Pilot selection (pick businesses where the pain is obvious)
- Missed calls / slow replies are costing them bookings (salon, clinic, gym, home services, photographer, tutor).
- Owner is reachable weekly and willing to share numbers.
- Has a website form or is willing to forward missed-call events.

## Onboarding a pilot (≈30 min, done by you)
1. Create their account (signup) → log in as them → run onboarding (business, services, hours, follow-up + review prefs).
2. **Set their AI key**: `AI_API_KEY` + `AI_PROVIDER` (openai/anthropic) in their tenant? Currently keys are global env. For pilots, set global keys (one OpenAI key covers all tenants). Or run a separate Vercel project per pilot if isolation needed.
3. **Set `RESEND_API_KEY`** (global) so their follow-up emails actually send. Use a verified sending domain; set `EMAIL_FROM` to their brand.
4. **Set `UPI_ID`** to your collection UPI so they can pay manually after trial.
5. **Wire lead capture**: either embed the chat widget / form on their site, or forward their contact-form submissions to `POST /api/webhooks/lead?businessId=<their biz id>` (HMAC-signed with `WEBHOOK_SECRET` in production).
6. **Optional WhatsApp**: set `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_VERIFY_TOKEN`, point Meta webhook at `/api/webhooks/whatsapp`, store the phone_number_id in their business settings (`whatsappPhoneNumberId`).
7. Seed 3–5 of their real recent leads manually (or import) so the AI has context; mark the rest as they come in.

## What to measure (weekly, 15 min)
- Leads captured (count, source).
- Median first-response time (target < 2 min).
- Follow-ups sent vs. replies received (chase templates 1/2/3).
- Appointments booked from recovered leads.
- Reviews requested vs. posted.
- Owner time saved (ask them; qualitative).

## Success criteria (before charging)
- ≥1 recovered booking attributed to LeadPilot follow-up.
- Owner says "I'd pay for this" unprompted.
- No cross-tenant data leak (verified by tenant-isolation test).
- No missed follow-up (heartbeat + outbox depth stay green).

## After a successful pilot
- Replace the labeled sample figures on the landing page (`src/app/page.tsx` ROI calculator defaults + testimonials) with the pilot's real numbers (with permission).
- Switch their tenant to a paid plan via admin verify (manual UPI).
- Ask for a written testimonial + logo.
- Repeat with 2 more businesses, then charge publicly.

## Failure modes to watch
- AI replies that hallucinate prices → check the price-stripping guardrail fired; review `automation_runs` for low-confidence escalations.
- Follow-ups landing in spam → verify Resend domain + SPF/DKIM.
- Owner ignores the dashboard → the value is invisible; send a weekly digest email (not yet built — candidate next feature).
- Cron dies → `/api/health` shows `STALE`; re-point cron-job.org.
