// Aplica as migrações de migrations/*.sql que ainda não rodaram (registro em schema_migrations).
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db, SCHEMA, databaseUrl } from '../lib/db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate() {
  const sql = db();
  await sql.unsafe(`create schema if not exists ${SCHEMA}`);
  const table = `${SCHEMA}.schema_migrations`;
  await sql.unsafe(`create table if not exists ${table} (name text primary key, applied_at timestamptz not null default now())`);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const body = await readFile(path.join(dir, f), 'utf8');
    await sql.begin(async (tx) => {
      // Trava para dois builds simultâneos não aplicarem a mesma migração
      await tx.unsafe(`select pg_advisory_xact_lock(hashtext('${SCHEMA}.migrations'))`);
      const [already] = await tx.unsafe(`select 1 from ${table} where name = $1`, [f]);
      if (already) return;
      await tx.unsafe(`set local search_path to ${SCHEMA}`);
      await tx.unsafe(body);
      await tx.unsafe(`insert into ${table} (name) values ($1)`, [f]);
      console.log('migração aplicada:', f);
    });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (!databaseUrl()) {
    console.log('DATABASE_URL ausente — migrações ignoradas neste build.');
    process.exit(0);
  }
  migrate()
    .then(() => { console.log('migrações ok'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
