// Real availability: derive free booking slots from a business's configured
// working hours + existing appointments. No external calendar needed — this is
// the "good enough for pilots" layer; Google Calendar sync can replace
// `existing` later without changing the public API.
import { all, get } from './db';
import {
  addLocalDays,
  businessLocalDate,
  localMinutesInTimeZone,
  localWallTimeToUtc,
  minutesToTime,
  normalizeBusinessHours,
  weekdayOfLocalDate,
} from './business-hours';
import { migrateLegacyBusinessHours } from './business-hours-migration';

export type SlotOptions = {
  days?: number;       // how many days ahead to scan (default 7)
  duration?: number;   // slot length in minutes (default 60)
  now?: Date;
  bufferMin?: number;  // gap between slots (default 0)
};

/**
 * Generate free slot start times (ISO) from validated structured hours.
 * `booked`: existing appointments as {starts_at, ends_at} ISO strings.
 */
export function generateSlots(
  hours: unknown,
  booked: { starts_at: string; ends_at: string }[],
  opts: SlotOptions = {},
): string[] {
  const schedule = normalizeBusinessHours(hours);
  if (schedule.status !== 'configured') return [];

  const days = opts.days ?? 7;
  const duration = opts.duration ?? 60;
  const now = opts.now ?? new Date();
  const buffer = opts.bufferMin ?? 0;
  const slots: string[] = [];

  const bookedRanges = booked.map((b) => ({
    start: new Date(b.starts_at).getTime(),
    end: new Date(b.ends_at).getTime(),
  }));

  const localToday = businessLocalDate(now, schedule.timezone);
  const nowMinutes = localMinutesInTimeZone(now, schedule.timezone);
  const earliestToday = (Math.floor(nowMinutes / 60) + 1) * 60; // no past/near-now slots

  for (let i = 0; i < days; i++) {
    const date = addLocalDays(localToday, i);
    const day = schedule.days[weekdayOfLocalDate(date)];
    if (!day?.open || !day.start || !day.end) continue;
    const openMin = Number(day.start.slice(0, 2)) * 60 + Number(day.start.slice(3));
    const closeMin = Number(day.end.slice(0, 2)) * 60 + Number(day.end.slice(3));
    if (closeMin <= openMin) continue;

    for (let m = openMin; m + duration <= closeMin; m += duration + buffer) {
      if (i === 0 && m < earliestToday) continue;
      const slotStart = localWallTimeToUtc(date, minutesToTime(m), schedule.timezone);
      if (slotStart.getTime() <= now.getTime()) continue;
      const slotEnd = slotStart.getTime() + duration * 60000;
      const clash = bookedRanges.some((b) => slotStart.getTime() < b.end && slotEnd > b.start);
      if (clash) continue;
      slots.push(slotStart.toISOString());
    }
  }
  return slots;
}

/** Load a business's hours + booked appointments and return free slots. */
export async function freeSlotsForBusiness(
  businessId: string,
  opts: SlotOptions = {},
): Promise<string[]> {
  await migrateLegacyBusinessHours();
  const biz = await get<{ hours_json: string }>('SELECT hours_json FROM businesses WHERE id=?', businessId);
  let hours: unknown = {};
  try { hours = biz ? JSON.parse(biz.hours_json || '{}') : {}; } catch { hours = {}; }
  const booked = await all<{ starts_at: string; ends_at: string }>(
    `SELECT starts_at, ends_at FROM appointments WHERE business_id=? AND status IN ('booked','confirmed')`,
    businessId,
  );
  return generateSlots(hours, booked, opts);
}
