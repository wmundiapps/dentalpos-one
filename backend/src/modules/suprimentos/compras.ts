import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, dateISO, pageParams, qs } from '../core/crud'
import { scheduleReminder, completeReminders, cancelReminders } from '../core/reminders'
import { audit, notify } from '../core/notify'
import { LEITURA, GESTAO } from './catalogo'
import { alcadasNecessarias, compararCotacoes, parcelar, podeTransitar, proximoNivelPendente, PEDIDO_TRANSICOES, REQ_TRANSICOES, round2, round3, DAY } from './logic'
import { checarEstoqueMinimo, movimentarTx, proximoNumero } from './stock'

const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
const SOLICITANTES = ['TEACHER', 'COORDINATOR', 'SUPPLIES', 'FACILITIES', 'STAFF', 'FINANCE'] as const
const APROVADORES = ['COORDINATOR', 'FINANCE', 'SUPPLIES', 'FACILITIES'] as const
const mod = 'suprimentos'
const roleOf = (req: AuthenticatedRequest) => String(req.user?.role || '').toUpperCase()
const httpErr = (status: number, msg: string) => Object.assign(new Error(msg), { status })

async function precoBase(tenantId: string, itemId?: string | null) {
  if (!itemId) return null
  const it = await prisma.supItem.findFirst({ where: { id: itemId, tenantId } })
  return it ? (it.precoReferencia ?? (it.custoMedio > 0 ? it.custoMedio : null)) : null
}

async function validarOrigem(tenantId: string, d: { cursoId?: string | null; laboratorioId?: string | null; centroCustoId?: string | null; almoxarifadoId?: string | null }) {
  // Referências externas: validadas com tolerância (apenas se o modelo existir e encontrar o id)
  if (d.cursoId) {
    const c = await prisma.academicProgram.findFirst({ where: { id: d.cursoId, tenantId }, select: { id: true } })
    if (!c) throw httpErr(404, 'Curso não encontrado.')
  }
  if (d.laboratorioId) {
    const l = await prisma.eduSpace.findFirst({ where: { id: d.laboratorioId, tenantId }, select: { id: true } })
    if (!l) throw httpErr(404, 'Laboratório/espaço não encontrado.')
  }
  if (d.centroCustoId) {
    const c = await prisma.eduCostCenter.findFirst({ where: { id: d.centroCustoId, tenantId }, select: { id: true } })
    if (!c) throw httpErr(404, 'Centro de custo não encontrado.')
  }
  if (d.almoxarifadoId) {
    const a = await prisma.supAlmoxarifado.findFirst({ where: { id: d.almoxarifadoId, tenantId, ativo: true }, select: { id: true } })
    if (!a) throw httpErr(404, 'Almoxarifado não encontrado.')
  }
}

const itemReqSchema = z.object({
  itemId: z.string().optional().nullable(), descricao: z.string().min(2).optional(), unidade: z.string().optional(),
  quantidade: z.coerce.number().positive(), precoEstimado: z.coerce.number().min(0).optional().nullable(),
})
const reqSchema = z.object({
  tipo: z.enum(['COMPRA', 'INSUMO']).default('COMPRA'),
  cursoId: z.string().optional().nullable(), laboratorioId: z.string().optional().nullable(), centroCustoId: z.string().optional().nullable(),
  classSectionId: z.string().optional().nullable(), almoxarifadoId: z.string().optional().nullable(),
  justificativa: z.string().optional().nullable(), urgencia: z.enum(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE']).default('NORMAL'),
  necessarioEm: dateISO().optional().nullable(),
  itens: z.array(itemReqSchema).min(1, 'Informe ao menos um item'),
})

async function montarItens(tenantId: string, itens: z.infer<typeof itemReqSchema>[]) {
  const out: Array<{ tenantId: string; itemId: string | null; descricao: string; unidade: string; quantidade: number; precoEstimado: number | null }> = []
  for (const i of itens) {
    let descricao = i.descricao
    let unidade = i.unidade
    let preco = i.precoEstimado ?? null
    if (i.itemId) {
      const it = await prisma.supItem.findFirst({ where: { id: i.itemId, tenantId, ativo: true } })
      if (!it) throw httpErr(404, `Item ${i.itemId} não encontrado no catálogo.`)
      descricao = descricao ?? it.nome
      unidade = unidade ?? it.unidade
      if (preco == null) preco = it.precoReferencia ?? (it.custoMedio > 0 ? it.custoMedio : null)
    }
    if (!descricao) throw httpErr(400, 'Item sem descrição: informe itemId do catálogo ou descricao.')
    out.push({ tenantId, itemId: i.itemId ?? null, descricao, unidade: unidade ?? 'UN', quantidade: i.quantidade, precoEstimado: preco })
  }
  return out
}
const valorEstimado = (itens: Array<{ quantidade: number; precoEstimado: number | null }>) => round2(itens.reduce((s, i) => s + i.quantidade * (i.precoEstimado ?? 0), 0))

async function carregarReq(req: AuthenticatedRequest, id: string) {
  const r = await prisma.supRequisicao.findFirst({ where: { id, tenantId: getTenantId(req) }, include: { itens: true, aprovacoes: { orderBy: { nivel: 'asc' } } } })
  if (!r) throw httpErr(404, 'Requisição não encontrada.')
  return r
}
function checarAcessoReq(req: AuthenticatedRequest, r: { solicitanteUserId: string }) {
  const role = roleOf(req)
  if (SUPER.includes(role) || ['SUPPLIES', 'FINANCE', 'COORDINATOR'].includes(role)) return
  if (r.solicitanteUserId !== getUserId(req)) throw httpErr(403, 'Sem permissão para esta requisição.')
}

export function registerCompras(router: Router) {
  // ---------- Requisições ----------
  router.get('/requisicoes', requireRole(...SOLICITANTES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'tipo', 'cursoId', 'laboratorioId', 'centroCustoId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const role = roleOf(req)
    if (!SUPER.includes(role) && !['SUPPLIES', 'FINANCE', 'COORDINATOR'].includes(role)) where.solicitanteUserId = getUserId(req)
    if (qs(req.query.minhas) === 'true') where.solicitanteUserId = getUserId(req)
    if (qs(req.query.pendentesMinhaAprovacao) === 'true') {
      where.status = 'AGUARDANDO_APROVACAO'
      if (!SUPER.includes(role)) where.aprovacoes = { some: { status: 'PENDENTE', papel: role } }
    }
    const [items, total] = await Promise.all([
      prisma.supRequisicao.findMany({ where, include: { itens: true, aprovacoes: { orderBy: { nivel: 'asc' } } }, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.supRequisicao.count({ where }),
    ])
    res.json({ items, total, page, pageSize })
  }))

  router.get('/requisicoes/:id', requireRole(...SOLICITANTES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await carregarReq(req, String(req.params.id))
    checarAcessoReq(req, r)
    const cotacoes = await prisma.supCotacao.findMany({ where: { tenantId: r.tenantId, requisicaoId: r.id }, orderBy: { createdAt: 'desc' } })
    res.json({ ...r, cotacoes })
  }))

  router.post('/requisicoes', requireRole(...SOLICITANTES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(reqSchema, req.body)
    await validarOrigem(tenantId, d)
    if (d.tipo === 'INSUMO' && !d.almoxarifadoId) throw httpErr(400, 'Requisição de insumo exige o almoxarifado de origem.')
    if (!d.cursoId && !d.laboratorioId && !d.centroCustoId) throw httpErr(400, 'Informe curso, laboratório ou centro de custo para apropriar o gasto.')
    const itens = await montarItens(tenantId, d.itens)
    if (d.tipo === 'INSUMO' && itens.some((i) => !i.itemId)) throw httpErr(400, 'Insumo deve referenciar itens do catálogo.')
    const created = await prisma.$transaction(async (tx) => {
      const numero = await proximoNumero(tx, tenantId, 'REQ')
      const { itens: _i, ...cab } = d
      return tx.supRequisicao.create({ data: { ...cab, tenantId, numero, solicitanteUserId: getUserId(req), valorEstimado: valorEstimado(itens), itens: { create: itens } }, include: { itens: true } })
    })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'CRIAR_REQUISICAO', refType: 'SupRequisicao', refId: created.id })
    res.status(201).json(created)
  }))

  router.put('/requisicoes/:id', requireRole(...SOLICITANTES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await carregarReq(req, String(req.params.id))
    if (r.solicitanteUserId !== getUserId(req) && !SUPER.includes(roleOf(req)) && roleOf(req) !== 'SUPPLIES') throw httpErr(403, 'Somente o solicitante edita a requisição.')
    if (r.status !== 'RASCUNHO') throw httpErr(409, 'Somente requisições em RASCUNHO podem ser editadas.')
    const d = parseBody(reqSchema.partial(), req.body)
    await validarOrigem(tenantId, d)
    const { itens: novosItens, ...cab } = d
    const up = await prisma.$transaction(async (tx) => {
      let valor = r.valorEstimado
      if (novosItens) {
        const itens = await montarItens(tenantId, novosItens)
        await tx.supRequisicaoItem.deleteMany({ where: { requisicaoId: r.id } })
        await tx.supRequisicaoItem.createMany({ data: itens.map((i) => ({ ...i, requisicaoId: r.id })) })
        valor = valorEstimado(itens)
      }
      return tx.supRequisicao.update({ where: { id: r.id }, data: { ...cab, valorEstimado: valor }, include: { itens: true } })
    })
    res.json(up)
  }))

  // Envia para aprovação: monta a cadeia de alçadas conforme o valor estimado.
  router.post('/requisicoes/:id/enviar', requireRole(...SOLICITANTES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await carregarReq(req, String(req.params.id))
    if (r.solicitanteUserId !== getUserId(req) && !SUPER.includes(roleOf(req)) && roleOf(req) !== 'SUPPLIES') throw httpErr(403, 'Somente o solicitante envia a requisição.')
    if (!podeTransitar(REQ_TRANSICOES, r.status, 'AGUARDANDO_APROVACAO')) throw httpErr(409, `Requisição em ${r.status} não pode ser enviada.`)
    if (r.itens.length === 0) throw httpErr(400, 'Requisição sem itens.')
    const alcadas = await prisma.supAlcada.findMany({ where: { tenantId, ativo: true }, orderBy: { nivel: 'asc' } })
    const exigidas = alcadasNecessarias(r.valorEstimado, alcadas)
    await prisma.$transaction(async (tx) => {
      await tx.supAprovacao.deleteMany({ where: { requisicaoId: r.id } })
      await tx.supAprovacao.createMany({ data: exigidas.map((a) => ({ tenantId, requisicaoId: r.id, nivel: a.nivel, papel: a.papel })) })
      await tx.supRequisicao.update({ where: { id: r.id }, data: { status: 'AGUARDANDO_APROVACAO', motivoReprovacao: null } })
    })
    const prox = exigidas[0]
    await scheduleReminder({ tenantId, modulo: mod, refType: 'SupRequisicao', refId: r.id, dedupeKey: `sup-aprov-${r.id}-${prox.nivel}`, titulo: `Aprovar requisição ${r.numero} (R$ ${r.valorEstimado.toFixed(2)})`, dueAt: new Date(Date.now() + (r.urgencia === 'URGENTE' ? 1 : 3) * DAY), assigneeRole: prox.papel, severity: r.urgencia === 'URGENTE' ? 'CRITICO' : 'ATENCAO' })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'ENVIAR_REQUISICAO', refType: 'SupRequisicao', refId: r.id, detalhes: { niveis: exigidas.map((a) => a.nivel) } })
    res.json(await carregarReq(req, r.id))
  }))

  router.post('/requisicoes/:id/decidir', requireRole(...APROVADORES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ decisao: z.enum(['APROVADO', 'REPROVADO']), parecer: z.string().optional() }), req.body)
    const r = await carregarReq(req, String(req.params.id))
    if (r.status !== 'AGUARDANDO_APROVACAO') throw httpErr(409, 'Requisição não está aguardando aprovação.')
    if (r.solicitanteUserId === getUserId(req)) throw httpErr(403, 'O solicitante não pode aprovar a própria requisição.')
    const pend = proximoNivelPendente(r.aprovacoes)
    if (!pend) throw httpErr(409, 'Não há aprovação pendente.')
    const role = roleOf(req)
    if (!SUPER.includes(role) && role !== pend.papel) throw httpErr(403, `Esta etapa (nível ${pend.nivel}) deve ser decidida por ${(pend as any).papel}.`)
    if (d.decisao === 'REPROVADO' && !d.parecer) throw httpErr(400, 'Informe o parecer para reprovar.')
    await prisma.supAprovacao.updateMany({ where: { requisicaoId: r.id, nivel: pend.nivel, status: 'PENDENTE' }, data: { status: d.decisao, decididoPorId: getUserId(req), decididoEm: new Date(), parecer: d.parecer } })
    await completeReminders({ tenantId, refType: 'SupRequisicao', refId: r.id, userId: getUserId(req) })
    let status = 'AGUARDANDO_APROVACAO'
    if (d.decisao === 'REPROVADO') {
      status = 'REPROVADA'
      await prisma.supAprovacao.updateMany({ where: { requisicaoId: r.id, status: 'PENDENTE' }, data: { status: 'REPROVADO', parecer: 'Cancelada por reprovação em nível anterior' } })
    } else {
      const resto = await prisma.supAprovacao.findMany({ where: { requisicaoId: r.id, status: 'PENDENTE' }, orderBy: { nivel: 'asc' } })
      if (resto.length === 0) status = 'APROVADA'
      else await scheduleReminder({ tenantId, modulo: mod, refType: 'SupRequisicao', refId: r.id, dedupeKey: `sup-aprov-${r.id}-${resto[0].nivel}`, titulo: `Aprovar requisição ${r.numero} (nível ${resto[0].nivel})`, dueAt: new Date(Date.now() + 3 * DAY), assigneeRole: resto[0].papel, severity: 'ATENCAO' })
    }
    await prisma.supRequisicao.update({ where: { id: r.id }, data: { status: status as any, motivoReprovacao: d.decisao === 'REPROVADO' ? d.parecer : null } })
    if (status !== 'AGUARDANDO_APROVACAO') {
      await notify({ tenantId, userId: r.solicitanteUserId, assunto: `Requisição ${r.numero} ${status === 'APROVADA' ? 'aprovada' : 'reprovada'}`, mensagem: `Sua requisição ${r.numero} foi ${status === 'APROVADA' ? 'aprovada' : 'reprovada'}.${d.parecer ? ' Parecer: ' + d.parecer : ''}`, refType: 'SupRequisicao', refId: r.id })
      if (status === 'APROVADA') await scheduleReminder({ tenantId, modulo: mod, refType: 'SupRequisicao', refId: r.id, dedupeKey: `sup-prov-${r.id}`, titulo: `Providenciar requisição aprovada ${r.numero}`, dueAt: r.necessarioEm ?? new Date(Date.now() + 7 * DAY), assigneeRole: 'SUPPLIES', severity: r.urgencia === 'URGENTE' ? 'CRITICO' : 'INFO' })
    }
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: `DECIDIR_${d.decisao}`, refType: 'SupRequisicao', refId: r.id, detalhes: { nivel: pend.nivel, parecer: d.parecer } })
    res.json(await carregarReq(req, r.id))
  }))

  router.post('/requisicoes/:id/cancelar', requireRole(...SOLICITANTES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await carregarReq(req, String(req.params.id))
    if (r.solicitanteUserId !== getUserId(req) && !SUPER.includes(roleOf(req)) && roleOf(req) !== 'SUPPLIES') throw httpErr(403, 'Sem permissão para cancelar.')
    if (!podeTransitar(REQ_TRANSICOES, r.status, 'CANCELADA')) throw httpErr(409, `Requisição em ${r.status} não pode ser cancelada.`)
    await prisma.supRequisicao.update({ where: { id: r.id }, data: { status: 'CANCELADA' } })
    await cancelReminders({ tenantId, refType: 'SupRequisicao', refId: r.id })
    res.json(await carregarReq(req, r.id))
  }))

  // Reabre requisição reprovada como rascunho para ajuste.
  router.post('/requisicoes/:id/reabrir', requireRole(...SOLICITANTES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await carregarReq(req, String(req.params.id))
    if (r.solicitanteUserId !== getUserId(req) && !SUPER.includes(roleOf(req))) throw httpErr(403, 'Sem permissão.')
    if (!podeTransitar(REQ_TRANSICOES, r.status, 'RASCUNHO')) throw httpErr(409, 'Somente requisições reprovadas podem ser reabertas.')
    await prisma.supRequisicao.update({ where: { id: r.id }, data: { status: 'RASCUNHO' } })
    res.json(await carregarReq(req, r.id))
  }))

  // Atende requisição de INSUMO baixando do estoque (apropriando ao curso/laboratório/centro de custo).
  router.post('/requisicoes/:id/atender-estoque', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await carregarReq(req, String(req.params.id))
    if (r.status !== 'APROVADA') throw httpErr(409, 'Somente requisições APROVADAS podem ser atendidas.')
    const d = parseBody(z.object({ almoxarifadoId: z.string().optional(), parcial: z.boolean().optional() }), req.body ?? {})
    const almox = d.almoxarifadoId ?? r.almoxarifadoId
    if (!almox) throw httpErr(400, 'Informe o almoxarifado.')
    const pendentes = r.itens.filter((i) => i.itemId && i.quantidade - i.quantidadeAtendida > 1e-9)
    if (pendentes.length === 0) throw httpErr(409, 'Nada a atender.')
    const faltas: Array<{ itemId: string; descricao: string; faltante: number }> = []
    const resultado = await prisma.$transaction(async (tx) => {
      const afetados: string[] = []
      for (const i of pendentes) {
        const falta = round3(i.quantidade - i.quantidadeAtendida)
        const s = await tx.supSaldo.findUnique({ where: { almoxarifadoId_itemId: { almoxarifadoId: almox, itemId: i.itemId! } } })
        const disp = s?.quantidade ?? 0
        const qtd = Math.min(falta, disp)
        if (qtd < falta) faltas.push({ itemId: i.itemId!, descricao: i.descricao, faltante: round3(falta - qtd) })
        if (qtd <= 0) continue
        if (qtd < falta && !d.parcial) continue
        await movimentarTx(tx, { tenantId, tipo: 'SAIDA', itemId: i.itemId!, almoxarifadoId: almox, quantidade: qtd, origemTipo: 'REQUISICAO', origemId: r.id, cursoId: r.cursoId ?? undefined, laboratorioId: r.laboratorioId ?? undefined, centroCustoId: r.centroCustoId ?? undefined, classSectionId: r.classSectionId ?? undefined, motivo: `Requisição ${r.numero}`, userId: getUserId(req) })
        await tx.supRequisicaoItem.update({ where: { id: i.id }, data: { quantidadeAtendida: { increment: qtd } } })
        afetados.push(i.itemId!)
      }
      if (faltas.length && !d.parcial) throw httpErr(409, `Estoque insuficiente para: ${faltas.map((f) => `${f.descricao} (falta ${f.faltante})`).join(', ')}. Use parcial=true ou gere cotação.`)
      const itens = await tx.supRequisicaoItem.findMany({ where: { requisicaoId: r.id } })
      const completo = itens.every((i) => i.quantidadeAtendida >= i.quantidade - 1e-9)
      if (completo) await tx.supRequisicao.update({ where: { id: r.id }, data: { status: 'ATENDIDA' } })
      return { afetados, completo }
    }, { timeout: 30_000 })
    if (resultado.completo) { await completeReminders({ tenantId, refType: 'SupRequisicao', refId: r.id }); await notify({ tenantId, userId: r.solicitanteUserId, assunto: `Requisição ${r.numero} atendida`, mensagem: `Os insumos da requisição ${r.numero} foram separados no almoxarifado.`, refType: 'SupRequisicao', refId: r.id }) }
    await checarEstoqueMinimo(tenantId, resultado.afetados)
    res.json({ atendida: resultado.completo, faltas, requisicao: await carregarReq(req, r.id) })
  }))

  // ---------- Cotações ----------
  router.post('/requisicoes/:id/cotacoes', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ fornecedorIds: z.array(z.string()).min(1).max(20), prazoResposta: dateISO().optional(), criterio: z.enum(['MENOR_PRECO', 'MELHOR_PRAZO', 'CUSTO_BENEFICIO']).default('MENOR_PRECO') }), req.body)
    const r = await carregarReq(req, String(req.params.id))
    if (!['APROVADA', 'EM_COTACAO', 'COTADA'].includes(r.status)) throw httpErr(409, 'A requisição precisa estar aprovada para cotar.')
    const forn = await prisma.supFornecedor.findMany({ where: { tenantId, id: { in: d.fornecedorIds }, ativo: true, status: { in: ['ATIVO', 'EM_ANALISE'] } } })
    if (forn.length !== new Set(d.fornecedorIds).size) throw httpErr(400, 'Há fornecedores inexistentes, inativos ou bloqueados na lista.')
    if (forn.length < 3 && r.valorEstimado >= 1000) { /* recomendação: mínimo de 3 cotações para compras relevantes — apenas aviso */ }
    const cot = await prisma.$transaction(async (tx) => {
      const numero = await proximoNumero(tx, tenantId, 'COT')
      const c = await tx.supCotacao.create({ data: { tenantId, numero, requisicaoId: r.id, criterio: d.criterio, prazoResposta: d.prazoResposta, propostas: { create: forn.map((f) => ({ tenantId, fornecedorId: f.id })) } }, include: { propostas: true } })
      await tx.supRequisicao.update({ where: { id: r.id }, data: { status: 'EM_COTACAO' } })
      return c
    })
    await completeReminders({ tenantId, refType: 'SupRequisicao', refId: r.id })
    if (d.prazoResposta) await scheduleReminder({ tenantId, modulo: mod, refType: 'SupCotacao', refId: cot.id, dedupeKey: `sup-cot-${cot.id}`, titulo: `Prazo de resposta da cotação ${cot.numero}`, descricao: 'Registre as propostas recebidas e encerre a cotação.', dueAt: d.prazoResposta, antecedenciaDias: 1, assigneeRole: 'SUPPLIES', severity: 'ATENCAO' })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'ABRIR_COTACAO', refType: 'SupCotacao', refId: cot.id })
    res.status(201).json({ ...cot, aviso: forn.length < 3 && r.valorEstimado >= 1000 ? 'Recomenda-se ao menos 3 fornecedores para compras acima de R$ 1.000.' : undefined })
  }))

  router.get('/cotacoes', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'requisicaoId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [items, total] = await Promise.all([prisma.supCotacao.findMany({ where, include: { propostas: { include: { precos: true } } }, orderBy: { createdAt: 'desc' }, skip, take }), prisma.supCotacao.count({ where })])
    res.json({ items, total, page, pageSize })
  }))

  async function cotacaoCompleta(tenantId: string, id: string) {
    const c = await prisma.supCotacao.findFirst({ where: { id, tenantId }, include: { propostas: { include: { precos: true } }, requisicao: { include: { itens: true } } } })
    if (!c) throw httpErr(404, 'Cotação não encontrada.')
    return c
  }

  router.put('/cotacoes/:id/propostas/:fornecedorId', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ frete: z.coerce.number().min(0).default(0), prazoEntregaDias: z.coerce.number().int().min(0).optional().nullable(), parcelas: z.coerce.number().int().min(1).max(36).default(1), validadeProposta: dateISO().optional().nullable(), observacao: z.string().optional().nullable(), precos: z.array(z.object({ requisicaoItemId: z.string(), precoUnitario: z.coerce.number().min(0) })).min(1) }), req.body)
    const c = await cotacaoCompleta(tenantId, String(req.params.id))
    if (c.status !== 'ABERTA') throw httpErr(409, 'Cotação não está aberta.')
    const prop = c.propostas.find((p) => p.fornecedorId === String(req.params.fornecedorId))
    if (!prop) throw httpErr(404, 'Fornecedor não participa desta cotação.')
    const idsValidos = new Set(c.requisicao.itens.map((i) => i.id))
    if (d.precos.some((p) => !idsValidos.has(p.requisicaoItemId))) throw httpErr(400, 'Há preços para itens que não pertencem à requisição.')
    await prisma.$transaction(async (tx) => {
      await tx.supCotacaoPreco.deleteMany({ where: { propostaId: prop.id } })
      await tx.supCotacaoPreco.createMany({ data: d.precos.map((p) => ({ tenantId, propostaId: prop.id, requisicaoItemId: p.requisicaoItemId, precoUnitario: p.precoUnitario })) })
      await tx.supCotacaoProposta.update({ where: { id: prop.id }, data: { respondeu: true, frete: d.frete, prazoEntregaDias: d.prazoEntregaDias, parcelas: d.parcelas, validadeProposta: d.validadeProposta, observacao: d.observacao } })
    })
    res.json(await cotacaoCompleta(tenantId, c.id))
  }))

  async function mapa(tenantId: string, c: Awaited<ReturnType<typeof cotacaoCompleta>>) {
    const forn = await prisma.supFornecedor.findMany({ where: { tenantId, id: { in: c.propostas.map((p) => p.fornecedorId) } }, select: { id: true, razaoSocial: true, avaliacaoMedia: true, status: true } })
    const m = compararCotacoes(
      c.requisicao.itens.map((i) => ({ id: i.id, quantidade: i.quantidade, precoEstimado: i.precoEstimado })),
      c.propostas.map((p) => ({ fornecedorId: p.fornecedorId, respondeu: p.respondeu, frete: p.frete, prazoEntregaDias: p.prazoEntregaDias, notaFornecedor: forn.find((f) => f.id === p.fornecedorId)?.avaliacaoMedia ?? null, precos: p.precos.map((x) => ({ requisicaoItemId: x.requisicaoItemId, precoUnitario: x.precoUnitario })) })),
      c.criterio as any,
    )
    return { ...m, fornecedores: forn, itens: c.requisicao.itens }
  }

  router.get('/cotacoes/:id/mapa', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await cotacaoCompleta(tenantId, String(req.params.id))
    res.json({ cotacao: { id: c.id, numero: c.numero, status: c.status, criterio: c.criterio, fornecedorVencedorId: c.fornecedorVencedorId }, ...(await mapa(tenantId, c)) })
  }))

  router.post('/cotacoes/:id/encerrar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ fornecedorId: z.string().optional(), justificativa: z.string().optional() }), req.body ?? {})
    const c = await cotacaoCompleta(tenantId, String(req.params.id))
    if (c.status !== 'ABERTA') throw httpErr(409, 'Cotação já encerrada/cancelada.')
    const m = await mapa(tenantId, c)
    if (m.semProposta || !m.vencedor) throw httpErr(409, 'Nenhuma proposta completa (cobrindo todos os itens) foi registrada.')
    let escolhido = m.vencedor
    if (d.fornecedorId && d.fornecedorId !== m.vencedor) {
      const linha = m.linhas.find((l) => l.fornecedorId === d.fornecedorId)
      if (!linha || !linha.cobreTodos) throw httpErr(400, 'O fornecedor escolhido não apresentou proposta completa.')
      if (!d.justificativa) throw httpErr(400, `Justifique a escolha de fornecedor diferente do vencedor pelo critério ${c.criterio}.`)
      escolhido = d.fornecedorId
    }
    const total = m.linhas.find((l) => l.fornecedorId === escolhido)!.total
    const economia = m.referencia != null ? round2(m.referencia - total) : null
    await prisma.$transaction(async (tx) => {
      await tx.supCotacao.update({ where: { id: c.id }, data: { status: 'ENCERRADA', fornecedorVencedorId: escolhido, justificativaEscolha: d.justificativa, valorEscolhido: total, economia, encerradaEm: new Date() } })
      await tx.supRequisicao.update({ where: { id: c.requisicaoId }, data: { status: 'COTADA' } })
    })
    await completeReminders({ tenantId, refType: 'SupCotacao', refId: c.id })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'ENCERRAR_COTACAO', refType: 'SupCotacao', refId: c.id, detalhes: { escolhido, total, economia } })
    res.json({ fornecedorVencedorId: escolhido, valorEscolhido: total, economia, referencia: m.referencia })
  }))

  router.post('/cotacoes/:id/cancelar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await cotacaoCompleta(tenantId, String(req.params.id))
    if (c.status !== 'ABERTA') throw httpErr(409, 'Apenas cotações abertas podem ser canceladas.')
    await prisma.$transaction([prisma.supCotacao.update({ where: { id: c.id }, data: { status: 'CANCELADA' } }), prisma.supRequisicao.update({ where: { id: c.requisicaoId }, data: { status: 'APROVADA' } })])
    await cancelReminders({ tenantId, refType: 'SupCotacao', refId: c.id })
    res.json({ ok: true })
  }))

  // Gera pedido de compra a partir da cotação encerrada (fornecedor vencedor).
  router.post('/cotacoes/:id/gerar-pedido', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ almoxarifadoId: z.string().optional(), previsaoEntrega: dateISO().optional(), parcelas: z.coerce.number().int().min(1).max(36).optional(), intervaloParcelasDias: z.coerce.number().int().min(1).max(180).optional() }), req.body ?? {})
    const c = await cotacaoCompleta(tenantId, String(req.params.id))
    if (c.status !== 'ENCERRADA' || !c.fornecedorVencedorId) throw httpErr(409, 'Encerre a cotação antes de gerar o pedido.')
    const jaTem = await prisma.supPedido.findFirst({ where: { tenantId, cotacaoId: c.id, status: { not: 'CANCELADO' } } })
    if (jaTem) throw httpErr(409, `Já existe o pedido ${jaTem.numero} para esta cotação.`)
    const prop = c.propostas.find((p) => p.fornecedorId === c.fornecedorVencedorId)!
    const almox = d.almoxarifadoId ?? c.requisicao.almoxarifadoId
    if (!almox) throw httpErr(400, 'Informe o almoxarifado de destino.')
    await validarOrigem(tenantId, { almoxarifadoId: almox })
    const forn = await prisma.supFornecedor.findFirst({ where: { id: prop.fornecedorId, tenantId } })
    const itens = c.requisicao.itens.map((ri) => {
      const pr = prop.precos.find((x) => x.requisicaoItemId === ri.id)
      if (!ri.itemId) throw httpErr(400, `O item "${ri.descricao}" não está no catálogo; vincule-o antes de gerar o pedido.`)
      return { tenantId, itemId: ri.itemId, requisicaoItemId: ri.id, quantidade: ri.quantidade, precoUnitario: pr!.precoUnitario }
    })
    const valorItens = round2(itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0))
    const pedido = await prisma.$transaction(async (tx) => {
      const numero = await proximoNumero(tx, tenantId, 'PC')
      const p = await tx.supPedido.create({ data: {
        tenantId, numero, fornecedorId: prop.fornecedorId, requisicaoId: c.requisicaoId, cotacaoId: c.id, almoxarifadoId: almox,
        centroCustoId: c.requisicao.centroCustoId, cursoId: c.requisicao.cursoId, laboratorioId: c.requisicao.laboratorioId,
        valorItens, frete: prop.frete, valorTotal: round2(valorItens + prop.frete), parcelas: d.parcelas ?? prop.parcelas,
        intervaloParcelasDias: d.intervaloParcelasDias ?? Math.max(1, forn?.prazoPagamentoDias ?? 30),
        previsaoEntrega: d.previsaoEntrega ?? (prop.prazoEntregaDias != null ? new Date(Date.now() + prop.prazoEntregaDias * DAY) : null),
        criadoPorId: getUserId(req), itens: { create: itens } }, include: { itens: true } })
      await tx.supRequisicao.update({ where: { id: c.requisicaoId }, data: { status: 'PEDIDO_EMITIDO' } })
      return p
    })
    res.status(201).json(pedido)
  }))

  // ---------- Pedidos de compra ----------
  const pedidoSchema = z.object({
    fornecedorId: z.string(), almoxarifadoId: z.string(), centroCustoId: z.string().optional().nullable(), cursoId: z.string().optional().nullable(), laboratorioId: z.string().optional().nullable(),
    frete: z.coerce.number().min(0).default(0), parcelas: z.coerce.number().int().min(1).max(36).default(1), intervaloParcelasDias: z.coerce.number().int().min(1).max(180).default(30),
    primeiroVencimentoEm: dateISO().optional().nullable(), previsaoEntrega: dateISO().optional().nullable(), observacao: z.string().optional().nullable(),
    itens: z.array(z.object({ itemId: z.string(), quantidade: z.coerce.number().positive(), precoUnitario: z.coerce.number().min(0) })).min(1),
  })
  router.post('/pedidos', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(pedidoSchema, req.body)
    await validarOrigem(tenantId, d)
    const f = await prisma.supFornecedor.findFirst({ where: { id: d.fornecedorId, tenantId, ativo: true } })
    if (!f) throw httpErr(404, 'Fornecedor não encontrado.')
    const itensDb = await prisma.supItem.findMany({ where: { tenantId, id: { in: d.itens.map((i) => i.itemId) }, ativo: true } })
    if (itensDb.length !== new Set(d.itens.map((i) => i.itemId)).size) throw httpErr(404, 'Há itens inexistentes ou inativos.')
    const valorItens = round2(d.itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0))
    const { itens, ...cab } = d
    const p = await prisma.$transaction(async (tx) => {
      const numero = await proximoNumero(tx, tenantId, 'PC')
      return tx.supPedido.create({ data: { ...cab, tenantId, numero, valorItens, valorTotal: round2(valorItens + d.frete), criadoPorId: getUserId(req), itens: { create: itens.map((i) => ({ ...i, tenantId })) } }, include: { itens: true } })
    })
    res.status(201).json(p)
  }))

  router.get('/pedidos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'fornecedorId', 'cursoId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [items, total] = await Promise.all([prisma.supPedido.findMany({ where, include: { itens: true, fornecedor: { select: { razaoSocial: true } } }, orderBy: { createdAt: 'desc' }, skip, take }), prisma.supPedido.count({ where })])
    res.json({ items, total, page, pageSize })
  }))
  router.get('/pedidos/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const p = await prisma.supPedido.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { itens: true, fornecedor: true, recebimentos: { include: { itens: true }, orderBy: { dataRecebimento: 'desc' } } } })
    if (!p) return res.status(404).json({ error: 'Pedido não encontrado.' })
    res.json(p)
  }))

  router.post('/pedidos/:id/emitir', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await prisma.supPedido.findFirst({ where: { id: String(req.params.id), tenantId }, include: { fornecedor: { include: { documentos: true } } } })
    if (!p) throw httpErr(404, 'Pedido não encontrado.')
    if (!podeTransitar(PEDIDO_TRANSICOES, p.status, 'EMITIDO')) throw httpErr(409, `Pedido em ${p.status} não pode ser emitido.`)
    if (p.fornecedor.status === 'BLOQUEADO' || !p.fornecedor.ativo) throw httpErr(409, 'Fornecedor bloqueado/inativo: pedido não pode ser emitido.')
    const vencidos = p.fornecedor.documentos.filter((x) => x.validade && x.validade.getTime() < Date.now())
    const forcar = qs(req.query.forcar) === 'true'
    if (vencidos.length && !(forcar && ['FINANCE', ...SUPER].includes(roleOf(req)))) throw httpErr(409, `Fornecedor com documentos vencidos: ${vencidos.map((v) => v.tipo).join(', ')}. Regularize ou emita com ?forcar=true (Financeiro/Direção).`)
    const up = await prisma.supPedido.update({ where: { id: p.id }, data: { status: 'EMITIDO', emitidoEm: new Date() }, include: { itens: true } })
    if (p.previsaoEntrega) await scheduleReminder({ tenantId, modulo: mod, refType: 'SupPedido', refId: p.id, dedupeKey: `sup-entrega-${p.id}`, titulo: `Entrega prevista do pedido ${p.numero} (${p.fornecedor.razaoSocial})`, dueAt: p.previsaoEntrega, antecedenciaDias: 1, assigneeRole: 'SUPPLIES', severity: 'ATENCAO' })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'EMITIR_PEDIDO', refType: 'SupPedido', refId: p.id, detalhes: { forcado: vencidos.length > 0 } })
    res.json(up)
  }))

  router.post('/pedidos/:id/cancelar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await prisma.supPedido.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) throw httpErr(404, 'Pedido não encontrado.')
    if (!podeTransitar(PEDIDO_TRANSICOES, p.status, 'CANCELADO')) throw httpErr(409, `Pedido em ${p.status} não pode ser cancelado.`)
    if (p.status === 'PARCIALMENTE_RECEBIDO') throw httpErr(409, 'Pedido já tem recebimentos: encerre o saldo pendente em vez de cancelar.')
    await prisma.supPedido.update({ where: { id: p.id }, data: { status: 'CANCELADO' } })
    if (p.requisicaoId) await prisma.supRequisicao.updateMany({ where: { id: p.requisicaoId, tenantId, status: 'PEDIDO_EMITIDO' }, data: { status: 'APROVADA' } })
    await cancelReminders({ tenantId, refType: 'SupPedido', refId: p.id })
    res.json({ ok: true })
  }))

  // Recebimento (total ou parcial): conferência, entrada em estoque, contas a pagar.
  router.post('/pedidos/:id/receber', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({
      notaFiscal: z.string().optional(), observacao: z.string().optional(), primeiroVencimentoEm: dateISO().optional(),
      gerarContasPagar: z.boolean().default(true),
      itens: z.array(z.object({ pedidoItemId: z.string(), quantidadeRecebida: z.coerce.number().min(0), quantidadeRejeitada: z.coerce.number().min(0).default(0), motivoRejeicao: z.string().optional(), loteNumero: z.string().optional(), validade: dateISO().optional() })).min(1),
    }), req.body)
    const userId = getUserId(req)
    const out = await prisma.$transaction(async (tx) => {
      const p = await tx.supPedido.findFirst({ where: { id: String(req.params.id), tenantId }, include: { itens: true, fornecedor: true } })
      if (!p) throw httpErr(404, 'Pedido não encontrado.')
      if (!['EMITIDO', 'PARCIALMENTE_RECEBIDO'].includes(p.status)) throw httpErr(409, `Pedido em ${p.status} não aceita recebimento.`)
      const linhas = d.itens.filter((l) => l.quantidadeRecebida > 0 || l.quantidadeRejeitada > 0)
      if (linhas.length === 0) throw httpErr(400, 'Nenhuma quantidade informada.')
      let valorRecebidoItens = 0
      const movimentados: string[] = []
      const lotesValidade: Array<{ itemId: string; numero: string; validade: Date; almox: string }> = []
      const rec = await tx.supRecebimento.create({ data: { tenantId, pedidoId: p.id, notaFiscal: d.notaFiscal, observacao: d.observacao, recebidoPorId: userId } })
      const fretePct = p.valorItens > 0 ? p.frete / p.valorItens : 0
      for (const l of linhas) {
        const pi = p.itens.find((x) => x.id === l.pedidoItemId)
        if (!pi) throw httpErr(400, `Item de pedido ${l.pedidoItemId} inválido.`)
        const pendente = round3(pi.quantidade - pi.quantidadeRecebida)
        if (l.quantidadeRecebida > pendente + 1e-9) throw httpErr(409, `Quantidade recebida (${l.quantidadeRecebida}) excede o pendente (${pendente}).`)
        if (l.quantidadeRejeitada > 0 && !l.motivoRejeicao) throw httpErr(400, 'Informe o motivo da rejeição.')
        await tx.supRecebimentoItem.create({ data: { tenantId, recebimentoId: rec.id, pedidoItemId: pi.id, itemId: pi.itemId, quantidadeRecebida: l.quantidadeRecebida, quantidadeRejeitada: l.quantidadeRejeitada, motivoRejeicao: l.motivoRejeicao, loteNumero: l.loteNumero, validade: l.validade } })
        if (l.quantidadeRecebida > 0) {
          const custo = round2(pi.precoUnitario * (1 + fretePct))   // frete rateado no custo de entrada
          await movimentarTx(tx, { tenantId, tipo: 'ENTRADA', itemId: pi.itemId, almoxarifadoId: p.almoxarifadoId, quantidade: l.quantidadeRecebida, custoUnitario: custo, loteNumero: l.loteNumero, validade: l.validade, origemTipo: 'RECEBIMENTO', origemId: rec.id, cursoId: p.cursoId ?? undefined, laboratorioId: p.laboratorioId ?? undefined, centroCustoId: p.centroCustoId ?? undefined, motivo: `Pedido ${p.numero}${d.notaFiscal ? ' NF ' + d.notaFiscal : ''}`, userId })
          movimentados.push(pi.itemId)
          if (l.loteNumero && l.validade) lotesValidade.push({ itemId: pi.itemId, numero: l.loteNumero, validade: l.validade, almox: p.almoxarifadoId })
          await tx.supPedidoItem.update({ where: { id: pi.id }, data: { quantidadeRecebida: { increment: l.quantidadeRecebida } } })
          valorRecebidoItens += l.quantidadeRecebida * pi.precoUnitario
          if (pi.requisicaoItemId) await tx.supRequisicaoItem.updateMany({ where: { id: pi.requisicaoItemId }, data: { quantidadeAtendida: { increment: l.quantidadeRecebida } } })
        }
      }
      const valorRec = round2(valorRecebidoItens + (p.valorItens > 0 ? p.frete * (valorRecebidoItens / p.valorItens) : 0))
      await tx.supRecebimento.update({ where: { id: rec.id }, data: { valor: valorRec } })
      const itensAtual = await tx.supPedidoItem.findMany({ where: { pedidoId: p.id } })
      const completo = itensAtual.every((i) => i.quantidadeRecebida >= i.quantidade - 1e-9)
      const novoStatus = completo ? 'RECEBIDO' : 'PARCIALMENTE_RECEBIDO'
      // Contas a pagar com parcelas
      const payableIds: string[] = []
      if (d.gerarContasPagar && valorRec > 0) {
        let ccId: string | null = null
        if (p.centroCustoId) ccId = (await tx.eduCostCenter.findFirst({ where: { id: p.centroCustoId, tenantId }, select: { id: true } }))?.id ?? null
        const cat = await tx.supItem.findFirst({ where: { id: p.itens[0].itemId }, include: { categoria: true } })
        const primeiro = d.primeiroVencimentoEm ?? p.primeiroVencimentoEm ?? new Date(Date.now() + (p.fornecedor.prazoPagamentoDias || p.intervaloParcelasDias) * DAY)
        const parcelas = parcelar(valorRec, p.parcelas, primeiro, p.intervaloParcelasDias)
        for (const pc of parcelas) {
          const ap = await tx.accountPayable.create({ data: { tenantId, costCenterId: ccId, descricao: `Pedido ${p.numero}${d.notaFiscal ? ' NF ' + d.notaFiscal : ''} — parcela ${pc.numero}/${parcelas.length}`, fornecedor: p.fornecedor.razaoSocial, categoria: cat?.categoria?.nome ?? 'suprimentos', valor: pc.valor, dataVencimento: pc.vencimento } })
          payableIds.push(ap.id)
        }
      }
      await tx.supPedido.update({ where: { id: p.id }, data: { status: novoStatus, recebidoEm: completo ? new Date() : null, payableIds: { push: payableIds } } })
      if (completo && p.requisicaoId) {
        await tx.supRequisicao.update({ where: { id: p.requisicaoId }, data: { status: 'ATENDIDA' } })
      }
      return { recebimentoId: rec.id, valor: valorRec, status: novoStatus, completo, payableIds, movimentados, lotesValidade, pedido: p }
    }, { timeout: 60_000 })

    if (out.completo) await completeReminders({ tenantId, refType: 'SupPedido', refId: out.pedido.id, userId })
    for (const l of out.lotesValidade) {
      const it = await prisma.supItem.findFirst({ where: { id: l.itemId, tenantId }, select: { nome: true } })
      await scheduleReminder({ tenantId, modulo: mod, refType: 'SupLote', refId: `${l.almox}:${l.itemId}:${l.numero}`, dedupeKey: `sup-lote-${l.almox}-${l.itemId}-${l.numero}`, titulo: `Lote ${l.numero} de ${it?.nome ?? 'item'} vence em ${l.validade.toLocaleDateString('pt-BR')}`, dueAt: l.validade, antecedenciaDias: 30, assigneeRole: 'SUPPLIES', severity: 'ATENCAO' })
    }
    await checarEstoqueMinimo(tenantId, out.movimentados)
    await audit({ tenantId, userId, modulo: mod, acao: 'RECEBER_PEDIDO', refType: 'SupPedido', refId: out.pedido.id, detalhes: { recebimentoId: out.recebimentoId, valor: out.valor, payableIds: out.payableIds } })
    res.status(201).json({ recebimentoId: out.recebimentoId, valor: out.valor, statusPedido: out.status, contasPagarIds: out.payableIds })
  }))

  // Encerra o saldo pendente de um pedido parcialmente recebido (entrega não completada).
  router.post('/pedidos/:id/encerrar-saldo', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await prisma.supPedido.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) throw httpErr(404, 'Pedido não encontrado.')
    if (p.status !== 'PARCIALMENTE_RECEBIDO') throw httpErr(409, 'Somente pedidos parcialmente recebidos.')
    await prisma.supPedido.update({ where: { id: p.id }, data: { status: 'RECEBIDO', recebidoEm: new Date(), observacao: `${p.observacao ?? ''} [saldo encerrado]`.trim() } })
    await completeReminders({ tenantId, refType: 'SupPedido', refId: p.id })
    res.json({ ok: true })
  }))
}
