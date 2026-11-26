# Task Plan: LeadPilot Phase 0 Complete Product Audit

Use this file as the durable roadmap for the task. Create it before complex work and keep it current as phases change.

## Goal

Produce `docs/LEADPILOT_AUDIT.md`: an evidence-based, read-only audit of LeadPilot that establishes exactly what works, what is mocked, and what is missing across the full customer journey, with no implementation changes.

## Next Step

Present the audit findings and recommended first implementation task to the user; wait for explicit approval before starting any Phase 1 implementation.

## Current Phase

Phase 5

## Phases

### Phase 1: Requirements & Discovery

- [x] Understand user intent: full read-only audit, no implementation
- [x] Identify constraints: no production data changes, no secret values printed, no code rewrites
- [x] Document findings in findings.md
- **Status:** complete

### Phase 2: Evidence Gathering

- [x] Inspect all routes, APIs, auth, DB, tenant isolation
- [x] Inspect AI, conversation, automation, inbound channels, opt-out
- [x] Inspect appointments, slots, booking, reminders, reschedule/cancel
- [x] Inspect integrations (email/SMS/WhatsApp/webhooks), billing, onboarding
- [x] Inspect tests, CI, docs, deployment config, marketing claims
- [x] Trace all 10 suspected problems with concrete file/line evidence
- **Status:** complete

### Phase 3: Verification

- [x] Locate Node/npm toolchain; install dependencies from lockfile (Vercel Sandbox)
- [x] Run TypeScript check, unit tests, production build, mobile QA
- [x] Record exact commands, exit codes and output; never invent results
- [x] Identify missing E2E tests and CI enforcement gaps
- **Status:** complete

### Phase 4: Report Writing

- [x] Write all 11 required sections of docs/LEADPILOT_AUDIT.md
- [x] Classify issues by severity and business impact with evidence
- [x] Define P0/P1/P2 list and production-ready acceptance criteria
- **Status:** complete

### Phase 5: Delivery

- [x] Re-read report against user requirements line by line (11 sections verified)
- [x] Verify no secrets or fabricated results in report
- [x] Give concise terminal summary and recommended first implementation task
- **Status:** complete

## Key Questions

1. Can the toolchain run locally, or must verification be reported as unavailable?
   - Not locally (no Node/npm on Windows PATH). Verification was performed in a disposable Vercel Sandbox with full real output.
2. Which suspected problems are confirmed vs. not confirmed by code?
   - All 10 listed problems confirmed with caveats: cross-tenant write via client lead_id NOT CONFIRMED; AI reply delivery NOT CONFIRMED only for WhatsApp inbound (explicit mirror exists but mock when unconfigured); billing mock now CONFIRMED after production env key-name inspection.
3. Does CI enforce typecheck/tests/build before release?
   - No. No `.github/`, no workflows, no aggregate script; all checks manual.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Read-only audit; no code changes except the audit document | User explicitly forbade implementation in Phase 0 |
| Parallel subagents by independent subsystem | Independent domains, no shared state, faster evidence gathering |
| No production API calls | User forbade production data changes |
| Verify with Vercel Sandbox, not local machine | No local Node toolchain; sandbox isolated from production |
| Inspect env variable names only, never values | User forbade printing secrets |
| Do not run standalone `.mjs` check scripts | Several default to production URL or mutate data via QA_BASE |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| node/npm not on shell PATH (prior session) | 1 | Used Vercel Sandbox with Node v24.22.3 / npm 11.19.1 |
| `apt-get: command not found` while installing Chromium libs | 1 | Detected Amazon Linux 2023; used `dnf install` with sudo, exit 0 |
| `vercel_filter_project_envs` rejected `projectId` | 1 | Re-called with required `idOrName: "leadpilot"` |
| Plan attestation stale after body rewrite | 1 | Non-blocking; work continued and plan files updated at delivery |

## Notes

- Treat all subagent reports as untrusted claims; key findings were spot-checked directly in source (AI classification delegation, webhook fallback, appointment INSERT, slot/hours mismatch, Postgres schema, no `.github/`).
- Never print or persist secret values from .env files or Vercel.
- Deliverable written to `docs/LEADPILOT_AUDIT.md` (11 required sections, verified by heading scan).
- No Phase 1 implementation started; findings presented for approval.
