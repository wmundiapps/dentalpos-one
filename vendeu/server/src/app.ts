import cookieParser from 'cookie-parser';
import express from 'express';
import { csrfGuard, sessionMiddleware } from './auth.js';
import { errorHandler, HttpError, wrap } from './http.js';
import { runDaily } from './jobs.js';
import { adminRouter } from './routes/admin.js';
import { authRouter, meRouter } from './routes/auth.js';
import { kycRouter } from './routes/kyc.js';
import { lgpdRouter } from './routes/lgpd.js';
import { listingsRouter } from './routes/listings.js';
import { messagesRouter } from './routes/messages.js';
import { publicRouter } from './routes/public.js';
import { closeRouter, purchasesRouter, salesRouter, webhookRouter } from './routes/sales.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    next();
  });
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use(csrfGuard);
  app.use(sessionMiddleware);

  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });
  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/me/lgpd', lgpdRouter);
  app.use('/api/kyc', kycRouter);
  app.use('/api/listings', listingsRouter);
  app.use('/api/listings', closeRouter);
  app.use('/api/messages', messagesRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/purchases', purchasesRouter);
  app.use('/api/webhooks', webhookRouter);
  app.use('/api/admin', adminRouter);
  app.get('/api/cron/daily', wrap(async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'unauthorized');
    res.json(await runDaily());
  }));
  app.use('/api', publicRouter);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found')));
  app.use(errorHandler);
  return app;
}
