import { describe, it, expect } from 'vitest';
import { isValidEmail, emailOn, formatWhen } from '../src/lib/messaging';

describe('email validation', () => {
  it('accepts real addresses', () => {
    expect(isValidEmail('owner@shop.in')).toBe(true);
    expect(isValidEmail(' a.b+c@sub.domain.co ')).toBe(true);
  });
  it('rejects missing/invalid addresses', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail(undefined as unknown as string)).toBe(false);
  });
});

describe('settings gates (default ON)', () => {
  it('enabled when key missing or settings unparseable', () => {
    expect(emailOn('{}', 'emailFollowups')).toBe(true);
    expect(emailOn(null, 'emailFollowups')).toBe(true);
    expect(emailOn('not-json', 'emailFollowups')).toBe(true);
    expect(emailOn(undefined, 'emailOwnerAlerts')).toBe(true);
  });
  it('respects explicit opt-out', () => {
    expect(emailOn('{"emailFollowups":false}', 'emailFollowups')).toBe(false);
    expect(emailOn('{"emailFollowups":false}', 'emailReminders')).toBe(true);
    expect(emailOn('{"emailReviews":false}', 'emailReviews')).toBe(false);
  });
});

describe('appointment formatting', () => {
  it('renders IST time with year', () => {
    const s = formatWhen('2026-11-06T10:30:00.000Z');
    expect(s).toContain('2026');
    expect(s).toContain('IST');
  });
  it('passes through unparseable input', () => {
    expect(formatWhen('not-a-date')).toBe('not-a-date');
  });
});
