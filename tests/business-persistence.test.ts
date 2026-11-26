import { describe, expect, it } from 'vitest';
import { all, run } from '../src/lib/db';
import { businessUpdateSql } from '../src/lib/business-update';

describe('business update persistence', () => {
  it('saves hours and advances onboarding on SQLite without GREATEST', async () => {
    const id = `test-biz-${Date.now()}`;
    const owner = `test-owner-${Date.now()}`;
    await run(
      'INSERT INTO businesses (id, owner_user_id, name, hours_json, settings_json, onboarding_step) VALUES (?, ?, ?, ?, ?, ?)',
      id, owner, 'Test', '{}', '{}', 1,
    );
    try {
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
      await run(sql, ...params);
      const rows = await all<{ hours_json: string; onboarding_step: number }>(
        'SELECT hours_json, onboarding_step FROM businesses WHERE id=?', id,
      );
      expect(rows[0]?.hours_json).toBe(hoursJson);
      expect(rows[0]?.onboarding_step).toBe(8);
    } finally {
      await run('DELETE FROM businesses WHERE id=?', id);
    }
  });
});
