import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, pageParams, qs, dateISO } from '../core/crud'
import { audit } from '../core/notify'
import { getBranding, brandHeaderHtml, escapeHtml as esc } from '../core/branding'
import { scheduleReminder, completeReminders } from '../core/reminders'
import { depreciacaoLinear, classificarDivergencia, resumoInventario } from './calc'
import { GESTAO, LEITURA, MODULO, ensureSpace, fail, money, nextSeq, parseDateQ } from './util'

const ESTADOS = ['NOVO', 'BOM', 'REGULAR', 'RUIM', 'INSERVIVEL'] as const

export function depreciacaoDoBem(bem: any, categoria: any, ref = new Date()) {
  return depreciacaoLinear({
    valorAquisicao: bem.valorAquisicao,
    dataAquisicao: bem.dataAquisicao,
    vidaUtilMeses: bem.vidaUtilMeses ?? categoria?.vidaUtilMeses ?? 120,
    valorResidual: bem.valorResidual ?? undefined,
    residualPct: categoria?.valorResidualPct ?? 0,
    dataReferencia: ref,
    dataBaixa: bem.baixadoEm,
  })
}

async function registrarMov(tenantId: string, bemId: string, userId: string, data: any) {
  return prisma.infMovimentacaoBem.create({ data: { tenantId, bemId, userId, ...data } })
}

export function mountPatrimonio(router: Router) {
  mountCrud(router, {
    model: 'infCategoriaBem',
    path: '/categorias-bem',
    read: LEITURA,
    write: GESTAO,
    modulo: MODULO,
    create: z.object({
      codigo: z.string().min(1).max(30).transform((s) => s.toUpperCase()),
      nome: z.string().min(2),
      vidaUtilMeses: z.number().int().min(1).max(1200).default(120),
      valorResidualPct: z.number().min(0).max(100).default(10),
      grupo: z.string().optional().nullable(),
      ativo: z.boolean().optional(),
    }),
    search: ['nome', 'codigo'],
    filters: ['grupo', 'ativo'],
    orderBy: { nome: 'asc' },
  })

  const bemCreate = z.object({
    tombamento: z.string().min(1).max(40).optional(),
    descricao: z.string().min(2),
    categoriaId: z.string().min(1),
    marca: z.string().optional().nullable(),
    modelo: z.string().optional().nullable(),
    numeroSerie: z.string().optional().nullable(),
    notaFiscal: z.string().optional().nullable(),
    fornecedorId: z.string().optional().nullable(),
    valorAquisicao: z.number().min(0),
    dataAquisicao: dateISO(),
    vidaUtilMeses: z.number().int().min(1).optional().nullable(),
    valorResidual: z.number().min(0).optional().nullable(),
    spaceId: z.string().optional().nullable(),
    responsavelUserId: z.string().optional().nullable(),
    estado: z.enum(ESTADOS).default('NOVO'),
    criticidade: z.enum(['BAIXA', 'NORMAL', 'ALTA', 'CRITICA']).default('NORMAL'),
    fotoUrl: z.string().url().optional().nullable(),
    garantiaAte: dateISO().optional().nullable(),
    observacoes: z.string().optional().nullable(),
  })

  router.post(
    '/bens',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const d = parseBody(bemCreate, req.body)
      const cat = await prisma.infCategoriaBem.findFirst({ where: { id: d.categoriaId, tenantId } })
      if (!cat) fail(400, 'Categoria não encontrada.')
      await ensureSpace(tenantId, d.spaceId)
      if (d.dataAquisicao.getTime() > Date.now() + 86_400_000) fail(400, 'Data de aquisição no futuro.')
      let tombamento = d.tombamento?.trim()
      if (!tombamento) tombamento = `PAT-${String(await nextSeq(tenantId, 'PAT')).padStart(6, '0')}`
      const dup = await prisma.infBem.findFirst({ where: { tenantId, tombamento } })
      if (dup) fail(409, `Tombamento ${tombamento} já existe.`)
      const bem = await prisma.infBem.create({ data: { ...d, tombamento, tenantId } })
      await registrarMov(tenantId, bem.id, userId, { tipo: 'CADASTRO', destinoSpaceId: bem.spaceId, destinoResponsavelId: bem.responsavelUserId, estadoNovo: bem.estado, motivo: 'Cadastro do bem' })
      await audit({ tenantId, userId, modulo: MODULO, acao: 'BEM_CADASTRADO', refType: 'InfBem', refId: bem.id })
      if (bem.garantiaAte && bem.garantiaAte.getTime() > Date.now()) {
        await scheduleReminder({
          tenantId, modulo: MODULO, titulo: `Garantia vence: ${bem.descricao} (${bem.tombamento})`, dueAt: bem.garantiaAte, antecedenciaDias: 30,
          refType: 'InfBem', refId: bem.id, assigneeRole: 'FACILITIES', dedupeKey: `inf-garantia-${bem.id}`,
        })
      }
      res.status(201).json({ ...bem, depreciacao: depreciacaoDoBem(bem, cat) })
    }),
  )

  router.get(
    '/bens',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      for (const f of ['categoriaId', 'spaceId', 'status', 'estado', 'responsavelUserId', 'criticidade']) {
        const v = qs((req.query as any)[f])
        if (v) where[f] = v
      }
      const q = qs(req.query.q)
      if (q) where.OR = ['descricao', 'tombamento', 'numeroSerie', 'marca', 'modelo'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' } }))
      const [rows, total] = await Promise.all([
        prisma.infBem.findMany({ where, include: { categoria: true }, orderBy: { tombamento: 'asc' }, skip, take }),
        prisma.infBem.count({ where }),
      ])
      const items = rows.map((b) => ({ ...b, depreciacao: depreciacaoDoBem(b, b.categoria) }))
      res.json({ items, total, page, pageSize })
    }),
  )

  router.get(
    '/bens/:id',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const bem = await prisma.infBem.findFirst({
        where: { id: String(req.params.id), tenantId },
        include: { categoria: true, movimentacoes: { orderBy: { createdAt: 'desc' }, take: 100 } },
      })
      if (!bem) return res.status(404).json({ error: 'Bem não encontrado.' })
      const ordens = await prisma.infOrdemServico.findMany({ where: { tenantId, bemId: bem.id }, orderBy: { abertaEm: 'desc' }, take: 50 })
      const custoManutencao = ordens.reduce((s, o) => s + o.custoMaoObra + o.custoPecas, 0)
      res.json({ ...bem, depreciacao: depreciacaoDoBem(bem, bem.categoria), ordensServico: ordens, custoManutencao: money(custoManutencao) })
    }),
  )

  const bemPatch = bemCreate.partial().omit({ tombamento: true, spaceId: true, responsavelUserId: true, estado: true })
  router.patch(
    '/bens/:id',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const id = String(req.params.id)
      const cur = await prisma.infBem.findFirst({ where: { id, tenantId } })
      if (!cur) return res.status(404).json({ error: 'Bem não encontrado.' })
      if (cur.status === 'BAIXADO') fail(409, 'Bem baixado não pode ser editado; reative-o antes.')
      const d = parseBody(bemPatch, req.body)
      if (d.categoriaId) {
        const c = await prisma.infCategoriaBem.findFirst({ where: { id: d.categoriaId, tenantId } })
        if (!c) fail(400, 'Categoria não encontrada.')
      }
      const bem = await prisma.infBem.update({ where: { id }, data: d })
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'BEM_ATUALIZADO', refType: 'InfBem', refId: id })
      res.json(bem)
    }),
  )

  const transfer = z.object({ spaceId: z.string().optional().nullable(), responsavelUserId: z.string().optional().nullable(), motivo: z.string().min(3), documento: z.string().optional() })
  router.post(
    '/bens/:id/transferir',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const id = String(req.params.id)
      const d = parseBody(transfer, req.body)
      const cur = await prisma.infBem.findFirst({ where: { id, tenantId } })
      if (!cur) return res.status(404).json({ error: 'Bem não encontrado.' })
      if (cur.status === 'BAIXADO') fail(409, 'Bem baixado não pode ser transferido.')
      if (d.spaceId === undefined && d.responsavelUserId === undefined) fail(400, 'Informe spaceId e/ou responsavelUserId.')
      await ensureSpace(tenantId, d.spaceId)
      const mudouLocal = d.spaceId !== undefined && d.spaceId !== cur.spaceId
      const mudouResp = d.responsavelUserId !== undefined && d.responsavelUserId !== cur.responsavelUserId
      if (!mudouLocal && !mudouResp) fail(400, 'Nada a transferir: destino igual à situação atual.')
      const bem = await prisma.infBem.update({
        where: { id },
        data: { ...(mudouLocal ? { spaceId: d.spaceId } : {}), ...(mudouResp ? { responsavelUserId: d.responsavelUserId } : {}) },
      })
      await registrarMov(tenantId, id, userId, {
        tipo: mudouLocal ? 'TRANSFERENCIA' : 'MUDANCA_RESPONSAVEL',
        origemSpaceId: cur.spaceId, destinoSpaceId: bem.spaceId,
        origemResponsavelId: cur.responsavelUserId, destinoResponsavelId: bem.responsavelUserId,
        motivo: d.motivo, documento: d.documento,
      })
      await audit({ tenantId, userId, modulo: MODULO, acao: 'BEM_TRANSFERIDO', refType: 'InfBem', refId: id, detalhes: { de: cur.spaceId, para: bem.spaceId } })
      res.json(bem)
    }),
  )

  router.post(
    '/bens/:id/estado',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const id = String(req.params.id)
      const d = parseBody(z.object({ estado: z.enum(ESTADOS), motivo: z.string().optional() }), req.body)
      const cur = await prisma.infBem.findFirst({ where: { id, tenantId } })
      if (!cur) return res.status(404).json({ error: 'Bem não encontrado.' })
      if (cur.status === 'BAIXADO') fail(409, 'Bem baixado.')
      const bem = await prisma.infBem.update({ where: { id }, data: { estado: d.estado } })
      await registrarMov(tenantId, id, userId, { tipo: 'MUDANCA_ESTADO', estadoAnterior: cur.estado, estadoNovo: d.estado, motivo: d.motivo })
      res.json(bem)
    }),
  )

  router.post(
    '/bens/:id/baixar',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const id = String(req.params.id)
      const d = parseBody(z.object({ motivo: z.string().min(5), documento: z.string().optional(), data: dateISO().optional() }), req.body)
      const cur = await prisma.infBem.findFirst({ where: { id, tenantId }, include: { categoria: true } })
      if (!cur) return res.status(404).json({ error: 'Bem não encontrado.' })
      if (cur.status === 'BAIXADO') fail(409, 'Bem já está baixado.')
      const abertas = await prisma.infOrdemServico.count({ where: { tenantId, bemId: id, status: { in: ['ABERTA', 'AGENDADA', 'EM_EXECUCAO', 'AGUARDANDO_PECA'] } } })
      const quando = d.data ?? new Date()
      const bem = await prisma.infBem.update({ where: { id }, data: { status: 'BAIXADO', baixadoEm: quando, motivoBaixa: d.motivo } })
      await registrarMov(tenantId, id, userId, { tipo: 'BAIXA', origemSpaceId: cur.spaceId, estadoAnterior: cur.estado, motivo: d.motivo, documento: d.documento })
      // planos preventivos do bem deixam de gerar OS; OS abertas são canceladas
      await prisma.infPlanoPreventivo.updateMany({ where: { tenantId, bemId: id, ativo: true }, data: { ativo: false } })
      if (abertas > 0) await prisma.infOrdemServico.updateMany({ where: { tenantId, bemId: id, status: { in: ['ABERTA', 'AGENDADA'] } }, data: { status: 'CANCELADA' } })
      await completeReminders({ tenantId, refType: 'InfBem', refId: id, userId })
      await audit({ tenantId, userId, modulo: MODULO, acao: 'BEM_BAIXADO', refType: 'InfBem', refId: id, detalhes: { motivo: d.motivo, valorContabil: depreciacaoDoBem(cur, cur.categoria, quando).valorContabil } })
      res.json({ ...bem, depreciacao: depreciacaoDoBem(bem, cur.categoria), osAbertasRestantes: Math.max(0, abertas) })
    }),
  )

  router.post(
    '/bens/:id/reativar',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const id = String(req.params.id)
      const d = parseBody(z.object({ motivo: z.string().min(3) }), req.body)
      const cur = await prisma.infBem.findFirst({ where: { id, tenantId } })
      if (!cur) return res.status(404).json({ error: 'Bem não encontrado.' })
      if (cur.status !== 'BAIXADO') fail(409, 'Bem não está baixado.')
      const bem = await prisma.infBem.update({ where: { id }, data: { status: 'ATIVO', baixadoEm: null, motivoBaixa: null } })
      await registrarMov(tenantId, id, getUserId(req), { tipo: 'REATIVACAO', motivo: d.motivo })
      res.json(bem)
    }),
  )

  router.get(
    '/bens/:id/depreciacao',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const bem = await prisma.infBem.findFirst({ where: { id: String(req.params.id), tenantId }, include: { categoria: true } })
      if (!bem) return res.status(404).json({ error: 'Bem não encontrado.' })
      const ref = parseDateQ(req.query.data, new Date())
      // tabela mês a mês (até 120 linhas) para fins contábeis
      const base = depreciacaoDoBem(bem, bem.categoria, ref)
      const tabela: Array<{ mes: number; acumulada: number; valorContabil: number }> = []
      const vida = bem.vidaUtilMeses ?? bem.categoria.vidaUtilMeses
      for (let m = 0; m <= Math.min(vida, 120); m++) {
        const dt = new Date(bem.dataAquisicao)
        dt.setMonth(dt.getMonth() + m)
        const r = depreciacaoDoBem({ ...bem, baixadoEm: null }, bem.categoria, dt)
        tabela.push({ mes: m, acumulada: r.depreciacaoAcumulada, valorContabil: r.valorContabil })
      }
      res.json({ bemId: bem.id, tombamento: bem.tombamento, dataReferencia: ref, ...base, tabela })
    }),
  )

  // Dados de etiqueta/QR (o front gera a imagem do QR a partir de qrPayload).
  async function dadosEtiqueta(tenantId: string, bens: any[]) {
    const spaceIds = [...new Set(bens.map((b) => b.spaceId).filter(Boolean))]
    const spaces = spaceIds.length ? await prisma.eduSpace.findMany({ where: { tenantId, id: { in: spaceIds } } }) : []
    const sm = new Map(spaces.map((s) => [s.id, s]))
    const b = await getBranding(tenantId)
    return {
      instituicao: { nome: b.nome, sigla: b.sigla, logo: b.logoPrincipal },
      etiquetas: bens.map((x) => ({
        bemId: x.id, tombamento: x.tombamento, descricao: x.descricao, categoria: x.categoria?.nome,
        local: x.spaceId ? sm.get(x.spaceId)?.nome ?? null : null,
        codigoLocal: x.spaceId ? sm.get(x.spaceId)?.codigo ?? null : null,
        qrPayload: JSON.stringify({ t: 'INF_BEM', id: x.id, tomb: x.tombamento }),
      })),
    }
  }

  router.get(
    '/bens/:id/etiqueta',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const bem = await prisma.infBem.findFirst({ where: { id: String(req.params.id), tenantId }, include: { categoria: true } })
      if (!bem) return res.status(404).json({ error: 'Bem não encontrado.' })
      const r = await dadosEtiqueta(tenantId, [bem])
      res.json({ instituicao: r.instituicao, ...r.etiquetas[0] })
    }),
  )

  router.post(
    '/etiquetas',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ ids: z.array(z.string()).max(500).optional(), spaceId: z.string().optional(), categoriaId: z.string().optional() }), req.body)
      if (!d.ids?.length && !d.spaceId && !d.categoriaId) fail(400, 'Informe ids, spaceId ou categoriaId.')
      const bens = await prisma.infBem.findMany({
        where: { tenantId, status: { not: 'BAIXADO' }, ...(d.ids?.length ? { id: { in: d.ids } } : {}), ...(d.spaceId ? { spaceId: d.spaceId } : {}), ...(d.categoriaId ? { categoriaId: d.categoriaId } : {}) },
        include: { categoria: true }, take: 500, orderBy: { tombamento: 'asc' },
      })
      res.json(await dadosEtiqueta(tenantId, bens))
    }),
  )

  // Consulta rápida por leitura de QR/tombamento
  router.get(
    '/bens-por-tombamento/:tomb',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const bem = await prisma.infBem.findFirst({ where: { tenantId: getTenantId(req), tombamento: String(req.params.tomb) }, include: { categoria: true } })
      if (!bem) return res.status(404).json({ error: 'Bem não encontrado.' })
      res.json({ ...bem, depreciacao: depreciacaoDoBem(bem, bem.categoria) })
    }),
  )

  // ---------- Relatório de patrimônio ----------
  router.get(
    '/relatorios/patrimonio',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const ref = parseDateQ(req.query.data, new Date())
      const bens = await prisma.infBem.findMany({ where: { tenantId, ...(qs(req.query.spaceId) ? { spaceId: qs(req.query.spaceId) } : {}) }, include: { categoria: true } })
      const spaces = await prisma.eduSpace.findMany({ where: { tenantId }, select: { id: true, nome: true, codigo: true } })
      const sm = new Map(spaces.map((s) => [s.id, s]))
      const porCategoria: Record<string, any> = {}
      const porLocal: Record<string, any> = {}
      const porStatus: Record<string, number> = {}
      const porEstado: Record<string, number> = {}
      let totalAq = 0, totalCont = 0, totalDep = 0, ativos = 0
      for (const b of bens) {
        porStatus[b.status] = (porStatus[b.status] ?? 0) + 1
        if (b.status === 'BAIXADO') continue
        ativos++
        porEstado[b.estado] = (porEstado[b.estado] ?? 0) + 1
        const dep = depreciacaoDoBem(b, b.categoria, ref)
        totalAq += b.valorAquisicao; totalCont += dep.valorContabil; totalDep += dep.depreciacaoAcumulada
        const ck = b.categoria.nome
        const c = (porCategoria[ck] ??= { categoria: ck, quantidade: 0, valorAquisicao: 0, valorContabil: 0 })
        c.quantidade++; c.valorAquisicao += b.valorAquisicao; c.valorContabil += dep.valorContabil
        const lk = b.spaceId ? sm.get(b.spaceId)?.nome ?? 'Local desconhecido' : 'Sem localização'
        const l = (porLocal[lk] ??= { local: lk, quantidade: 0, valorContabil: 0 })
        l.quantidade++; l.valorContabil += dep.valorContabil
      }
      const fmt = (o: Record<string, any>) => Object.values(o).map((x: any) => ({ ...x, valorAquisicao: x.valorAquisicao != null ? money(x.valorAquisicao) : undefined, valorContabil: money(x.valorContabil) })).sort((a: any, b: any) => b.valorContabil - a.valorContabil)
      const out = {
        dataReferencia: ref, bensAtivos: ativos, totalBens: bens.length,
        valorAquisicaoTotal: money(totalAq), valorContabilTotal: money(totalCont), depreciacaoAcumuladaTotal: money(totalDep),
        semLocalizacao: bens.filter((b) => b.status !== 'BAIXADO' && !b.spaceId).length,
        semResponsavel: bens.filter((b) => b.status !== 'BAIXADO' && !b.responsavelUserId).length,
        totalmenteDepreciados: bens.filter((b) => b.status !== 'BAIXADO' && depreciacaoDoBem(b, b.categoria, ref).totalmenteDepreciado).length,
        porStatus, porEstado, porCategoria: fmt(porCategoria), porLocal: fmt(porLocal),
      }
      if (qs(req.query.format) === 'html') {
        const b = await getBranding(tenantId)
        const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        const tbl = (rows: any[], k: string) => `<table style="width:100%;border-collapse:collapse;font:13px sans-serif;margin:8px 0">${`<tr style="background:#f1f5f9"><th align=left>${k}</th><th>Qtd</th><th align=right>Valor contábil</th></tr>`}${rows.map((r) => `<tr><td>${esc(r.categoria ?? r.local)}</td><td align=center>${r.quantidade}</td><td align=right>${brl(r.valorContabil)}</td></tr>`).join('')}</table>`
        res.type('html').send(`<!doctype html><meta charset="utf-8"><body style="max-width:900px;margin:auto">${brandHeaderHtml(b, { titulo: 'Relatório de Patrimônio', subtitulo: `Posição em ${ref.toLocaleDateString('pt-BR')}` })}
<div style="padding:16px 28px;font:14px sans-serif"><p><b>Bens ativos:</b> ${ativos} · <b>Aquisição:</b> ${brl(out.valorAquisicaoTotal)} · <b>Contábil:</b> ${brl(out.valorContabilTotal)} · <b>Depreciação acumulada:</b> ${brl(out.depreciacaoAcumuladaTotal)}</p>
<p>Sem localização: ${out.semLocalizacao} · Sem responsável: ${out.semResponsavel} · Totalmente depreciados: ${out.totalmenteDepreciados}</p>
<h3>Por categoria</h3>${tbl(out.porCategoria, 'Categoria')}<h3>Por local</h3>${tbl(out.porLocal, 'Local')}</div></body>`)
        return
      }
      res.json(out)
    }),
  )

  // ---------- Inventário periódico ----------
  router.post(
    '/inventarios',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const d = parseBody(z.object({ titulo: z.string().min(3), spaceId: z.string().optional().nullable(), categoriaId: z.string().optional().nullable(), responsavelUserId: z.string().optional().nullable(), prazoEm: dateISO().optional().nullable() }), req.body)
      await ensureSpace(tenantId, d.spaceId)
      const bens = await prisma.infBem.findMany({
        where: { tenantId, status: { not: 'BAIXADO' }, ...(d.spaceId ? { spaceId: d.spaceId } : {}), ...(d.categoriaId ? { categoriaId: d.categoriaId } : {}) },
        select: { id: true, spaceId: true },
      })
      if (bens.length === 0) fail(400, 'Nenhum bem no escopo do inventário.')
      const inv = await prisma.infInventario.create({
        data: { tenantId, ...d, responsavelUserId: d.responsavelUserId ?? userId, itens: { create: bens.map((b) => ({ tenantId, bemId: b.id, spaceEsperadoId: b.spaceId })) } },
      })
      if (inv.prazoEm) {
        await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Concluir inventário: ${inv.titulo}`, dueAt: inv.prazoEm, refType: 'InfInventario', refId: inv.id, assigneeUserId: inv.responsavelUserId ?? undefined, assigneeRole: 'FACILITIES', antecedenciaDias: 5, dedupeKey: `inf-inv-${inv.id}` })
      }
      await audit({ tenantId, userId, modulo: MODULO, acao: 'INVENTARIO_ABERTO', refType: 'InfInventario', refId: inv.id, detalhes: { itens: bens.length } })
      res.status(201).json({ ...inv, totalItens: bens.length })
    }),
  )

  router.get(
    '/inventarios',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId, ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}) }
      const [items, total] = await Promise.all([
        prisma.infInventario.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { _count: { select: { itens: true } } } }),
        prisma.infInventario.count({ where }),
      ])
      res.json({ items, total, page, pageSize })
    }),
  )

  router.get(
    '/inventarios/:id',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const inv = await prisma.infInventario.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!inv) return res.status(404).json({ error: 'Inventário não encontrado.' })
      const apenasDiv = qs(req.query.divergentes) === 'true'
      const itens = await prisma.infInventarioItem.findMany({ where: { tenantId, inventarioId: inv.id, ...(apenasDiv ? { divergencia: { not: 'NENHUMA' } } : {}) }, orderBy: { createdAt: 'asc' }, take: 5000 })
      const todos = await prisma.infInventarioItem.findMany({ where: { tenantId, inventarioId: inv.id }, select: { contado: true, divergencia: true } })
      const contados = todos.filter((i) => i.contado).length
      res.json({ ...inv, itens, progresso: { total: todos.length, contados, pct: todos.length ? money((contados / todos.length) * 100) : 0 } })
    }),
  )

  // Registro de contagem por tombamento (leitura de QR/etiqueta).
  router.post(
    '/inventarios/:id/contagem',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const d = parseBody(z.object({ tombamento: z.string().min(1), spaceId: z.string().optional().nullable(), estado: z.enum(ESTADOS).optional(), observacao: z.string().optional() }), req.body)
      const inv = await prisma.infInventario.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!inv) return res.status(404).json({ error: 'Inventário não encontrado.' })
      if (inv.status !== 'ABERTO') fail(409, 'Inventário não está aberto.')
      await ensureSpace(tenantId, d.spaceId)
      const bem = await prisma.infBem.findFirst({ where: { tenantId, tombamento: d.tombamento.trim() } })
      let item = bem ? await prisma.infInventarioItem.findFirst({ where: { tenantId, inventarioId: inv.id, bemId: bem.id } }) : null
      const agora = new Date()
      if (!bem) {
        item = await prisma.infInventarioItem.create({ data: { tenantId, inventarioId: inv.id, tombamentoLido: d.tombamento, spaceEncontradoId: d.spaceId ?? inv.spaceId, estadoEncontrado: d.estado, contado: true, divergencia: 'SOBRA', observacao: d.observacao ?? 'Etiqueta sem bem cadastrado', contadoPorId: userId, contadoEm: agora } })
        return res.status(201).json(item)
      }
      const spaceEnc = d.spaceId ?? inv.spaceId ?? item?.spaceEsperadoId ?? bem.spaceId
      const divergencia = classificarDivergencia({ contado: true, spaceEsperadoId: bem.spaceId, spaceEncontradoId: spaceEnc, estadoEsperado: bem.estado, estadoEncontrado: d.estado })
      const data = { contado: true, spaceEncontradoId: spaceEnc, estadoEncontrado: d.estado ?? bem.estado, divergencia, observacao: d.observacao, contadoPorId: userId, contadoEm: agora }
      item = item
        ? await prisma.infInventarioItem.update({ where: { id: item.id }, data })
        : await prisma.infInventarioItem.create({ data: { ...data, tenantId, inventarioId: inv.id, bemId: bem.id, spaceEsperadoId: bem.spaceId } })
      res.json({ item, bem: { id: bem.id, tombamento: bem.tombamento, descricao: bem.descricao } })
    }),
  )

  router.post(
    '/inventarios/:id/fechar',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const d = parseBody(z.object({ aplicarAjustes: z.boolean().default(false), permitirIncompleto: z.boolean().default(false) }), req.body ?? {})
      const inv = await prisma.infInventario.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!inv) return res.status(404).json({ error: 'Inventário não encontrado.' })
      if (inv.status !== 'ABERTO') fail(409, 'Inventário não está aberto.')
      const itens = await prisma.infInventarioItem.findMany({ where: { tenantId, inventarioId: inv.id } })
      const naoContados = itens.filter((i) => !i.contado).length
      if (naoContados > 0 && !d.permitirIncompleto) fail(409, `${naoContados} item(ns) ainda não contados. Conte-os ou use permitirIncompleto=true (serão marcados NAO_ENCONTRADO).`)
      let ajustes = 0
      for (const it of itens) {
        const div = it.contado ? it.divergencia : 'NAO_ENCONTRADO'
        if (div !== it.divergencia) await prisma.infInventarioItem.update({ where: { id: it.id }, data: { divergencia: div } })
        if (d.aplicarAjustes && it.bemId) {
          if (div === 'LOCAL_DIVERGENTE' && it.spaceEncontradoId) {
            await prisma.infBem.update({ where: { id: it.bemId }, data: { spaceId: it.spaceEncontradoId } })
            await registrarMov(tenantId, it.bemId, userId, { tipo: 'TRANSFERENCIA', origemSpaceId: it.spaceEsperadoId, destinoSpaceId: it.spaceEncontradoId, motivo: `Ajuste de inventário ${inv.titulo}` })
            ajustes++
          } else if (div === 'ESTADO_DIVERGENTE' && it.estadoEncontrado) {
            const b = await prisma.infBem.findFirst({ where: { id: it.bemId, tenantId } })
            await prisma.infBem.update({ where: { id: it.bemId }, data: { estado: it.estadoEncontrado } })
            await registrarMov(tenantId, it.bemId, userId, { tipo: 'MUDANCA_ESTADO', estadoAnterior: b?.estado, estadoNovo: it.estadoEncontrado, motivo: `Ajuste de inventário ${inv.titulo}` })
            ajustes++
          }
        }
      }
      const final = await prisma.infInventarioItem.findMany({ where: { tenantId, inventarioId: inv.id }, select: { divergencia: true } })
      const resumo = { ...resumoInventario(final.map((i) => i.divergencia as any)), ajustesAplicados: ajustes }
      const fechado = await prisma.infInventario.update({ where: { id: inv.id }, data: { status: 'FECHADO', fechadoEm: new Date(), resumo } })
      await completeReminders({ tenantId, refType: 'InfInventario', refId: inv.id, userId })
      await audit({ tenantId, userId, modulo: MODULO, acao: 'INVENTARIO_FECHADO', refType: 'InfInventario', refId: inv.id, detalhes: resumo })
      res.json(fechado)
    }),
  )

  router.post(
    '/inventarios/:id/cancelar',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const inv = await prisma.infInventario.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!inv) return res.status(404).json({ error: 'Inventário não encontrado.' })
      if (inv.status !== 'ABERTO') fail(409, 'Inventário não está aberto.')
      await completeReminders({ tenantId, refType: 'InfInventario', refId: inv.id })
      res.json(await prisma.infInventario.update({ where: { id: inv.id }, data: { status: 'CANCELADO' } }))
    }),
  )
}
