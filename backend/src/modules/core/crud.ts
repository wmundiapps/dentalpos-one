import { Router, Response } from 'express'
import { z, ZodTypeAny } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import {
  AcademicRole,
  AuthenticatedRequest,
  asyncHandler,
  getTenantId,
  getUserId,
  requireRole,
} from '../academico/middleware'
import { audit } from './notify'

// Fábrica de CRUD multi-tenant para os módulos EduMaster. Evita repetir
// listagem paginada/busca/filtros/validação em cada tabela simples.
// Todo model usado precisa ter o campo `tenantId`.

export interface CrudOptions {
  model: string                         // nome do delegate do Prisma (ex.: 'regProcesso')
  path: string                          // ex.: '/processos'
  read: AcademicRole[]                  // papéis que consultam (ADMIN/OWNER/RECTOR/BOARD sempre podem)
  write: AcademicRole[]                 // papéis que criam/alteram/removem
  create: ZodTypeAny
  update?: ZodTypeAny                   // padrão: create.partial()
  search?: string[]                     // campos texto p/ ?q=
  filters?: string[]                    // campos filtráveis por igualdade via query (?status=X)
  include?: Record<string, any>
  orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>
  modulo?: string                       // p/ auditoria
  removeMode?: 'hard' | 'soft'          // soft: usa campo `ativo=false`
  scope?: (req: AuthenticatedRequest) => Record<string, any>   // restrição extra por usuário (ex.: aluno só vê o seu)
  readAll?: boolean                     // true: qualquer usuário autenticado lê (ex.: catálogos)
  beforeCreate?: (data: any, req: AuthenticatedRequest) => Promise<any> | any
  afterCreate?: (row: any, req: AuthenticatedRequest) => Promise<void> | void
  beforeUpdate?: (data: any, req: AuthenticatedRequest, current: any) => Promise<any> | any
  afterUpdate?: (row: any, req: AuthenticatedRequest) => Promise<void> | void
}

export function pageParams(query: any) {
  const page = Math.min(100_000, Math.max(1, parseInt(String(query.page || '1'), 10) || 1))
  const pageSize = Math.min(200, Math.max(1, parseInt(String(query.pageSize || '50'), 10) || 50))
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

export function qs(v: unknown): string | undefined {
  if (Array.isArray(v)) return v[0] != null ? String(v[0]) : undefined
  return v == null || v === '' ? undefined : String(v)
}

export function parseBody<T extends ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body)
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || 'corpo'}: ${i.message}`).join('; ')
    throw Object.assign(new Error(`Dados inválidos — ${msg}`), { status: 400 })
  }
  return r.data
}

export function dateISO() {
  return z.preprocess((v) => (typeof v === 'string' || v instanceof Date ? new Date(v as any) : v), z.date())
}

// Converte o valor de ?campo=valor para o tipo real do campo no schema (Int, Float, Boolean, DateTime, enum).
// Valor inválido => 400 (antes virava PrismaClientValidationError => 500).
function coerceFilter(model: string, field: string, v: string): unknown {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name.toLowerCase() === model.toLowerCase())
  const f = m?.fields.find((x) => x.name === field)
  const bad = () => Object.assign(new Error(`Filtro inválido: ${field}.`), { status: 400 })
  if (!f) return v === 'true' ? true : v === 'false' ? false : v
  if (f.kind === 'enum') {
    const en = Prisma.dmmf.datamodel.enums.find((e) => e.name === f.type)
    if (en && !en.values.some((x) => x.name === v)) throw bad()
    return v
  }
  if (f.type === 'Int' || f.type === 'BigInt') { if (!/^-?\d+$/.test(v)) throw bad(); return parseInt(v, 10) }
  if (f.type === 'Float' || f.type === 'Decimal') { const n = Number(v); if (!Number.isFinite(n)) throw bad(); return n }
  if (f.type === 'Boolean') { if (v !== 'true' && v !== 'false') throw bad(); return v === 'true' }
  if (f.type === 'DateTime') { const d = new Date(v); if (isNaN(d.getTime())) throw bad(); return d }
  return v
}

export function mountCrud(router: Router, o: CrudOptions) {
  const delegate = () => (prisma as any)[o.model]
  const readGuard = o.readAll ? (_q: any, _s: any, n: any) => n() : requireRole(...o.read, ...o.write)
  const writeGuard = requireRole(...o.write)
  const updateSchema = o.update ?? (o.create as any).partial?.() ?? o.create

  router.get(
    o.path,
    readGuard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId, ...(o.scope ? o.scope(req) : {}) }
      for (const f of o.filters ?? []) {
        const v = qs((req.query as any)[f])
        if (v !== undefined) where[f] = coerceFilter(o.model, f, v)
      }
      const q = qs(req.query.q)
      if (q && o.search?.length) where.OR = o.search.map((f) => ({ [f]: { contains: q, mode: 'insensitive' } }))
      const [items, total] = await Promise.all([
        delegate().findMany({ where, include: o.include, orderBy: o.orderBy ?? { createdAt: 'desc' }, skip, take }),
        delegate().count({ where }),
      ])
      res.json({ items, total, page, pageSize })
    }),
  )

  router.get(
    `${o.path}/:id`,
    readGuard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const row = await delegate().findFirst({ where: { id: String(req.params.id), tenantId, ...(o.scope ? o.scope(req) : {}) }, include: o.include })
      if (!row) return res.status(404).json({ error: 'Registro não encontrado.' })
      res.json(row)
    }),
  )

  router.post(
    o.path,
    writeGuard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      let data: any = parseBody(o.create, req.body)
      if (o.beforeCreate) data = (await o.beforeCreate(data, req)) ?? data
      const row = await delegate().create({ data: { ...data, tenantId }, include: o.include })
      await audit({ tenantId, userId: getUserId(req), modulo: o.modulo ?? o.model, acao: 'CRIAR', refType: o.model, refId: row.id })
      if (o.afterCreate) await o.afterCreate(row, req)
      res.status(201).json(row)
    }),
  )

  const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const id = String(req.params.id)
    const current = await delegate().findFirst({ where: { id, tenantId } })
    if (!current) return res.status(404).json({ error: 'Registro não encontrado.' })
    let data: any = parseBody(updateSchema, req.body)
    delete data.tenantId
    delete data.id
    if (o.beforeUpdate) data = (await o.beforeUpdate(data, req, current)) ?? data
    const row = await delegate().update({ where: { id }, data, include: o.include })
    await audit({ tenantId, userId: getUserId(req), modulo: o.modulo ?? o.model, acao: 'ATUALIZAR', refType: o.model, refId: id })
    if (o.afterUpdate) await o.afterUpdate(row, req)
    res.json(row)
  })
  router.put(`${o.path}/:id`, writeGuard, update)
  router.patch(`${o.path}/:id`, writeGuard, update)

  router.delete(
    `${o.path}/:id`,
    writeGuard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const id = String(req.params.id)
      const current = await delegate().findFirst({ where: { id, tenantId } })
      if (!current) return res.status(404).json({ error: 'Registro não encontrado.' })
      if (o.removeMode === 'soft') await delegate().update({ where: { id }, data: { ativo: false } })
      else await delegate().delete({ where: { id } })
      await audit({ tenantId, userId: getUserId(req), modulo: o.modulo ?? o.model, acao: 'REMOVER', refType: o.model, refId: id })
      res.status(204).end()
    }),
  )
}
