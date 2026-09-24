// Conexão com PostgreSQL, transações e migrações versionadas (server/migrations/*.sql).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Carrega server/.env se existir (variáveis já definidas no ambiente têm prioridade)
try { process.loadEnvFile(); } catch { /* sem .env */ }

// NUMERIC e BIGINT como number; DATE como texto 'YYYY-MM-DD' (sem fuso)
pg.types.setTypeParser(1700, (v) => Number(v));
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1082, (v) => v);
// DATE[] (oid 1182, ausente do enum de tipos do driver) como lista de 'YYYY-MM-DD'
(pg.types.setTypeParser as (oid: number, parse: (v: string) => unknown) => void)(1182, (v) => (v === '{}' ? [] : v.slice(1, -1).split(',')));

const DEFAULT_URL = 'postgresql://spacehour:spacehour@localhost:5432/spacehour';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? DEFAULT_URL,
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

/** Executor de consultas: o pool ou o cliente de uma transação. */
export interface Db {
  query<R extends pg.QueryResultRow = Record<string, unknown>>(text: string, params?: unknown[]): Promise<pg.QueryResult<R>>;
}

export async function rows<R extends pg.QueryResultRow = Record<string, any>>(db: Db, text: string, params: unknown[] = []): Promise<R[]> {
  return (await db.query<R>(text, params)).rows;
}

export async function one<R extends pg.QueryResultRow = Record<string, any>>(db: Db, text: string, params: unknown[] = []): Promise<R | undefined> {
  return (await db.query<R>(text, params)).rows[0];
}

/** Executa fn numa transação; desfaz tudo se houver erro. */
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

/** Trava exclusiva por chave até o fim da transação (ex.: agenda de um espaço). */
export async function lockKey(tx: Db, key: string) {
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
}

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate(log = true): Promise<string[]> {
  return withTx(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(424242)'); // evita duas instâncias migrando juntas
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

/** Apaga todas as tabelas (somente para testes e `npm run db:reset`). */
export async function dropAll() {
  if (process.env.NODE_ENV === 'production') throw new Error('dropAll bloqueado em produção');
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}

export const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
export const token = () => crypto.randomBytes(24).toString('base64url');
export const nowIso = () => new Date().toISOString();
