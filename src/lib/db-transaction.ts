// Server-only transaction adapters used by the authoritative booking path.
// SQLite uses a dedicated connection with BEGIN IMMEDIATE; PostgreSQL uses a
// dedicated pooled client with BEGIN/COMMIT/ROLLBACK and a business-row lock.
import { DatabaseSync } from 'node:sqlite';
import { config } from './config';
import { getPool, isPostgres, toPgPlaceholders } from './db';
import { pgTransactionAdapter, sqliteTransactionAdapter, type PgClientLike, type SqliteHandle } from './transaction-adapters';
import type { TransactionAdapter, TransactionClient } from './transaction';

function sqlitePath(): string {
  const url = config.databaseUrl || '';
  if (url.startsWith('file:')) return url.slice(5);
  return url || 'data/leadpilot.db';
}

/** Serialize all appointment writes for one business inside the transaction. */
export async function lockBusiness(client: TransactionClient, businessId: string): Promise<void> {
  if (isPostgres()) {
    await client.query('SELECT id FROM businesses WHERE id=? FOR UPDATE', [businessId]);
  } else {
    await client.query('SELECT id FROM businesses WHERE id=?', [businessId]);
  }
}

export function bookingTransaction(): TransactionAdapter {
  if (isPostgres()) {
    return pgTransactionAdapter(
      async () => (await getPool()).connect() as unknown as PgClientLike,
      toPgPlaceholders,
    );
  }
  const db = new DatabaseSync(sqlitePath()) as unknown as SqliteHandle;
  db.exec('PRAGMA busy_timeout = 5000');
  return sqliteTransactionAdapter(db);
}
