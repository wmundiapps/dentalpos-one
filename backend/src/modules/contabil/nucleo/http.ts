import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { ZodTypeAny } from 'zod'

// Utilidades HTTP do bloco contábil (independentes dos middlewares do sistema hospedeiro).

export function httpError(status: number, message: string, extra?: Record<string, unknown>) {
  return Object.assign(new Error(message), { status, ...(extra || {}) })
}

export function asyncHandler(fn: (req: any, res: Response, next: NextFunction) => Promise<any> | any): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res, next)).catch(next) }
}

export function parseBody<T extends ZodTypeAny>(schema: T, body: unknown): ReturnType<T['parse']> {
  const r = schema.safeParse(body)
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || 'corpo'}: ${i.message}`).join('; ')
    throw httpError(400, `Dados inválidos — ${msg}`)
  }
  return r.data
}

export function qs(v: unknown): string | undefined {
  if (Array.isArray(v)) return v[0] != null ? String(v[0]) : undefined
  return v == null || v === '' ? undefined : String(v)
}

export function pageParams(query: any, max = 200) {
  const page = Math.min(100_000, Math.max(1, parseInt(String(query.page || '1'), 10) || 1))
  const pageSize = Math.min(max, Math.max(1, parseInt(String(query.pageSize || '50'), 10) || 50))
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

/** Converte erros com .status em 4xx; erros do Prisma conhecidos em 4xx; o resto vira 500 genérico (sem vazar detalhes). */
export function errorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err)
  let status: number = err?.status || 0
  let message: string = err?.message || ''
  if (!status) {
    if (err?.code === 'P2002') { status = 409; message = 'Registro duplicado.' }
    else if (err?.code === 'P2025') { status = 404; message = 'Registro não encontrado.' }
    else if (err?.code === 'P2000' || err?.code === 'P2006' || err?.code === 'P2007' || String(err?.name) === 'PrismaClientValidationError') { status = 400; message = 'Dados inválidos para esta operação.' }
    else if (err?.type === 'entity.parse.failed') { status = 400; message = 'JSON inválido.' }
    else if (err?.type === 'entity.too.large') { status = 413; message = 'Arquivo muito grande.' }
  }
  status = status || 500
  if (status >= 500) console.error('[contabil]', err)
  res.status(status).json({ error: status >= 500 && !err?.status ? 'Erro interno do servidor.' : message || 'Erro.', ...(status < 500 && typeof err?.codigo === 'string' ? { codigo: err.codigo } : {}) })
}
