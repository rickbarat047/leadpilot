import { describe, expect, it } from 'vitest';
import { businessUpdateSql } from '../src/lib/business-update';

describe('business update persistence', () => {
  it('builds SQLite-compatible SQL that saves hours and advances onboarding without GREATEST', () => {
    const id = `test-biz-${Date.now()}`;
    const hoursJson = JSON.stringify({
      version: 1,
      timezone: 'Asia/Kolkata',
      status: 'configured',
      days: {
        sun: { open: true, start: '10:00', end: '11:00' },
        mon: { open: false }, tue: { open: false }, wed: { open: false },
        thu: { open: false }, fri: { open: false }, sat: { open: false },
      },
    });
    const { sql, params } = businessUpdateSql({
      name: 'Test', industry: null, description: null, location: null,
      phone: null, email: null, website: null,
      hoursJson, settingsJson: '{}', businessId: id,
    });

    expect(sql).not.toContain('GREATEST');
    expect(sql).toContain('CASE WHEN onboarding_step < 8 THEN 8 ELSE onboarding_step END');
    expect(sql).toContain('hours_json=?');
    expect(params).toContain(hoursJson);
    expect(params.at(-1)).toBe(id);
  });
});
