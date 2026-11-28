import { describe, it, expect } from 'vitest';
import {
  buildSlotOffer,
  classifyOfferReply,
  offerConsumed,
  offerDurationMatches,
  parseSlotOffer,
  type SlotOffer,
} from '../src/lib/booking-core';

const offer: SlotOffer = buildSlotOffer({
  id: 'offer_1',
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

describe('slot offer identity and lifecycle', () => {
  it('requires a stable offer id', () => {
    const withoutId = { ...offer, id: undefined };
    expect(parseSlotOffer(JSON.stringify(withoutId))).toBeNull();
  });

  it('preserves consumption metadata from stored rows', () => {
    const consumed = { ...offer, consumedAt: '2026-11-28T10:05:00.000Z', consumedBy: 'apt_1' };
    const parsed = parseSlotOffer(JSON.stringify(consumed));
    expect(parsed?.consumedAt).toBe('2026-11-28T10:05:00.000Z');
    expect(parsed?.consumedBy).toBe('apt_1');
    expect(offerConsumed(parsed!)).toBe(true);
  });

  it('notices an unconsumed offer', () => {
    expect(offerConsumed(offer)).toBe(false);
  });

  it('matches offer duration against the configured service duration', () => {
    expect(offerDurationMatches(offer, 60)).toBe(true);
    expect(offerDurationMatches(offer, 90)).toBe(false);
  });

  it('classifies a valid numbered selection as an acceptance', () => {
    expect(classifyOfferReply('2', offer, new Date('2026-11-28T10:05:00.000Z'))).toEqual({ kind: 'accept', index: 2 });
  });
});

describe('expired offer replies', () => {
  const now = new Date('2026-11-29T11:00:00.000Z');

  for (const reply of ['1', '2', '3', 'option 2', 'yes please']) {
    it(`never accepts ${reply} from an expired offer`, () => {
      expect(classifyOfferReply(reply, offer, now)).toEqual({ kind: 'expired' });
    });
  }

  it('reports consumed offers before looking at the reply', () => {
    const consumed: SlotOffer = { ...offer, consumedAt: '2026-11-28T10:05:00.000Z' };
    expect(classifyOfferReply('2', consumed, new Date('2026-11-28T10:06:00.000Z'))).toEqual({ kind: 'consumed' });
  });

  it('reports ambiguous numeric-like replies on a live offer', () => {
    expect(classifyOfferReply('2 or 3', offer, new Date('2026-11-28T10:05:00.000Z'))).toEqual({ kind: 'ambiguous' });
  });

  it('reports no offer when nothing was stored', () => {
    expect(classifyOfferReply('1', null, new Date('2026-11-28T10:05:00.000Z'))).toEqual({ kind: 'none' });
  });
});
