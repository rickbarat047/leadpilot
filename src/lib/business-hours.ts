// Structured business hours + timezone helpers.
// Stored in businesses.hours_json as a versioned JSON document. Free-text
// legacy summaries are never treated as verified opening hours.
import { z } from 'zod';
import { all, run } from './db';

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type DayHours = { open: boolean; start?: string; end?: string };
export type BusinessHours = {
  version: 1;
  timezone: string;
  status: 'configured' | 'needs-configuration';
  legacySummary?: string;
  days: Record<Weekday, DayHours>;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function hhmm(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export const dayHoursSchema = z.object({
  open: z.boolean(),
  start: z.string().regex(TIME_RE).optional(),
  end: z.string().regex(TIME_RE).optional(),
}).superRefine((day, ctx) => {
  if (day.open && (!day.start || !day.end)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Opening and closing times are required for an open day' });
  }
  if (!day.open && (day.start || day.end)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A closed day must not have times' });
  }
  if (day.start && day.end && hhmm(day.end) <= hhmm(day.start)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Closing time must be later than opening time' });
  }
});

export const businessHoursSchema = z.object({
  version: z.literal(1),
  timezone: z.string().refine(isValidTimeZone, 'Unknown timezone'),
  status: z.enum(['configured', 'needs-configuration']),
  legacySummary: z.string().max(500).optional(),
  days: z.record(z.enum(WEEKDAYS), dayHoursSchema),
}).superRefine((hours, ctx) => {
  const openDays = Object.values(hours.days).filter((d) => d.open).length;
  if (hours.status === 'configured' && openDays === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one day must be open' });
  }
  if (hours.status === 'needs-configuration' && openDays > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Open days require status configured' });
  }
});

/** A complete, explicitly closed schedule. Never guesses opening hours. */
export function emptyBusinessHours(timezone = 'Asia/Kolkata'): BusinessHours {
  const days = {} as Record<Weekday, DayHours>;
  for (const day of WEEKDAYS) days[day] = { open: false };
  return { version: 1, timezone, status: 'needs-configuration', days };
}

/** Parse stored hours; fall back to an explicitly unconfigured schedule. */
export function normalizeBusinessHours(input: unknown): BusinessHours {
  const parsed = businessHoursSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const summary = (input as { summary?: unknown } | null)?.summary;
  return { ...emptyBusinessHours(), ...(typeof summary === 'string' ? { legacySummary: summary.slice(0, 500) } : {}) };
}

/** Value to store for a legacy row, or null when the row is already structured. */
export function legacyHoursMigrationValue(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return JSON.stringify(emptyBusinessHours());
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  if (businessHoursSchema.safeParse(parsed).success) return null;
  return JSON.stringify(normalizeBusinessHours(parsed));
}

let migration: Promise<void> | null = null;
/** Idempotent, dialect-neutral data migration; preserves the legacy text. */
export function migrateLegacyBusinessHours(): Promise<void> {
  if (!migration) {
    migration = (async () => {
      const rows = await all<{ id: string; hours_json: string }>('SELECT id, hours_json FROM businesses');
      for (const row of rows) {
        const value = legacyHoursMigrationValue(row.hours_json);
        if (value) await run('UPDATE businesses SET hours_json=? WHERE id=? AND hours_json=?', value, row.id, row.hours_json);
      }
    })().catch((e) => {
      migration = null;
      console.error('[business-hours migration]', e instanceof Error ? e.message : e);
    });
  }
  return migration;
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = Number(p.value);
  return { year: map.year, month: map.month, day: map.day, hour: map.hour, minute: map.minute };
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

/** Calendar date in the business's timezone, as YYYY-MM-DD. */
export function businessLocalDate(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutes since local midnight in the business's timezone. */
export function localMinutesInTimeZone(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

/** Add calendar days without crossing DST boundaries incorrectly. */
export function addLocalDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Weekday key for a YYYY-MM-DD calendar date. */
export function weekdayOfLocalDate(localDate: string): Weekday {
  const [y, m, d] = localDate.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Convert a local wall-clock time on a calendar date to a UTC instant. */
export function localWallTimeToUtc(localDate: string, time: string, timeZone: string): Date {
  const minutes = hhmm(time);
  const [y, m, d] = localDate.split('-').map(Number);
  let instant = new Date(Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60));
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(instant, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const delta = asUtc - instant.getTime();
    if (delta === 0) break;
    instant = new Date(instant.getTime() - delta);
  }
  return instant;
}

export function minutesToTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}
