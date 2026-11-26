// Upserts Vercel project environment variables.
// Usage:
//   $env:VERCEL_TOKEN='...'; node ./db/vercel-env.mjs KEY=value OTHER=value [--target production]
// Without values, it prints current vars (values redacted).
import fs from 'node:fs';

const TOKEN = process.env.VERCEL_TOKEN;
if (!TOKEN) { console.error('VERCEL_TOKEN required'); process.exit(1); }
const link = JSON.parse(fs.readFileSync(new URL('../.vercel/project.json', import.meta.url), 'utf8'));
const { projectId, orgId } = link;
const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const target = targetIdx >= 0 ? args[targetIdx + 1] : 'production';
const pairs = args.filter((a, i) => i !== targetIdx && i !== targetIdx + 1 && a.includes('='));
const hdr = { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const api = (path, init = {}) => fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${orgId}`, { ...init, headers: { ...hdr, ...(init.headers ?? {}) } });

if (pairs.length === 0) {
  const r = await api(`/v10/projects/${projectId}/env`);
  const j = await r.json();
  for (const e of j.envs ?? []) console.log(`${e.key} | target=${(e.target ?? []).join(',')} | ${String(e.value ?? '').slice(0, 6)}…`);
  process.exit(0);
}

const list = await (await api(`/v10/projects/${projectId}/env`)).json();
for (const pair of pairs) {
  const eq = pair.indexOf('=');
  const key = pair.slice(0, eq);
  const value = pair.slice(eq + 1);
  const existing = (list.envs ?? []).find((e) => e.key === key);
  if (existing) {
    const r = await api(`/v10/projects/${projectId}/env/${existing.id}`, {
      method: 'PATCH', body: JSON.stringify({ value, target: existing.target ?? [target] }),
    });
    console.log(`${r.ok ? 'updated' : 'UPDATE FAILED'} ${key} (${r.status})`);
  } else {
    const r = await api(`/v10/projects/${projectId}/env`, {
      method: 'POST', body: JSON.stringify({ key, value, type: 'encrypted', target: [target] }),
    });
    console.log(`${r.ok ? 'created' : 'CREATE FAILED'} ${key} (${r.status})`);
  }
}
console.log('Note: changes apply on next deployment (vercel.cmd --prod --yes).');
