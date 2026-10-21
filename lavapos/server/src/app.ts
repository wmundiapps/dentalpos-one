import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { loadUser, requireUser, requirePlatform, requireOwner, type AuthedRequest } from './auth.js';
import { HttpError, errorHandler, rateLimit, securityHeaders } from './security.js';
import { safeEqual } from './secure.js';
import { authRouter } from './routes/auth.js';
import { recordsRouter } from './routes/records.js';
import { ordersRouter } from './routes/orders.js';
import { photosRouter } from './routes/photos.js';
import { agendaRouter } from './routes/agenda.js';
import { clubRouter } from './routes/club.js';
import { financeRouter } from './routes/finance.js';
import { dashboardRouter } from './routes/dashboard.js';
import { settingsRouter } from './routes/settings.js';
import { showcaseRouter } from './routes/showcase.js';
import { publicRouter } from './routes/public.js';
import { platformRouter } from './routes/platform.js';
import { webhooksRouter } from './routes/webhooks.js';
import { runJobs } from './jobs.js';

const SITE_ORIGINS = ['https://app.lavapos.com.br', 'https://lavapos.com.br', 'https://www.lavapos.com.br', 'capacitor://localhost', 'https://localhost', 'http://localhost'];
function allowedOrigins(): string[] | boolean {
  if (process.env.CORS_ORIGIN) return process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  if (process.env.NODE_ENV !== 'production') return true;
  return [...SITE_ORIGINS, ...(process.env.APP_URL ? [process.env.APP_URL.replace(/\/$/, '')] : [])];
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(cors({ origin: allowedOrigins(), methods: ['GET', 'POST', 'PUT', 'DELETE'], maxAge: 600 }));
  app.use('/api', securityHeaders);
  app.use('/api', rateLimit('api', 600, 60)); // teto geral por IP
  app.use('/api', (req: Request, _res: Response, next: NextFunction) => {
    // Defesa contra CSRF/abuso: escrita só com JSON (ou imagem nas fotos); formulário de outro site não consegue enviar isso sem passar pelo CORS
    if (['POST', 'PUT'].includes(req.method) && req.path !== '/photos' && req.headers['content-length'] !== '0' && !req.is('application/json')) return next(new HttpError(415, 'Formato não aceito.', 'formato'));
    next();
  });
  app.use('/api/photos', loadUser, requireUser, photosRouter); // corpo bruto (imagem) — antes do express.json
  app.use('/api/webhooks', webhooksRouter); // confere o token ANTES de ler o corpo (tem o próprio express.json, depois da autenticação)
  app.use(express.json({ limit: '200kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);

  // Rotina periódica: Vercel Cron envia "Authorization: Bearer CRON_SECRET"
  app.all('/api/cron/tick', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const got = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!secret || !got || !safeEqual(got, secret)) throw new HttpError(401, 'Não autorizado.', 'sem_permissao');
    res.json(await runJobs());
  });

  const guarded = [loadUser, requireUser] as const;
  app.use('/api/platform', ...guarded, requirePlatform, platformRouter);
  app.use('/api/r', ...guarded, recordsRouter);
  app.use('/api/orders', ...guarded, ordersRouter);
  app.use('/api/agenda', ...guarded, agendaRouter);
  app.use('/api/club', ...guarded, clubRouter);
  app.use('/api/finance', ...guarded, financeRouter);
  app.use('/api/dashboard', ...guarded, dashboardRouter);
  app.use('/api/settings', ...guarded, settingsRouter);
  app.use('/api/showcase', ...guarded, showcaseRouter);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.', 'nao_encontrado')));
  app.use(errorHandler);
  return app;
}
