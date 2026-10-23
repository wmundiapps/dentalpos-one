import { Pool } from 'pg';
import { migrate } from '../lib/migrate';
(async () => {
  const url = process.env.DATABASE_URL!;
  const p = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  const applied = await migrate(p);
  console.log(applied.length ? 'Aplicadas: ' + applied.join(', ') : 'Nada a aplicar');
  await p.end();
})().catch((e) => { console.error(e); process.exit(1); });
