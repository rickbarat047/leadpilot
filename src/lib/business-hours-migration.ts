// Server-only data migration for legacy free-text hours. Kept separate from
// the pure hours schema so client components can import it without pulling in
// the database driver.
import { all, run } from './db';
import { planLegacyHoursMigration } from './business-hours';

let migration: Promise<void> | null = null;
/** Idempotent, dialect-neutral data migration; preserves the legacy text. */
export function migrateLegacyBusinessHours(): Promise<void> {
  if (!migration) {
    migration = (async () => {
      const rows = await all<{ id: string; hours_json: string }>('SELECT id, hours_json FROM businesses');
      for (const update of planLegacyHoursMigration(rows)) {
        await run('UPDATE businesses SET hours_json=? WHERE id=? AND hours_json=?', update.value, update.id, update.previous);
      }
    })().catch((e) => {
      migration = null;
      console.error('[business-hours migration]', e instanceof Error ? e.message : e);
    });
  }
  return migration;
}
