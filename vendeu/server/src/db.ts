import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

pg.types.setTypeParser(20, (v) => Number(v)); // bigint → number (valores em centavos cabem com folga)

const DEFAULT_URL = 'postgresql://vendeu:vendeu@localhost:5432/vendeu';
const connectionString = process.env.DATABASE_URL ?? DEFAULT_URL;
export const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX ?? 5),
  ssl: /supabase|neon|amazonaws|render/.test(connectionString) && !/localhost/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
});

export type Db = Pick<pg.Pool, 'query'>;

export const id = (prefix: string) => `${prefix}_${crypto.randomBytes(12).toString('base64url')}`;

export async function one<T = any>(db: Db, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await db.query(sql, params)).rows[0] as T | undefined;
}
export async function many<T = any>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query(sql, params)).rows as T[];
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Aplica as migrações em ordem; cada arquivo roda uma vez (nunca edite uma já publicada). */
export async function migrate(log = true) {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(727401)');
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const f of fs.readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      await c.query('BEGIN');
      try {
        await c.query(fs.readFileSync(path.join(migrationsDir, f), 'utf8'));
        await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await c.query('COMMIT');
        if (log) console.log(`migração aplicada: ${f}`);
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock(727401)').catch(() => {});
    c.release();
  }
}

/** Só para testes: apaga tudo. */
export async function dropAll() {
  if (!/_test(\?|$)/.test(new URL(connectionString).pathname)) throw new Error('dropAll só roda em banco *_test');
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}
