import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, public code: string, public detail?: unknown) { super(code); }
}

export const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'validation_error', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.code, detail: err.detail }); return; }
  if (err instanceof ZodError) { res.status(400).json({ error: 'validation_error' }); return; }
  const e = err as { code?: string; type?: string; message?: string };
  if (e?.code === 'LIMIT_FILE_SIZE') { res.status(413).json({ error: 'file_too_large' }); return; }
  if (e?.code === 'LIMIT_UNEXPECTED_FILE' || e?.code === 'LIMIT_FILE_COUNT') { res.status(400).json({ error: 'too_many_files' }); return; }
  if (e?.type === 'entity.too.large') { res.status(413).json({ error: 'payload_too_large' }); return; }
  if (e?.type === 'entity.parse.failed') { res.status(400).json({ error: 'invalid_json' }); return; }
  console.error('erro não tratado:', err);
  res.status(500).json({ error: 'internal_error' });
}

/** IP do cliente. Na Vercel/Railway o último salto confiável vem em x-forwarded-for / x-real-ip. */
export function clientIp(req: Request): string {
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real) return real.trim();
  const xff = req.headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}
export const ipChain = (req: Request) => {
  const xff = req.headers['x-forwarded-for'];
  return (Array.isArray(xff) ? xff.join(',') : xff) ?? '';
};
