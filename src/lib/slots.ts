// Real availability: derive free booking slots from a business's configured
// working hours + existing appointments. No external calendar needed — this is
// the "good enough for pilots" layer; Google Calendar sync can replace
// `existing` later without changing the public API.
import { all, get } from './db';

export type Hours = Record<string, [string, string] | string[] | null>;

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number(n));
  return (h || 0) * 60 + (m || 0);
}

function fromDate(d: Date): string {
  return d.toISOString();
}

export type SlotOptions = {
  days?: number;       // how many days ahead to scan (default 7)
  duration?: number;   // slot length in minutes (default 60)
  now?: Date;
  bufferMin?: number;  // gap between slots (default 0)
};

/**
 * Generate free slot start times (ISO) for a business.
 * `hours`: map of day-key -> [open, close] (HH:MM) or null (closed).
 * `booked`: existing appointments as {starts_at, ends_at} ISO strings.
 */
export function generateSlots(
  hours: Hours,
  booked: { starts_at: string; ends_at: string }[],
  opts: SlotOptions = {},
): string[] {
  const days = opts.days ?? 7;
  const duration = opts.duration ?? 60;
  const now = opts.now ?? new Date();
  const buffer = opts.bufferMin ?? 0;
  const slots: string[] = [];

  const bookedRanges = booked.map((b) => ({
    start: new Date(b.starts_at).getTime(),
    end: new Date(b.ends_at).getTime(),
  }));

  const cursor = new Date(now);
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + 1); // don't offer past/near-now slots

  for (let i = 0; i < days; i++) {
    const d = new Date(cursor);
    d.setDate(d.getDate() + i);
    const key = DAY_KEYS[d.getDay()];
    const range = hours?.[key];
    if (!range || !Array.isArray(range) || range.length < 2) continue;
    const openMin = toMin(String(range[0]));
    const closeMin = toMin(String(range[1]));
    if (closeMin <= openMin) continue;

    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);

    for (let m = openMin; m + duration <= closeMin; m += duration + buffer) {
      const slotStart = new Date(dayStart.getTime() + m * 60000);
      if (slotStart.getTime() < now.getTime()) continue;
      const slotEnd = slotStart.getTime() + duration * 60000;
      const clash = bookedRanges.some((b) => slotStart.getTime() < b.end && slotEnd > b.start);
      if (clash) continue;
      slots.push(fromDate(slotStart));
    }
  }
  return slots;
}

/** Load a business's hours + booked appointments and return free slots. */
export async function freeSlotsForBusiness(
  businessId: string,
  opts: SlotOptions = {},
): Promise<string[]> {
  const biz = await get<{ hours_json: string }>(`SELECT hours_json FROM businesses WHERE id=?`, businessId);
  let hours: Hours = {};
  try { hours = biz ? JSON.parse(biz.hours_json || '{}') : {}; } catch { hours = {}; }
  const booked = await all<{ starts_at: string; ends_at: string }>(
    `SELECT starts_at, ends_at FROM appointments WHERE business_id=? AND status IN ('booked','confirmed')`,
    businessId,
  );
  return generateSlots(hours, booked, opts);
}
