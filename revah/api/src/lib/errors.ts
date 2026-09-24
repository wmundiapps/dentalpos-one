import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message)
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'BAD_REQUEST', details)
export const notFound = (msg = 'Registro não encontrado.') => new HttpError(404, msg, 'NOT_FOUND')
export const forbidden = (msg = 'Acesso negado.') => new HttpError(403, msg, 'FORBIDDEN')
export const conflict = (msg: string, code = 'CONFLICT', details?: unknown) => new HttpError(409, msg, code, details)
export const paymentRequired = (msg: string, code = 'UPGRADE_REQUIRED', details?: unknown) =>
  new HttpError(402, msg, code, details)

type Handler = (req: any, res: Response, next: NextFunction) => Promise<unknown> | unknown

// Express 4 não captura rejeições de handlers async.
export const ah = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next)

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Dados inválidos.', code: 'VALIDATION', details: err.flatten() })
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details })
  }
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' })
  console.error('[revah] erro não tratado', err)
  return res.status(500).json({ error: 'Erro interno. Tente novamente.' })
}
