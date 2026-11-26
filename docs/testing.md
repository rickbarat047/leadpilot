# Testing — LeadPilot

## Suites

### 1. Unit tests — `npx vitest run` (14 tests)
- `tests/dialect.test.ts` — Postgres/SQLite SQL dialect helpers, including the
  `sinceDays` regression (`created_at >= created_at >= …` → pg 42601)
- `tests/billing.test.ts` — plan limits, trial logic, STOP/opt-out detection
- `tests/ai.test.ts` — provider abstraction + mock provider behavior
- `tests/razorpay.test.ts` — signature verification + plan mapping

### 2. Mobile QA — `node ./tests/mobile-qa.mjs` (10 checks, Playwright)
390×844 viewport against local (`QA_BASE=http://localhost:3100`) or production
(`$env:QA_BASE='https://leadpilot-sepia-six.vercel.app'`):
zero horizontal overflow on home/pricing/login/app/leads/automations/conversations/
onboarding, hamburger menu opens + navigates. Exits non-zero on any failure.

### 3. Overflow finder — `node ./tests/find-overflow.mjs /app/leads`
Debug helper: lists elements wider than the viewport.

### 4. Prod smoke — `node ./db/prod-check.mjs`
Health (`db ok`), public pages, demo login → authed pages, admin login.

## Mock modes (run fully without external keys)
- **AI**: no `AI_API_KEY` → MockProvider (classified replies, never invents prices)
- **Email**: no `RESEND_API_KEY` → sends logged to `automation_runs` (`email (mock)`)
- **Billing**: no Razorpay keys → checkout returns `{ mock: true, upi: true }`
- **DB**: no `DATABASE_URL` → local SQLite file

## Release gate
```powershell
npx tsc --noEmit
npx vitest run
npm run build
node ./tests/mobile-qa.mjs
$env:QA_BASE='https://leadpilot-sepia-six.vercel.app'; node ./tests/mobile-qa.mjs
node ./db/prod-check.mjs
```

## Fixed history (regression-tested)
- pg predicate duplication in `analytics.ts` (dialect test guards it)
- Mobile grid blowout (`.shell > * { min-width: 0 }`), table scroll containers,
  search input flex shrink, dashboard email hidden ≤640px, full-width hero CTAs
