# Deployment — LeadPilot

Production: **https://leadpilot-sepia-six.vercel.app** (Vercel Hobby, project `rick-e181/leadpilot`)
Database: **Neon Postgres** (attached as `DATABASE_URL`; the app picks Postgres vs SQLite automatically from the URL shape).

## Stack decisions
- Next.js 14 App Router + TypeScript, custom CSS design system (no UI framework)
- SQLite (`file:./data/leadpilot.db`) for local dev — zero config
- Postgres (Neon) for production — schema in `db/schema.postgres.sql`
- Built-in auth: bcryptjs password hashes + jose JWT session cookie (`lp_session`)
- Providers behind abstractions: AI (`src/lib/ai.ts`), email/SMS (`src/lib/messaging.ts`), billing (`src/lib/billing.ts`, `src/lib/razorpay.ts`)

## Environment variables
All documented in `.env.example`. Set them in Vercel → Settings → Environment Variables
(or via `db/vercel-env.mjs`, see below).

| Var | Notes |
|---|---|
| `DATABASE_URL` | Neon connection string (auto-selects Postgres) |
| `JWT_SECRET` | 32+ random chars |
| `APP_URL` | `https://leadpilot-sepia-six.vercel.app` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin panel login |
| `DEMO_ENABLED` | `true` keeps `demo@leadpilot.local / demo1234` working |
| `CRON_SECRET` | If set, `/api/cron/tick` requires `Authorization: Bearer <secret>` |
| `RAZORPAY_*` | Key ID/Secret, webhook secret, plan IDs — see Billing |
| `RESEND_API_KEY` | Enables real email delivery (without it, emails log as mock) |
| `AI_*` | Optional OpenAI-compatible provider (mock works with no key) |

### Managing env vars from the CLI
```powershell
$env:VERCEL_TOKEN='…'
node ./db/vercel-env.mjs                 # list (values redacted)
node ./db/vercel-env.mjs KEY=value …      # upsert → then redeploy
vercel.cmd env pull .env --environment production --yes   # restore local .env
```

## Deploying
```powershell
$env:VERCEL_TOKEN='…'
vercel.cmd --prod --yes
```
`.vercel/project.json` is already linked. Aliased URL stays `leadpilot-sepia-six.vercel.app`.

## Cron / automation tick
- Vercel cron (`vercel.json`): daily `0 2 * * *` → `POST /api/cron/tick` (Hobby plan fallback)
- External cron-job.org job (created manually): every 5 min → same URL
- The tick is idempotent (one-shot state transitions, `NOT EXISTS` guards) — safe to call often
- If `CRON_SECRET` is set, append `?secret=<value>` to the cron-job.org URL

## Migrations
- SQLite: `src/lib/db.ts` executes `db/schema.sqlite.sql` automatically on startup
- Postgres: `node ./db/migrate-pg.mjs` (reads `DATABASE_URL` from `.env.neon`; run from a
  network where port 5432 is reachable — Vercel-side, or adjust). Multi-statement,
  `IF NOT EXISTS` — safe to re-run.
- `db/gen-schema.mjs` regenerates both schema files from `db/schema-dump.json`
  (captured from the live DB; see `db/capture-schema.mjs` + the temp route history in git-less ops notes)

## Billing (Razorpay UPI Autopay)
1. Create 3 subscription plans in Razorpay (Starter ₹2,999 / Growth ₹5,999 / Pro ₹11,999)
2. `node ./db/vercel-env.mjs RAZORPAY_KEY_ID=… RAZORPAY_KEY_SECRET=… RAZORPAY_WEBHOOK_SECRET=… RAZORPAY_PLAN_STARTER=… RAZORPAY_PLAN_GROWTH=… RAZORPAY_PLAN_PRO=…`
3. Webhook URL: `https://leadpilot-sepia-six.vercel.app/api/webhooks/razorpay` (events: `subscription.activated`, `payment.*`)
4. Redeploy. Without keys, checkout runs in mock mode (`"mock": true`).

Stripe remains available as an alternative (`BILLING_PROVIDER=stripe` + `STRIPE_*`).

## Incident: 2026-11-05 file loss
Root config files (`package.json`, `tsconfig`, `db/`, docs) were deleted from the working
copy by an external process. Everything was reconstructed: configs rewritten, `.env`
restored via `vercel env pull`, and `db/*.sql` regenerated from the live Neon schema
via a temporary admin-only introspection route (deployed, captured, removed).
Verification after recovery: `tsc` clean, vitest 14/14, build 49 routes, mobile QA 10/10,
prod smoke green.
