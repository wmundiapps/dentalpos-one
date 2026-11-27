import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { mountCrud } from '../core/crud'
import { audit } from '../core/notify'
import { AuthenticatedRequest, READ, Response, WRITE, agendarVencimento, alertaDe, asyncHandler, assertNoTenant, checarVigencia, fail, mountLista, optDate, optMoney, optStr, pageParams, parseBody, proximoCodigo, qs, requireRole, tid, uid } from './common'
import { bloquearStatus, mountCiclo, travarStatus } from './ciclo'
import { aplicarReajuste, diasAte, gerarParcelas, r2 } from './logic'

const NATUREZAS = ['LOCACAO_PAGA', 'LOCACAO_RECEBIDA', 'COMPRA', 'VENDA', 'COMODATO'] as const
const GARANTIAS = ['CAUCAO', 'FIADOR', 'SEGURO_FIANCA', 'TITULO_CAPITALIZACAO', 'NENHUMA'] as const

export const lembreteLocacao = (l: any, reabrir = false) => agendarVencimento({
  tenantId: l.tenantId, refType: 'JurLocacao', refId: l.id, tag: 'locacao', titulo: `Contrato de locação ${l.codigo} (${l.locadorNome} x ${l.locatarioNome})`,
  descricao: 'Negocie a renovação (ação renovatória exige prazo) ou programe a desocupação.', due: l.vigenciaFim, ativo: l.status === 'VIGENTE', reabrir,
})

const imovel = z.object({
  apelido: z.string().min(2).max(120), tipo: z.enum(['PREDIO', 'TERRENO', 'SALA', 'POLO', 'GALPAO', 'OUTRO']).optional(),
  propriedade: z.enum(['PROPRIO', 'ALUGADO', 'CEDIDO', 'EM_NEGOCIACAO']).optional(), logradouro: optStr(200), numero: optStr(20), bairro: optStr(100),
  cidade: optStr(100), uf: z.string().length(2).nullish(), cep: optStr(12), matricula: optStr(60), inscricaoIptu: optStr(60), areaM2: z.number().min(0).max(1e7).nullish(),
  spaceId: optStr(80), observacoes: optStr(), ativo: z.boolean().optional(),
})

const locacao = z.object({
  codigo: z.string().min(3).max(40).optional(), imovelId: z.string().uuid(), natureza: z.enum(NATUREZAS).optional(), locadorNome: z.string().min(2).max(200), locadorDoc: optStr(30),
  locatarioNome: z.string().min(2).max(200), locatarioDoc: optStr(30), valorMensal: z.number().finite().min(0).max(1e9), diaVencimento: z.number().int().min(1).max(31).optional(),
  indiceReajuste: z.enum(['IGPM', 'IPCA', 'INPC', 'FIXO', 'NENHUM']).optional(), percentualFixo: z.number().min(-20).max(100).nullish(), mesReajuste: z.number().int().min(1).max(12).nullish(),
  vigenciaInicio: z.coerce.date(), vigenciaFim: z.coerce.date(), garantiaTipo: z.enum(GARANTIAS).optional(), garantiaValor: optMoney(), garantiaDetalhe: optStr(500),
  multaRescisoria: optStr(500), condicoes: optStr(), documentoId: z.string().uuid().nullish(), responsavelNome: optStr(120),
  emNegociacao: z.boolean().optional(),
})

export function registerImoveis(router: Router) {
  mountCrud(router, {
    model: 'jurImovel', path: '/imoveis', read: READ, write: WRITE, modulo: 'juridico.imoveis', create: imovel, search: ['apelido', 'logradouro', 'cidade', 'matricula'],
    filters: ['propriedade', 'tipo', 'ativo', 'uf', 'cidade'], orderBy: { apelido: 'asc' },
    include: { locacoes: { select: { id: true, codigo: true, status: true, vigenciaFim: true, valorMensal: true, natureza: true } } },
  })

  mountLista(router, {
    model: 'jurLocacao', path: '/locacoes', campoVenc: 'vigenciaFim', statusVigente: ['VIGENTE'], search: ['codigo', 'locadorNome', 'locatarioNome'],
    filters: ['status', 'natureza', 'imovelId', 'garantiaTipo'], orderBy: [{ vigenciaFim: 'asc' }], include: { imovel: { select: { id: true, apelido: true, cidade: true, uf: true } } },
  })
  bloquearStatus(router, '/locacoes')
  mountCrud(router, {
    model: 'jurLocacao', path: '/locacoes', read: READ, write: WRITE, modulo: 'juridico.locacoes', create: locacao,
    include: { imovel: true, _count: { select: { parcelas: true } } },
    beforeCreate: async (d, req) => {
      checarVigencia(d.vigenciaInicio, d.vigenciaFim, 'vigência da locação')
      await assertNoTenant(tid(req), 'jurImovel', d.imovelId, 'Imóvel')
      await assertNoTenant(tid(req), 'jurDocumento', d.documentoId, 'Documento')
      if (d.indiceReajuste === 'FIXO' && d.percentualFixo == null) fail(422, 'Reajuste FIXO exige percentualFixo.')
      if (d.garantiaTipo && d.garantiaTipo !== 'NENHUMA' && !d.garantiaDetalhe && d.garantiaValor == null) fail(422, 'Informe o detalhe ou o valor da garantia.')
      const { emNegociacao, ...rest } = d
      return { ...rest, codigo: d.codigo ?? (await proximoCodigo(tid(req), 'LOC')), status: emNegociacao ? 'EM_NEGOCIACAO' : 'RASCUNHO' }
    },
    afterCreate: (row) => lembreteLocacao(row),
    beforeUpdate: async (d, req, cur) => {
      travarStatus(d, cur, ['emNegociacao'])
      delete d.imovelId
      checarVigencia(d.vigenciaInicio ?? cur.vigenciaInicio, d.vigenciaFim ?? cur.vigenciaFim, 'vigência da locação')
      if (d.valorMensal !== undefined && d.valorMensal !== cur.valorMensal) fail(422, 'O valor mensal só muda por /reajustar ou /renovar (preserva o histórico das parcelas).')
    },
    afterUpdate: (row) => lembreteLocacao(row, true),
  })
  mountCiclo(router, { path: '/locacoes', model: 'jurLocacao', modulo: 'juridico.locacoes', refType: 'JurLocacao', campoValor: 'valorMensal', onChange: lembreteLocacao })

  // ---- parcelas
  router.post('/locacoes/:id/parcelas/gerar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const l = await prisma.jurLocacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!l) return res.status(404).json({ error: 'Locação não encontrada.' })
    if (['RESCINDIDO', 'ENCERRADO'].includes(l.status)) fail(409, 'Locação encerrada/rescindida não gera parcelas.')
    const ps = gerarParcelas(l.vigenciaInicio, l.vigenciaFim, l.diaVencimento, l.valorMensal)
    const r = await prisma.jurParcela.createMany({ data: ps.map((p) => ({ ...p, tenantId, locacaoId: l.id })), skipDuplicates: true })
    await audit({ tenantId, userId: uid(req), modulo: 'juridico.locacoes', acao: 'GERAR_PARCELAS', refType: 'JurLocacao', refId: l.id, detalhes: { criadas: r.count, previstas: ps.length } })
    res.status(201).json({ criadas: r.count, jaExistiam: ps.length - r.count })
  }))

  router.get('/parcelas', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const loc = qs(req.query.locacaoId); if (loc) where.locacaoId = loc
    const st = qs(req.query.status)
    const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0)
    if (st === 'ATRASADA') { where.status = 'ABERTA'; where.vencimento = { lt: hoje } }
    else if (st) { if (!['ABERTA', 'PAGA', 'CANCELADA'].includes(st)) fail(400, 'Filtro status inválido.'); where.status = st }
    const ate = qs(req.query.ateDias)
    if (ate) { if (!/^\d{1,4}$/.test(ate)) fail(400, 'ateDias inválido.'); where.vencimento = { ...(where.vencimento || {}), lte: new Date(hoje.getTime() + +ate * 86_400_000) } }
    const [rows, total] = await Promise.all([
      prisma.jurParcela.findMany({ where, orderBy: { vencimento: 'asc' }, skip, take, include: { locacao: { select: { codigo: true, locadorNome: true, locatarioNome: true, natureza: true, imovel: { select: { apelido: true } } } } } }),
      prisma.jurParcela.count({ where }),
    ])
    res.json({ items: rows.map((p) => ({ ...p, atrasada: p.status === 'ABERTA' && p.vencimento < hoje, diasAtraso: p.status === 'ABERTA' && p.vencimento < hoje ? -(diasAte(p.vencimento) ?? 0) : 0 })), total, page, pageSize })
  }))

  router.post('/parcelas/:id/pagar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ pagoEm: z.coerce.date().optional(), valorPago: z.number().finite().min(0).max(1e9).optional(), observacao: z.string().max(500).optional() }), req.body)
    const p = await prisma.jurParcela.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) return res.status(404).json({ error: 'Parcela não encontrada.' })
    if (p.status !== 'ABERTA') fail(409, `Parcela ${p.status === 'PAGA' ? 'já paga' : 'cancelada'}.`)
    const pagoEm = b.pagoEm ?? new Date()
    if (pagoEm.getTime() > Date.now() + 86_400_000) fail(422, 'Data de pagamento no futuro.')
    const row = await prisma.jurParcela.update({ where: { id: p.id }, data: { status: 'PAGA', pagoEm, valorPago: r2(b.valorPago ?? p.valor), observacao: b.observacao ?? p.observacao } })
    await audit({ tenantId, userId: uid(req), modulo: 'juridico.locacoes', acao: 'PAGAR_PARCELA', refType: 'JurParcela', refId: p.id, detalhes: { valorPago: row.valorPago } })
    res.json(row)
  }))
  router.post('/parcelas/:id/cancelar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.jurParcela.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) return res.status(404).json({ error: 'Parcela não encontrada.' })
    if (p.status !== 'ABERTA') fail(409, 'Somente parcelas em aberto podem ser canceladas.')
    const row = await prisma.jurParcela.update({ where: { id: p.id }, data: { status: 'CANCELADA' } })
    await audit({ tenantId, userId: uid(req), modulo: 'juridico.locacoes', acao: 'CANCELAR_PARCELA', refType: 'JurParcela', refId: p.id })
    res.json(row)
  }))

  // ---- reajuste: o índice acumulado é INFORMADO pelo usuário (o sistema não consulta IGP-M/IPCA externos).
  router.post('/locacoes/:id/reajustar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ percentual: z.number().min(-20).max(100).optional(), aPartirDe: z.coerce.date().optional() }), req.body)
    const l = await prisma.jurLocacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!l) return res.status(404).json({ error: 'Locação não encontrada.' })
    if (l.status !== 'VIGENTE') fail(409, 'Somente locações vigentes são reajustadas.')
    if (l.indiceReajuste === 'NENHUM') fail(422, 'Esta locação não prevê reajuste.')
    const pct = b.percentual ?? (l.indiceReajuste === 'FIXO' ? l.percentualFixo ?? undefined : undefined)
    if (pct === undefined) fail(400, `Informe o percentual acumulado do índice ${l.indiceReajuste} (percentual).`)
    const desde = b.aPartirDe ?? new Date()
    if (l.ultimoReajusteEm && diasAte(desde, l.ultimoReajusteEm)! < 360) fail(409, 'Já houve reajuste há menos de 12 meses (a lei veda reajuste em periodicidade inferior a um ano — confirme com o jurídico).')
    const novo = aplicarReajuste(l.valorMensal, pct)
    const out = await prisma.$transaction(async (tx) => {
      const abertas = await tx.jurParcela.findMany({ where: { tenantId, locacaoId: l.id, status: 'ABERTA', vencimento: { gte: desde } }, select: { id: true } })
      if (abertas.length) await tx.jurParcela.updateMany({ where: { id: { in: abertas.map((a) => a.id) } }, data: { valor: novo } })
      const nl = await tx.jurLocacao.update({ where: { id: l.id }, data: { valorMensal: novo, ultimoReajusteEm: desde } })
      return { nl, parcelas: abertas.length }
    })
    await audit({ tenantId, userId: uid(req), modulo: 'juridico.locacoes', acao: 'REAJUSTAR', refType: 'JurLocacao', refId: l.id, detalhes: { de: l.valorMensal, para: novo, percentual: pct, parcelasAtualizadas: out.parcelas } })
    res.json({ locacao: out.nl, valorAnterior: l.valorMensal, valorNovo: novo, percentual: pct, parcelasAtualizadas: out.parcelas })
  }))

  // ---- resumo de imóveis e aluguéis
  router.get('/imoveis-resumo', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0)
    const [imoveis, locs, atrasadas, aberto90] = await Promise.all([
      prisma.jurImovel.findMany({ where: { tenantId, ativo: true }, select: { propriedade: true } }),
      prisma.jurLocacao.findMany({ where: { tenantId, status: 'VIGENTE' }, select: { id: true, codigo: true, natureza: true, valorMensal: true, vigenciaFim: true, locadorNome: true, locatarioNome: true } }),
      prisma.jurParcela.aggregate({ where: { tenantId, status: 'ABERTA', vencimento: { lt: hoje } }, _count: true, _sum: { valor: true } }),
      prisma.jurParcela.aggregate({ where: { tenantId, status: 'ABERTA', vencimento: { gte: hoje, lte: new Date(hoje.getTime() + 90 * 86_400_000) } }, _count: true, _sum: { valor: true } }),
    ])
    const porProp: Record<string, number> = {}
    for (const i of imoveis) porProp[i.propriedade] = (porProp[i.propriedade] ?? 0) + 1
    const pagos = locs.filter((l) => l.natureza === 'LOCACAO_PAGA'), recebidos = locs.filter((l) => l.natureza === 'LOCACAO_RECEBIDA')
    res.json({
      imoveis: { total: imoveis.length, porPropriedade: porProp },
      locacoesVigentes: locs.length,
      custoMensalAlugueis: r2(pagos.reduce((s, l) => s + l.valorMensal, 0)),
      receitaMensalAlugueis: r2(recebidos.reduce((s, l) => s + l.valorMensal, 0)),
      parcelasAtrasadas: { qtd: atrasadas._count, valor: r2(atrasadas._sum.valor ?? 0) },
      parcelasProximos90Dias: { qtd: aberto90._count, valor: r2(aberto90._sum.valor ?? 0) },
      vencendo: locs.map((l) => ({ ...l, alerta: alertaDe(l.vigenciaFim) })).filter((l) => l.alerta.dias !== null && l.alerta.dias <= 90).sort((a, b) => a.alerta.dias! - b.alerta.dias!),
    })
  }))
  void optDate
}
