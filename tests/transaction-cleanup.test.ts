import { describe, it, expect } from 'vitest';
import { withTransaction, type TransactionAdapter, type TransactionClient } from '../src/lib/transaction';
import {
  pgTransactionAdapter,
  sqliteTransactionAdapter,
  type SqliteHandle,
} from '../src/lib/transaction-adapters';

function fakeAdapter(overrides: Partial<TransactionAdapter> = {}) {
  const calls: string[] = [];
  const client: TransactionClient = { query: async () => [] };
  const adapter: TransactionAdapter = {
    begin: async () => { calls.push('begin'); return client; },
    commit: async () => { calls.push('commit'); },
    rollback: async () => { calls.push('rollback'); },
    release: async () => { calls.push('release'); },
    ...overrides,
  };
  return { adapter, calls, client };
}

describe('withTransaction cleanup', () => {
  it('releases even when begin fails and preserves the original error', async () => {
    const { adapter, calls } = fakeAdapter({
      begin: async () => { calls.push('begin'); throw new Error('begin failed'); },
    });
    await expect(withTransaction(adapter, async () => 'never')).rejects.toThrow('begin failed');
    expect(calls).toEqual(['begin', 'release']);
  });

  it('rolls back and releases on work failure', async () => {
    const { adapter, calls } = fakeAdapter();
    await expect(withTransaction(adapter, async () => { throw new Error('work failed'); })).rejects.toThrow('work failed');
    expect(calls).toEqual(['begin', 'rollback', 'release']);
  });

  it('rolls back and releases when commit fails', async () => {
    const { adapter, calls } = fakeAdapter({
      commit: async () => { calls.push('commit'); throw new Error('commit failed'); },
    });
    await expect(withTransaction(adapter, async () => 'ok')).rejects.toThrow('commit failed');
    expect(calls).toEqual(['begin', 'commit', 'rollback', 'release']);
  });

  it('does not let rollback failure hide the work error', async () => {
    const { adapter } = fakeAdapter({
      rollback: async () => { throw new Error('rollback failed'); },
    });
    await expect(withTransaction(adapter, async () => { throw new Error('original'); })).rejects.toThrow('original');
  });

  it('does not let release failure hide the work error', async () => {
    const { adapter } = fakeAdapter({
      release: async () => { throw new Error('release failed'); },
    });
    await expect(withTransaction(adapter, async () => { throw new Error('original'); })).rejects.toThrow('original');
  });
});

describe('concrete transaction adapters', () => {
  it('closes the SQLite connection when BEGIN IMMEDIATE fails', async () => {
    let closed = 0;
    const db: SqliteHandle = {
      exec: (sql) => { if (sql === 'BEGIN IMMEDIATE') throw new Error('database is locked'); },
      prepare: () => ({ all: () => [], run: () => ({ changes: 0 }) }),
      close: () => { closed += 1; },
    };
    const adapter = sqliteTransactionAdapter(db);
    await expect(withTransaction(adapter, async () => 'never')).rejects.toThrow('database is locked');
    expect(closed).toBe(1);
  });

  it('releases the PostgreSQL client when BEGIN fails', async () => {
    let released = 0;
    const adapter = pgTransactionAdapter(async () => ({
      query: async (text) => {
        if (text === 'BEGIN') throw new Error('begin rejected');
        return { rows: [] };
      },
      release: () => { released += 1; },
    }));
    await expect(withTransaction(adapter, async () => 'never')).rejects.toThrow('begin rejected');
    expect(released).toBe(1);
  });
});
