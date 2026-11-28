// Injectable transaction adapters. These factories contain no imports of
// node:sqlite or pg, so their cleanup behaviour can be unit tested directly.

import type { TransactionAdapter, TransactionClient, TransactionRow } from './transaction';

export interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes?: number };
}

export interface SqliteHandle {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

export interface PgClientLike {
  query(text: string, params?: unknown[]): Promise<{ rows?: unknown[] }>;
  release(): void;
}

/** SQLite: one dedicated connection, BEGIN IMMEDIATE, and always close it. */
export function sqliteTransactionAdapter(db: SqliteHandle): TransactionAdapter {
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
      if (began) {
        db.exec('COMMIT');
        began = false;
      }
    },
    async rollback(): Promise<void> {
      if (began) {
        try {
          db.exec('ROLLBACK');
        } finally {
          began = false;
        }
      }
    },
    async release(): Promise<void> {
      try {
        db.close();
      } finally {
        began = false;
      }
    },
  };
}

/** PostgreSQL: one dedicated pooled client and BEGIN/COMMIT/ROLLBACK. */
export function pgTransactionAdapter(
  connect: () => Promise<PgClientLike>,
  toPgPlaceholders: (text: string) => string = (text) => text,
): TransactionAdapter {
  let client: PgClientLike | null = null;
  let began = false;
  return {
    async begin(): Promise<TransactionClient> {
      const c = await connect();
      client = c;
      try {
        await c.query('BEGIN');
        began = true;
      } catch (error) {
        try { c.release(); } catch { /* preserve BEGIN error */ }
        client = null;
        began = false;
        throw error;
      }
      return {
        async query<T = TransactionRow>(text: string, params: unknown[] = []): Promise<T[]> {
          const result = await c.query(toPgPlaceholders(text), params);
          return (result.rows ?? []) as T[];
        },
      };
    },
    async commit(): Promise<void> {
      if (began && client) await client.query('COMMIT');
      began = false;
    },
    async rollback(): Promise<void> {
      if (began && client) await client.query('ROLLBACK');
      began = false;
    },
    async release(): Promise<void> {
      const c = client;
      client = null;
      began = false;
      if (c) c.release();
    },
  };
}
