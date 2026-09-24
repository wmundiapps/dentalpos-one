import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { HttpError } from './auth';
import { authRouter } from './routes/auth';
import { listingsRouter } from './routes/listings';
import { bookingsRouter } from './routes/bookings';
import { tick } from './bookings';

export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }));
  app.use(express.json({ limit: '1mb' }));

  // Rotina periódica também roda "sob demanda" (no máx. a cada 30 s)
  let lastTick = 0;
  app.use((_req, _res, next) => {
    if (Date.now() - lastTick > 30000) {
      lastTick = Date.now();
      tick();
    }
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', authRouter, listingsRouter, bookingsRouter);

  app.use((_req, _res, next) => next(new HttpError(404, 'not_found')));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, params: err.params });
    if (err instanceof ZodError) return res.status(422).json({ error: 'validation', params: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    console.error(err);
    res.status(500).json({ error: 'internal' });
  });
  return app;
}
