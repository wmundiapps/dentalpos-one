// Função serverless da Vercel: leva todas as chamadas de /api, /webhooks, /healthz e /uploads para o servidor do app.
import { createHandler } from '../server/index.js';
import { initDb } from '../server/db.js';
import { ensureHq } from '../server/seed.js';

let ready = null;
let handler = null;

const unavailable = (res, msg) => {
  res.statusCode = 503;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: msg }));
};

export default async function (req, res) {
  if (!process.env.DATABASE_URL) return unavailable(res, 'Banco de dados ainda não configurado.');
  try {
    ready ??= (async () => { await initDb(); await ensureHq(); handler = createHandler(); })();
    await ready;
  } catch (e) {
    ready = null; // tenta de novo na próxima chamada
    console.error('[inicialização]', e.message);
    return unavailable(res, 'Serviço iniciando. Tente novamente em instantes.');
  }
  return handler(req, res);
}
