import type { Request, RequestHandler } from 'express';
import { pool } from './db.js';
import { HttpError, clientIp } from './http.js';

/** Limite por janela guardado no banco (funciona em várias instâncias/serverless). */
export async function hit(key: string, max: number, windowSec: number): Promise<void> {
  if (process.env.RATE_LIMIT_DISABLED === 'true') return;
  const r = await pool.query(
    `INSERT INTO rate_limits (key, hits, window_start) VALUES ($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       hits = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $3) THEN 1 ELSE rate_limits.hits + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $3) THEN now() ELSE rate_limits.window_start END
     RETURNING hits`, [key, max, windowSec]);
  if (r.rows[0].hits > max) throw new HttpError(429, 'too_many_requests');
}

export const limit = (name: string, max: number, windowSec: number, by: (req: Request) => string = clientIp): RequestHandler =>
  (req, _res, next) => { hit(`${name}:${by(req)}`, max, windowSec).then(() => next(), next); };
