// Post-commit booking notifications. Each channel is independent and claimed
// exactly once per appointment, so retries cannot send duplicates.

import { emailOn, isValidEmail, notifyOwner, queueEmail } from './messaging';
import { recordRun } from './runs';
import { nowIso } from './ids';
import { get } from './db';

export type NotificationKind = 'customer' | 'owner';
export type NotificationResult = { ok: boolean; mock?: boolean; id?: string; error?: string };
export type NotificationStatus = 'sent' | 'mock' | 'failed' | 'skipped';

export type NotificationDeps = {
  claim(kind: NotificationKind): Promise<boolean>;
  sendCustomer(): Promise<NotificationResult | null>;
  sendOwner(): Promise<NotificationResult | null>;
  record(kind: NotificationKind, status: NotificationStatus, error: string): Promise<void>;
};

export async function notifyBookingParties(appointmentId: string, deps: NotificationDeps): Promise<void> {
  const deliver = async (kind: NotificationKind, send: () => Promise<NotificationResult | null>) => {
    try {
      if (!(await deps.claim(kind))) return;
      const result = await send();
      if (!result) {
        await deps.record(kind, 'skipped', '');
        return;
      }
      if (result.ok) {
        await deps.record(kind, result.mock ? 'mock' : 'sent', '');
      } else {
        await deps.record(kind, 'failed', result.error ?? 'unknown notification failure');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await deps.record(kind, 'failed', message.slice(0, 500));
      } catch {
        // Logging must never turn a notification failure into a booking failure.
      }
    }
  };

  await Promise.all([
    deliver('customer', deps.sendCustomer),
    deliver('owner', deps.sendOwner),
  ]);
}

/** Production adapter: claims are rows in automation_runs with deterministic ids. */
export async function notifyBookingPartiesForBooking(input: {
  businessId: string;
  appointmentId: string;
  customerEmail: string | null;
  settingsJson: string;
  confirmation: string;
  ownerBody: string;
}): Promise<void> {
  const claim = async (kind: NotificationKind): Promise<boolean> => {
    const id = `notif_${input.appointmentId}_${kind}`;
    const claimed = await get<{ id: string }>(
      `INSERT INTO automation_runs (id, business_id, automation_id, automation_name, trigger, lead_id, steps_json, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'claimed', '', ?) ON CONFLICT(id) DO NOTHING RETURNING id`,
      id, input.businessId, '', `Booking notification (${kind})`, `booking.notification.${kind}`, '',
      JSON.stringify([{ appointmentId: input.appointmentId }]), nowIso(),
    );
    return Boolean(claimed?.id);
  };

  const record = async (kind: NotificationKind, status: NotificationStatus, error: string) => {
    await recordRun(
      input.businessId,
      '',
      `Booking ${kind} notification (${status})`,
      `booking.notification.${kind}.${status}`,
      '',
      [{ appointmentId: input.appointmentId, status }],
      status,
      error,
    );
  };

  await notifyBookingParties(input.appointmentId, {
    claim,
    sendCustomer: async () => {
      if (!input.customerEmail || !emailOn(input.settingsJson, 'emailBookingConfirm')) return null;
      if (!isValidEmail(input.customerEmail)) return { ok: false, error: 'invalid recipient address' };
      return queueEmail(input.businessId, input.customerEmail, 'Your appointment is confirmed', input.confirmation);
    },
    sendOwner: async () => notifyOwner(input.businessId, 'New appointment booked', input.ownerBody),
    record,
  });
}
