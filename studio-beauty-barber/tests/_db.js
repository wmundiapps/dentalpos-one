// Banco dos testes: SQLite em memória por padrão; com TEST_DATABASE_URL roda contra um PostgreSQL de teste (apaga tudo no schema public!).
export async function openTestDb(initDb) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return initDb({ sqlitePath: ':memory:' });
  if (!/localhost|127\.0\.0\.1|test/i.test(url)) throw new Error('TEST_DATABASE_URL precisa apontar para um banco local ou de teste.');
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await c.end();
  return initDb({ databaseUrl: url });
}
