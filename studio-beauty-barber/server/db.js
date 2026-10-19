// Adaptador de banco: SQLite (node:sqlite, piloto/dev/testes) ou PostgreSQL (produção, via DATABASE_URL).
// O SQL do projeto usa "?" como parâmetro; no Postgres é convertido para $1, $2...
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { cfg } from './config.js';
import { MIGRATIONS } from './schema.js';
import { nowIso } from './util.js';

let impl = null;

const norm = (params = []) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

async function openSqlite(path) {
  const { DatabaseSync } = await import('node:sqlite');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 5000;');

  // Transações são serializadas: uma conexão só, então nada pode se intercalar dentro de BEGIN/COMMIT.
  let chain = Promise.resolve();
  const exec = {
    all: async (sql, p) => raw.prepare(sql).all(...norm(p)).map((r) => ({ ...r })),
    get: async (sql, p) => { const r = raw.prepare(sql).get(...norm(p)); return r ? { ...r } : undefined; },
    run: async (sql, p) => { const r = raw.prepare(sql).run(...norm(p)); return { changes: Number(r.changes) }; },
    exec: async (sql) => { raw.exec(sql); },
  };
  return {
    kind: 'sqlite',
    ...exec,
    tx(fn) {
      const job = chain.then(async () => {
        raw.exec('BEGIN IMMEDIATE');
        try {
          const out = await fn(exec);
          raw.exec('COMMIT');
          return out;
        } catch (e) {
          try { raw.exec('ROLLBACK'); } catch { /* já revertido */ }
          throw e;
        }
      });
      chain = job.catch(() => {});
      return job;
    },
    close: async () => raw.close(),
  };
}

async function openPg(url) {
  let pg;
  try { pg = await import('pg'); } catch {
    throw new Error('DATABASE_URL definido, mas o pacote "pg" não está instalado. Rode: npm install');
  }
  const Pool = pg.default?.Pool || pg.Pool;
  // COUNT/SUM voltam como texto no Postgres; o projeto guarda dinheiro em centavos inteiros, então número é seguro.
  const types = pg.default?.types || pg.types;
  types.setTypeParser(20, (v) => Number(v));
  types.setTypeParser(1700, (v) => Number(v));
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX || 10),
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });
  const conv = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
  const mk = (client) => ({
    all: async (sql, p) => (await client.query(conv(sql), norm(p))).rows,
    get: async (sql, p) => (await client.query(conv(sql), norm(p))).rows[0],
    run: async (sql, p) => ({ changes: (await client.query(conv(sql), norm(p))).rowCount }),
    exec: async (sql) => { await client.query(sql); },
  });
  return {
    kind: 'pg',
    ...mk(pool),
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const out = await fn(mk(c));
        await c.query('COMMIT');
        return out;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally { c.release(); }
    },
    close: async () => pool.end(),
  };
}

export async function initDb({ sqlitePath, databaseUrl } = {}) {
  const url = databaseUrl ?? cfg.databaseUrl;
  impl = url ? await openPg(url) : await openSqlite(sqlitePath ?? cfg.sqlitePath);
  await impl.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const m of MIGRATIONS) {
    const done = await impl.get('SELECT id FROM schema_migrations WHERE id = ?', [m.id]);
    if (done) continue;
    await impl.exec(m.sql);
    await impl.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [m.id, nowIso()]);
  }
  return db;
}

const need = () => { if (!impl) throw new Error('Banco não inicializado (chame initDb).'); return impl; };

export const db = {
  get kind() { return need().kind; },
  all: (sql, p) => need().all(sql, p),
  get: (sql, p) => need().get(sql, p),
  run: (sql, p) => need().run(sql, p),
  exec: (sql) => need().exec(sql),
  tx: (fn) => need().tx(fn),
  close: () => (impl ? impl.close() : undefined),
};
