import { createApp } from './app';
import { migrate, one, pool } from './db';
import { seed } from './seed';
import { runJobs } from './jobs';

await migrate();
const empty = !(await one(pool, 'SELECT 1 FROM users LIMIT 1'));
if (empty && process.env.SEED_DEMO !== 'false') {
  await seed();
  console.log('Banco vazio: dados de demonstração criados (senha de todos os usuários demo: demo12345).');
}

const port = Number(process.env.PORT ?? 4000);
const server = createApp().listen(port, () => console.log(`SpaceHour API em http://localhost:${port}/api`));

// Rotina periódica (expirações, repasses, caução, avaliações). Seguro com
// várias instâncias: cada reserva é tratada com a linha travada.
let running = false;
const timer = setInterval(async () => {
  if (running) return;
  running = true;
  try { await runJobs(); } catch (e) { console.error('[jobs]', e); } finally { running = false; }
}, Number(process.env.TICK_INTERVAL_MS ?? 60000));

async function shutdown() {
  clearInterval(timer);
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
