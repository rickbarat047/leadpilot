'use client';
import { useEffect, useState } from 'react';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(path: string, init?: RequestInit, retries = 1): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  try {
    const r = await fetch(path, init);
    const text = await r.text();
    let j: Record<string, unknown> = {};
    try { j = text ? JSON.parse(text) : {}; }
    catch {
      if (retries > 0 && r.status >= 500) { await sleep(2000); return fetchJson(path, init, retries - 1); }
      throw new Error('Server hiccup — retrying automatically failed. Reload the page.');
    }
    if (!r.ok && r.status >= 500 && retries > 0) { await sleep(2000); return fetchJson(path, init, retries - 1); }
    return { ok: r.ok, status: r.status, json: j };
  } catch (e) {
    if (retries > 0 && e instanceof TypeError) { await sleep(2000); return fetchJson(path, init, retries - 1); }
    throw e;
  }
}

export function useApi<T>(path: string): { data: T | null; error: string; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fetchJson(path).then(({ ok, status, json }) => {
      if (!live) return;
      if (status === 401) { window.location.href = '/login'; return; }
      if (!ok) setError((json.error as string) || 'Failed');
      else setData(json as T);
    }).catch((e) => live && setError(e instanceof Error ? e.message : 'Failed'));
    return () => { live = false; };
  }, [path, tick]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

export async function api(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const { ok, status, json } = await fetchJson(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (!ok) throw new Error((json.error as string) || `Request failed (${status})`);
  return json;
}
