import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { CONFERE, LEITURA, OPERA, httpError, log, proximoNumero, r2, tid, uid } from './common'
import { CONTAS_PADRAO, CONTAS_TES, contaPadrao, getOrCreateAccount, lancarPartidaDobrada } from './contabil'

export const permutaSchema = z.object({
  sentido: z.enum(['RECEBER', 'PAGAR']),
  parteNome: z.string().min(2).max(150),
  parteDocumento: z.string().max(20).optional(),
  tipoContrapartida: z.enum(['BEM', 'SERVICO', 'CESSAO_ESPACO', 'PUBLICIDADE', 'OUTRO']).default('SERVICO'),
  descricao: z.string().min(3).max(400),
  valorEquivalente: z.number().positive(),
  documentoTipo: z.enum(['CONTRATO', 'NOTA_FISCAL', 'TERMO', 'RECIBO']),
  documentoNumero: z.string().min(1).max(60),
  documentoUrl: z.string().max(500).optional(),
  notaFiscalId: z.string().optional(),
  receivableId: z.string().optional(),
  tituloId: z.string().optional(),
  dataAcordo: dateISO().optional(),
  contaDebitoId: z.string().optional(),
  contaCreditoId: z.string().optional(),
  observacao: z.string().max(500).optional(),
})

async function validarVinculos(tenantId: string, d: z.infer<typeof permutaSchema>) {
  if (d.receivableId) {
    const r = await prisma.accountReceivable.findFirst({ where: { id: d.receivableId, tenantId } })
    if (!r) throw httpError(404, 'Conta a receber não encontrada.')
  }
  if (d.tituloId && !(await prisma.tesTitulo.findFirst({ where: { id: d.tituloId, tenantId }, select: { id: true } }))) throw httpError(404, 'Título a pagar não encontrado.')
  if (d.notaFiscalId && !(await prisma.tesNotaFiscal.findFirst({ where: { id: d.notaFiscalId, tenantId }, select: { id: true } }))) throw httpError(404, 'Nota fiscal não encontrada.')
  for (const c of [d.contaDebitoId, d.contaCreditoId]) if (c && !(await prisma.chartOfAccount.findFirst({ where: { id: c, tenantId }, select: { id: true } }))) throw httpError(404, 'Conta contábil não encontrada.')
}

/**
 * Liquida uma permuta APROVADA: gera a contrapartida contábil pelo valor equivalente.
 *  RECEBER: D Bens/serviços recebidos em permuta (ou conta informada) / C Receita de mensalidades.
 *  PAGAR:   D Despesa (conta informada ou despesas gerais) / C Receitas de permuta.
 */
export async function liquidarPermuta(tenantId: string, permutaId: string, vinculo: { receivableId?: string; tituloId?: string }, data = new Date(), opts: { debitoId?: string } = {}) {
  const p = await prisma.tesPermuta.findFirst({ where: { id: permutaId, tenantId } })
  if (!p) throw httpError(404, 'Permuta não encontrada.')
  if (p.status !== 'APROVADA') throw httpError(409, `Permuta ${p.numero} está ${p.status}; apenas permutas APROVADAS podem ser usadas para quitar.`, { code: 'PERMUTA_NAO_APROVADA' })
  if (p.documentoNumero.trim() === '') throw httpError(409, 'Permuta sem documento de suporte.')
  let debito = p.contaDebitoId ?? (p.sentido === 'PAGAR' ? opts.debitoId ?? null : null), credito = p.contaCreditoId
  if (p.sentido === 'RECEBER') {
    debito ||= (await contaPadrao(tenantId, CONTAS_TES.PERMUTA_ATIVO)).id
    credito ||= (await getOrCreateAccount(tenantId, CONTAS_PADRAO.RECEITA_MENSALIDADE.codigo, CONTAS_PADRAO.RECEITA_MENSALIDADE.nome, CONTAS_PADRAO.RECEITA_MENSALIDADE.tipo)).id
  } else {
    debito ||= (await getOrCreateAccount(tenantId, CONTAS_PADRAO.DESPESA_GERAL.codigo, CONTAS_PADRAO.DESPESA_GERAL.nome, CONTAS_PADRAO.DESPESA_GERAL.tipo)).id
    credito ||= (await contaPadrao(tenantId, CONTAS_TES.RECEITA_PERMUTA)).id
  }
  const claim = await prisma.tesPermuta.updateMany({ where: { id: p.id, tenantId, status: 'APROVADA' }, data: { status: 'LIQUIDADA', liquidadaEm: data } })
  if (claim.count === 0) throw httpError(409, 'Permuta já utilizada.')
  try {
    const lanc = await lancarPartidaDobrada({ tenantId, debitoId: debito, creditoId: credito, valor: p.valorEquivalente, historico: `Permuta ${p.numero} (${p.sentido}) — ${p.parteNome} — doc ${p.documentoTipo} ${p.documentoNumero}`, data })
    return prisma.tesPermuta.update({ where: { id: p.id }, data: { lancamentoId: lanc.id, contaDebitoId: debito, contaCreditoId: credito, receivableId: vinculo.receivableId ?? p.receivableId, tituloId: vinculo.tituloId ?? p.tituloId } })
  } catch (e) {
    await prisma.tesPermuta.update({ where: { id: p.id }, data: { status: 'APROVADA', liquidadaEm: null } })
    throw e
  }
}

export function mountPermutas(router: Router) {
  router.get('/permutas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { page, pageSize, skip, take } = pageParams(req.query)
    const where: any = { tenantId }
    const status = qs(req.query.status), sentido = qs(req.query.sentido)
    if (status) where.status = status
    if (sentido) where.sentido = sentido
    const [total, items, agg] = await Promise.all([
      prisma.tesPermuta.count({ where }),
      prisma.tesPermuta.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.tesPermuta.groupBy({ by: ['status', 'sentido'], where: { tenantId }, _sum: { valorEquivalente: true }, _count: true }),
    ])
    res.json({ total, page, pageSize, items, resumo: agg.map((a) => ({ status: a.status, sentido: a.sentido, qtd: a._count, valor: r2(a._sum.valorEquivalente ?? 0) })) })
  }))

  router.post('/permutas', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = parseBody(permutaSchema, req.body)
    await validarVinculos(tenantId, d)
    const numero = `PM-${String(await proximoNumero(tenantId, 'permuta')).padStart(5, '0')}`
    const p = await prisma.tesPermuta.create({ data: { tenantId, numero, ...d, dataAcordo: d.dataAcordo ?? new Date(), criadoPorId: uid(req) } as any })
    await log(req, 'PERMUTA_CRIADA', 'TesPermuta', p.id, { numero, valor: p.valorEquivalente, sentido: p.sentido })
    res.status(201).json(p)
  }))

  router.get('/permutas/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const p = await prisma.tesPermuta.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!p) throw httpError(404, 'Permuta não encontrada.')
    const lanc = p.lancamentoId ? await prisma.accountingEntry.findFirst({ where: { id: p.lancamentoId, tenantId: tid(req) }, include: { contaDebito: true, contaCredito: true } }) : null
    res.json({ ...p, lancamento: lanc })
  }))

  router.put('/permutas/:id', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.tesPermuta.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) throw httpError(404, 'Permuta não encontrada.')
    if (p.status !== 'RASCUNHO') throw httpError(409, 'Somente permutas em RASCUNHO podem ser editadas.')
    const d = parseBody(permutaSchema.partial(), req.body)
    await validarVinculos(tenantId, d as any)
    res.json(await prisma.tesPermuta.update({ where: { id: p.id }, data: d as any }))
  }))

  // Aprovação por pessoa diferente de quem criou (segregação), com documento obrigatório.
  router.post('/permutas/:id/aprovar', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.tesPermuta.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) throw httpError(404, 'Permuta não encontrada.')
    if (p.status !== 'RASCUNHO') throw httpError(409, `Permuta está ${p.status}.`)
    if (p.criadoPorId === uid(req)) throw httpError(403, 'Segregação de funções: quem registrou a permuta não pode aprová-la.', { code: 'SEGREGACAO' })
    const c = await prisma.tesPermuta.updateMany({ where: { id: p.id, tenantId, status: 'RASCUNHO' }, data: { status: 'APROVADA', aprovadoPorId: uid(req), aprovadoEm: new Date() } })
    if (c.count === 0) throw httpError(409, 'Permuta já processada.')
    await log(req, 'PERMUTA_APROVADA', 'TesPermuta', p.id, { numero: p.numero })
    res.json(await prisma.tesPermuta.findUniqueOrThrow({ where: { id: p.id } }))
  }))

  router.post('/permutas/:id/cancelar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { motivo } = parseBody(z.object({ motivo: z.string().min(5).max(300) }), req.body)
    const p = await prisma.tesPermuta.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) throw httpError(404, 'Permuta não encontrada.')
    if (!['RASCUNHO', 'APROVADA'].includes(p.status)) throw httpError(409, p.status === 'LIQUIDADA' ? 'Permuta já liquidada: não pode ser cancelada (faça um estorno contábil).' : 'Permuta já cancelada.')
    const c = await prisma.tesPermuta.updateMany({ where: { id: p.id, tenantId, status: { in: ['RASCUNHO', 'APROVADA'] } }, data: { status: 'CANCELADA', canceladaEm: new Date(), motivoCancelamento: motivo } })
    if (c.count === 0) throw httpError(409, 'Permuta já processada.')
    await log(req, 'PERMUTA_CANCELADA', 'TesPermuta', p.id, { motivo })
    res.json(await prisma.tesPermuta.findUniqueOrThrow({ where: { id: p.id } }))
  }))
}
