import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { brandHeaderHtml, escapeHtml as esc, getBranding } from '../core/branding'
import { dateISO, mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { scheduleReminder } from '../core/reminders'
import { MODULO, SEC, SEC_GESTAO, SEC_LEITURA, proximoNumero } from './common'
import { ArquivoStatus, calcularEliminacao, formatNumero, localizacaoTexto, statusArquivoCalculado } from './logic'

// ============================================================
// ARQUIVO / GUARDA DE DOCUMENTOS (tabela de temporalidade, localização, descarte com aprovação)
// ============================================================

const temporalidadeSchema = z.object({
  codigo: z.string().min(2).max(40).transform((s) => s.toUpperCase().replace(/\s+/g, '_')),
  tipoDocumento: z.string().min(3).max(200),
  descricao: z.string().max(1000).optional(),
  prazoCorrenteAnos: z.number().int().min(0).max(100).default(5),
  prazoIntermediarioAnos: z.number().int().min(0).max(100).default(0),
  destinacao: z.enum(['ELIMINACAO', 'GUARDA_PERMANENTE']).default('ELIMINACAO'),
  fundamento: z.string().max(500).optional(),
  ativo: z.boolean().optional(),
})

const itemSchema = z.object({
  temporalidadeId: z.string().min(1),
  titulo: z.string().min(2).max(250),
  descricao: z.string().max(1000).optional(),
  studentId: z.string().optional(),
  refType: z.string().max(60).optional(),
  refId: z.string().max(100).optional(),
  predio: z.string().max(60).optional(),
  sala: z.string().max(60).optional(),
  estante: z.string().max(60).optional(),
  caixa: z.string().max(60).optional(),
  pasta: z.string().max(60).optional(),
  urlDigital: z.string().url().max(2000).optional(),
  dataDocumento: dateISO().optional(),
  dataEncerramento: dateISO(),
})

// Registro programático (outros módulos podem arquivar documentos encerrados).
export async function registrarNoArquivo(p: { tenantId: string; temporalidadeCodigo: string; titulo: string; dataEncerramento: Date; studentId?: string; refType?: string; refId?: string; localizacao?: Partial<Record<'predio' | 'sala' | 'estante' | 'caixa' | 'pasta', string>>; urlDigital?: string }) {
  const t = await prisma.secTemporalidade.findFirst({ where: { tenantId: p.tenantId, codigo: p.temporalidadeCodigo.toUpperCase(), ativo: true } })
  if (!t) throw Object.assign(new Error('Tipo de temporalidade não encontrado.'), { status: 404 })
  const eliminarApos = calcularEliminacao(p.dataEncerramento, t.prazoCorrenteAnos, t.prazoIntermediarioAnos, t.destinacao)
  return prisma.secArquivoItem.create({
    data: { tenantId: p.tenantId, temporalidadeId: t.id, titulo: p.titulo, studentId: p.studentId, refType: p.refType, refId: p.refId, urlDigital: p.urlDigital, dataEncerramento: p.dataEncerramento, eliminarApos, status: statusArquivoCalculado('ATIVO', t.destinacao, eliminarApos), ...(p.localizacao ?? {}) },
  })
}

async function aplicarTemporalidade(tenantId: string, data: any, atual?: any) {
  const tid = data.temporalidadeId ?? atual?.temporalidadeId
  const enc: Date = data.dataEncerramento ?? atual?.dataEncerramento
  const t = await prisma.secTemporalidade.findFirst({ where: { id: tid, tenantId } })
  if (!t) throw Object.assign(new Error('Item da tabela de temporalidade não encontrado.'), { status: 404 })
  data.eliminarApos = calcularEliminacao(enc, t.prazoCorrenteAnos, t.prazoIntermediarioAnos, t.destinacao)
  data.status = statusArquivoCalculado((atual?.status ?? 'ATIVO') as ArquivoStatus, t.destinacao, data.eliminarApos)
  return data
}

// Recalcula status por temporalidade; chamado pelo job e sob demanda.
export async function reclassificarArquivo(tenantId?: string) {
  const agora = new Date()
  const where: any = { status: 'ATIVO', eliminarApos: { lte: agora }, ...(tenantId ? { tenantId } : {}) }
  const elegiveis = await prisma.secArquivoItem.findMany({ where, select: { id: true, tenantId: true }, take: 5000 })
  if (elegiveis.length) await prisma.secArquivoItem.updateMany({ where: { id: { in: elegiveis.map((e) => e.id) } }, data: { status: 'ELEGIVEL_DESCARTE' } })
  const porTenant = new Map<string, number>()
  for (const e of elegiveis) porTenant.set(e.tenantId, (porTenant.get(e.tenantId) ?? 0) + 1)
  for (const [tid, n] of porTenant) {
    const mes = agora.toISOString().slice(0, 7)
    await scheduleReminder({ tenantId: tid, modulo: MODULO, titulo: `${n} documento(s) elegível(is) para descarte`, descricao: 'Revise a tabela de temporalidade e solicite o termo de eliminação.', dueAt: new Date(agora.getTime() + 15 * 86_400_000), remindAt: agora, refType: 'SecArquivoItem', assigneeRole: 'SECRETARY', severity: 'ATENCAO', dedupeKey: `sec:arq:elegivel:${mes}` })
  }
  return { elegiveisNovos: elegiveis.length }
}

export function mountArquivo(router: Router) {
  mountCrud(router, {
    model: 'secTemporalidade',
    path: '/temporalidade',
    read: SEC_LEITURA,
    write: SEC_GESTAO,
    create: temporalidadeSchema,
    search: ['tipoDocumento', 'codigo'],
    filters: ['destinacao', 'ativo'],
    orderBy: { tipoDocumento: 'asc' },
    modulo: MODULO,
    removeMode: 'soft',
  })

  mountCrud(router, {
    model: 'secArquivoItem',
    path: '/arquivo',
    read: SEC_LEITURA,
    write: SEC,
    create: itemSchema,
    update: itemSchema.partial(),
    search: ['titulo', 'caixa', 'pasta', 'estante', 'descricao'],
    filters: ['status', 'temporalidadeId', 'studentId', 'predio', 'sala', 'estante', 'caixa'],
    orderBy: { createdAt: 'desc' },
    modulo: MODULO,
    removeMode: 'hard',
    beforeCreate: (d, req) => aplicarTemporalidade(getTenantId(req), d),
    beforeUpdate: (d, req, cur) => {
      if (['DESCARTADO', 'DESCARTE_SOLICITADO'].includes(cur.status)) throw Object.assign(new Error('Item em processo de descarte/descartado não pode ser alterado.'), { status: 409 })
      return d.temporalidadeId || d.dataEncerramento ? aplicarTemporalidade(getTenantId(req), d, cur) : d
    },
  })

  // Busca por localização/aluno/texto com texto de localização montado.
  router.get('/arquivo-busca', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const q = qs(req.query.q)
    const where: any = { tenantId }
    if (q) where.OR = ['titulo', 'descricao', 'caixa', 'pasta', 'estante', 'sala', 'predio'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' } }))
    for (const f of ['status', 'studentId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const ra = qs(req.query.ra)
    if (ra) {
      const s = await prisma.student.findFirst({ where: { tenantId, ra }, select: { id: true } })
      where.studentId = s?.id ?? '__nenhum__'
    }
    const [items, total] = await Promise.all([prisma.secArquivoItem.findMany({ where, orderBy: { titulo: 'asc' }, skip, take }), prisma.secArquivoItem.count({ where })])
    res.json({ items: items.map((i) => ({ ...i, localizacao: localizacaoTexto(i) || 'Somente digital' })), total, page, pageSize })
  }))

  router.post('/arquivo/:id/suspender', requireRole(...SEC_GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { motivo } = parseBody(z.object({ motivo: z.string().min(5).max(500) }), req.body)
    const i = await prisma.secArquivoItem.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!i) return res.status(404).json({ error: 'Item não encontrado.' })
    if (i.status === 'DESCARTADO') return res.status(409).json({ error: 'Item já descartado.' })
    if (i.status === 'DESCARTE_SOLICITADO') return res.status(409).json({ error: 'Item em termo de descarte: rejeite o termo primeiro.' })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'ARQUIVO_SUSPENSO', refType: 'SecArquivoItem', refId: i.id, detalhes: { motivo } })
    res.json(await prisma.secArquivoItem.update({ where: { id: i.id }, data: { status: 'SUSPENSO', suspensoMotivo: motivo } }))
  }))

  router.post('/arquivo/:id/retomar', requireRole(...SEC_GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const i = await prisma.secArquivoItem.findFirst({ where: { id: String(req.params.id), tenantId, status: 'SUSPENSO' } })
    if (!i) return res.status(404).json({ error: 'Item suspenso não encontrado.' })
    const t = await prisma.secTemporalidade.findFirst({ where: { id: i.temporalidadeId, tenantId } })
    const st = statusArquivoCalculado('ATIVO', t?.destinacao ?? 'ELIMINACAO', i.eliminarApos)
    res.json(await prisma.secArquivoItem.update({ where: { id: i.id }, data: { status: st, suspensoMotivo: null } }))
  }))

  router.post('/arquivo-reclassificar', requireRole(...SEC_GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await reclassificarArquivo(getTenantId(req)))
  }))

  // ---------- descarte com aprovação (segregação de funções) ----------
  router.get('/descartes', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const st = qs(req.query.status)
    if (st) where.status = st
    const [items, total] = await Promise.all([prisma.secDescarte.findMany({ where, select: { id: true, numero: true, status: true, justificativa: true, itemIds: true, solicitadoPorId: true, aprovadoPorId: true, aprovadoEm: true, executadoEm: true, createdAt: true }, orderBy: { createdAt: 'desc' }, skip, take }), prisma.secDescarte.count({ where })])
    res.json({ items, total, page, pageSize })
  }))

  router.post('/descartes', requireRole(...SEC), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ itemIds: z.array(z.string()).min(1).max(1000), justificativa: z.string().min(5).max(1000) }), req.body)
    const itens = await prisma.secArquivoItem.findMany({ where: { id: { in: b.itemIds }, tenantId } })
    if (itens.length !== new Set(b.itemIds).size) return res.status(404).json({ error: 'Algum item não foi encontrado.' })
    const invalidos = itens.filter((i) => i.status !== 'ELEGIVEL_DESCARTE')
    if (invalidos.length) return res.status(409).json({ error: 'Apenas itens ELEGIVEL_DESCARTE podem ser incluídos.', itens: invalidos.map((i) => ({ id: i.id, titulo: i.titulo, status: i.status })) })
    const ano = new Date().getFullYear()
    const numero = formatNumero(ano, await proximoNumero(tenantId, `DESCARTE:${ano}`), 4)
    const d = await prisma.secDescarte.create({ data: { tenantId, numero, justificativa: b.justificativa, itemIds: itens.map((i) => i.id), status: 'AGUARDANDO_APROVACAO', solicitadoPorId: getUserId(req) } })
    await prisma.secArquivoItem.updateMany({ where: { id: { in: itens.map((i) => i.id) } }, data: { status: 'DESCARTE_SOLICITADO', descarteId: d.id } })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Aprovar termo de descarte ${numero}`, descricao: `${itens.length} item(ns)`, dueAt: new Date(Date.now() + 7 * 86_400_000), antecedenciaDias: 3, refType: 'SecDescarte', refId: d.id, assigneeRole: 'COORDINATOR', dedupeKey: `sec:descarte:${d.id}` })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'DESCARTE_SOLICITADO', refType: 'SecDescarte', refId: d.id, detalhes: { itens: itens.length } })
    res.status(201).json(d)
  }))

  const carregar = async (req: AuthenticatedRequest, res: Response) => {
    const d = await prisma.secDescarte.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!d) res.status(404).json({ error: 'Termo de descarte não encontrado.' })
    return d
  }

  router.post('/descartes/:id/aprovar', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const d = await carregar(req, res)
    if (!d) return
    if (d.status !== 'AGUARDANDO_APROVACAO') return res.status(409).json({ error: `Termo está ${d.status}.` })
    if (d.solicitadoPorId === getUserId(req)) return res.status(403).json({ error: 'Quem solicitou o descarte não pode aprová-lo (segregação de funções).' })
    const r = await prisma.secDescarte.update({ where: { id: d.id }, data: { status: 'APROVADO', aprovadoPorId: getUserId(req), aprovadoEm: new Date() } })
    await prisma.eduReminder.updateMany({ where: { tenantId: d.tenantId, dedupeKey: `sec:descarte:${d.id}` }, data: { status: 'CONCLUIDO', concluidoEm: new Date() } })
    await audit({ tenantId: d.tenantId, userId: getUserId(req), modulo: MODULO, acao: 'DESCARTE_APROVADO', refType: 'SecDescarte', refId: d.id })
    res.json(r)
  }))

  router.post('/descartes/:id/rejeitar', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { motivo } = parseBody(z.object({ motivo: z.string().min(5).max(500) }), req.body)
    const d = await carregar(req, res)
    if (!d) return
    if (d.status !== 'AGUARDANDO_APROVACAO') return res.status(409).json({ error: `Termo está ${d.status}.` })
    const r = await prisma.secDescarte.update({ where: { id: d.id }, data: { status: 'REJEITADO', motivoRejeicao: motivo, aprovadoPorId: getUserId(req), aprovadoEm: new Date() } })
    await prisma.secArquivoItem.updateMany({ where: { descarteId: d.id, status: 'DESCARTE_SOLICITADO' }, data: { status: 'ELEGIVEL_DESCARTE', descarteId: null } })
    await prisma.eduReminder.updateMany({ where: { tenantId: d.tenantId, dedupeKey: `sec:descarte:${d.id}` }, data: { status: 'CANCELADO' } })
    await audit({ tenantId: d.tenantId, userId: getUserId(req), modulo: MODULO, acao: 'DESCARTE_REJEITADO', refType: 'SecDescarte', refId: d.id, detalhes: { motivo } })
    res.json(r)
  }))

  router.post('/descartes/:id/executar', requireRole(...SEC_GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const d = await carregar(req, res)
    if (!d) return
    if (d.status !== 'APROVADO') return res.status(409).json({ error: 'O termo precisa estar APROVADO.' })
    const ids = d.itemIds as string[]
    const itens = await prisma.secArquivoItem.findMany({ where: { id: { in: ids }, tenantId: d.tenantId } })
    const b = await getBranding(d.tenantId)
    const termo = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Termo de eliminação ${esc(d.numero)}</title><style>body{font-family:Georgia,serif;margin:24px auto;max-width:820px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left}th{background:#f1f5f9}</style></head><body>${brandHeaderHtml(b, { titulo: `Termo de eliminação de documentos nº ${d.numero}` })}<p style="margin-top:20px">Em ${new Date().toLocaleDateString('pt-BR')}, nos termos da tabela de temporalidade institucional e após aprovação, procedeu-se à eliminação dos documentos abaixo relacionados. Justificativa: ${esc(d.justificativa)}</p><table><thead><tr><th>#</th><th>Documento</th><th>Localização</th><th>Encerramento</th><th>Eliminação prevista</th></tr></thead><tbody>${itens.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.titulo)}</td><td>${esc(localizacaoTexto(i) || 'Digital')}</td><td>${i.dataEncerramento.toLocaleDateString('pt-BR')}</td><td>${i.eliminarApos?.toLocaleDateString('pt-BR') ?? '—'}</td></tr>`).join('')}</tbody></table><div style="display:flex;gap:60px;margin-top:70px;justify-content:center"><div style="text-align:center">________________________<br/>Responsável pela eliminação</div><div style="text-align:center">________________________<br/>Aprovador(a)</div></div></body></html>`
    await prisma.secArquivoItem.updateMany({ where: { id: { in: ids }, tenantId: d.tenantId }, data: { status: 'DESCARTADO' } })
    const r = await prisma.secDescarte.update({ where: { id: d.id }, data: { status: 'EXECUTADO', executadoEm: new Date(), termoHtml: termo } })
    await audit({ tenantId: d.tenantId, userId: getUserId(req), modulo: MODULO, acao: 'DESCARTE_EXECUTADO', refType: 'SecDescarte', refId: d.id, detalhes: { itens: ids.length } })
    res.json({ id: r.id, numero: r.numero, status: r.status, itens: ids.length })
  }))

  router.get('/descartes/:id/termo', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const d = await carregar(req, res)
    if (!d) return
    if (!d.termoHtml) return res.status(409).json({ error: 'Termo ainda não executado.' })
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(d.termoHtml)
  }))
}
