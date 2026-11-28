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
 * Run work atomically. Commit only when work resolves. The acquired resource is
 * always released, even if begin() fails. Rollback/release errors never mask
 * the original failure.
 */
export async function withTransaction<T>(
  adapter: TransactionAdapter,
  work: (client: TransactionClient) => Promise<T>,
): Promise<T> {
  let began = false;
  let primaryError: unknown = null;
  let result: T | undefined;
  try {
    const client = await adapter.begin();
    began = true;
    result = await work(client);
    await adapter.commit();
    began = false;
  } catch (error) {
    primaryError = error;
    if (began) {
      try {
        await adapter.rollback();
      } catch {
        // The original error is the one callers need to see.
      }
    }
  } finally {
    try {
      await adapter.release();
    } catch (error) {
      if (!primaryError) primaryError = error;
    }
  }
  if (primaryError !== null) throw primaryError;
  return result as T;
}
