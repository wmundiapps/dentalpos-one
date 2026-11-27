import type { NextFunction, Response } from 'express'
import { adapter, PapelContabil } from '../adapter'
import { prisma } from './db'
import { httpError } from './http'

// Papéis e permissões do escritório de contabilidade. Aluno/professor (e qualquer cargo sem papel) NÃO acessam.

export type Permissao =
  | 'ler' | 'empresa.escrever' | 'regime.simular' | 'nota.emitir' | 'nota.cancelar'
  | 'guia.gerar' | 'guia.pagar' | 'financeiro.escrever' | 'conciliar' | 'contabil.lancar' | 'auditoria.ler' | 'membros.gerir'

const TODAS: Permissao[] = ['ler', 'empresa.escrever', 'regime.simular', 'nota.emitir', 'nota.cancelar', 'guia.gerar', 'guia.pagar', 'financeiro.escrever', 'conciliar', 'contabil.lancar', 'auditoria.ler', 'membros.gerir']

export const MATRIZ: Record<PapelContabil, Permissao[]> = {
  GESTOR: TODAS,
  CONTADOR: TODAS.filter((p) => p !== 'membros.gerir'),
  FINANCEIRO: ['ler', 'nota.emitir', 'guia.pagar', 'financeiro.escrever', 'conciliar'],
  LEITOR: ['ler'],
}

export interface CtbCtx { tenantId: string; userId: string; papel: PapelContabil; cargo: string }

export const PAPEIS: PapelContabil[] = ['GESTOR', 'CONTADOR', 'FINANCEIRO', 'LEITOR']

/** Resolve o papel contábil: aluno/professor nunca; GESTOR do hospedeiro sempre; depois designação explícita (CtbMembro); depois mapeamento do cargo; depois acesso concedido (leitura). */
export async function resolverPapel(req: any): Promise<CtbCtx | null> {
  const a = adapter()
  const c = a.contexto(req)
  if (!c) return null
  const mapeado = a.mapearCargo(c.cargo)
  if (mapeado === 'NEGAR') return null
  if (mapeado === 'GESTOR') return { tenantId: c.tenantId, userId: c.userId, papel: 'GESTOR', cargo: c.cargo }
  const m = await prisma.ctbMembro.findUnique({ where: { tenantId_userId: { tenantId: c.tenantId, userId: c.userId } } })
  if (m) return m.ativo && PAPEIS.includes(m.papel as PapelContabil) ? { tenantId: c.tenantId, userId: c.userId, papel: m.papel as PapelContabil, cargo: c.cargo } : null
  if (mapeado) return { tenantId: c.tenantId, userId: c.userId, papel: mapeado, cargo: c.cargo }
  if (c.acessoConcedido) return { tenantId: c.tenantId, userId: c.userId, papel: 'LEITOR', cargo: c.cargo }
  return null
}

/** Middleware do módulo: exige papel contábil e anexa `req.ctb`. */
export async function contextoContabil(req: any, _res: Response, next: NextFunction) {
  try {
    const ctx = await resolverPapel(req)
    if (!req.user && !ctx) return next(httpError(401, 'Não autenticado.'))
    if (!ctx) return next(httpError(403, 'Seu cargo não tem acesso à Contabilidade. Peça ao gestor para designar o papel de contador, financeiro ou leitor.', { codigo: 'CTB_SEM_PAPEL' }))
    req.ctb = ctx
    next()
  } catch (e) { next(e) }
}

export const pode = (papel: PapelContabil, p: Permissao) => MATRIZ[papel].includes(p)

/** Guarda por permissão (usar depois de contextoContabil). */
export const exigir = (p: Permissao) => (req: any, _res: Response, next: NextFunction) => {
  const ctx = req.ctb as CtbCtx | undefined
  if (!ctx) return next(httpError(401, 'Não autenticado.'))
  if (!pode(ctx.papel, p)) return next(httpError(403, 'Seu papel na Contabilidade não permite esta ação.', { codigo: 'CTB_SEM_PERMISSAO' }))
  next()
}

export const ctxDe = (req: any): CtbCtx => req.ctb as CtbCtx
