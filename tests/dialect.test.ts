import { describe, it, expect } from 'vitest';
import { toPgPlaceholders, sql } from '../src/lib/db';

describe('postgres dialect', () => {
  it('converts ? to $n', () => {
    expect(toPgPlaceholders('SELECT * FROM leads WHERE a=? AND b=?')).toBe(
      'SELECT * FROM leads WHERE a=$1 AND b=$2',
    );
  });
  it('leaves ? inside string literals alone', () => {
    expect(toPgPlaceholders(`SELECT 'a?b', c=?`)).toBe(`SELECT 'a?b', c=$1`);
  });
  it('series predicate composes without duplication', () => {
    // Regression: sinceDays emits the full `col >= ...` predicate, so call
    // sites must NOT add their own `created_at >=`. This once produced
    // `created_at >= created_at >= ...` → pg 42601 on /api/business.
    const stmt = `SELECT ${sql.dayOf('created_at')} d, COUNT(*) n FROM leads WHERE business_id=? AND ${sql.sinceDays('created_at', 13)} GROUP BY d ORDER BY d`;
    expect((stmt.match(/>=/g) || []).length).toBe(1);
    expect(stmt).not.toContain('created_at >= created_at');
  });
  it('emits sqlite fragments by default (no DATABASE_URL)', () => {
    expect(sql.today('created_at')).toContain("date('now')");
    expect(sql.thisMonth('created_at')).toContain('strftime');
    expect(sql.dayOf('created_at')).toBe('date(created_at)');
    expect(sql.plusHours(25)).toContain('datetime(');
  });
});
