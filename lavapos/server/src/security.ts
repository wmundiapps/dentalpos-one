// Camadas de proteção da API: cabeçalhos, limite de tentativas, auditoria e erros seguros.
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { one, pool, type Db } from './db.js';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'erro') { super(message); }
}

/** Cabeçalhos de segurança em toda resposta da API. */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cache-Control': 'no-store',
  });
  next();
}

export const clientIp = (req: Request) => (req.ip ?? 'desconhecido').replace(/^::ffff:/, '');

/**
 * Limite de requisições por IP, guardado no banco (vale entre instâncias serverless).
 * `closed`: se o banco falhar, bloqueia (login/cadastro); senão deixa passar.
 */
export function rateLimit(name: string, max: number, windowSec: number, closed = false) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.RATE_LIMIT_OFF === '1' && process.env.NODE_ENV !== 'production') return next(); // só para semear dados de demonstração
    try {
      const r = await one<{ hits: number }>(pool,
        `INSERT INTO rate_hits (bucket, window_start, hits)
         VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $2) * $2), 1)
         ON CONFLICT (bucket, window_start) DO UPDATE SET hits = rate_hits.hits + 1
         RETURNING hits`, [`${name}:${clientIp(req)}`, windowSec]);
      if (r && r.hits > max) {
        res.set('Retry-After', String(windowSec));
        return next(new HttpError(429, 'Muitas tentativas. Aguarde um pouco e tente de novo.', 'limite'));
      }
      next();
    } catch (e) {
      console.error('[rateLimit]', (e as Error).message);
      if (closed) return next(new HttpError(503, 'Serviço indisponível. Tente em instantes.'));
      next();
    }
  };
}

/** Registra evento de segurança. Nunca grava senha, token ou documento. */
export async function audit(db: Db, action: string, who: { tenantId?: string | null; userId?: string | null; ip?: string }, detail?: Record<string, unknown>) {
  try {
    await db.query('INSERT INTO audit_log (tenant_id, user_id, action, detail, ip) VALUES ($1,$2,$3,$4,$5)',
      [who.tenantId ?? null, who.userId ?? null, action, detail ? JSON.stringify(detail) : null, who.ip ?? null]);
  } catch (e) {
    console.error('[audit]', (e as Error).message);
  }
}

/** Remove qualquer link digitado pelo usuário de um texto que vai em mensagem (anti-phishing). */
export function stripLinks(s: string): string {
  return s.replace(/(https?:\/\/|www\.)\S+/gi, '[link removido]').replace(/\b[\w-]+\.(com|net|org|br|io|app|xyz|top|link)\b\S*/gi, '[link removido]');
}

/** Última barreira: erros viram JSON sem vazar detalhe interno. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message, code: err.code });
  if (err instanceof ZodError) {
    return void res.status(400).json({ error: 'Dados inválidos: ' + err.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'campo'} ${i.message}`).join('; '), code: 'invalido' });
  }
  const e = err as { type?: string; status?: number };
  if (e?.type === 'entity.too.large') return void res.status(413).json({ error: 'Envio grande demais.', code: 'grande' });
  if (e?.type === 'entity.parse.failed') return void res.status(400).json({ error: 'JSON inválido.', code: 'invalido' });
  console.error(`[erro] ${req.method} ${req.path}`, err instanceof Error ? err.message : err);
  res.status(500).json({ error: 'Erro interno. Tente novamente.', code: 'interno' });
}
