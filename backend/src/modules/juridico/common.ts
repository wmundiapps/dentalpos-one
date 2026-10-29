import { Router, Response } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { pageParams, qs } from '../core/crud'
import { scheduleReminder } from '../core/reminders'
import { DAY, diasAte, faixaVencimento, planoLembretes, severidadePorDias, LIMITES_VENCIMENTO } from './logic'

export const MOD = 'juridico'

// Papéis. ADMIN/OWNER/RECTOR/BOARD sempre têm acesso total (requireRole). 'LEGAL' = equipe jurídica (papel do usuário na tabela User).
export const LEGAL = 'LEGAL' as AcademicRole
export const WRITE: AcademicRole[] = [LEGAL]
export const READ: AcademicRole[] = [LEGAL, 'FINANCE', 'SECRETARY']
const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']

/** Vê tudo (documentos confidenciais, processos criminais/segredo de justiça, CPF sem máscara). */
export const acessoTotal = (req: AuthenticatedRequest) => {
  const r = String(req.user?.role || '').toUpperCase()
  return SUPER.includes(r) || r === 'LEGAL'
}

export function fail(status: number, msg: string): never {
  throw Object.assign(new Error(msg), { status })
}
export const tid = (req: AuthenticatedRequest) => getTenantId(req)
export const uid = (req: AuthenticatedRequest) => getUserId(req)
export const ymd = (d: Date) => d.toISOString().slice(0, 10)
export const nz = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v)

export const optDate = () => z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.date().optional())
export const reqDate = () => z.coerce.date()
export const optStr = (max = 2000) => z.preprocess((v) => (v === '' ? undefined : v), z.string().max(max).nullish())
export const money = () => z.number().finite().min(0).max(1e12)
export const optMoney = () => z.preprocess((v) => (v === '' ? undefined : v), z.number().finite().min(0).max(1e12).nullish())

// Limite de restrição de leitura para quem não tem acesso total.
export const restricaoDocumento = (req: AuthenticatedRequest) => (acessoTotal(req) ? {} : { confidencial: false })
export const restricaoProcesso = (req: AuthenticatedRequest) => (acessoTotal(req) ? {} : { area: { not: 'CRIMINAL' }, segredoJustica: false })

export async function proximoCodigo(tenantId: string, prefixo: string, now = new Date()) {
  const ano = now.getFullYear()
  const chave = `${prefixo}-${ano}`
  const r = await prisma.jurContador.upsert({ where: { tenantId_chave: { tenantId, chave } }, create: { tenantId, chave, valor: 1 }, update: { valor: { increment: 1 } } })
  return `JUR-${prefixo}-${ano}-${String(r.valor).padStart(4, '0')}`
}

export function checarVigencia(inicio?: Date | null, fim?: Date | null, label = 'vigência') {
  if (inicio && fim && fim.getTime() < inicio.getTime()) fail(400, `O fim da ${label} deve ser igual ou posterior ao início.`)
}

/** Confere que ids de outras tabelas pertencem ao tenant (evita referência cruzada entre instituições). */
export async function assertNoTenant(tenantId: string, model: string, id: string | null | undefined, rotulo: string) {
  if (!id) return
  const row = await (prisma as any)[model].findFirst({ where: { id, tenantId }, select: { id: true } })
  if (!row) fail(400, `${rotulo} não encontrado(a) nesta instituição.`)
}

// ------------------------------------------------------------------ lembretes (alertas 30/60/90, prazos, audiências)
export interface VencInput {
  tenantId: string; refType: string; refId: string; tag: string; titulo: string; descricao?: string
  due: Date | null | undefined; limites?: readonly number[]; assigneeRole?: string; assigneeUserId?: string; ativo?: boolean; reabrir?: boolean
}

/** Agenda os lembretes de um vencimento (idempotente) e cancela os que deixaram de valer. */
export async function agendarVencimento(v: VencInput) {
  const prefix = `jur:${v.tag}:${v.refId}:`
  const keep: string[] = []
  if (v.ativo !== false && v.due) {
    const dias = diasAte(v.due) ?? 0
    for (const p of planoLembretes(v.due, v.limites ?? LIMITES_VENCIMENTO)) {
      const key = `${prefix}${p.limite}:${ymd(v.due)}`
      keep.push(key)
      const rotulo = p.limite === 'vencido' ? 'VENCIDO' : `vence em até ${p.limite} dias`
      await scheduleReminder({
        tenantId: v.tenantId, modulo: MOD, titulo: `${v.titulo} — ${rotulo}`, descricao: v.descricao, dueAt: v.due, remindAt: p.remindAt,
        refType: v.refType, refId: v.refId, severity: p.limite === 'vencido' ? 'CRITICO' : severidadePorDias(typeof p.limite === 'number' ? Math.min(p.limite, dias) : dias),
        assigneeRole: v.assigneeRole ?? 'LEGAL', assigneeUserId: v.assigneeUserId, dedupeKey: key, reabrir: v.reabrir,
      })
    }
  }
  await prisma.eduReminder.updateMany({
    where: { tenantId: v.tenantId, dedupeKey: { startsWith: prefix, notIn: keep.length ? keep : ['__none__'] }, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } },
    data: { status: 'CANCELADO' },
  })
}

export async function cancelarLembretes(tenantId: string, tag: string, refId: string) {
  return prisma.eduReminder.updateMany({
    where: { tenantId, dedupeKey: { startsWith: `jur:${tag}:${refId}:` }, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } },
    data: { status: 'CANCELADO' },
  })
}

// ------------------------------------------------------------------ listagem com filtro de vencimento (30/60/90/vencido)
export const alertaDe = (data: Date | null | undefined) => {
  const dias = diasAte(data)
  return { dias, faixa: faixaVencimento(dias) }
}

export interface ListaOpts {
  model: string; path: string; modulo?: string; campoVenc?: string; statusVigente?: string[]; search: string[]; filters: string[]
  orderBy?: any; scope?: (req: AuthenticatedRequest) => Record<string, any>; read?: AcademicRole[]; include?: any
  extraWhere?: (req: AuthenticatedRequest) => Record<string, any>
}

/** GET lista paginada com q, filtros por igualdade e ?vencimento=30|60|90|vencido (campo de vencimento do registro) + decoração `alerta`. */
export function mountLista(router: Router, o: ListaOpts) {
  router.get(o.path, requireRole(...(o.read ?? READ)), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId, ...(o.scope ? o.scope(req) : {}), ...(o.extraWhere ? o.extraWhere(req) : {}) }
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name.toLowerCase() === o.model.toLowerCase())
    for (const f of o.filters) {
      const v = qs((req.query as any)[f])
      if (v === undefined) continue
      const fld = model?.fields.find((x) => x.name === f)
      if (fld?.type === 'Boolean') { if (v !== 'true' && v !== 'false') fail(400, `Filtro inválido: ${f}.`); where[f] = v === 'true' }
      else if (fld?.type === 'Int') { if (!/^-?\d+$/.test(v)) fail(400, `Filtro inválido: ${f}.`); where[f] = parseInt(v, 10) }
      else if (fld?.isList) where[f] = { has: v }
      else where[f] = v
    }
    const q = qs(req.query.q)
    if (q && o.search.length) where.OR = o.search.map((f) => ({ [f]: { contains: q, mode: 'insensitive' } }))
    const venc = qs(req.query.vencimento)
    if (venc && o.campoVenc) {
      const ini = new Date(); ini.setUTCHours(0, 0, 0, 0)
      if (venc === 'vencido') where[o.campoVenc] = { lt: ini }
      else if (['30', '60', '90'].includes(venc)) where[o.campoVenc] = { gte: ini, lte: new Date(ini.getTime() + (+venc + 1) * DAY - 1) }
      else fail(400, 'Filtro vencimento inválido (use 30, 60, 90 ou vencido).')
      if (o.statusVigente) where.status = where.status ?? { in: o.statusVigente }
    }
    const [items, total] = await Promise.all([
      (prisma as any)[o.model].findMany({ where, include: o.include, orderBy: o.orderBy ?? { createdAt: 'desc' }, skip, take }),
      (prisma as any)[o.model].count({ where }),
    ])
    res.json({ items: o.campoVenc ? items.map((r: any) => ({ ...r, alerta: alertaDe(r[o.campoVenc!]) })) : items, total, page, pageSize })
  }))
}

// ------------------------------------------------------------------ máquina de estados de contratos (ativar / encerrar / rescindir)
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body ?? {})
  if (!r.success) fail(400, `Dados inválidos — ${r.error.issues.map((i) => `${i.path.join('.') || 'corpo'}: ${i.message}`).join('; ')}`)
  return r.data
}

export { requireRole, asyncHandler, pageParams, qs, DAY }
export type { AuthenticatedRequest, Response }
