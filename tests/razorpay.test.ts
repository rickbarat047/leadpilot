import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyRazorpaySignature } from '../src/lib/razorpay';

describe('razorpay webhook signature', () => {
  const secret = 'test_secret_123';
  const raw = JSON.stringify({ event: 'subscription.activated', payload: {} });
  const good = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  it('accepts a valid signature', () => {
    expect(verifyRazorpaySignature(raw, good, secret)).toBe(true);
  });
  it('rejects tampered bodies', () => {
    expect(verifyRazorpaySignature(raw + 'x', good, secret)).toBe(false);
  });
  it('rejects wrong signatures and empty secrets', () => {
    expect(verifyRazorpaySignature(raw, 'deadbeef', secret)).toBe(false);
    expect(verifyRazorpaySignature(raw, good, '')).toBe(false);
  });
});
