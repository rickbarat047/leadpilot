import { describe, it, expect } from 'vitest';
import {
  buildSlotOffer,
  classifyOfferReply,
  detectSelectionIntent,
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

describe('selection intent is detected before offer lifecycle', () => {
  const now = new Date('2026-11-28T10:05:00.000Z');
  const expiredNow = new Date('2026-11-29T11:00:00.000Z');
  const consumed: SlotOffer = { ...offer, consumedAt: '2026-11-28T10:04:00.000Z', consumedBy: 'apt_1' };

  for (const reply of ['What is your business address?', 'What are your working hours?', 'yes please', 'I have 2 questions about pricing']) {
    it(`keeps ${reply} in normal conversation for a live offer`, () => {
      expect(detectSelectionIntent(reply, offer)).toEqual({ kind: 'none' });
      expect(classifyOfferReply(reply, offer, now)).toEqual({ kind: 'none' });
    });
  }

  for (const reply of ['What is your business address?', 'What are your working hours?', 'yes please', 'I have 2 questions about pricing']) {
    it(`does not apply stale offer state to ${reply}`, () => {
      expect(classifyOfferReply(reply, consumed, now)).toEqual({ kind: 'none' });
      expect(classifyOfferReply(reply, offer, expiredNow)).toEqual({ kind: 'none' });
    });
  }

  it('rejects replayed selections 1 and 2 from a consumed offer', () => {
    expect(classifyOfferReply('1', consumed, now)).toEqual({ kind: 'consumed' });
    expect(classifyOfferReply('2', consumed, now)).toEqual({ kind: 'consumed' });
  });

  it('offers fresh slots for genuine selections against an expired offer', () => {
    expect(classifyOfferReply('1', offer, expiredNow)).toEqual({ kind: 'expired' });
    expect(classifyOfferReply('option 2', offer, expiredNow)).toEqual({ kind: 'expired' });
  });

  it('asks for one unambiguous selection against a live offer', () => {
    expect(classifyOfferReply('2 or 3', offer, now)).toEqual({ kind: 'ambiguous' });
  });

  it('never books from a bare number when no offer exists', () => {
    expect(classifyOfferReply('1', null, now)).toEqual({ kind: 'none' });
  });
});
