import { describe, it, expect } from 'vitest';
import { PLANS, canAddLead, planById, trialActive } from '../src/lib/billing';
import { isOptOut } from '../src/lib/text';

describe('billing', () => {
  it('plans are config-driven with limits', () => {
    expect(PLANS.starter.priceInr).toBe(2999);
    expect(PLANS.growth.priceInr).toBe(5999);
    expect(PLANS.pro.priceInr).toBe(11999);
    expect(canAddLead(PLANS.starter, 199)).toBe(true);
    expect(canAddLead(PLANS.starter, 200)).toBe(false);
  });
  it('unknown plan falls back to trial', () => {
    expect(planById('nope').id).toBe('trial');
  });
  it('trial expiry works', () => {
    expect(trialActive(new Date(Date.now() + 86400000).toISOString())).toBe(true);
    expect(trialActive(new Date(Date.now() - 86400000).toISOString())).toBe(false);
  });
});

describe('opt-out', () => {
  it('detects STOP variants', () => {
    expect(isOptOut('STOP')).toBe(true);
    expect(isOptOut('please unsubscribe me')).toBe(true);
    expect(isOptOut('see you Tuesday!')).toBe(false);
  });
});
