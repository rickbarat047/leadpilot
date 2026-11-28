import { describe, it, expect } from 'vitest';
import {
  buildSlotOffer,
  formatSlotOffers,
  isOfferedSlot,
  normalizeBookingTimes,
  overlaps,
  parseSlotSelection,
  serviceDuration,
  slotOfferExpired,
  type SlotOffer,
} from '../src/lib/booking-core';

const offer: SlotOffer = buildSlotOffer({
  createdAt: '2026-11-28T10:00:00.000Z',
  timezone: 'Asia/Kolkata',
  durationMin: 60,
  serviceName: 'Haircut',
  options: [
    { startsAt: '2026-11-30T04:30:00.000Z', label: 'Monday, 10:00 AM' },
    { startsAt: '2026-11-30T05:30:00.000Z', label: 'Monday, 11:00 AM' },
    { startsAt: '2026-12-01T04:30:00.000Z', label: 'Tuesday, 10:00 AM' },
  ],
});

describe('deterministic slot selection', () => {
  it('accepts bare numbers and option/first/second/third wording', () => {
    expect(parseSlotSelection('1', offer)).toBe(1);
    expect(parseSlotSelection('option 2', offer)).toBe(2);
    expect(parseSlotSelection('third', offer)).toBe(3);
    expect(parseSlotSelection('First please', offer)).toBe(1);
  });

  it('rejects ambiguous, out-of-range and empty choices', () => {
    expect(parseSlotSelection('yes', offer)).toBeNull();
    expect(parseSlotSelection('2 or 3', offer)).toBeNull();
    expect(parseSlotSelection('4', offer)).toBeNull();
    expect(parseSlotSelection('', offer)).toBeNull();
  });

  it('rejects any selection when there is no active offer', () => {
    expect(parseSlotSelection('1', null)).toBeNull();
  });

  it('rejects an arbitrary time that was never offered', () => {
    expect(isOfferedSlot(offer, 1, '2026-12-02T04:30:00.000Z')).toBe(false);
    expect(isOfferedSlot(offer, 2, offer.options[1]!.startsAt)).toBe(true);
  });

  it('treats old offers as expired', () => {
    expect(slotOfferExpired(offer, new Date('2026-11-28T11:00:00.000Z'))).toBe(false);
    expect(slotOfferExpired(offer, new Date('2026-11-29T11:00:00.000Z'))).toBe(true);
  });
});

describe('slot offer metadata and display', () => {
  it('stores exactly three numbered options with ISO starts and duration', () => {
    expect(offer.version).toBe(1);
    expect(offer.type).toBe('slot_offer');
    expect(offer.options.map((o) => o.index)).toEqual([1, 2, 3]);
    expect(offer.options[0]!.startsAt).toBe('2026-11-30T04:30:00.000Z');
    expect(offer.durationMin).toBe(60);
    expect(offer.serviceName).toBe('Haircut');
  });

  it('renders numbered choices that correspond to stored options', () => {
    expect(formatSlotOffers(offer)).toBe(
      '1. Monday, 10:00 AM\n2. Monday, 11:00 AM\n3. Tuesday, 10:00 AM',
    );
  });
});

describe('booking time validation', () => {
  it('uses the configured service duration and ignores a client end time', () => {
    const services = [{ name: 'Haircut', duration_min: 90 }] as never;
    expect(serviceDuration(services, 'Haircut')).toBe(90);
    expect(normalizeBookingTimes('2026-11-30T04:30:00.000Z', 90, new Date('2026-11-28T00:00:00.000Z')))
      .toEqual({ startsAt: '2026-11-30T04:30:00.000Z', endsAt: '2026-11-30T06:00:00.000Z' });
  });

  it('falls back to 60 minutes when no service matches', () => {
    expect(serviceDuration([], 'Unknown')).toBe(60);
  });

  it('rejects past, invalid and non-positive bookings', () => {
    const now = new Date('2026-11-28T00:00:00.000Z');
    expect(normalizeBookingTimes('2026-11-27T23:00:00.000Z', 60, now)).toBeNull();
    expect(normalizeBookingTimes('not-a-date', 60, now)).toBeNull();
    expect(normalizeBookingTimes('2026-11-30T04:30:00.000Z', 0, now)).toBeNull();
    expect(normalizeBookingTimes('2026-11-30T04:30:00.000Z', -30, now)).toBeNull();
  });
});

describe('overlap protection', () => {
  it('rejects overlapping active appointments', () => {
    expect(overlaps('10:00', '11:00', '10:30', '11:30')).toBe(true);
    expect(overlaps('10:00', '11:00', '09:00', '10:30')).toBe(true);
  });

  it('allows back-to-back appointments', () => {
    expect(overlaps('10:00', '11:00', '11:00', '12:00')).toBe(false);
  });
});
