// Server-only transaction adapters used by the authoritative booking path.
// SQLite uses a dedicated connection with BEGIN IMMEDIATE; PostgreSQL uses a
// dedicated pooled client with BEGIN/COMMIT/ROLLBACK and a business-row lock.
import { DatabaseSync } from 'node:sqlite';
import { config } from './config';
import { getPool, isPostgres, toPgPlaceholders } from './db';
import type { TransactionAdapter, TransactionClient, TransactionRow } from './transaction';

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
    let client: { query: (text: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>; release: () => void } | null = null;
    let began = false;
    return {
      async begin(): Promise<TransactionClient> {
        const c = await (await getPool()).connect();
        client = c;
        await c.query('BEGIN');
        began = true;
        return {
          async query<T = TransactionRow>(text: string, params: unknown[] = []): Promise<T[]> {
            const result = await c.query(toPgPlaceholders(text), params);
            return (result.rows ?? []) as T[];
          },
        };
      },
      async commit(): Promise<void> {
        if (began && client) await client.query('COMMIT');
      },
      async rollback(): Promise<void> {
        if (began && client) await client.query('ROLLBACK');
      },
      async release(): Promise<void> {
        client?.release();
        client = null;
        began = false;
      },
    };
  }

  const db = new DatabaseSync(sqlitePath());
  db.exec('PRAGMA busy_timeout = 5000');
  let began = false;
  return {
    async begin(): Promise<TransactionClient> {
      db.exec('BEGIN IMMEDIATE');
      began = true;
      return {
        async query<T = TransactionRow>(text: string, params: unknown[] = []): Promise<T[]> {
          const stmt = db.prepare(text);
          if (/^\s*(select|pragma|explain|with)\b/i.test(text)) return stmt.all(...params) as T[];
          stmt.run(...params);
          return [];
        },
      };
    },
    async commit(): Promise<void> {
      if (began) db.exec('COMMIT');
      began = false;
    },
    async rollback(): Promise<void> {
      if (began) db.exec('ROLLBACK');
      began = false;
    },
    async release(): Promise<void> {
      db.close();
    },
  };
}
