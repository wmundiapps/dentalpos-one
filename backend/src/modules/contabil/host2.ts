// ============================================================
// ESCRITÓRIO DE CONTABILIDADE — parte 2 (societário, RH/DP, imposto de renda, assistente)
// ÚNICO ponto de contato com o sistema hospedeiro (EduMaster Pro): autenticação/papéis, Prisma, tenant e usuário.
// Para plugar em outro sistema (CompletoDonto, Cashbacksmart, Studiobeautybarber...) basta reescrever ESTE arquivo.
// ============================================================
import type { NextFunction, Request, Response } from 'express'
import { z, type ZodTypeAny } from 'zod'
import { prisma } from '../../lib/prisma'
import { asyncHandler, requireAuth } from '../academico/middleware'
import { resolverPapel } from './nucleo/rbac'
import type { AuthenticatedRequest } from '../academico/middleware'
import { notify } from '../core/notify'
import { registerEduJob } from '../core/jobs'

export { prisma, asyncHandler, requireAuth }
/** Rotinas periódicas (cron único do hospedeiro). */
export const registrarJob = registerEduJob
export type { AuthenticatedRequest }

/**
 * Papéis contábeis (mesmo modelo da parte fiscal: nucleo/rbac.ts + adapter): GESTOR (cargos de gestão do hospedeiro), CONTADOR, FINANCEIRO e LEITOR.
 * Aluno e professor nunca acessam. Designação explícita (CtbMembro) vale mais que o mapeamento do cargo.
 * Nesta parte: leitura = qualquer papel; escrita = GESTOR/CONTADOR/FINANCEIRO; parecer, configuração e auditoria de conversas = GESTOR/CONTADOR.
 */
export type PapelCtb = 'GESTOR' | 'CONTADOR' | 'FINANCEIRO' | 'LEITOR'
export const PAPEIS_ESCRITA: PapelCtb[] = ['GESTOR', 'CONTADOR', 'FINANCEIRO']
export const PAPEIS_PARECER: PapelCtb[] = ['GESTOR', 'CONTADOR']

export function httpError(status: number, message: string, extra?: Record<string, unknown>) {
  return Object.assign(new Error(message), { status, ...(extra || {}) })
}

export const tid = (req: AuthenticatedRequest): string => {
  if (!req.user?.tenantId) throw httpError(400, 'Tenant não identificado na sessão.')
  return req.user.tenantId
}
export const uid = (req: AuthenticatedRequest): string => {
  if (!req.user?.id) throw httpError(401, 'Usuário não identificado.')
  return req.user.id
}
/** Papel contábil já resolvido pelo middleware (porMetodo/soLeitura/soEscrita/soParecer). */
export const papelDe = (req: AuthenticatedRequest): PapelCtb | undefined => (req as any).ctb?.papel
export const podeEscrever = (req: AuthenticatedRequest) => PAPEIS_ESCRITA.includes(papelDe(req) as PapelCtb)
export const ehAuditor = (req: AuthenticatedRequest) => PAPEIS_PARECER.includes(papelDe(req) as PapelCtb)

export function parseBody<T extends ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body)
  if (!r.success) throw httpError(400, `Dados inválidos — ${r.error.issues.map((i) => `${i.path.join('.') || 'corpo'}: ${i.message}`).join('; ')}`)
  return r.data
}
export const qs = (v: unknown): string | undefined => (Array.isArray(v) ? (v[0] != null ? String(v[0]) : undefined) : v == null || v === '' ? undefined : String(v))
export function pageParams(query: any) {
  const page = Math.min(100_000, Math.max(1, parseInt(String(query.page || '1'), 10) || 1))
  const pageSize = Math.min(200, Math.max(1, parseInt(String(query.pageSize || '50'), 10) || 50))
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

const guarda = (permitidos?: PapelCtb[]) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const r = req as AuthenticatedRequest
    if (!r.user) return res.status(401).json({ error: 'Não autenticado.' })
    const ctx = (req as any).ctb ?? (await resolverPapel(req))
    if (!ctx) return res.status(403).json({ error: 'Seu cargo não tem acesso à Contabilidade. Peça ao gestor para designar o papel de contador, financeiro ou leitor.', codigo: 'CTB_SEM_PAPEL' })
    ;(req as any).ctb = ctx
    if (permitidos && !permitidos.includes(ctx.papel)) return res.status(403).json({ error: 'Seu papel na Contabilidade não permite esta ação.', codigo: 'CTB_SEM_PERMISSAO' })
    next()
  } catch (e) { next(e) }
}
/** Leitura (GET/HEAD): qualquer papel contábil. Escrita: GESTOR/CONTADOR/FINANCEIRO. Alunos e professores nunca passam. */
export function porMetodo(req: Request, res: Response, next: NextFunction) {
  return guarda(req.method === 'GET' || req.method === 'HEAD' ? undefined : PAPEIS_ESCRITA)(req, res, next)
}
export const soLeitura = guarda()
export const soEscrita = guarda(PAPEIS_ESCRITA)
export const soParecer = guarda(PAPEIS_PARECER)

/** Auditoria própria do bloco (sem dados pessoais em `detalhes`: use ids e contagens). */
export async function auditar(req: AuthenticatedRequest | null, modulo: string, acao: string, ref?: { tipo?: string; id?: string }, detalhes?: unknown, tenantId?: string, userId?: string) {
  try {
    await prisma.ctbAudit2.create({
      data: { tenantId: (tenantId ?? req?.user?.tenantId) as string, userId: userId ?? req?.user?.id, modulo, acao, refTipo: ref?.tipo, refId: ref?.id, detalhes: detalhes === undefined ? undefined : (detalhes as any) },
    })
  } catch (e) { console.error('[ctb2-audit]', (e as any)?.message) }
}

// ---------------- empresa do cliente (EmpresaRef) ----------------
/** Contrato mínimo da empresa do cliente. A camada adapter da parte fiscal (se existir) pode registrar um provedor melhor. */
export interface EmpresaRef { id: string; nome: string | null; documento?: string | null; regime?: string | null; municipio?: string | null; uf?: string | null }
export type EmpresaProvider = (tenantId: string, empresaId: string) => Promise<EmpresaRef | null>
let provider: EmpresaProvider | null = null
export const registrarEmpresaProvider = (p: EmpresaProvider | null) => { provider = p }

/** Resolve a empresa pelo provedor registrado; sem provedor, usa as "fotos" guardadas neste bloco (aberturas, funcionários, declarações). */
export async function resolverEmpresa(tenantId: string, empresaId: string): Promise<EmpresaRef> {
  if (provider) { try { const e = await provider(tenantId, empresaId); if (e) return e } catch (e) { console.error('[ctb2-empresa-provider]', (e as any)?.message) } }
  // cadastro de empresas da parte fiscal (mesmo bloco contábil), quando existir
  try {
    const fe = await prisma.ctbEmpresa.findFirst({ where: { id: empresaId, tenantId }, select: { id: true, razaoSocial: true, documento: true, regimeAtual: true, municipio: true, uf: true } })
    if (fe) return { id: fe.id, nome: fe.razaoSocial, documento: fe.documento, regime: fe.regimeAtual, municipio: fe.municipio, uf: fe.uf }
  } catch { /* tabela ausente neste hospedeiro */ }
  const ab = await prisma.ctbSocAbertura.findFirst({ where: { tenantId, empresaId }, select: { nomeEmpresarial: true, cnpj: true, municipio: true, uf: true } })
  if (ab) return { id: empresaId, nome: ab.nomeEmpresarial, documento: ab.cnpj, municipio: ab.municipio, uf: ab.uf }
  const f = await prisma.ctbDpFuncionario.findFirst({ where: { tenantId, empresaId }, select: { empresaNome: true } })
  if (f?.empresaNome) return { id: empresaId, nome: f.empresaNome }
  const d = await prisma.ctbIrDeclaracao.findFirst({ where: { tenantId, empresaId }, select: { titularNome: true, titularDoc: true } })
  if (d) return { id: empresaId, nome: d.titularNome, documento: d.titularDoc }
  return { id: empresaId, nome: null }
}
export async function nomeEmpresa(tenantId: string, empresaId?: string | null, informado?: string | null): Promise<string | null> {
  if (!empresaId) return informado ?? null
  return informado || (await resolverEmpresa(tenantId, empresaId)).nome
}

/** Notificação interna SEM dados pessoais (apenas título genérico e referência). Melhor esforço: nunca derruba a operação. */
export async function notificarContadores(tenantId: string, assunto: string, mensagem: string, ref?: { tipo: string; id: string }) {
  try {
    const us = await prisma.user.findMany({ where: { tenantId, role: { in: ['FINANCE', 'ACCOUNTANT', 'CONTADOR'] } }, select: { id: true }, take: 50 })
    const ms = await prisma.ctbMembro.findMany({ where: { tenantId, ativo: true, papel: { in: ['CONTADOR', 'GESTOR'] } }, select: { userId: true }, take: 50 })
    const ids = [...new Set([...us.map((u) => u.id), ...ms.map((m) => m.userId)])]
    for (const u of ids.map((id) => ({ id }))) await notify({ tenantId, userId: u.id, assunto, mensagem, templateKey: 'ctb2.generico', refType: ref?.tipo, refId: ref?.id })
  } catch (e) { console.error('[ctb2-notify]', (e as any)?.message) }
}
