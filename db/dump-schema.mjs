// Dumps the live Postgres schema (tables, columns, constraints, indexes) as JSON.
// Usage: node ./db/dump-schema.mjs  (reads DATABASE_URL from .env)
import fs from 'node:fs';

// Minimal .env loader (no dotenv dependency).
const envText = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const dbUrl = envText.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='))?.slice('DATABASE_URL='.length).trim().replace(/^"(.*)"$/, '$1');
if (!dbUrl?.startsWith('postgres')) { console.error('DATABASE_URL (postgres) not found in .env'); process.exit(1); }

const pgMod = await import('pg');
const Pool = pgMod.Pool ?? pgMod.default?.Pool;
const pool = new Pool({ connectionString: dbUrl, max: 1, ssl: { rejectUnauthorized: false } });

const cols = await pool.query(`
  SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, ordinal_position
  FROM information_schema.columns
  WHERE table_schema='public' AND table_type='BASE TABLE'
  ORDER BY table_name, ordinal_position`);
const pks = await pool.query(`
  SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name AND kcu.table_schema=tc.table_schema
  WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public'`);
const fks = await pool.query(`
  SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_column, rc.delete_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name AND kcu.table_schema=tc.table_schema
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema
  JOIN information_schema.referential_constraints rc ON rc.constraint_name=tc.constraint_name AND rc.table_schema=tc.table_schema
  WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'`);
const uniques = await pool.query(`
  SELECT tc.table_name, string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS cols
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name AND kcu.table_schema=tc.table_schema
  WHERE tc.constraint_type='UNIQUE' AND tc.table_schema='public'
  GROUP BY tc.table_name, tc.constraint_name`);
const idx = await pool.query(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public'`);
const seqs = await pool.query(`SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public'`);
await pool.end();

const dump = { columns: cols.rows, pks: pks.rows, fks: fks.rows, uniques: uniques.rows, indexes: idx.rows, sequences: seqs.rows };
fs.writeFileSync(new URL('./schema-dump.json', import.meta.url), JSON.stringify(dump, null, 2));
console.log(`tables: ${new Set(cols.rows.map((r) => r.table_name)).size}, columns: ${cols.rows.length}, indexes: ${idx.rows.length}, sequences: ${seqs.rows.length}`);
