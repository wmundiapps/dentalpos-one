import { Pool } from 'pg';
import { migrate } from '../lib/migrate';
export default async function () {
  const p = new Pool({ connectionString: process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5433/cashbacksmart_test' });
  await p.query('drop schema public cascade; create schema public;');
  await migrate(p);
  await p.end();
}
