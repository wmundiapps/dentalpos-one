import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { LEITURA, OPERA, dia, httpError, log, r2, soDigitos, tid, uid } from './common'
import { competenciaValida, liquidoNota, totalRetencoes, validarChaveNFe, validarDocumento } from './fiscal'
import { criarTitulo } from './titulos'

export const notaSchema = z.object({
  direcao: z.enum(['ENTRADA', 'SAIDA']),
  modelo: z.enum(['NFSE', 'NFE', 'OUTRA']).default('NFSE'),
  numero: z.string().min(1).max(30),
  serie: z.string().max(10).default('1'),
  chave: z.string().max(60).optional(),
  emissao: dateISO(),
  competencia: z.string().optional(),
  participanteNome: z.string().min(2).max(150),
  participanteDocumento: z.string().max(20).optional(),
  descricao: z.string().max(400).optional(),
  valorServicos: z.number().min(0).default(0),
  valorProdutos: z.number().min(0).default(0),
  valorDescontos: z.number().min(0).default(0),
  valorTotal: z.number().min(0).optional(),
  issAliquota: z.number().min(0).max(100).default(0),
  issValor: z.number().min(0).optional(),
  issRetido: z.boolean().default(false),
  retencaoIrrf: z.number().min(0).default(0),
  retencaoPis: z.number().min(0).default(0),
  retencaoCofins: z.number().min(0).default(0),
  retencaoCsll: z.number().min(0).default(0),
  retencaoInss: z.number().min(0).default(0),
  retencaoOutras: z.number().min(0).default(0),
  tituloId: z.string().optional(),
  receivableId: z.string().optional(),
  pedidoId: z.string().optional(),
  contratoId: z.string().optional(),
  centroCustoId: z.string().optional(),
  contaContabilId: z.string().optional(),
  arquivoUrl: z.string().max(500).optional(),
  observacao: z.string().max(400).optional(),
})
type NotaInput = z.infer<typeof notaSchema>

export function normalizarNota(d: NotaInput) {
  const total = d.valorTotal ?? r2(d.valorServicos + d.valorProdutos - d.valorDescontos)
  if (total <= 0) throw httpError(400, 'O valor total da nota deve ser positivo.')
  const iss = d.issValor ?? r2((d.valorServicos * d.issAliquota) / 100)
  const ret = { iss, irrf: d.retencaoIrrf, pis: d.retencaoPis, cofins: d.retencaoCofins, csll: d.retencaoCsll, inss: d.retencaoInss, outras: d.retencaoOutras }
  const totalRet = totalRetencoes(ret, d.issRetido)
  if (totalRet > total + 0.001) throw httpError(400, 'As retenções excedem o valor total da nota.')
  if (d.competencia && !competenciaValida(d.competencia)) throw httpError(400, 'Competência inválida (use AAAA-MM).')
  if (d.participanteDocumento && !validarDocumento(d.participanteDocumento)) throw httpError(400, 'CPF/CNPJ do participante inválido.')
  if (d.modelo === 'NFE') {
    if (!d.chave || !validarChaveNFe(d.chave)) throw httpError(400, 'NF-e exige chave de acesso válida (44 dígitos com dígito verificador correto).')
    const cnpjChave = soDigitos(d.chave).slice(6, 20)
    if (d.direcao === 'ENTRADA' && d.participanteDocumento && soDigitos(d.participanteDocumento).length === 14 && cnpjChave !== soDigitos(d.participanteDocumento)) throw httpError(400, 'O CNPJ da chave de acesso não confere com o do emitente informado.')
  } else if (d.chave && soDigitos(d.chave).length === 44 && !validarChaveNFe(d.chave)) throw httpError(400, 'Chave de acesso com dígito verificador inválido.')
  return {
    valorTotal: total, issValor: iss, totalRetencoes: totalRet, valorLiquido: liquidoNota(total, ret, d.issRetido),
    chave: d.chave ? soDigitos(d.chave) || d.chave : undefined,
    participanteDocumento: d.participanteDocumento ? soDigitos(d.participanteDocumento) : undefined,
    competencia: d.competencia ?? d.emissao.toISOString().slice(0, 7),
  }
}

async function validarVinculosNota(tenantId: string, d: Partial<NotaInput>) {
  if (d.tituloId && !(await prisma.tesTitulo.findFirst({ where: { id: d.tituloId, tenantId }, select: { id: true } }))) throw httpError(404, 'Título a pagar não encontrado.')
  if (d.receivableId && !(await prisma.accountReceivable.findFirst({ where: { id: d.receivableId, tenantId }, select: { id: true } }))) throw httpError(404, 'Conta a receber não encontrada.')
  if (d.centroCustoId && !(await prisma.eduCostCenter.findFirst({ where: { id: d.centroCustoId, tenantId }, select: { id: true } }))) throw httpError(404, 'Centro de custo não encontrado.')
  if (d.contaContabilId && !(await prisma.chartOfAccount.findFirst({ where: { id: d.contaContabilId, tenantId }, select: { id: true } }))) throw httpError(404, 'Conta contábil não encontrada.')
}

/** Confronta a nota com o título/recebível vinculado (conciliação fiscal básica). */
export async function conciliarFiscal(tenantId: string, notaId: string) {
  const n = await prisma.tesNotaFiscal.findFirst({ where: { id: notaId, tenantId } })
  if (!n) throw httpError(404, 'Nota não encontrada.')
  let alvo: number | null = null, rotulo = ''
  if (n.tituloId) { const t = await prisma.tesTitulo.findFirst({ where: { id: n.tituloId, tenantId } }); if (t) { alvo = t.valorBruto; rotulo = t.numero } }
  else if (n.receivableId) { const r = await prisma.accountReceivable.findFirst({ where: { id: n.receivableId, tenantId } }); if (r) { alvo = r.valor; rotulo = r.descricao } }
  if (alvo === null) return prisma.tesNotaFiscal.update({ where: { id: n.id }, data: { conciliacaoFiscal: 'PENDENTE', diferenca: 0 } })
  const dif = r2(n.valorTotal - alvo)
  // saída: a nota pode refletir o valor líquido de bolsa da mensalidade; aceitamos igualdade com o valor bruto ou o líquido do ajuste
  let ok = Math.abs(dif) < 0.01
  if (!ok && n.receivableId) {
    const aj = await prisma.tesRecebivelAjuste.findUnique({ where: { tenantId_receivableId: { tenantId, receivableId: n.receivableId } } })
    if (aj && Math.abs(n.valorTotal - aj.valorLiquido) < 0.01) { ok = true }
  }
  void rotulo
  return prisma.tesNotaFiscal.update({ where: { id: n.id }, data: { conciliacaoFiscal: ok ? 'OK' : 'DIVERGENTE', diferenca: ok ? 0 : dif } })
}

export function mountNotas(router: Router) {
  router.get('/notas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { page, pageSize, skip, take } = pageParams(req.query)
    const where: any = { tenantId }
    for (const k of ['direcao', 'modelo', 'status']) { const v = qs(req.query[k]); if (v) where[k] = v }
    const cf = qs(req.query.conciliacao)
    if (cf) where.conciliacaoFiscal = cf
    const q = qs(req.query.q)
    if (q) where.OR = [{ participanteNome: { contains: q, mode: 'insensitive' } }, { numero: { contains: q } }, { chave: { contains: q } }]
    const de = qs(req.query.de), ate = qs(req.query.ate)
    if (de || ate) where.emissao = { ...(de ? { gte: dia(de) } : {}), ...(ate ? { lte: new Date(dia(ate).getTime() + 12 * 3600_000) } : {}) }
    const [total, items, agg] = await Promise.all([
      prisma.tesNotaFiscal.count({ where }),
      prisma.tesNotaFiscal.findMany({ where, orderBy: [{ emissao: 'desc' }, { createdAt: 'desc' }], skip, take }),
      prisma.tesNotaFiscal.groupBy({ by: ['direcao'], where: { ...where, status: 'LANCADA' }, _sum: { valorTotal: true, totalRetencoes: true }, _count: true }),
    ])
    res.json({ total, page, pageSize, items, resumo: agg.map((a) => ({ direcao: a.direcao, qtd: a._count, valor: r2(a._sum.valorTotal ?? 0), retencoes: r2(a._sum.totalRetencoes ?? 0) })) })
  }))

  router.post('/notas', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = parseBody(notaSchema, req.body)
    await validarVinculosNota(tenantId, d)
    const calc = normalizarNota(d)
    const dup = await prisma.tesNotaFiscal.findFirst({ where: { tenantId, direcao: d.direcao, modelo: d.modelo, serie: d.serie, numero: d.numero, participanteDocumento: calc.participanteDocumento ?? null, status: 'LANCADA' }, select: { id: true } })
    if (dup) throw httpError(409, 'Nota já lançada (mesmo número, série e participante).', { code: 'NOTA_DUPLICADA' })
    if (calc.chave && soDigitos(calc.chave).length === 44 && (await prisma.tesNotaFiscal.findFirst({ where: { tenantId, chave: calc.chave, status: 'LANCADA' }, select: { id: true } }))) throw httpError(409, 'Já existe nota lançada com esta chave de acesso.', { code: 'CHAVE_DUPLICADA' })
    const n = await prisma.tesNotaFiscal.create({ data: { tenantId, ...d, ...calc, criadoPorId: uid(req) } as any })
    if (n.tituloId) await prisma.tesTitulo.updateMany({ where: { id: n.tituloId, tenantId, notaFiscalId: null }, data: { notaFiscalId: n.id } })
    const out = n.tituloId || n.receivableId ? await conciliarFiscal(tenantId, n.id) : n
    await log(req, 'NOTA_LANCADA', 'TesNotaFiscal', n.id, { direcao: n.direcao, modelo: n.modelo, numero: n.numero, valor: n.valorTotal })
    res.status(201).json(out)
  }))

  router.get('/notas/conciliacao', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const [semVinculo, divergentes, titulosSemNota, recebSemNota] = await Promise.all([
      prisma.tesNotaFiscal.findMany({ where: { tenantId, status: 'LANCADA', tituloId: null, receivableId: null }, orderBy: { emissao: 'desc' }, take: 200 }),
      prisma.tesNotaFiscal.findMany({ where: { tenantId, status: 'LANCADA', conciliacaoFiscal: 'DIVERGENTE' }, orderBy: { emissao: 'desc' }, take: 200 }),
      prisma.tesTitulo.findMany({ where: { tenantId, status: { in: ['PAGO', 'CONCILIADO', 'AUTORIZADO', 'ENVIADO_BANCO'] }, origem: { in: ['COMPRA', 'CONTRATO', 'TERCEIRO', 'NOTA_FISCAL'] }, notaFiscalId: null }, orderBy: { vencimento: 'desc' }, take: 200 }),
      prisma.accountReceivable.findMany({ where: { tenantId, status: 'PAGO' }, orderBy: { dataPagamento: 'desc' }, take: 200 }),
    ])
    const comNota = new Set((await prisma.tesNotaFiscal.findMany({ where: { tenantId, direcao: 'SAIDA', status: 'LANCADA', receivableId: { in: recebSemNota.map((r) => r.id) } }, select: { receivableId: true } })).map((n) => n.receivableId))
    const recSem = recebSemNota.filter((r) => !comNota.has(r.id))
    res.json({
      notasSemVinculo: semVinculo, notasDivergentes: divergentes, titulosSemNota,
      recebimentosSemNotaSaida: recSem.slice(0, 100),
      totais: { notasSemVinculo: semVinculo.length, notasDivergentes: divergentes.length, titulosSemNota: titulosSemNota.length, recebimentosSemNotaSaida: recSem.length },
    })
  }))

  router.get('/notas/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const n = await prisma.tesNotaFiscal.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!n) throw httpError(404, 'Nota não encontrada.')
    const [titulo, receivable] = await Promise.all([
      n.tituloId ? prisma.tesTitulo.findFirst({ where: { id: n.tituloId, tenantId }, select: { id: true, numero: true, status: true, valorBruto: true, fornecedor: true } }) : null,
      n.receivableId ? prisma.accountReceivable.findFirst({ where: { id: n.receivableId, tenantId } }) : null,
    ])
    res.json({ ...n, titulo, receivable })
  }))

  router.put('/notas/:id', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const n = await prisma.tesNotaFiscal.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!n) throw httpError(404, 'Nota não encontrada.')
    if (n.status !== 'LANCADA') throw httpError(409, 'Nota cancelada não pode ser editada.')
    const d = parseBody(notaSchema.partial(), req.body)
    await validarVinculosNota(tenantId, d)
    const merged: any = { ...n, ...d, valorTotal: d.valorTotal ?? (d.valorServicos !== undefined || d.valorProdutos !== undefined || d.valorDescontos !== undefined ? undefined : n.valorTotal), issValor: d.issValor ?? (d.valorServicos !== undefined || d.issAliquota !== undefined ? undefined : n.issValor) }
    const calc = normalizarNota(merged)
    const upd = await prisma.tesNotaFiscal.update({ where: { id: n.id }, data: { ...(d as any), ...calc } })
    const out = upd.tituloId || upd.receivableId ? await conciliarFiscal(tenantId, upd.id) : upd
    await log(req, 'NOTA_EDITADA', 'TesNotaFiscal', n.id, { campos: Object.keys(d) })
    res.json(out)
  }))

  router.post('/notas/:id/cancelar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), id = String(req.params.id)
    const { motivo } = parseBody(z.object({ motivo: z.string().min(5).max(300) }), req.body)
    if (!(await prisma.tesNotaFiscal.findFirst({ where: { id, tenantId }, select: { id: true } }))) throw httpError(404, 'Nota não encontrada.')
    const c = await prisma.tesNotaFiscal.updateMany({ where: { id, tenantId, status: 'LANCADA' }, data: { status: 'CANCELADA', canceladaEm: new Date(), motivoCancelamento: motivo } })
    if (c.count === 0) throw httpError(409, 'Nota não encontrada ou já cancelada.')
    await prisma.tesTitulo.updateMany({ where: { tenantId, notaFiscalId: id }, data: { notaFiscalId: null } })
    await log(req, 'NOTA_CANCELADA', 'TesNotaFiscal', id, { motivo })
    res.json(await prisma.tesNotaFiscal.findUniqueOrThrow({ where: { id } }))
  }))

  router.post('/notas/:id/vincular', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), id = String(req.params.id)
    const d = parseBody(z.object({ tituloId: z.string().optional(), receivableId: z.string().optional() }).refine((x) => !!(x.tituloId || x.receivableId), 'informe tituloId ou receivableId'), req.body)
    const n = await prisma.tesNotaFiscal.findFirst({ where: { id, tenantId } })
    if (!n) throw httpError(404, 'Nota não encontrada.')
    if (n.status !== 'LANCADA') throw httpError(409, 'Nota cancelada.')
    if (d.tituloId && n.direcao !== 'ENTRADA') throw httpError(400, 'Título a pagar só vincula a nota de ENTRADA.')
    if (d.receivableId && n.direcao !== 'SAIDA') throw httpError(400, 'Conta a receber só vincula a nota de SAÍDA.')
    await validarVinculosNota(tenantId, d)
    await prisma.tesNotaFiscal.update({ where: { id }, data: { tituloId: d.tituloId ?? null, receivableId: d.receivableId ?? null } })
    if (d.tituloId) await prisma.tesTitulo.updateMany({ where: { id: d.tituloId, tenantId }, data: { notaFiscalId: id } })
    await log(req, 'NOTA_VINCULADA', 'TesNotaFiscal', id, d)
    res.json(await conciliarFiscal(tenantId, id))
  }))

  router.post('/notas/:id/conciliar-fiscal', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await conciliarFiscal(tid(req), String(req.params.id)))
  }))

  // Nota de ENTRADA -> título a pagar em rascunho (já com retenções), aguardando conferência/autorização.
  router.post('/notas/:id/gerar-titulo', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), id = String(req.params.id)
    const d = parseBody(z.object({
      vencimento: dateISO(), formaPagamento: z.enum(['PIX', 'TED', 'BOLETO', 'CREDITO_CONTA', 'DINHEIRO']).default('PIX'), contaBancariaId: z.string().optional(),
      chavePix: z.string().optional(), tipoChavePix: z.enum(['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA']).optional(), codigoBarras: z.string().optional(),
      favorecidoBanco: z.string().optional(), favorecidoAgencia: z.string().optional(), favorecidoConta: z.string().optional(),
    }), req.body)
    const n = await prisma.tesNotaFiscal.findFirst({ where: { id, tenantId } })
    if (!n) throw httpError(404, 'Nota não encontrada.')
    if (n.direcao !== 'ENTRADA' || n.status !== 'LANCADA') throw httpError(409, 'Só notas de ENTRADA lançadas geram título a pagar.')
    if (n.tituloId) throw httpError(409, 'A nota já está vinculada a um título.')
    const t = await criarTitulo(req, {
      origem: 'NOTA_FISCAL', descricao: `NF ${n.numero}/${n.serie} — ${n.descricao || n.participanteNome}`.slice(0, 300), fornecedor: n.participanteNome, fornecedorDocumento: n.participanteDocumento ?? undefined,
      centroCustoId: n.centroCustoId ?? undefined, contaContabilId: n.contaContabilId ?? undefined, valorBruto: n.valorTotal,
      retencaoInss: n.retencaoInss, retencaoIrrf: n.retencaoIrrf, retencaoIss: n.issRetido ? n.issValor : 0,
      retencaoOutras: r2(n.retencaoPis + n.retencaoCofins + n.retencaoCsll + n.retencaoOutras), notaFiscalId: n.id, competencia: n.competencia ?? undefined,
      pedidoId: n.pedidoId ?? undefined, contratoId: n.contratoId ?? undefined, ...d,
    } as any)
    await prisma.tesNotaFiscal.update({ where: { id }, data: { tituloId: t.id } })
    await conciliarFiscal(tenantId, id)
    res.status(201).json(t)
  }))
}
