// Applies db/schema.postgres.sql to the Postgres database in .env.neon (or DATABASE_URL).
// Usage: node ./db/migrate-pg.mjs
import fs from 'node:fs';

function loadUrl() {
  if (process.env.DATABASE_URL?.startsWith('postgres')) return process.env.DATABASE_URL;
  const env = fs.readFileSync(new URL('../.env.neon', import.meta.url), 'utf8');
  return env
    .split(/\r?\n/)
    .find((l) => l.startsWith('DATABASE_URL='))
    ?.slice('DATABASE_URL='.length)
    .trim()
    .replace(/^"(.*)"$/, '$1');
}

const url = loadUrl();
if (!url?.startsWith('postgres')) {
  console.error('No postgres DATABASE_URL found');
  process.exit(1);
}
const pgMod = await import('pg');
const Pool = pgMod.Pool ?? pgMod.default?.Pool;
const pool = new Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
const sqlText = fs.readFileSync(new URL('./schema.postgres.sql', import.meta.url), 'utf8');
try {
  await pool.query(sqlText); // multi-statement simple query — no params
  const t = await pool.query(`SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`);
  console.log(`migrate ok | public tables: ${t.rows[0].n}`);
} catch (e) {
  console.error('migrate failed:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
