import { execSync } from 'child_process';
import { Pool } from 'pg';
import { migrate } from '../lib/migrate';

export default async function () {
  const url = process.env.E2E_DATABASE_URL || 'postgres://postgres@localhost:5433/cashbacksmart_e2e';
  const p = new Pool({ connectionString: url });
  await p.query('drop schema public cascade; create schema public;');
  await migrate(p);
  await p.end();
  execSync('npx tsx scripts/seed.ts', { env: { ...process.env, DATABASE_URL: url, ADMIN_EMAIL: 'admin@e2e.com', ADMIN_PASSWORD: 'Painel#Seguro2026', SEED_DEMO: '1' }, stdio: 'inherit' });
}
