import { describe, it, expect } from 'vitest';
import { withTransaction, type TransactionAdapter, type TransactionClient } from '../src/lib/transaction';

function fakeAdapter() {
  const calls: string[] = [];
  const client: TransactionClient = { query: async () => [] };
  const adapter: TransactionAdapter = {
    begin: async () => { calls.push('begin'); return client; },
    commit: async () => { calls.push('commit'); },
    rollback: async () => { calls.push('rollback'); },
    release: async () => { calls.push('release'); },
  };
  return { adapter, calls, client };
}

describe('withTransaction', () => {
  it('commits and releases on success, passing one client to all work', async () => {
    const { adapter, calls, client } = fakeAdapter();
    const seen: TransactionClient[] = [];
    const value = await withTransaction(adapter, async (tx) => {
      seen.push(tx);
      tx.query('SELECT 1');
      return 'ok';
    });
    expect(value).toBe('ok');
    expect(seen).toEqual([client]);
    expect(calls).toEqual(['begin', 'commit', 'release']);
  });

  it('rolls back and releases on failure, preserving the error', async () => {
    const { adapter, calls } = fakeAdapter();
    await expect(withTransaction(adapter, async () => {
      throw new Error('conflict');
    })).rejects.toThrow('conflict');
    expect(calls).toEqual(['begin', 'rollback', 'release']);
  });

  it('does not commit when release itself is needed after a thrown error', async () => {
    const { adapter, calls } = fakeAdapter();
    try { await withTransaction(adapter, async () => { throw new Error('x'); }); } catch { /* expected */ }
    expect(calls).not.toContain('commit');
  });
});
