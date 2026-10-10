import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { assistantRouter } from './routes/assistant.js';
import { waitUntil } from '@vercel/functions';
import { flushPushQueue, pushConfigured } from './push.js';
import { flushEmailQueue, verifySmtp } from './mailer.js';
import { ZodError } from 'zod';
import { HttpError, adminEmails, isAdminEmail, optionalAuth, type AuthedRequest } from './auth.js';
import { authRouter } from './routes/auth.js';
import { listingsRouter } from './routes/listings.js';
import { bookingsRouter } from './routes/bookings.js';
import { webhooksRouter } from './routes/webhooks.js';
import { filesRouter } from './routes/files.js';
import { feedbackRouter } from './routes/feedback.js';
import { payoutsRouter } from './routes/payouts.js';
import { marketingRouter } from './routes/marketing.js';
import { prospectingRouter } from './routes/prospecting.js';
import { runJobs } from './jobs.js';
import { one, pool } from './db.js';
import { marketplaceEnabled } from './payments/mpAccounts.js';
import { asaasEnabled } from './payments/asaas.js';
import { hasDocumentKey } from './secure.js';

const SITE_ORIGINS = ['https://space-hour.com', 'https://www.space-hour.com', 'https://spacehour.com.br', 'https://www.spacehour.com.br', 'capacitor://localhost', 'https://localhost'];
/** Origens que podem chamar a API pelo navegador (CORS_ORIGIN substitui a lista; em desenvolvimento, qualquer uma). */
function allowedOrigins(): string[] | boolean {
  if (process.env.CORS_ORIGIN) return process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  if (process.env.NODE_ENV !== 'production') return true;
  return [...SITE_ORIGINS, ...(process.env.APP_URL ? [process.env.APP_URL.replace(/\/$/, '')] : [])];
}

export function createApp() {
  if (process.env.NODE_ENV === 'production' && !hasDocumentKey()) {
    console.error('[segurança] DOCUMENT_ENCRYPTION_KEY ausente: envio de documentos de registro ficará indisponível');
  }
  const app = express();
  // Só o próprio site (e o app) chamam a API a partir do navegador: outro site não consegue usar a API logado como o usuário
  app.use(cors({ origin: allowedOrigins() }));
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use('/api', (_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      'Cross-Origin-Resource-Policy': 'same-site',
    });
    next();
  });
  app.use('/api', webhooksRouter); // corpo bruto (assinatura) — antes do express.json
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  // Diagnóstico da configuração (sem segredos): o que a Vercel está entregando ao servidor
  app.get('/api/health/config', optionalAuth, async (req: AuthedRequest, res) => {
    const mail = await one<{ sent24: number; failed24: number; pending: number; last_error: string | null; last_sent: Date | null }>(pool,
      `SELECT count(*) FILTER (WHERE email_status = 'sent' AND email_sent_at > now() - interval '24 hours')::int AS sent24,
              count(*) FILTER (WHERE email_status = 'failed' AND created_at > now() - interval '24 hours')::int AS failed24,
              count(*) FILTER (WHERE email_status = 'pending')::int AS pending,
              (SELECT email_error FROM notifications WHERE email_error IS NOT NULL ORDER BY created_at DESC LIMIT 1) AS last_error,
              max(email_sent_at) AS last_sent
         FROM notifications`).catch(() => undefined);
    res.set('Cache-Control', 'no-store');
    res.json({
      adminEmailsConfigured: adminEmails().length,
      emailSending: !!process.env.SMTP_HOST,
      smtpLogin: await verifySmtp(),
      emailFrom: process.env.MAIL_FROM ? 'configurado' : 'padrão',
      emailLast24h: mail ? { sent: mail.sent24, failed: mail.failed24, pending: mail.pending, lastSentAt: mail.last_sent, lastError: mail.last_error?.slice(0, 160) ?? null } : null,
      mercadoPago: marketplaceEnabled(),
      asaas: asaasEnabled() ? (process.env.ASAAS_ENV === 'sandbox' ? 'sandbox' : 'production') : false,
      appUrl: process.env.APP_URL ?? null,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      // Só os dados da própria conta logada: por que ela é (ou não é) admin
      you: req.user ? {
        email: req.user.email, emailVerified: !!req.user.emailVerifiedAt,
        inAdminList: isAdminEmail(req.user.email), isAdmin: req.user.roles.includes('admin'),
      } : null,
    });
  });
  // Rotina periódica disparada pelo Vercel Cron (Authorization: Bearer CRON_SECRET)
  app.get('/api/cron/tick', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'unauthorized');
    res.json(await runJobs());
  });
  // E-mails e push logo após cada ação (a rotina periódica cobre o que falhar). Na Vercel,
  // waitUntil mantém a função viva até o envio terminar, mesmo depois da resposta.
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && (process.env.SMTP_HOST || pushConfigured())) {
      res.on('finish', () => {
        const work = Promise.all([
          process.env.SMTP_HOST ? flushEmailQueue().catch((e) => console.error('[email]', (e as Error).message)) : undefined,
          pushConfigured() ? flushPushQueue().catch((e) => console.error('[push]', (e as Error).message)) : undefined,
        ]);
        try { waitUntil(work); } catch { /* fora da Vercel: segue em segundo plano */ }
      });
    }
    next();
  });
  app.use('/api', assistantRouter, authRouter, listingsRouter, bookingsRouter, filesRouter, feedbackRouter, payoutsRouter, marketingRouter, prospectingRouter);

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
