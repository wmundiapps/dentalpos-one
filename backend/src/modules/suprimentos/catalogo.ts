import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, dateISO, qs } from '../core/crud'
import { scheduleReminder, cancelReminders, completeReminders } from '../core/reminders'
import { audit } from '../core/notify'
import { DAY, notaAvaliacao, novaMedia, reajustar, renovarVigencia, statusContrato, diasParaVencer } from './logic'

export const LEITURA = ['SUPPLIES', 'FINANCE', 'COORDINATOR', 'FACILITIES', 'STAFF', 'TEACHER'] as const
export const GESTAO = ['SUPPLIES'] as const

const num = z.coerce.number()
const optNum = z.coerce.number().optional().nullable()
const optDate = dateISO().optional().nullable()

export function statusDocumento(validade?: Date | null, hoje = new Date()): 'VALIDO' | 'A_VENCER' | 'VENCIDO' {
  if (!validade) return 'VALIDO'
  const d = Math.floor((validade.getTime() - hoje.getTime()) / DAY)
  return d < 0 ? 'VENCIDO' : d <= 30 ? 'A_VENCER' : 'VALIDO'
}

async function lembreteDocumento(doc: any) {
  if (!doc.validade) return cancelReminders({ tenantId: doc.tenantId, refType: 'SupFornecedorDocumento', refId: doc.id })
  const forn = await prisma.supFornecedor.findFirst({ where: { id: doc.fornecedorId, tenantId: doc.tenantId }, select: { razaoSocial: true } })
  await scheduleReminder({
    tenantId: doc.tenantId, modulo: 'suprimentos', refType: 'SupFornecedorDocumento', refId: doc.id, dedupeKey: `sup-doc-${doc.id}`,
    titulo: `Certidão a vencer: ${doc.tipo} — ${forn?.razaoSocial ?? 'fornecedor'}`,
    descricao: 'Solicite a renovação do documento ao fornecedor antes de novas compras.',
    dueAt: doc.validade, antecedenciaDias: 30, severity: 'ATENCAO', assigneeRole: 'SUPPLIES',
  })
}

async function lembretesContrato(c: any) {
  const base = { tenantId: c.tenantId, modulo: 'suprimentos', refType: 'SupContrato', refId: c.id, assigneeRole: 'SUPPLIES' }
  if (['ENCERRADO', 'RENOVADO', 'RASCUNHO'].includes(c.status)) return cancelReminders({ tenantId: c.tenantId, refType: 'SupContrato', refId: c.id })
  await scheduleReminder({ ...base, dedupeKey: `sup-contrato-fim-${c.id}`, titulo: `Contrato ${c.numero} vence em ${new Date(c.vigenciaFim).toLocaleDateString('pt-BR')}`,
    descricao: c.renovacaoAutomatica ? 'Renovação automática prevista — confirme condições.' : 'Decida: renovar, renegociar ou encerrar.', dueAt: c.vigenciaFim, antecedenciaDias: c.avisoDias, severity: 'ATENCAO' })
  if (c.proximoReajusteEm) {
    await scheduleReminder({ ...base, dedupeKey: `sup-contrato-reaj-${c.id}`, titulo: `Reajuste do contrato ${c.numero} (${c.indiceReajuste ?? 'índice'})`,
      dueAt: c.proximoReajusteEm, antecedenciaDias: 30, severity: 'INFO' })
  }
}

export function registerCatalogo(router: Router) {
  const mod = 'suprimentos'

  // ---------- Fornecedores ----------
  const fornecedorBase = z.object({
    razaoSocial: z.string().min(2), nomeFantasia: z.string().optional().nullable(),
    cnpj: z.string().regex(/^\d{14}$|^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, 'CNPJ inválido').optional().nullable(),
    inscricaoEstadual: z.string().optional().nullable(), email: z.string().email().optional().nullable(),
    telefone: z.string().optional().nullable(), contato: z.string().optional().nullable(), endereco: z.string().optional().nullable(),
    cidade: z.string().optional().nullable(), uf: z.string().length(2).optional().nullable(),
    categorias: z.array(z.string()).optional(), prazoPagamentoDias: z.coerce.number().int().min(0).optional(),
    banco: z.string().optional().nullable(), chavePix: z.string().optional().nullable(),
    status: z.enum(['ATIVO', 'EM_ANALISE', 'BLOQUEADO', 'INATIVO']).optional(), observacoes: z.string().optional().nullable(),
  })
  mountCrud(router, {
    model: 'supFornecedor', path: '/fornecedores', read: [...LEITURA], write: [...GESTAO, 'FINANCE'], create: fornecedorBase,
    search: ['razaoSocial', 'nomeFantasia', 'cnpj'], filters: ['status', 'uf', 'ativo'], orderBy: { razaoSocial: 'asc' }, modulo: mod, removeMode: 'soft',
    beforeCreate: (d) => ({ ...d, cnpj: d.cnpj ? d.cnpj.replace(/\D/g, '') : d.cnpj }),
    beforeUpdate: (d) => (d.cnpj ? { ...d, cnpj: d.cnpj.replace(/\D/g, '') } : d),
  })

  const docSchema = z.object({ fornecedorId: z.string().min(1), tipo: z.string().min(2), numero: z.string().optional().nullable(), emissao: optDate, validade: optDate, arquivoUrl: z.string().optional().nullable() })
  mountCrud(router, {
    model: 'supFornecedorDocumento', path: '/fornecedor-documentos', read: [...LEITURA], write: [...GESTAO, 'FINANCE'], create: docSchema,
    filters: ['fornecedorId', 'tipo', 'status'], orderBy: { validade: 'asc' }, modulo: mod,
    beforeCreate: async (d, req) => {
      const f = await prisma.supFornecedor.findFirst({ where: { id: d.fornecedorId, tenantId: getTenantId(req) } })
      if (!f) throw Object.assign(new Error('Fornecedor não encontrado.'), { status: 404 })
      return { ...d, status: statusDocumento(d.validade) }
    },
    beforeUpdate: (d, _r, cur) => ({ ...d, status: statusDocumento(d.validade !== undefined ? d.validade : cur.validade) }),
    afterCreate: (row) => lembreteDocumento(row),
    afterUpdate: (row) => lembreteDocumento(row),
  })

  // Documentos vencendo (painel)
  router.get('/fornecedor-documentos-vencendo', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const dias = Math.min(365, parseInt(qs(req.query.dias) || '60', 10) || 60)
    const docs = await prisma.supFornecedorDocumento.findMany({ where: { tenantId, validade: { lte: new Date(Date.now() + dias * DAY) } }, orderBy: { validade: 'asc' }, take: 300 })
    const fs = await prisma.supFornecedor.findMany({ where: { tenantId, id: { in: [...new Set(docs.map((d) => d.fornecedorId))] } }, select: { id: true, razaoSocial: true } })
    res.json(docs.map((d) => ({ ...d, status: statusDocumento(d.validade), fornecedor: fs.find((f) => f.id === d.fornecedorId)?.razaoSocial })))
  }))

  // Avaliação de fornecedor (atualiza média)
  const avalSchema = z.object({ fornecedorId: z.string(), pedidoId: z.string().optional().nullable(), notaPrazo: z.coerce.number().int().min(1).max(5), notaQualidade: z.coerce.number().int().min(1).max(5), notaPreco: z.coerce.number().int().min(1).max(5), notaAtendimento: z.coerce.number().int().min(1).max(5).optional(), comentario: z.string().optional().nullable() })
  router.post('/fornecedores/avaliacoes', requireRole(...GESTAO, 'FINANCE', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(avalSchema, req.body)
    const f = await prisma.supFornecedor.findFirst({ where: { id: d.fornecedorId, tenantId } })
    if (!f) return res.status(404).json({ error: 'Fornecedor não encontrado.' })
    const nota = notaAvaliacao({ prazo: d.notaPrazo, qualidade: d.notaQualidade, preco: d.notaPreco, atendimento: d.notaAtendimento })
    const av = await prisma.supFornecedorAvaliacao.create({ data: { ...d, tenantId, nota, avaliadorUserId: getUserId(req) } })
    const media = novaMedia(f.avaliacaoMedia, f.totalAvaliacoes, nota)
    await prisma.supFornecedor.update({ where: { id: f.id }, data: { avaliacaoMedia: media, totalAvaliacoes: { increment: 1 } } })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'AVALIAR_FORNECEDOR', refType: 'SupFornecedor', refId: f.id, detalhes: { nota } })
    res.status(201).json({ avaliacao: av, avaliacaoMedia: media })
  }))
  router.get('/fornecedores/:id/avaliacoes', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await prisma.supFornecedorAvaliacao.findMany({ where: { tenantId: getTenantId(req), fornecedorId: String(req.params.id) }, orderBy: { createdAt: 'desc' }, take: 100 }))
  }))

  // ---------- Categorias / Itens / Almoxarifados ----------
  mountCrud(router, {
    model: 'supCategoria', path: '/categorias', read: [...LEITURA], write: [...GESTAO], readAll: true,
    create: z.object({ nome: z.string().min(2), descricao: z.string().optional().nullable(), contaContabilId: z.string().optional().nullable(), ativo: z.boolean().optional() }),
    search: ['nome'], filters: ['ativo'], orderBy: { nome: 'asc' }, modulo: mod, removeMode: 'soft',
  })

  const itemSchema = z.object({
    codigo: z.string().min(1), nome: z.string().min(2), descricao: z.string().optional().nullable(), categoriaId: z.string().optional().nullable(),
    unidade: z.string().min(1).optional(), estoqueMinimo: z.coerce.number().min(0).optional(), estoqueMaximo: optNum, pontoPedido: optNum,
    leadTimeDias: z.coerce.number().int().min(0).optional(), controlaLote: z.boolean().optional(), controlaValidade: z.boolean().optional(),
    precoReferencia: optNum, contaContabilId: z.string().optional().nullable(), ativo: z.boolean().optional(),
  }).refine((d) => d.estoqueMaximo == null || d.estoqueMinimo == null || d.estoqueMaximo >= d.estoqueMinimo, { message: 'estoqueMaximo deve ser >= estoqueMinimo' })
  const checkCategoria = async (d: any, req: AuthenticatedRequest) => {
    if (d.categoriaId) {
      const c = await prisma.supCategoria.findFirst({ where: { id: d.categoriaId, tenantId: getTenantId(req) } })
      if (!c) throw Object.assign(new Error('Categoria não encontrada.'), { status: 404 })
    }
    return d
  }
  mountCrud(router, {
    model: 'supItem', path: '/itens', read: [...LEITURA], write: [...GESTAO], readAll: true, create: itemSchema, update: (itemSchema as any)._def.schema.partial(),
    search: ['nome', 'codigo'], filters: ['categoriaId', 'ativo'], include: { categoria: true }, orderBy: { nome: 'asc' }, modulo: mod, removeMode: 'soft',
    beforeCreate: checkCategoria, beforeUpdate: checkCategoria,
  })

  mountCrud(router, {
    model: 'supAlmoxarifado', path: '/almoxarifados', read: [...LEITURA], write: [...GESTAO], readAll: true,
    create: z.object({ codigo: z.string().min(1), nome: z.string().min(2), campusId: z.string().optional().nullable(), localizacao: z.string().optional().nullable(), responsavelUserId: z.string().optional().nullable(), ativo: z.boolean().optional() }),
    search: ['nome', 'codigo'], filters: ['ativo', 'campusId'], orderBy: { nome: 'asc' }, modulo: mod, removeMode: 'soft',
  })

  // ---------- Alçadas ----------
  mountCrud(router, {
    model: 'supAlcada', path: '/alcadas', read: [...LEITURA], write: ['FINANCE'],
    create: z.object({ nivel: z.coerce.number().int().min(1), valorMinimo: z.coerce.number().min(0), papel: z.string().min(2), descricao: z.string().optional().nullable(), ativo: z.boolean().optional() }),
    orderBy: { nivel: 'asc' }, modulo: mod,
  })

  // ---------- Contratos ----------
  const contratoBase = z.object({
    numero: z.string().min(1), fornecedorId: z.string(), objeto: z.string().min(3), vigenciaInicio: dateISO(), vigenciaFim: dateISO(),
    valorMensal: optNum, valorTotal: optNum, indiceReajuste: z.string().optional().nullable(), percentualReajuste: optNum, proximoReajusteEm: optDate,
    renovacaoAutomatica: z.boolean().optional(), avisoDias: z.coerce.number().int().min(1).max(365).optional(), status: z.enum(['RASCUNHO', 'VIGENTE', 'ENCERRADO']).optional(),
    centroCustoId: z.string().optional().nullable(), arquivoUrl: z.string().optional().nullable(), observacoes: z.string().optional().nullable(),
  })
  const checkContrato = async (d: any, req: AuthenticatedRequest, cur?: any) => {
    const ini = d.vigenciaInicio ?? cur?.vigenciaInicio
    const fim = d.vigenciaFim ?? cur?.vigenciaFim
    if (ini && fim && fim <= ini) throw Object.assign(new Error('Vigência final deve ser posterior ao início.'), { status: 400 })
    if (d.fornecedorId) {
      const f = await prisma.supFornecedor.findFirst({ where: { id: d.fornecedorId, tenantId: getTenantId(req) } })
      if (!f) throw Object.assign(new Error('Fornecedor não encontrado.'), { status: 404 })
    }
    const merged = { vigenciaInicio: ini, vigenciaFim: fim, avisoDias: d.avisoDias ?? cur?.avisoDias ?? 60, status: d.status ?? cur?.status ?? 'VIGENTE' }
    return { ...d, status: statusContrato(merged) }
  }
  mountCrud(router, {
    model: 'supContrato', path: '/contratos', read: [...LEITURA], write: [...GESTAO, 'FINANCE'], create: contratoBase,
    search: ['numero', 'objeto'], filters: ['status', 'fornecedorId'], orderBy: { vigenciaFim: 'asc' }, modulo: mod,
    beforeCreate: (d, req) => checkContrato(d, req), beforeUpdate: (d, req, cur) => checkContrato(d, req, cur),
    afterCreate: lembretesContrato, afterUpdate: lembretesContrato,
  })

  router.post('/contratos/:id/reajustar', requireRole(...GESTAO, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ percentual: z.coerce.number().min(-50).max(200), proximoReajusteEm: optDate }), req.body)
    const c = await prisma.supContrato.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Contrato não encontrado.' })
    if (!['VIGENTE', 'A_VENCER'].includes(c.status)) return res.status(409).json({ error: 'Só contratos vigentes podem ser reajustados.' })
    const prox = d.proximoReajusteEm ?? new Date(new Date().setFullYear(new Date().getFullYear() + 1))
    const up = await prisma.supContrato.update({ where: { id: c.id }, data: {
      valorMensal: c.valorMensal != null ? reajustar(c.valorMensal, d.percentual) : null,
      valorTotal: c.valorTotal != null ? reajustar(c.valorTotal, d.percentual) : null,
      percentualReajuste: d.percentual, proximoReajusteEm: prox } })
    await completeReminders({ tenantId, refType: 'SupContrato', refId: c.id })
    await lembretesContrato(up)
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'REAJUSTAR_CONTRATO', refType: 'SupContrato', refId: c.id, detalhes: { percentual: d.percentual } })
    res.json(up)
  }))

  router.post('/contratos/:id/renovar', requireRole(...GESTAO, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ meses: z.coerce.number().int().min(1).max(120).optional(), percentualReajuste: z.coerce.number().min(-50).max(200).optional(), numero: z.string().optional() }), req.body)
    const c = await prisma.supContrato.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Contrato não encontrado.' })
    if (['RENOVADO', 'ENCERRADO', 'RASCUNHO'].includes(c.status)) return res.status(409).json({ error: `Contrato em status ${c.status} não pode ser renovado.` })
    const v = renovarVigencia(c.vigenciaInicio, c.vigenciaFim, d.meses)
    const pct = d.percentualReajuste ?? 0
    const novo = await prisma.$transaction(async (tx) => {
      await tx.supContrato.update({ where: { id: c.id }, data: { status: 'RENOVADO' } })
      return tx.supContrato.create({ data: {
        tenantId, numero: d.numero ?? `${c.numero}-R${new Date().getFullYear()}`, fornecedorId: c.fornecedorId, objeto: c.objeto,
        vigenciaInicio: v.inicio, vigenciaFim: v.fim, valorMensal: c.valorMensal != null ? reajustar(c.valorMensal, pct) : null,
        valorTotal: c.valorTotal != null ? reajustar(c.valorTotal, pct) : null, indiceReajuste: c.indiceReajuste, percentualReajuste: pct || c.percentualReajuste,
        renovacaoAutomatica: c.renovacaoAutomatica, avisoDias: c.avisoDias, status: 'VIGENTE', centroCustoId: c.centroCustoId, contratoAnteriorId: c.id } })
    })
    await cancelReminders({ tenantId, refType: 'SupContrato', refId: c.id })
    await lembretesContrato(novo)
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'RENOVAR_CONTRATO', refType: 'SupContrato', refId: c.id, detalhes: { novoId: novo.id } })
    res.status(201).json(novo)
  }))

  router.get('/contratos-vencendo', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const dias = Math.min(730, parseInt(qs(req.query.dias) || '90', 10) || 90)
    const cs = await prisma.supContrato.findMany({ where: { tenantId, status: { in: ['VIGENTE', 'A_VENCER', 'VENCIDO'] }, vigenciaFim: { lte: new Date(Date.now() + dias * DAY) } }, include: { fornecedor: { select: { razaoSocial: true } } }, orderBy: { vigenciaFim: 'asc' } })
    res.json(cs.map((c) => ({ ...c, diasParaVencer: diasParaVencer(c.vigenciaFim) })))
  }))
}
