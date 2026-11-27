import { NextFunction, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest } from '../academico/middleware'
import { ehEssencial, ehSuper } from './catalogo'

// Carrega as regras de acesso por cargo de um tenant (cache curto) e aplica o BLOQUEAR / PERMITIR no agregador /api/edu.

export const TTL_CACHE_MS = 30_000
export const MENSAGEM_BLOQUEIO = 'Seu cargo não tem acesso a este módulo. A administração pode liberar em Configurações > Acesso por cargo.'

export type MapaRegras = Map<string, string> // chave "CARGO|modulo" -> BLOQUEAR | PERMITIR (PADRAO não é guardado)
const chave = (cargo: string, modulo: string) => `${cargo.toUpperCase()}|${modulo}`

const cache = new Map<string, { exp: number; regras: MapaRegras }>()
const carregando = new Map<string, Promise<MapaRegras>>()
let consultasAoBanco = 0

/** Descarta o cache do tenant (chamado ao salvar a matriz) — vale imediatamente nesta instância; outras instâncias expiram em até TTL_CACHE_MS. */
export function invalidarCacheAcesso(tenantId?: string) {
  if (tenantId) { cache.delete(tenantId); carregando.delete(tenantId) } else { cache.clear(); carregando.clear() }
}
/** Só para testes/diagnóstico: quantas leituras ao banco já foram feitas pelo cache. */
export const consultasDeRegras = () => consultasAoBanco

export async function regrasDoTenant(tenantId: string): Promise<MapaRegras> {
  const hit = cache.get(tenantId)
  if (hit && hit.exp > Date.now()) return hit.regras
  const emCurso = carregando.get(tenantId)
  if (emCurso) return emCurso
  const p = (async () => {
    consultasAoBanco++
    const rows = await prisma.acsRegra.findMany({ where: { tenantId, estado: { in: ['BLOQUEAR', 'PERMITIR'] } }, select: { cargo: true, modulo: true, estado: true } })
    const m: MapaRegras = new Map()
    for (const r of rows) m.set(chave(r.cargo, r.modulo), r.estado)
    cache.set(tenantId, { exp: Date.now() + TTL_CACHE_MS, regras: m })
    return m
  })()
  carregando.set(tenantId, p)
  try { return await p } finally { if (carregando.get(tenantId) === p) carregando.delete(tenantId) }
}

/** Estado efetivo de uma regra para (cargo, módulo): PADRAO quando não há regra, e sempre PADRAO para cargos SUPER e módulos essenciais. */
export function estadoDe(regras: MapaRegras, cargo: string, modulo: string): 'PADRAO' | 'PERMITIR' | 'BLOQUEAR' {
  if (ehSuper(cargo) || ehEssencial(modulo)) return 'PADRAO'
  const e = regras.get(chave(cargo, modulo))
  return e === 'BLOQUEAR' || e === 'PERMITIR' ? e : 'PADRAO'
}

/**
 * Middleware do agregador /api/edu: módulo = 1º segmento da rota.
 * BLOQUEAR => 403; PERMITIR => marca req.acessoConcedido (consultado por requireRole); PADRAO => nada muda.
 * Falha ao ler as regras NÃO derruba o sistema (segue o comportamento padrão e registra o erro).
 */
export async function acessoPorCargo(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const user = req.user
    if (!user?.tenantId) return next()
    const modulo = (req.path.split('/')[1] || '').toLowerCase()
    const cargo = String(user.role || '').toUpperCase()
    if (!modulo || ehEssencial(modulo) || ehSuper(cargo)) return next()
    const estado = estadoDe(await regrasDoTenant(user.tenantId), cargo, modulo)
    if (estado === 'BLOQUEAR') return res.status(403).json({ error: MENSAGEM_BLOQUEIO, codigo: 'ACESSO_CARGO_BLOQUEADO', modulo })
    if (estado === 'PERMITIR') (req as any).acessoConcedido = true
    next()
  } catch (e) {
    console.error('[acesso-por-cargo]', e)
    next()
  }
}
