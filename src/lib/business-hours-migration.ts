// Server-only data migration for legacy free-text hours. Kept separate from
// the pure hours schema so client components can import it without pulling in
// the database driver.
import { all, run } from './db';
import { legacyHoursMigrationValue } from './business-hours';

let migration: Promise<void> | null = null;
/** Idempotent, dialect-neutral data migration; preserves the legacy text. */
export function migrateLegacyBusinessHours(): Promise<void> {
  if (!migration) {
    migration = (async () => {
      const rows = await all<{ id: string; hours_json: string }>('SELECT id, hours_json FROM businesses');
      for (const row of rows) {
        const value = legacyHoursMigrationValue(row.hours_json);
        if (value) await run('UPDATE businesses SET hours_json=? WHERE id=? AND hours_json=?', value, row.id, row.hours_json);
      }
    })().catch((e) => {
      migration = null;
      console.error('[business-hours migration]', e instanceof Error ? e.message : e);
    });
  }
  return migration;
}
