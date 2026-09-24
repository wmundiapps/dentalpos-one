import { createApp } from './app';
import { db, flush } from './db';
import { seed } from './seed';
import { tick } from './bookings';

if (db.users.length === 0) {
  seed();
  flush();
  console.log('Banco vazio: dados de demonstração criados (senha de todos os usuários demo: demo12345).');
}

const port = Number(process.env.PORT ?? 4000);
createApp().listen(port, () => console.log(`SpaceHour API em http://localhost:${port}/api`));
setInterval(() => tick(), 60000).unref();
process.on('SIGINT', () => { flush(); process.exit(0); });
process.on('SIGTERM', () => { flush(); process.exit(0); });
