import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { all, get } from '@/lib/db';

// Full data export for the authenticated business (owner session). Used for
// self-serve backups, DPDP/GDPR subject requests, and as a restore source.
// Every query is scoped by business_id — a tenant can only export their own data.
export const dynamic = 'force-dynamic';

export const GET = guard(async (req: NextRequest) => {
  const { error, businessId, user } = await requireBusiness(req);
  if (error || !businessId) return error;

  const business = await get(`SELECT * FROM businesses WHERE id=?`, businessId);
  const [services, leads, conversations, messages, appointments, knowledge,
    automations, runs, subscriptions, invoices, outbox, memberships] = await Promise.all([
    all(`SELECT * FROM services WHERE business_id=? ORDER BY name`, businessId),
    all(`SELECT * FROM leads WHERE business_id=? ORDER BY created_at`, businessId),
    all(`SELECT * FROM conversations WHERE business_id=? ORDER BY created_at`, businessId),
    all(`SELECT * FROM messages WHERE business_id=? ORDER BY created_at`, businessId),
    all(`SELECT * FROM appointments WHERE business_id=? ORDER BY starts_at`, businessId),
    all(`SELECT * FROM knowledge_entries WHERE business_id=? ORDER BY created_at`, businessId),
    all(`SELECT * FROM automations WHERE business_id=? ORDER BY name`, businessId),
    all(`SELECT * FROM automation_runs WHERE business_id=? ORDER BY created_at`, businessId),
    all(`SELECT * FROM subscriptions WHERE business_id=?`, businessId),
    all(`SELECT * FROM invoices WHERE business_id=? ORDER BY created_at`, businessId),
    all(`SELECT * FROM email_outbox WHERE business_id=? ORDER BY created_at`, businessId),
    all(`SELECT role, user_id FROM memberships WHERE business_id=?`, businessId),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    export_version: 1,
    business_id: businessId,
    business, memberships, services, leads, conversations, messages,
    appointments, knowledge_entries: knowledge, automations, automation_runs: runs,
    subscriptions, invoices, email_outbox: outbox,
    _counts: {
      leads: leads.length, conversations: conversations.length, messages: messages.length,
      appointments: appointments.length, services: services.length,
    },
  };

  const res = json(payload);
  res.headers.set('Content-Disposition', `attachment; filename="leadpilot-export-${businessId}-${new Date().toISOString().slice(0, 10)}.json"`);
  void user;
  return res;
});
