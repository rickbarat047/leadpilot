# LeadPilot — Operations Runbook

Last updated: 2026-11-06 · Owner: project owner + maintainer

## Architecture

| Piece | Where | Notes |
|---|---|---|
| App | Vercel — https://leadpilot-sepia-six.vercel.app | Next.js 14, project `rick-e181/leadpilot` |
| Database | Neon (Postgres) | `DATABASE_URL` in Vercel env; local dev uses SQLite `data/leadpilot.db` |
| Email | Resend (optional) | Without `RESEND_API_KEY` every send is logged as `email (mock)` |
| Payments | Razorpay (P2, pending keys) | UPI Autopay; webhook `/api/webhooks/razorpay` |
| Scheduler | cron-job.org → `GET /api/cron/tick` every 5 min | Vercel fallback cron: daily `0 2 * * *` |

## Day-2 commands (run from `leadpilot/`)

```powershell
# Pull current production env (never commit .env)
vercel env pull .env --environment production --yes

# Typecheck / tests / build — run before EVERY deploy
npx tsc --noEmit
npx vitest run                # expect 20/20
npm run build

# Local E2E (server must be running on :3100)
node ./tests/guard-verify.mjs
node ./tests/mobile-qa.mjs
node ./tests/email-flow.mjs
node ./tests/tenant-isolation.mjs   # LOCAL ONLY — never set QA_BASE for this one

# Deploy + production smoke
vercel --prod --yes
node ./db/prod-check.mjs
$env:QA_BASE='https://leadpilot-sepia-six.vercel.app'; node ./tests/mobile-qa.mjs
```

> The Vercel CLI may exit non-zero even on success — check the output for
> deployment status `Ready` / `Aliased`, not the exit code.

## Health & monitoring

- `GET /api/health` — db, ai/email/stripe mode, `emailOutbox` queue depth, and
  `cron` heartbeat staleness (`ok (Nm ago)` vs `STALE (Nm ago)`, warn >15 min).
  Bookmark it; it is the first thing to check in an incident.
- `/admin` overview — pending/failed email counts, tenant list.
- `system_logs` — `scope='cron'` heartbeat rows, `scope='api'`/error rows,
  automation failures. Client-side errors: `POST /api/logs` (rate-limited).
- Server logs (Vercel dashboard → Deployments → Functions) — structured one-line
  `[api-error] {...}` JSON for every unhandled route exception.

## Database backup & restore (Neon)

### What protects the data today

- Neon ships **continuous backups with PITR** (point-in-time recovery) on paid
  plans; the free tier keeps **daily backups retained ~7 days** (verify yours in
  the Neon console → *Monitoring → Backups*; this is the #1 thing to confirm
  manually, see "User actions" below).
- Vercel env vars hold the connection string — rotating the Neon password means
  updating `DATABASE_URL` in Vercel and redeploying.

### Verify backups (monthly, 2 minutes)

1. Neon console → your project → **Backups**: confirm the latest backup is
   recent (≤24 h) and PITR is enabled if you pay for it.
2. `GET /api/health` shows `db: ok (postgres)`.

### Restore procedure (disaster recovery)

**Option A — PITR (preferred, near-zero data loss):**
1. Neon console → project → **Restore** → choose a timestamp *before* the
   incident (use UTC; when in doubt pick 5 minutes earlier).
2. Neon creates a **new endpoint** with the restored data. Copy its
   `postgresql://…` connection string.
3. Update Vercel: `vercel env rm DATABASE_URL production` →
   `vercel env add DATABASE_URL production` (paste the new URL) — or
   `node ./db/vercel-env.mjs DATABASE_URL=<new url>` if that helper is present.
4. Redeploy (`vercel --prod --yes`) so the app picks up the new env, then run
   `node ./db/prod-check.mjs`.
5. Update this runbook with the restore timestamp.

**Option B — branch (fast, no downtime):**
1. Neon console → **Branch → Create from a restore point** → pick the timestamp.
2. Point `DATABASE_URL` at the new branch (same steps 3–4 as above).
3. Validate, then rename/swap endpoints at leisure — the old branch stays as a
   safety net until you delete it.

**Option C — schema-only rebuild (last resort):** `db/schema.postgres.sql` is
regenerated from the live DB and committed; apply it to a fresh Neon database,
then re-import a CSV/JSON export (see data export below).

### After any restore

- Run `node ./db/prod-check.mjs` + `tests/email-flow.mjs` (prod mode).
- Check `/api/health` → `emailOutbox` and `cron` are sane.
- Re-point cron-job.org only if the domain changed (it normally doesn't).

## Data export (tenant self-serve)

`GET /api/business/export` (authenticated, owner session) returns the calling
business's full data as JSON — profile, services, leads, conversations,
messages, appointments, knowledge, automations + runs, subscriptions, invoices,
and the email outbox. Use it for backups, GDPR/DPDP subject requests, and as the
input for a manual restore into a clean database.

## User actions (blocked on the owner)

1. **Confirm Neon backup tier / enable PITR** (console → Backups) — see above.
2. Razorpay keys + plan IDs (P2).
3. `RESEND_API_KEY` for live email (P1 is mock until then).
4. `CRON_SECRET` + cron-job.org URL update (P3 — follow the safe order in
   `PRODUCTION.md`; setting the secret first would 401 the live job).
5. Rotate `ADMIN_PASSWORD`, revoke the deploy token when deploys move to CI,
   and add a custom domain (P3/P6).
