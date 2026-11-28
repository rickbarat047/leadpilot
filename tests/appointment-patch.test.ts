import { describe, it, expect } from 'vitest';
import { validateAppointmentPatch } from '../src/lib/appointment-patch';

describe('appointment PATCH policy', () => {
  it('rejects start-time changes until rescheduling is implemented', () => {
    const decision = validateAppointmentPatch('booked', {
      starts_at: '2026-11-30T05:30:00.000Z',
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe('start_time_change_disabled');
  });

  it('rejects reactivating a cancelled appointment', () => {
    const decision = validateAppointmentPatch('cancelled', { status: 'booked' });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe('reactivation_disabled');
  });

  it('rejects reactivating completed and no-show appointments', () => {
    for (const current of ['completed', 'no-show']) {
      const decision = validateAppointmentPatch(current, { status: 'booked' });
      expect(decision.ok).toBe(false);
      if (!decision.ok) expect(decision.reason).toBe('reactivation_disabled');
    }
  });

  it('preserves safe status transitions', () => {
    expect(validateAppointmentPatch('booked', { status: 'completed' })).toEqual({ ok: true, status: 'completed' });
    expect(validateAppointmentPatch('booked', { status: 'cancelled' })).toEqual({ ok: true, status: 'cancelled' });
    expect(validateAppointmentPatch('booked', {})).toEqual({ ok: true });
  });

  it('still rejects unknown statuses', () => {
    const decision = validateAppointmentPatch('booked', { status: 'whatever' });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe('invalid_status');
  });
});
