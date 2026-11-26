// One-off: captures the production schema dump into db/schema-dump.json.
// Reads ADMIN_PASSWORD from .env.neon; calls the (temporary) schema-dump route.
import fs from 'node:fs';

const env = fs.readFileSync(new URL('../.env.neon', import.meta.url), 'utf8');
const pick = (k) =>
  env.split(/\r?\n/).find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim().replace(/^"(.*)"$/, '$1');

const res = await fetch('https://leadpilot-sepia-six.vercel.app/api/admin/schema-dump', {
  headers: { 'x-admin-secret': pick('ADMIN_PASSWORD') },
});
const txt = await res.text();
let body;
try {
  body = JSON.parse(txt);
} catch {
  console.error('NON-JSON', res.status, txt.slice(0, 500));
  process.exit(1);
}
if (res.status !== 200) {
  console.error('FAIL', res.status, JSON.stringify(body).slice(0, 300));
  process.exit(1);
}
fs.writeFileSync(new URL('./schema-dump.json', import.meta.url), JSON.stringify(body, null, 2));
const tables = [...new Set(body.columns.map((c) => c.table_name))];
console.log(`tables: ${tables.length} | columns: ${body.columns.length} | indexes: ${body.indexes.length} | fks: ${body.fks.length} | uniques: ${body.uniques.length} | seqs: ${body.sequences.length}`);
console.log('tables:', tables.join(', '));
