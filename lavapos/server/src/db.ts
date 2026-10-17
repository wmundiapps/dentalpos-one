// Conexão com PostgreSQL, transações e migrações versionadas (server/migrations/*.sql).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

try { process.loadEnvFile(); } catch { /* sem .env */ }

pg.types.setTypeParser(1700, (v) => Number(v));
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://lavapos:lavapos@localhost:5432/lavapos',
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

export interface Db {
  query<R extends pg.QueryResultRow = Record<string, unknown>>(text: string, params?: unknown[]): Promise<pg.QueryResult<R>>;
}

export async function rows<R extends pg.QueryResultRow = Record<string, any>>(db: Db, text: string, params: unknown[] = []): Promise<R[]> {
  return (await db.query<R>(text, params)).rows;
}

export async function one<R extends pg.QueryResultRow = Record<string, any>>(db: Db, text: string, params: unknown[] = []): Promise<R | undefined> {
  return (await db.query<R>(text, params)).rows[0];
}

export async function withTx<T>(fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Trava exclusiva até o fim da transação (ex.: agenda de um lava-rápido). */
export async function lockKey(tx: Db, key: string) {
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
}

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate(log = true): Promise<string[]> {
  return withTx(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(424243)');
    await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const done = new Set((await rows<{ version: string }>(tx, 'SELECT version FROM schema_migrations')).map((r) => r.version));
    const applied: string[] = [];
    for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      await tx.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      applied.push(file);
      if (log) console.log(`[db] migração aplicada: ${file}`);
    }
    return applied;
  });
}

/** Esvazia tudo (somente testes). */
export async function resetForTests() {
  if (process.env.NODE_ENV === 'production') throw new Error('proibido em produção');
  await pool.query('TRUNCATE photos, rate_hits, audit_log, optouts, outbox, records, users, tenants RESTART IDENTITY CASCADE');
}
