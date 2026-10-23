import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export async function migrate(p: Pool, dir = path.join(process.cwd(), 'db', 'migrations')) {
  await p.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await p.query('select name from schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const c = await p.connect();
    try {
      await c.query('begin');
      await c.query(sql);
      await c.query('insert into schema_migrations (name) values ($1)', [f]);
      await c.query('commit');
      applied.push(f);
    } catch (e) {
      await c.query('rollback');
      throw new Error(`Falha na migração ${f}: ${(e as Error).message}`);
    } finally {
      c.release();
    }
  }
  return applied;
}
