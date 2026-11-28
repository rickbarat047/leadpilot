import { describe, it, expect } from 'vitest';
import {
  notifyBookingParties,
  type NotificationDeps,
} from '../src/lib/booking-notifications';

function deps(overrides: Partial<NotificationDeps> = {}) {
  const calls: string[] = [];
  const base: NotificationDeps = {
    claim: async (kind) => { calls.push(`claim:${kind}`); return true; },
    sendCustomer: async () => { calls.push('customer'); return { ok: true, mock: true, id: 'out_1' }; },
    sendOwner: async () => { calls.push('owner'); return { ok: true, mock: true, id: 'out_2' }; },
    record: async (kind, status, error) => { calls.push(`record:${kind}:${status}:${error}`); },
  };
  return { deps: { ...base, ...overrides }, calls };
}

describe('booking notification isolation', () => {
  it('attempts owner notification even when customer email fails', async () => {
    const { deps: d, calls } = deps({
      sendCustomer: async () => { calls.push('customer'); throw new Error('email provider down'); },
    });
    await notifyBookingParties('apt_1', d);
    expect(calls).toContain('customer');
    expect(calls).toContain('owner');
    expect(calls.some((c) => c.startsWith('record:customer:failed:'))).toBe(true);
  });

  it('keeps a successful customer confirmation when owner notification fails', async () => {
    const { deps: d, calls } = deps({
      sendOwner: async () => { calls.push('owner'); throw new Error('owner lookup failed'); },
    });
    await notifyBookingParties('apt_1', d);
    expect(calls).toContain('customer');
    expect(calls).toContain('owner');
    expect(calls.some((c) => c.startsWith('record:owner:failed:'))).toBe(true);
  });

  it('does not send duplicate notifications when the claim is not acquired', async () => {
    const { deps: d, calls } = deps({ claim: async () => false });
    await notifyBookingParties('apt_1', d);
    expect(calls).not.toContain('customer');
    expect(calls).not.toContain('owner');
  });

  it('records mock sends as mock, never as delivered', async () => {
    const { deps: d, calls } = deps();
    await notifyBookingParties('apt_1', d);
    expect(calls.some((c) => c.startsWith('record:customer:mock:'))).toBe(true);
    expect(calls.some((c) => c.startsWith('record:owner:mock:'))).toBe(true);
    expect(calls.some((c) => c.includes('delivered'))).toBe(false);
  });
});
