// Authoritative appointment booking service. All appointment creation paths
// must go through createBooking() so conflict checks and the INSERT happen in
// one serialized transaction on the same connection.
import { normalizeBusinessHours } from './business-hours';
import {
  isOfferedSlot,
  normalizeBookingTimes,
  overlaps,
  parseSlotOffer,
  serviceDuration,
  slotOfferExpired,
} from './booking-core';
import { bookingTransaction, lockBusiness } from './db-transaction';
import { nowIso, uid } from './ids';
import { emailOn, isValidEmail, notifyOwner, queueEmail } from './messaging';
import { generateSlots } from './slots';
import { withTransaction, type TransactionClient } from './transaction';

export type BookingOutcome =
  | 'created'
  | 'already_booked'
  | 'slot_unavailable'
  | 'invalid_selection'
  | 'lead_not_found'
  | 'business_not_found';

export type BookingInput = {
  businessId: string;
  leadId?: string | null;
  conversationId?: string | null;
  customerName: string;
  service?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  source?: 'customer' | 'manual';
  /** Stored meta_json from the AI message that offered the slots. */
  offerMeta?: unknown;
  /** The numbered option the customer selected, when accepting an offer. */
  selectedIndex?: number | null;
  /** Manual bookings may intentionally book outside configured hours. */
  ownerOverrideHours?: boolean;
};

export type BookingResult = {
  status: BookingOutcome;
  appointmentId?: string;
  startsAt?: string;
  endsAt?: string;
  message?: string;
};

type Row = Record<string, unknown>;
const ACTIVE = "('booked','confirmed')";

function displayTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Create one appointment atomically. Notifications happen only after commit. */
export async function createBooking(input: BookingInput): Promise<BookingResult> {
  let confirmation = '';
  let ownerBody = '';
  let customerEmail: string | null = null;
  let settingsJson = '{}';
  let timezone = 'Asia/Kolkata';

  const result = await withTransaction(bookingTransaction(), async (tx: TransactionClient) => {
    await lockBusiness(tx, input.businessId);

    const bizRows = await tx.query<Row>('SELECT id, hours_json, settings_json FROM businesses WHERE id=?', [input.businessId]);
    const business = bizRows[0];
    if (!business) return { status: 'business_not_found' as const };
    settingsJson = typeof business.settings_json === 'string' ? business.settings_json : '{}';
    timezone = normalizeBusinessHours(JSON.parse(typeof business.hours_json === 'string' ? business.hours_json : '{}')).timezone;

    let lead: Row | null = null;
    if (input.leadId) {
      const leadRows = await tx.query<Row>('SELECT id, name, email, service, status FROM leads WHERE id=? AND business_id=?', [input.leadId, input.businessId]);
      lead = leadRows[0] ?? null;
      if (!lead) return { status: 'lead_not_found' as const };
    }

    if (input.conversationId) {
      const convRows = await tx.query<Row>('SELECT id FROM conversations WHERE id=? AND business_id=?', [input.conversationId, input.businessId]);
      if (!convRows[0]) return { status: 'lead_not_found' as const };
    }

    const serviceName = input.service || (lead ? String(lead.service ?? '') : '') || '';
    const serviceRows = serviceName
      ? await tx.query<Row>('SELECT name, duration_min FROM services WHERE business_id=? AND name=?', [input.businessId, serviceName])
      : [];
    const durationMin = serviceDuration(serviceRows, serviceName);

    const offer = parseSlotOffer(input.offerMeta);
    let startsAt = input.startsAt ?? null;
    if (input.source === 'customer') {
      if (!offer || input.selectedIndex == null) return { status: 'invalid_selection' as const };
      if (slotOfferExpired(offer, new Date())) return { status: 'slot_unavailable' as const };
      const option = offer.options.find((o) => o.index === input.selectedIndex);
      if (!option || !isOfferedSlot(offer, input.selectedIndex, option.startsAt)) {
        return { status: 'invalid_selection' as const };
      }
      startsAt = option.startsAt;
    }
    if (!startsAt) return { status: 'invalid_selection' as const };

    const times = normalizeBookingTimes(startsAt, durationMin, new Date());
    if (!times) return { status: 'invalid_selection' as const };

    // Revalidate against current availability inside the same transaction.
    if (input.source === 'customer' && !input.ownerOverrideHours) {
      const [hoursRows, apptRows] = await Promise.all([
        tx.query<Row>('SELECT hours_json FROM businesses WHERE id=?', [input.businessId]),
        tx.query<Row>(`SELECT starts_at, ends_at FROM appointments WHERE business_id=? AND status IN ${ACTIVE}`, [input.businessId]),
      ]);
      const hours = normalizeBusinessHours(JSON.parse(typeof hoursRows[0]?.hours_json === 'string' ? hoursRows[0].hours_json : '{}'));
      const available = generateSlots(hours, apptRows as Array<{ starts_at: string; ends_at: string }>, {
        now: new Date(),
        days: 14,
        duration: durationMin,
      });
      if (!available.includes(times.startsAt)) return { status: 'slot_unavailable' as const };
    }

    const conflictRows = await tx.query<Row>(
      `SELECT id FROM appointments WHERE business_id=? AND status IN ${ACTIVE} AND starts_at < ? AND ends_at > ?`,
      [input.businessId, times.endsAt, times.startsAt],
    );
    if (conflictRows[0]) return { status: 'slot_unavailable' as const };

    if (input.leadId) {
      const dupRows = await tx.query<Row>(
        `SELECT id FROM appointments WHERE business_id=? AND lead_id=? AND starts_at=? AND status IN ${ACTIVE}`,
        [input.businessId, input.leadId, times.startsAt],
      );
      if (dupRows[0]) return { status: 'already_booked' as const };
    }

    const appointmentId = uid('apt');
    await tx.query(
      'INSERT INTO appointments (id, business_id, lead_id, customer_name, service, starts_at, ends_at, status, source, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [appointmentId, input.businessId, input.leadId ?? null, input.customerName, serviceName || 'General', times.startsAt, times.endsAt, 'booked', input.source ?? 'manual', '', nowIso()],
    );

    if (input.leadId) {
      await tx.query('UPDATE leads SET status=?, next_followup_at=NULL WHERE id=? AND business_id=?', ['Appointment Booked', input.leadId, input.businessId]);
    }

    confirmation = `Your appointment is confirmed for ${displayTime(times.startsAt, timezone)}.`;
    if (input.conversationId) {
      await tx.query(
        'INSERT INTO messages (id, business_id, conversation_id, sender, body, meta_json, created_at) VALUES (?,?,?,?,?,?,?)',
        [uid('msg'), input.businessId, input.conversationId, 'ai', confirmation, JSON.stringify({ type: 'booking_confirmation', appointmentId }), nowIso()],
      );
    }

    ownerBody = `New booking: ${input.customerName} — ${serviceName || 'General'} — ${displayTime(times.startsAt, timezone)}.`;
    customerEmail = lead && isValidEmail(String(lead.email ?? '')) ? String(lead.email) : null;

    return { status: 'created' as const, appointmentId, startsAt: times.startsAt, endsAt: times.endsAt };
  });

  if (result.status === 'created' && result.appointmentId) {
    try {
      if (customerEmail && emailOn(settingsJson, 'emailBookingConfirm')) {
        const sent = await queueEmail(input.businessId, customerEmail, 'Your appointment is confirmed', confirmation);
        if (!sent.ok) console.error('[booking] confirmation email failed', sent.error ?? 'unknown');
      }
      await notifyOwner(input.businessId, 'New appointment booked', ownerBody);
    } catch (e) {
      // A notification failure must never roll back a committed appointment.
      console.error('[booking] notification failure', e instanceof Error ? e.message : e);
    }
  }
  return result;
}

/** Find the conversation associated with a lead for the current business. */
export async function findConversationForLead(businessId: string, leadId: string): Promise<string | null> {
  const { get } = await import('./db');
  const row = await get<{ id: string }>('SELECT id FROM conversations WHERE business_id=? AND lead_id=? ORDER BY updated_at DESC LIMIT 1', businessId, leadId);
  return row?.id ?? null;
}
