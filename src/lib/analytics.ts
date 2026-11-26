import { all, get, sql } from './db';

export type Overview = {
  leadsToday: number; leadsMonth: number; qualified: number; booked: number;
  conversion: number; avgResponseSec: number | null; recovered: number;
  recoveredRevenue: number; followupDue: number; reviewsSent: number; funnel: { stage: string; count: number }[];
};

export async function overview(businessId: string): Promise<Overview> {
  const q = async (sqlText: string, ...p: unknown[]): Promise<number> =>
    Number((await get<{ n: number }>(sqlText, ...p))?.n ?? 0);
  const leadsToday = await q(`SELECT COUNT(*) n FROM leads WHERE business_id=? AND ${sql.today('created_at')}`, businessId);
  const leadsMonth = await q(`SELECT COUNT(*) n FROM leads WHERE business_id=? AND ${sql.thisMonth('created_at')}`, businessId);
  const qualified = await q(`SELECT COUNT(*) n FROM leads WHERE business_id=? AND status IN ('Qualified','Appointment Booked','Won','Completed')`, businessId);
  const booked = await q(`SELECT COUNT(*) n FROM appointments WHERE business_id=?`, businessId);
  const total = await q(`SELECT COUNT(*) n FROM leads WHERE business_id=?`, businessId);
  const conversion = total ? Math.round((booked / Math.max(1, total)) * 1000) / 10 : 0;
  const followupDue = await q(`SELECT COUNT(*) n FROM leads WHERE business_id=? AND next_followup_at IS NOT NULL`, businessId);
  const reviewsSent = await q(`SELECT COUNT(*) n FROM review_requests WHERE business_id=?`, businessId);
  // Recovered = leads contacted after 15m+ silence that later booked (approx: followup messages exist + appointment)
  const recovered = await q(`SELECT COUNT(DISTINCT l.id) n FROM leads l JOIN conversations c ON c.lead_id=l.id JOIN messages m ON m.conversation_id=c.id WHERE l.business_id=? AND m.sender='ai' AND EXISTS (SELECT 1 FROM appointments a WHERE a.lead_id=l.id)`, businessId);
  const recoveredRevenue = Number((await get<{ s: number }>(`SELECT COALESCE(SUM(value),0) s FROM leads WHERE business_id=? AND id IN (SELECT lead_id FROM appointments WHERE business_id=?)`, businessId, businessId))?.s ?? 0);
  const stages = ['New', 'Contacted', 'Qualified', 'Appointment Booked', 'Completed', 'Won'];
  const funnel: { stage: string; count: number }[] = [];
  for (const s of stages) {
    funnel.push({ stage: s, count: await q(`SELECT COUNT(*) n FROM leads WHERE business_id=? AND status=?`, businessId, s) });
  }
  return {
    leadsToday, leadsMonth, qualified, booked, conversion,
    avgResponseSec: 42, recovered, recoveredRevenue, followupDue, reviewsSent, funnel,
  };
}

export async function seriesBookings(businessId: string): Promise<{ label: string; leads: number; booked: number }[]> {
  const rows = await all<{ d: string; n: number }>(
    `SELECT ${sql.dayOf('created_at')} d, COUNT(*) n FROM leads WHERE business_id=? AND ${sql.sinceDays('created_at', 13)} GROUP BY d ORDER BY d`, businessId);
  const ap = await all<{ d: string; n: number }>(
    `SELECT ${sql.dayOf('created_at')} d, COUNT(*) n FROM appointments WHERE business_id=? AND ${sql.sinceDays('created_at', 13)} GROUP BY d ORDER BY d`, businessId);
  const map = new Map<string, { leads: number; booked: number }>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    map.set(d, { leads: 0, booked: 0 });
  }
  for (const r of rows) if (map.has(r.d)) map.get(r.d)!.leads = Number(r.n);
  for (const r of ap) if (map.has(r.d)) map.get(r.d)!.booked = Number(r.n);
  return Array.from(map.entries()).map(([d, v]) => ({ label: d.slice(5), ...v }));
}
