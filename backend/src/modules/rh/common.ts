import { NextFunction, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest, getTenantId, getUserId } from '../academico/middleware'
import { audit } from '../core/notify'
import { registrarAcessoSensivel } from '../lgpd/sensiveis'
import { hashDocumento, hashIp, soDigitos } from '../lgpd/mascara'
import { cifrar, decifrar } from '../seguranca/cripto'
import { CFG_PONTO_PADRAO } from './calculo'

export const MODULO = 'rh'
export const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
/** Papel de RH (não existe no enum acadêmico: o usuário recebe role "HR"); administração/reitoria sempre têm acesso. */
export const HR = 'HR' as AcademicRole
export const RH_ROLES: AcademicRole[] = [HR]
export const FIN_ROLES: AcademicRole[] = ['FINANCE']
export const GESTOR_ROLES: AcademicRole[] = ['COORDINATOR']

export const isSuper = (req: AuthenticatedRequest) => SUPER.includes(String(req.user?.role).toUpperCase())
export const isRh = (req: AuthenticatedRequest) => isSuper(req) || String(req.user?.role).toUpperCase() === 'HR'
export const isFin = (req: AuthenticatedRequest) => String(req.user?.role).toUpperCase() === 'FINANCE'
export const tid = (req: AuthenticatedRequest) => getTenantId(req)
export const uid = (req: AuthenticatedRequest) => getUserId(req)
export function httpError(status: number, message: string, extra?: Record<string, unknown>) { return Object.assign(new Error(message), { status, ...extra }) }

export function exigirRh(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
  if (isRh(req)) return next()
  return res.status(403).json({ error: 'Acesso restrito ao RH e à administração.' })
}
export function exigirRhOuFinanceiro(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
  if (isRh(req) || isFin(req)) return next()
  return res.status(403).json({ error: 'Acesso restrito ao RH, financeiro e administração.' })
}
/** Qualquer colaborador/gestor/RH logado (aluno e demais perfis sem vínculo recebem 403 nas rotas /meu). */
export function exigirAutenticado(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
  if (String(req.user.role).toUpperCase() === 'STUDENT') return res.status(403).json({ error: 'Sem permissão para esta ação.' })
  next()
}

export async function meuColaborador(req: AuthenticatedRequest) {
  const anyReq = req as any
  if (anyReq._rheMe !== undefined) return anyReq._rheMe as { id: string; nome: string } | null
  const c = req.user ? await prisma.rheColaborador.findFirst({ where: { tenantId: req.user.tenantId, userId: req.user.id }, select: { id: true, nome: true, departamentoId: true, status: true } }) : null
  anyReq._rheMe = c
  return c
}
export async function exigirMeuColaborador(req: AuthenticatedRequest) {
  const c = await meuColaborador(req)
  if (!c) throw httpError(403, 'Seu usuário não está vinculado a um colaborador do RH.')
  return c
}
/** IDs da equipe (liderados diretos + colaboradores dos departamentos que o usuário chefia). */
export async function equipeIds(req: AuthenticatedRequest): Promise<string[]> {
  const me = await meuColaborador(req)
  if (!me) return []
  const deps = await prisma.rheDepartamento.findMany({ where: { tenantId: tid(req), responsavelId: me.id }, select: { id: true } })
  const eq = await prisma.rheColaborador.findMany({ where: { tenantId: tid(req), OR: [{ gestorId: me.id }, ...(deps.length ? [{ departamentoId: { in: deps.map((d) => d.id) } }] : [])] }, select: { id: true } })
  return eq.map((e) => e.id).filter((id) => id !== me.id)
}
/** RH vê todos; o gestor vê a equipe; o colaborador vê a si mesmo. */
export async function podeVer(req: AuthenticatedRequest, colaboradorId: string, opts: { soProprio?: boolean; soRh?: boolean } = {}): Promise<boolean> {
  if (isRh(req)) return true
  if (opts.soRh) return false
  const me = await meuColaborador(req)
  if (me?.id === colaboradorId) return true
  if (opts.soProprio) return false
  if (!['COORDINATOR'].includes(String(req.user?.role).toUpperCase())) return false
  return (await equipeIds(req)).includes(colaboradorId)
}
export async function exigirAcesso(req: AuthenticatedRequest, colaboradorId: string, opts: { soProprio?: boolean; soRh?: boolean } = {}) {
  if (!(await podeVer(req, colaboradorId, opts))) throw httpError(403, 'Sem permissão para acessar os dados deste colaborador.')
}
export async function carregarColaborador(tenantId: string, id: string) {
  const c = await prisma.rheColaborador.findFirst({ where: { id, tenantId } })
  if (!c) throw httpError(404, 'Colaborador não encontrado.')
  return c
}

// ------------------------------------------------------------------ dados protegidos
export const proteger = (txt?: string | null) => (txt ? cifrar(String(txt)) : null)
export function revelar(payload?: string | null): string | null { if (!payload) return null; try { return decifrar(payload) } catch { return null } }
export const mascaraCpfFinal = (final?: string | null) => (final ? `***.***.***-${final}` : null)
export function validarCpf(v: unknown): string {
  const d = soDigitos(v)
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) throw httpError(400, 'CPF inválido.')
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  if (dv(9) !== +d[9] || dv(10) !== +d[10]) throw httpError(400, 'CPF inválido.')
  return d
}
export const hashCpf = (tenantId: string, cpf: string) => hashDocumento(cpf, tenantId)
export const ipHashDe = (req: AuthenticatedRequest) => hashIp(String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, ''), tid(req))

/** Remove segredos do colaborador; salário e vínculo financeiro só para o RH. */
export function colaboradorVisao(c: any, req: AuthenticatedRequest, extra: { cpf?: string | null } = {}) {
  const { cpfHash, cpfCifrado, contaCifrada, pixCifrado, ...r } = c
  const out: any = { ...r, cpfMascarado: mascaraCpfFinal(c.cpfFinal) }
  if (extra.cpf !== undefined) out.cpf = extra.cpf
  if (!isRh(req)) {
    delete out.salarioBase; delete out.valorHora; delete out.cargaMensalHoras; delete out.banco; delete out.agencia; delete out.cnpjPj
    delete out.dependentesIrrf; delete out.dataNascimento; delete out.observacoes; delete out.telefone
    out.dadosRestritos = true
  }
  return out
}

/** Log de acesso a dado sensível (LGPD): quem viu o quê do colaborador. */
export async function logSensivel(req: AuthenticatedRequest, recurso: string, categoria: 'SAUDE' | 'REMUNERACAO' | 'DISCIPLINAR' | 'IDENTIFICACAO' | 'AVALIACAO', colaboradorId?: string, recursoId?: string, motivo?: string) {
  await registrarAcessoSensivel(req, { recurso: `rh/${recurso}`, recursoId, categoria, acao: req.method === 'GET' ? 'LEITURA' : 'ESCRITA', titularTipo: colaboradorId ? 'COLABORADOR' : undefined, titularId: colaboradorId, motivo })
}
export const auditar = (req: AuthenticatedRequest, acao: string, refType: string, refId?: string, detalhes?: unknown) =>
  audit({ tenantId: tid(req), userId: uid(req), modulo: MODULO, acao, refType, refId, detalhes })

export async function getConfig(tenantId: string) {
  return prisma.rheConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} })
}
export const cfgPonto = (c: any) => ({ ...CFG_PONTO_PADRAO, toleranciaMarcacaoMin: c.toleranciaMarcacaoMin, toleranciaDiariaMin: c.toleranciaDiariaMin, adicionalNoturnoPct: c.adicionalNoturnoPct, horaNoturnaReduzida: c.horaNoturnaReduzida, noturnoInicio: c.noturnoInicio, noturnoFim: c.noturnoFim, he50LimiteDiarioMin: c.he50LimiteDiarioMin, excedenteCem: c.excedenteCem })

export const dia = (d: Date | string) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))
export const diaDate = (s: string) => new Date(s + 'T00:00:00.000Z')

export async function proximaMatricula(tenantId: string): Promise<string> {
  const n = await prisma.rheColaborador.count({ where: { tenantId } })
  for (let i = n + 1; i < n + 50; i++) {
    const m = `RH${String(i).padStart(5, '0')}`
    if (!(await prisma.rheColaborador.findFirst({ where: { tenantId, matricula: m }, select: { id: true } }))) return m
  }
  return `RH${Date.now()}`
}
