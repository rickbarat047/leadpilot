import { describe, it, expect } from 'vitest';
import {
  businessHoursSchema,
  emptyBusinessHours,
  legacyHoursMigrationValue,
  normalizeBusinessHours,
  type BusinessHours,
  type DayHours,
  type Weekday,
} from '../src/lib/business-hours';
import { businessSchema } from '../src/lib/validation';
import { generateSlots } from '../src/lib/slots';

const IST = 'Asia/Kolkata';

/** Build a complete structured schedule with only the given days open. */
function schedule(
  open: Partial<Record<Weekday, DayHours>>,
  timezone = IST,
): BusinessHours {
  const base = emptyBusinessHours(timezone);
  for (const day of Object.keys(open) as Weekday[]) base.days[day] = open[day]!;
  base.status = Object.values(base.days).some((d) => d.open) ? 'configured' : 'needs-configuration';
  return base;
}

describe('structured business hours validation', () => {
  it('accepts an open day with valid times', () => {
    const result = businessHoursSchema.safeParse(schedule({ mon: { open: true, start: '10:00', end: '20:00' } }));
    expect(result.success).toBe(true);
  });

  it('rejects an open day with no times', () => {
    const result = businessHoursSchema.safeParse(schedule({ mon: { open: true } }));
    expect(result.success).toBe(false);
  });

  it('rejects closing time that is not after opening time', () => {
    const result = businessHoursSchema.safeParse(schedule({ mon: { open: true, start: '20:00', end: '10:00' } }));
    expect(result.success).toBe(false);
  });

  it('rejects invalid time strings', () => {
    const result = businessHoursSchema.safeParse(schedule({ mon: { open: true, start: '25:00', end: '26:00' } }));
    expect(result.success).toBe(false);
  });

  it('rejects an unknown IANA timezone', () => {
    const result = businessHoursSchema.safeParse(schedule({ mon: { open: true, start: '10:00', end: '20:00' } }, 'Mars/Olympus'));
    expect(result.success).toBe(false);
  });

  it('normalizes legacy free text to needs-configuration without inventing days', () => {
    const hours = normalizeBusinessHours({ summary: 'Mon–Sat 10:00–20:00' });
    expect(hours.status).toBe('needs-configuration');
    expect(Object.values(hours.days).every((d) => d.open === false)).toBe(true);
    expect(hours.legacySummary).toBe('Mon–Sat 10:00–20:00');
  });

  it('preserves legacy summary in the migration value but leaves structured hours untouched', () => {
    const migrated = legacyHoursMigrationValue(JSON.stringify({ summary: 'Mon–Sat 10:00–20:00' }));
    expect(migrated).toContain('needs-configuration');
    expect(migrated).toContain('Mon–Sat 10:00–20:00');
    const current = JSON.stringify(schedule({ mon: { open: true, start: '10:00', end: '20:00' } }));
    expect(legacyHoursMigrationValue(current)).toBeNull();
  });

  it('accepts structured hours through the business API schema', () => {
    const result = businessSchema.safeParse({ hours: schedule({ mon: { open: true, start: '10:00', end: '20:00' } }) });
    expect(result.success).toBe(true);
  });

  it('rejects invalid structured hours through the business API schema', () => {
    const result = businessSchema.safeParse({ hours: schedule({ mon: { open: true } }) });
    expect(result.success).toBe(false);
  });
});

describe('availability from structured business hours', () => {
  const sunday = new Date('2026-11-29T00:00:00.000Z'); // 29 Nov 2026 is a Sunday; IST local date is Sunday.

  it('generates slots only on configured weekdays', () => {
    const hours = schedule({
      mon: { open: true, start: '10:00', end: '20:00' },
      tue: { open: true, start: '10:00', end: '20:00' },
      wed: { open: true, start: '10:00', end: '20:00' },
      thu: { open: true, start: '10:00', end: '20:00' },
      fri: { open: true, start: '10:00', end: '20:00' },
    });
    const slots = generateSlots(hours, [], { now: sunday, days: 7 });
    expect(slots.slice(0, 10)).toEqual([
      '2026-11-30T04:30:00.000Z', '2026-11-30T05:30:00.000Z', '2026-11-30T06:30:00.000Z',
      '2026-11-30T07:30:00.000Z', '2026-11-30T08:30:00.000Z', '2026-11-30T09:30:00.000Z',
      '2026-11-30T10:30:00.000Z', '2026-11-30T11:30:00.000Z', '2026-11-30T12:30:00.000Z',
      '2026-11-30T13:30:00.000Z',
    ]);
    expect(slots).toHaveLength(50);
    expect(slots.some((s) => s.startsWith('2026-12-05') || s.startsWith('2026-12-06'))).toBe(false);
  });

  it('returns no slots for a closed weekday', () => {
    const hours = schedule({ tue: { open: true, start: '10:00', end: '12:00' } });
    expect(generateSlots(hours, [], { now: sunday, days: 7 })).toEqual([
      '2026-12-01T04:30:00.000Z', '2026-12-01T05:30:00.000Z',
    ]);
  });

  it('respects each day’s own opening and closing times', () => {
    const hours = schedule({ wed: { open: true, start: '09:30', end: '12:30' } });
    expect(generateSlots(hours, [], { now: sunday, days: 7 })).toEqual([
      '2026-12-02T04:00:00.000Z', '2026-12-02T05:00:00.000Z', '2026-12-02T06:00:00.000Z',
    ]);
  });

  it('never offers a slot that runs beyond closing time', () => {
    const hours = schedule({ thu: { open: true, start: '10:00', end: '13:00' } });
    expect(generateSlots(hours, [], { now: sunday, days: 7, duration: 90 })).toEqual([
      '2026-12-03T04:30:00.000Z', '2026-12-03T06:00:00.000Z',
    ]);
  });

  it('respects the configured buffer between slots', () => {
    const hours = schedule({ fri: { open: true, start: '10:00', end: '13:00' } });
    expect(generateSlots(hours, [], { now: sunday, days: 7, bufferMin: 30 })).toEqual([
      '2026-12-04T04:30:00.000Z', '2026-12-04T06:00:00.000Z',
    ]);
  });

  it('returns no availability for missing, legacy or needs-configuration hours', () => {
    expect(generateSlots({}, [], { now: sunday, days: 7 })).toEqual([]);
    expect(generateSlots({ summary: 'Mon–Sat 10:00–20:00' }, [], { now: sunday, days: 7 })).toEqual([]);
    expect(generateSlots(emptyBusinessHours(IST), [], { now: sunday, days: 7 })).toEqual([]);
  });

  it('excludes already booked appointments', () => {
    const hours = schedule({ mon: { open: true, start: '10:00', end: '20:00' } });
    const slots = generateSlots(hours, [{ starts_at: '2026-11-30T04:30:00.000Z', ends_at: '2026-11-30T05:30:00.000Z' }], { now: sunday, days: 7 });
    expect(slots).toHaveLength(9);
    expect(slots[0]).toBe('2026-11-30T05:30:00.000Z');
  });

  it('converts the same wall-clock hours using the business timezone', () => {
    const now = new Date('2026-11-29T00:00:00.000Z');
    const ist = generateSlots(schedule({ mon: { open: true, start: '10:00', end: '11:00' } }, IST), [], { now, days: 7 });
    const utc = generateSlots(schedule({ mon: { open: true, start: '10:00', end: '11:00' } }, 'UTC'), [], { now, days: 7 });
    expect(ist).toEqual(['2026-11-30T04:30:00.000Z']);
    expect(utc).toEqual(['2026-11-30T10:00:00.000Z']);
  });

  it('handles a day boundary in the business timezone', () => {
    const now = new Date('2026-11-30T23:30:00.000Z'); // Tue 01 Dec 05:00 IST
    const hours = schedule({ tue: { open: true, start: '10:00', end: '20:00' } });
    const slots = generateSlots(hours, [], { now, days: 7 });
    expect(slots[0]).toBe('2026-12-01T04:30:00.000Z');
    expect(slots).toHaveLength(10);
  });
});
