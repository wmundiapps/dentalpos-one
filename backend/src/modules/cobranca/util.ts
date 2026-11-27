import { Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest } from '../academico/middleware'

export const httpErr = (status: number, message: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(message), { status, extra })

const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
export const ehGestor = (req: AuthenticatedRequest) => SUPER.includes(String(req.user?.role || '').toUpperCase())

/** Próximo número sequencial por tenant/ano (ACD-2026-00001). Atômico via upsert + increment. */
export async function proximoNumero(tenantId: string, chave: string, prefixo: string, now = new Date()): Promise<string> {
  const ano = now.getUTCFullYear()
  const s = await prisma.cobSequencia.upsert({
    where: { tenantId_chave_ano: { tenantId, chave, ano } },
    create: { tenantId, chave, ano, valor: 1 },
    update: { valor: { increment: 1 } },
  })
  return `${prefixo}-${ano}-${String(s.valor).padStart(5, '0')}`
}

export const dinheiro = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const dataBR = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10).split('-').reverse().join('/')

export function enviarCsv(res: Response, nome: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`)
  res.send(csv)
}

export function intervalo(q: { de?: string; ate?: string }, padraoDias = 30): { de: Date; ate: Date } {
  const ate = q.ate ? new Date(q.ate) : new Date()
  const de = q.de ? new Date(q.de) : new Date(ate.getTime() - padraoDias * 86_400_000)
  if (isNaN(de.getTime()) || isNaN(ate.getTime())) throw httpErr(400, 'Período inválido.')
  // data sem hora ("2026-10-01") vira o fim do dia no "ate"
  if (q.ate && /^\d{4}-\d{2}-\d{2}$/.test(q.ate)) ate.setTime(ate.getTime() + 86_400_000 - 1)
  return { de, ate }
}
