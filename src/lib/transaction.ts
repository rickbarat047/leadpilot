// Minimal transaction contract shared by SQLite and PostgreSQL adapters.
// All work inside withTransaction runs on ONE client/connection.

export type TransactionRow = Record<string, unknown>;

export interface TransactionClient {
  query<T = TransactionRow>(sqlText: string, params?: unknown[]): Promise<T[]>;
}

export interface TransactionAdapter {
  begin(): Promise<TransactionClient>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): Promise<void>;
}

/**
 * Run work atomically. Commit only when work resolves; always release the
 * underlying connection, including on failure.
 */
export async function withTransaction<T>(
  adapter: TransactionAdapter,
  work: (client: TransactionClient) => Promise<T>,
): Promise<T> {
  const client = await adapter.begin();
  try {
    const result = await work(client);
    await adapter.commit();
    return result;
  } catch (error) {
    await adapter.rollback();
    throw error;
  } finally {
    await adapter.release();
  }
}
