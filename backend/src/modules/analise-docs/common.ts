import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest, getTenantId, getUserId } from '../academico/middleware'
import { pageParams, qs } from '../core/crud'
import { decifrar } from '../seguranca/cripto'
import { Origem, ORIGENS } from './logic'

export const MOD = 'analise-docs'
export { pageParams, qs }

export const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
export const LEGAL = 'LEGAL' as AcademicRole
/** Quem opera o agente em cada setor (ADMIN/OWNER/RECTOR/BOARD sempre). */
export const OPERADORES: Record<Origem, string[]> = {
  SECRETARIA: ['SECRETARY', 'COORDINATOR', 'ADMISSIONS'],
  FINANCEIRO: ['FINANCE'],
  JURIDICO: ['LEGAL'],
}
/** Quem pode ver os dados pessoais por extenso (com log de acesso e motivo). Os demais veem só dados mascarados. */
export const VE_DADOS: Record<Origem, string[]> = { SECRETARIA: ['SECRETARY'], FINANCEIRO: ['FINANCE'], JURIDICO: ['LEGAL'] }
export const TODOS_OPERADORES = [...new Set(Object.values(OPERADORES).flat())] as AcademicRole[]

export function fail(status: number, msg: string): never { throw Object.assign(new Error(msg), { status }) }
export const tid = (req: AuthenticatedRequest) => getTenantId(req)
export const uid = (req: AuthenticatedRequest) => getUserId(req)
export const papel = (req: AuthenticatedRequest) => String(req.user?.role || '').toUpperCase()
export const ehSuper = (req: AuthenticatedRequest) => SUPER.includes(papel(req))

/** Setores que o usuário pode operar. */
export function origensDoUsuario(req: AuthenticatedRequest): Origem[] {
  if (ehSuper(req)) return [...ORIGENS]
  const p = papel(req)
  return ORIGENS.filter((o) => OPERADORES[o].includes(p))
}
export function exigirOrigem(req: AuthenticatedRequest, origem: string): Origem {
  if (!ORIGENS.includes(origem as Origem)) fail(400, 'Origem inválida (use SECRETARIA, FINANCEIRO ou JURIDICO).')
  if (!origensDoUsuario(req).includes(origem as Origem)) fail(403, 'Seu perfil não atua neste setor do Agente de documentos.')
  return origem as Origem
}

export interface Cfg { percentualAproveitamento: number; similaridadeMinima: number; validadeAproveitamentoAnos: number; slaHoras: number; slaCriticoHoras: number; retencaoDias: number; diretoriaSecretaria: string; diretoriaFinanceiro: string; diretoriaJuridico: string; notificarReitor: boolean; provedor: string }
export async function getConfig(tenantId: string): Promise<Cfg> {
  const c = await prisma.adcConfig.findUnique({ where: { tenantId } })
  return c ?? { percentualAproveitamento: 75, similaridadeMinima: 55, validadeAproveitamentoAnos: 10, slaHoras: 48, slaCriticoHoras: 4, retencaoDias: 180, diretoriaSecretaria: 'COORDINATOR', diretoriaFinanceiro: 'FINANCE', diretoriaJuridico: 'LEGAL', notificarReitor: true, provedor: 'SIMULADO' }
}
export const diretoriaDe = (cfg: Cfg, origem: string) => (origem === 'SECRETARIA' ? cfg.diretoriaSecretaria : origem === 'FINANCEIRO' ? cfg.diretoriaFinanceiro : cfg.diretoriaJuridico)

/** Quem pode DECIDIR um caso crítico: reitoria/administração ou a diretoria do setor. */
export function podeDecidirCritico(req: AuthenticatedRequest, cfg: Cfg, origem: string) {
  return ehSuper(req) || papel(req) === diretoriaDe(cfg, origem).toUpperCase()
}

export async function proximoCodigo(tenantId: string, now = new Date()) {
  const ano = now.getFullYear()
  const r = await prisma.adcContador.upsert({ where: { tenantId_chave: { tenantId, chave: `caso-${ano}` } }, create: { tenantId, chave: `caso-${ano}`, valor: 1 }, update: { valor: { increment: 1 } } })
  return `ADC-${ano}-${String(r.valor).padStart(4, '0')}`
}

export async function nomeUsuario(tenantId: string, id?: string | null) {
  if (!id) return undefined
  const u = await prisma.user.findFirst({ where: { id, tenantId }, select: { firstName: true, lastName: true } })
  return u ? `${u.firstName} ${u.lastName}`.trim() : undefined
}

export function lerDados(dadosCif?: string | null): any {
  if (!dadosCif) return null
  try { return JSON.parse(decifrar(dadosCif)) } catch { return null }
}

export async function evento(tenantId: string, casoId: string, tipo: string, p: { usuarioId?: string | null; texto?: string; dados?: unknown } = {}) {
  const usuarioNome = await nomeUsuario(tenantId, p.usuarioId)
  return prisma.adcEvento.create({ data: { tenantId, casoId, tipo, usuarioId: p.usuarioId ?? null, usuarioNome: usuarioNome ?? null, texto: p.texto?.slice(0, 2000), dados: p.dados as any } })
}
