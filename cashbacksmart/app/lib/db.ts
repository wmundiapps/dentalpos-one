import { Pool, PoolClient, QueryResultRow } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __ctPool: Pool | undefined;
}

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não configurada');
  const local = /localhost|127\.0\.0\.1/.test(url);
  return new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX || 5),
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
}

export function pool(): Pool {
  if (!global.__ctPool) global.__ctPool = makePool();
  return global.__ctPool;
}

export type Db = Pick<PoolClient, 'query'>;

export async function q<T extends QueryResultRow = any>(text: string, params: unknown[] = [], db: Db = pool()): Promise<T[]> {
  const r = await db.query<T>(text, params as any[]);
  return r.rows;
}

export async function one<T extends QueryResultRow = any>(text: string, params: unknown[] = [], db: Db = pool()): Promise<T | null> {
  const rows = await q<T>(text, params, db);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query('begin');
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}
