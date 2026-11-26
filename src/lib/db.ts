import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

// ---------------------------------------------------------------------------
// Database layer: SQLite (local dev, zero-config) or Postgres (production,
// e.g. Neon on Vercel). Chosen automatically from DATABASE_URL.
// All access is async and tenant-scoped by callers via business_id.
// ---------------------------------------------------------------------------

export function isPostgres(): boolean {
  const u = config.databaseUrl ?? '';
  return u.startsWith('postgres://') || u.startsWith('postgresql://');
}

/** Convert `?` placeholders to Postgres `$n`. Skips `?` inside 'quoted' literals. */
export function toPgPlaceholders(sqlText: string): string {
  let i = 0;
  let out = '';
  let inStr = false;
  for (const ch of sqlText) {
    if (ch === "'") { inStr = !inStr; out += ch; continue; }
    if (ch === '?' && !inStr) { i += 1; out += `$${i}`; continue; }
    out += ch;
  }
  return out;
}

/** Dialect-safe date fragments. Stored values are ISO strings (sqlite) / timestamptz (pg). */
export const sql = {
  now: (): string => (isPostgres() ? 'NOW()' : `datetime('now')`),
  today: (col: string): string =>
    isPostgres() ? `DATE(${col}) = CURRENT_DATE` : `date(${col})=date('now')`,
  thisMonth: (col: string): string =>
    isPostgres()
      ? `to_char(${col},'YYYY-MM')=to_char(NOW(),'YYYY-MM')`
      : `strftime('%Y-%m',${col})=strftime('%Y-%m','now')`,
  sinceDays: (col: string, n: number): string =>
    isPostgres() ? `${col} >= NOW() - INTERVAL '${n} days'` : `${col} >= date('now','-${n} days')`,
  dayOf: (col: string): string =>
    (isPostgres() ? `to_char(${col},'YYYY-MM-DD')` : `date(${col})`),
  plusHours: (n: number): string =>
    (isPostgres() ? `NOW() + INTERVAL '${n} hours'` : `datetime('now','+${n} hours')`),
  plusMinutes: (n: number): string =>
    (isPostgres() ? `NOW() + INTERVAL '${n} minutes'` : `datetime('now','+${n} minutes')`),
};

type Row = Record<string, unknown>;

// ---- Postgres pool (serverless-safe singleton) ----
type PgPool = import('pg').Pool;

// DDL for features added after the initial schema snapshot. Runs once per
// process (per lambda instance) — idempotent, safe under concurrency.
const PG_MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS email_outbox (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL DEFAULT '',
    to_addr TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT NOT NULL DEFAULT '',
    provider_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS idx_outbox_status ON email_outbox (status, created_at)`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified integer NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_expires timestamptz`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires timestamptz`,
];

let pool: PgPool | null = null;
async function getPool(): Promise<PgPool> {
  if (pool) return pool;
  const { Pool } = await import('pg');
  const url = config.databaseUrl;
  const sslOff = url.includes('sslmode=disable') || url.includes('localhost') || url.includes('127.0.0.1');
  const p = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 15000,
    ...(sslOff ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  for (const m of PG_MIGRATIONS) {
    try {
      await p.query(m);
    } catch (e) {
      // Loud in Vercel logs; the feature then fails at its own call site.
      console.error('[migrate]', e instanceof Error ? e.message : e);
    }
  }
  pool = p;
  return pool;
}

/** pg returns COUNT/SUM as strings and timestamptz as Date — normalize to sqlite-like shapes. */
function normalizePgRow(row: Row): Row {
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) {
      const n = Number(v);
      if (Number.isFinite(n)) row[k] = n;
    } else if (v instanceof Date) {
      row[k] = v.toISOString();
    }
  }
  return row;
}

// ---- SQLite (dev) ----
type SqliteDb = import('node:sqlite').DatabaseSync;
let sdb: SqliteDb | null = null;

function sqlitePath(): string {
  const u = config.databaseUrl;
  if (u.startsWith('file:')) {
    const rel = u.slice(5);
    return path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
  }
  return path.join(process.cwd(), 'data', 'leadpilot.db');
}

async function getSqlite(): Promise<SqliteDb> {
  if (sdb) return sdb;
  // Vite's resolver bundles do not know Node 24's node:sqlite builtin and try
  // to resolve it as the bare "sqlite" package. Leave the import to Node.
  const { DatabaseSync } = await import(/* @vite-ignore */ 'node:sqlite');
  const p = sqlitePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const fresh = !fs.existsSync(p);
  sdb = new DatabaseSync(p);
  sdb.exec('PRAGMA journal_mode=WAL;');
  const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sqlite.sql'), 'utf8');
  if (fresh) sdb.exec(schema);
  else {
    try { sdb.exec(schema); } catch { /* tables exist */ }
  }
  // Forward-compatible column additions for existing local DBs.
  try { sdb.exec(`ALTER TABLE invoices ADD COLUMN plan TEXT NOT NULL DEFAULT ''`); } catch { /* column exists */ }
  for (const col of [
    `ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN verify_token TEXT`,
    `ALTER TABLE users ADD COLUMN verify_expires TEXT`,
    `ALTER TABLE users ADD COLUMN reset_token TEXT`,
    `ALTER TABLE users ADD COLUMN reset_expires TEXT`,
  ]) { try { sdb.exec(col); } catch { /* column exists */ } }
  return sdb;
}

export async function all<T = Row>(sqlText: string, ...params: unknown[]): Promise<T[]> {
  if (isPostgres()) {
    const converted = toPgPlaceholders(sqlText);
    if (process.env.DEBUG_SQL) console.log('[sql-pg]', converted, '| params:', JSON.stringify(params).slice(0, 200));
    const res = await (await getPool()).query(converted, params as unknown[]);
    return res.rows.map((r) => normalizePgRow({ ...(r as Row) })) as unknown as T[];
  }
  const d = await getSqlite();
  return d.prepare(sqlText).all(...(params as [])) as unknown as T[];
}

export async function get<T = Row>(sqlText: string, ...params: unknown[]): Promise<T | undefined> {
  const rows = await all<T>(sqlText, ...params);
  return rows[0];
}

export async function run(sqlText: string, ...params: unknown[]): Promise<void> {
  if (isPostgres()) {
    await (await getPool()).query(toPgPlaceholders(sqlText), params as unknown[]);
    return;
  }
  const d = await getSqlite();
  d.prepare(sqlText).run(...(params as []));
}

/** Never throws — observability must not break product flows. */
export function logSystem(businessId: string, level: string, scope: string, message: string): void {
  const id = `log_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  run(
    `INSERT INTO system_logs (id, business_id, level, scope, message, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    id, businessId ?? '', level, scope, message.slice(0, 4000), new Date().toISOString(),
  ).catch(() => undefined);
}
