// Servidor HTTP do Studio Beauty Barber. Sem dependências externas.
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { cfg } from './config.js';
import { initDb, db } from './db.js';
import { Router, readBody, clientIp, sendJson, sendText, serveStatic, corsHeaders } from './http.js';
import { HttpError } from './util.js';
import { securityHeaders, rateLimit } from './security.js';
import { startScheduler, tick } from './scheduler.js';
import registerAuth from './routes/auth.js';
import registerCatalog from './routes/catalog.js';
import registerAgenda from './routes/agenda.js';
import registerCrm from './routes/crm.js';
import registerSettings, { UPLOAD_DIR } from './routes/settings.js';
import registerPublic from './routes/public.js';
import registerClub from './routes/club.js';
import registerWebhooks from './routes/webhooks.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web');
const LANDING = join(ROOT, 'landing');

const SENT = Symbol('sent');

export function buildRouter() {
  const r = new Router();
  r.get('/healthz', async () => {
    await db.get('SELECT 1 AS ok');
    return { ok: true, time: new Date().toISOString() };
  });
  // Agendador para hospedagem serverless: um serviço externo chama esta rota a cada poucos minutos.
  r.get('/api/cron/tick', async (ctx) => {
    const secret = process.env.CRON_SECRET || '';
    const got = String(ctx.req.headers.authorization || '').replace(/^Bearer /, '');
    if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) throw new HttpError(401, 'Não autorizado.');
    return { ok: true, stats: await tick() };
  });
  for (const reg of [registerAuth, registerCatalog, registerAgenda, registerCrm, registerSettings, registerClub, registerPublic, registerWebhooks]) reg(r);
  return r;
}

export function createHandler({ awaitWebhooks = false } = {}) {
  const router = buildRouter();

  const handler = async (req, res) => {
    const started = Date.now();
    const ip = clientIp(req);
    let status = 500;
    const extraHeaders = {};
    const cookies = [];
    try {
      const url = new URL(req.url, 'http://x');
      const pathname = url.pathname;
      const isApi = pathname.startsWith('/api/') || pathname.startsWith('/webhooks/') || pathname === '/healthz';
      const isPublicApi = pathname.startsWith('/api/public/');

      if (req.method === 'OPTIONS') {
        if (isPublicApi) { status = 204; res.writeHead(204, { ...corsHeaders(req), ...securityHeaders() }); return res.end(); }
        status = 405; res.writeHead(405, securityHeaders()); return res.end();
      }

      // ---------- Arquivos estáticos / páginas ----------
      if (!isApi) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método não permitido.');
        rateLimit(`static:${ip}`, 600, 60_000);
        status = 200;
        let ok = false;
        if (pathname === '/') ok = serveStatic(req, res, WEB, 'index.html');
        else if (pathname.startsWith('/s/')) ok = serveStatic(req, res, WEB, 'booking.html');
        else if (pathname === '/site' || pathname === '/site/') ok = serveStatic(req, res, LANDING, 'index.html');
        else if (pathname.startsWith('/site/')) ok = serveStatic(req, res, LANDING, pathname.slice(6));
        else if (pathname.startsWith('/uploads/')) {
          const row = await db.get('SELECT logo_data, logo_mime FROM salons WHERE logo_path = ?', [decodeURIComponent(pathname.slice(9))]);
          if (row?.logo_data) {
            const buf = Buffer.from(row.logo_data, 'base64');
            res.writeHead(200, { 'Content-Type': row.logo_mime, 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=3600', ...securityHeaders() });
            res.end(req.method === 'HEAD' ? undefined : buf); ok = true;
          }
        }
        else if (pathname === '/robots.txt') { sendText(res, 200, 'User-agent: *\nDisallow: /\n'); ok = true; }
        else if (pathname === '/.well-known/security.txt') {
          sendText(res, 200, 'Contact: mailto:seguranca@studiobeautybarber.com\nPreferred-Languages: pt, en\nExpires: 2027-12-31T23:59:00.000Z\n'); ok = true;
        } else ok = serveStatic(req, res, WEB, pathname.slice(1));
        if (!ok) { status = 404; sendText(res, 404, 'Não encontrado'); }
        return;
      }

      // ---------- API ----------
      const m = router.match(req.method, pathname);
      if (!m.route) {
        status = m.pathExists ? 405 : 404;
        return sendJson(res, status, { error: m.pathExists ? 'Método não permitido.' : 'Rota não encontrada.' });
      }
      rateLimit(`api:${ip}`, 600, 60_000);

      const ctx = {
        req, res, url, ip, query: Object.fromEntries(url.searchParams), params: m.params,
        body: null, rawBody: Buffer.alloc(0), awaitWebhooks,
        user: null, salon: null,
        setCookie: (c) => cookies.push(c),
        text: (s, t) => { res.writeHead(s, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders() }); res.end(t); status = s; return SENT; },
      };
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const limit = pathname === '/api/settings/logo' ? cfg.maxUploadBytes + 1024 : cfg.maxBodyBytes;
        ctx.rawBody = await readBody(req, limit);
        const ct = String(req.headers['content-type'] || '');
        if (ctx.rawBody.length && ct.includes('json')) {
          try { ctx.body = JSON.parse(ctx.rawBody.toString('utf8')); } catch { throw new HttpError(400, 'JSON inválido.'); }
        }
      }

      let result;
      for (const fn of m.route.chain) {
        result = await fn(ctx);
        if (result !== undefined) break;
      }
      if (result === SENT) return;
      status = 200;
      if (isPublicApi) Object.assign(extraHeaders, corsHeaders(req));
      if (cookies.length) extraHeaders['Set-Cookie'] = cookies;
      return sendJson(res, 200, result ?? { ok: true }, extraHeaders);
    } catch (e) {
      const isHttp = e instanceof HttpError;
      status = isHttp ? e.status : 500;
      if (!isHttp) console.error('[erro]', req.method, req.url.split('?')[0], e.stack || e.message);
      if (req.url.startsWith('/api/public/')) Object.assign(extraHeaders, corsHeaders(req));
      if (cookies.length) extraHeaders['Set-Cookie'] = cookies;
      if (isHttp && e.extra?.retryAfter) extraHeaders['Retry-After'] = String(e.extra.retryAfter);
      if (!res.headersSent) {
        sendJson(res, status, { error: isHttp ? e.message : 'Erro interno. Tente novamente em instantes.', ...(isHttp && e.extra?.errors ? { fields: e.extra.errors } : {}) }, extraHeaders);
      }
    } finally {
      if (process.env.LOG_REQUESTS !== 'false') {
        // Log sem corpo, sem query string e sem cookies (nada de dados pessoais).
        console.log(`${new Date().toISOString()} ${req.method} ${req.url.split('?')[0]} ${status} ${Date.now() - started}ms`);
      }
    }
  };
  return handler;
}

export function createApp({ awaitWebhooks = false } = {}) {
  const server = http.createServer(createHandler({ awaitWebhooks }));
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 65_000;
  return server;
}

export async function start() {
  await initDb();
  const { ensureHq } = await import('./seed.js');
  await ensureHq();
  const server = createApp();
  server.listen(cfg.port, () => console.log(`Studio Beauty Barber no ar: ${cfg.baseUrl} (${cfg.isProd ? 'produção' : 'desenvolvimento'}, banco: ${db.kind})`));
  startScheduler();
  const shutdown = () => { server.close(() => db.close().finally(() => process.exit(0))); setTimeout(() => process.exit(1), 10_000).unref(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((e) => { console.error('Falha ao iniciar:', e.message); process.exit(1); });
}
