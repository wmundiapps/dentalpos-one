import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { HttpError } from './auth';
import { authRouter } from './routes/auth';
import { listingsRouter } from './routes/listings';
import { bookingsRouter } from './routes/bookings';
import { webhooksRouter } from './routes/webhooks';
import { filesRouter } from './routes/files';
import { feedbackRouter } from './routes/feedback';
import { runJobs } from './jobs';

export function createApp() {
  if (process.env.NODE_ENV === 'production' && !process.env.DOCUMENT_ENCRYPTION_KEY) {
    console.error('[segurança] DOCUMENT_ENCRYPTION_KEY ausente: envio de documentos de registro ficará indisponível');
  }
  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }));
  app.set('trust proxy', 1);
  app.use('/api', webhooksRouter); // corpo bruto (assinatura) — antes do express.json
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  // Rotina periódica disparada pelo Vercel Cron (Authorization: Bearer CRON_SECRET)
  app.get('/api/cron/tick', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'unauthorized');
    res.json(await runJobs());
  });
  app.use('/api', authRouter, listingsRouter, bookingsRouter, filesRouter, feedbackRouter);

  app.use((_req, _res, next) => next(new HttpError(404, 'not_found')));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, params: err.params });
    if (err instanceof ZodError) return res.status(422).json({ error: 'validation', params: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr.code === '23505' && pgErr.constraint === 'users_email_key') return res.status(409).json({ error: 'email_in_use' });
    if (pgErr.code === '23505' && pgErr.constraint === 'reviews_one_per_side_idx') return res.status(409).json({ error: 'already_reviewed' });
    console.error(err);
    res.status(500).json({ error: 'internal' });
  });
  return app;
}
