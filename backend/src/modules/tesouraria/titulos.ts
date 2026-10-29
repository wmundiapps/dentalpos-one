import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { CONFERE, LEITURA, OPERA, dia, ehSuper, getConfig, httpError, exigir2fa, log, nomesUsuarios, papelDe, proximoNumero, r2, soDigitos, tid, uid } from './common'
import { CONTAS_TES, contaPadrao, lancarRetencoes, registrarBaixaComLancamento } from './contabil'
import { contaDoTenant, lancarMovimento } from './contas'
import { validarChavePix, validarDocumento, validarLinhaDigitavel } from './fiscal'
import { liquidarPermuta } from './permutas'
import {
  EM_ABERTO, StatusTitulo, aprovacoesNecessarias, carregarAlcadas, exigirTransicao, faixaDoValor, hashAutorizacao, papelPodeAutorizar,
  validarAutorizador, validarConferente,
} from './workflow'

const tituloSchema = z.object({
  origem: z.enum(['MANUAL', 'FOLHA', 'PROLABORE', 'TERCEIRO', 'COMPRA', 'CONTRATO', 'NOTA_FISCAL', 'IMPOSTO']).default('MANUAL'),
  descricao: z.string().min(3).max(300),
  fornecedor: z.string().min(2).max(150),
  fornecedorDocumento: z.string().max(20).optional(),
  fornecedorId: z.string().optional(),
  categoria: z.string().max(60).optional(),
  centroCustoId: z.string().optional(),
  contaContabilId: z.string().optional(),
  contaBancariaId: z.string().optional(),
  formaPagamento: z.enum(['PIX', 'TED', 'BOLETO', 'CREDITO_CONTA', 'DINHEIRO']).default('PIX'),
  favorecidoBanco: z.string().max(5).optional(),
  favorecidoAgencia: z.string().max(10).optional(),
  favorecidoConta: z.string().max(25).optional(),
  favorecidoTipoConta: z.enum(['CORRENTE', 'POUPANCA']).optional(),
  chavePix: z.string().max(100).optional(),
  tipoChavePix: z.enum(['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA']).optional(),
  codigoBarras: z.string().max(60).optional(),
  valorBruto: z.number().positive().max(100_000_000),
  retencaoInss: z.number().min(0).default(0),
  retencaoIrrf: z.number().min(0).default(0),
  retencaoIss: z.number().min(0).default(0),
  retencaoOutras: z.number().min(0).default(0),
  vencimento: dateISO(),
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  notaFiscalId: z.string().optional(),
  pedidoId: z.string().optional(),
  contratoId: z.string().optional(),
})
export type TituloInput = z.infer<typeof tituloSchema>

export const totalRet = (t: { retencaoInss: number; retencaoIrrf: number; retencaoIss: number; retencaoOutras: number }) => r2(t.retencaoInss + t.retencaoIrrf + t.retencaoIss + t.retencaoOutras)

async function validarReferencias(tenantId: string, d: Partial<TituloInput>) {
  if (d.centroCustoId && !(await prisma.eduCostCenter.findFirst({ where: { id: d.centroCustoId, tenantId }, select: { id: true } }))) throw httpError(404, 'Centro de custo não encontrado.')
  if (d.contaContabilId && !(await prisma.chartOfAccount.findFirst({ where: { id: d.contaContabilId, tenantId }, select: { id: true } }))) throw httpError(404, 'Conta contábil não encontrada.')
  if (d.contaBancariaId) await contaDoTenant(tenantId, d.contaBancariaId)
  if (d.notaFiscalId && !(await prisma.tesNotaFiscal.findFirst({ where: { id: d.notaFiscalId, tenantId }, select: { id: true } }))) throw httpError(404, 'Nota fiscal não encontrada.')
  if (d.fornecedorId && !(await prisma.supFornecedor.findFirst({ where: { id: d.fornecedorId, tenantId }, select: { id: true } }))) throw httpError(404, 'Fornecedor não encontrado.')
  if (d.valorBruto != null) {
    const ret = (d.retencaoInss ?? 0) + (d.retencaoIrrf ?? 0) + (d.retencaoIss ?? 0) + (d.retencaoOutras ?? 0)
    if (ret > d.valorBruto + 1e-9) throw httpError(400, 'As retenções não podem exceder o valor bruto.')
  }
}

/** Itens que impedem a conferência (dados do pagamento incompletos ou inválidos). */
export function pendenciasPagamento(t: any): string[] {
  const p: string[] = []
  if (t.fornecedorDocumento && !validarDocumento(t.fornecedorDocumento)) p.push('documento (CPF/CNPJ) do favorecido inválido')
  switch (t.formaPagamento) {
    case 'PIX': { const e = validarChavePix(t.tipoChavePix, t.chavePix); if (e) p.push(e); break }
    case 'TED': case 'CREDITO_CONTA':
      if (!/^\d{3}$/.test(soDigitos(t.favorecidoBanco))) p.push('código do banco do favorecido (3 dígitos)')
      if (!soDigitos(t.favorecidoAgencia)) p.push('agência do favorecido')
      if (!soDigitos(t.favorecidoConta)) p.push('conta do favorecido')
      if (!t.fornecedorDocumento) p.push('documento do favorecido (obrigatório em TED/crédito em conta)')
      break
    case 'BOLETO': if (!validarLinhaDigitavel(t.codigoBarras)) p.push('código de barras/linha digitável do boleto (44, 47 ou 48 dígitos)'); break
  }
  if (!t.contaBancariaId && t.formaPagamento !== 'DINHEIRO') p.push('conta bancária pagadora')
  return p
}

export async function eventoTitulo(tx: any, p: { tenantId: string; tituloId: string; acao: string; de?: string; para?: string; userId?: string; papel?: string; detalhe?: unknown }) {
  return tx.tesTituloEvento.create({ data: { tenantId: p.tenantId, tituloId: p.tituloId, acao: p.acao, de: p.de, para: p.para, userId: p.userId, papel: p.papel, detalhe: p.detalhe as any } })
}

export async function buscarTitulo(tenantId: string, id: string) {
  const t = await prisma.tesTitulo.findFirst({ where: { id, tenantId } })
  if (!t) throw httpError(404, 'Título não encontrado.')
  return t
}

export async function criarTitulo(req: AuthenticatedRequest, d: TituloInput, extra: { origemRef?: string; folhaLoteId?: string } = {}) {
  const tenantId = tid(req)
  await validarReferencias(tenantId, d)
  const numero = `CP-${String(await proximoNumero(tenantId, 'titulo')).padStart(6, '0')}`
  const liquido = r2(d.valorBruto - totalRet({ ...d } as any))
  const t = await prisma.tesTitulo.create({
    data: {
      tenantId, numero, ...d, fornecedorDocumento: d.fornecedorDocumento ? soDigitos(d.fornecedorDocumento) : undefined, valorBruto: r2(d.valorBruto), valorLiquido: liquido,
      criadoPorId: uid(req), origemRef: extra.origemRef, folhaLoteId: extra.folhaLoteId,
    } as any,
  })
  await eventoTitulo(prisma, { tenantId, tituloId: t.id, acao: 'CRIADO', para: 'RASCUNHO', userId: uid(req), papel: papelDe(req), detalhe: { origem: t.origem, valorBruto: t.valorBruto } })
  await log(req, 'TITULO_CRIADO', 'TesTitulo', t.id, { numero, valor: t.valorBruto, origem: t.origem })
  return t
}

/** Indicadores de alçada e permissões do usuário para exibição na fila. */
async function visao(req: AuthenticatedRequest, t: any, faixas: any[], cfg: any) {
  const user = uid(req), papel = papelDe(req)
  const faixa = faixaDoValor(faixas, t.valorBruto)
  const necessarias = aprovacoesNecessarias(faixa, t.valorBruto, cfg.limiteDuplaAprovacao)
  const aprovadores: string[] = (t.aprovacoes || []).filter((a: any) => a.tipo === 'AUTORIZACAO').map((a: any) => a.userId)
  const eFinance = ['FINANCE', 'COORDINATOR'].includes(papel) || ehSuper(papel)
  const podeConferir = eFinance && t.status === 'RASCUNHO' && t.criadoPorId !== user
  const podeAutorizar = eFinance && t.status === 'CONFERIDO' && papelPodeAutorizar(faixa, papel) && t.criadoPorId !== user && !aprovadores.includes(user) && !(cfg.conferenteNaoAutoriza && t.conferidoPorId === user)
  return { faixa: faixa.nome, aprovacoesNecessarias: necessarias, aprovacoesFeitas: aprovadores.length, podeConferir, podeAutorizar, exige2fa: !!faixa.exige2fa || (cfg.exige2faAcima != null && t.valorBruto >= cfg.exige2faAcima) }
}

/** Núcleo da conferência (usado pelo endpoint unitário e pelo lote). */
export async function conferirTitulo(req: AuthenticatedRequest, id: string, observacao?: string) {
  const tenantId = tid(req), user = uid(req)
  const t = await buscarTitulo(tenantId, id)
  exigirTransicao(t.status as StatusTitulo, 'CONFERIDO')
  validarConferente(user, t)
  const pend = pendenciasPagamento(t)
  if (pend.length) throw httpError(422, `Não é possível conferir: ${pend.join('; ')}.`, { code: 'DADOS_INCOMPLETOS', pendencias: pend })
  const c = await prisma.tesTitulo.updateMany({ where: { id, tenantId, status: 'RASCUNHO' }, data: { status: 'CONFERIDO', conferidoPorId: user, conferidoEm: new Date(), motivoRejeicao: null } })
  if (c.count === 0) throw httpError(409, 'Título já foi processado por outra pessoa.')
  await prisma.tesAprovacao.create({ data: { tenantId, tituloId: id, tipo: 'CONFERENCIA', nivel: 1, userId: user, papel: papelDe(req), valor: t.valorBruto } })
  await eventoTitulo(prisma, { tenantId, tituloId: id, acao: 'CONFERIDO', de: 'RASCUNHO', para: 'CONFERIDO', userId: user, papel: papelDe(req), detalhe: { observacao } })
  await log(req, 'TITULO_CONFERIDO', 'TesTitulo', id, { observacao })
  return prisma.tesTitulo.findUniqueOrThrow({ where: { id } })
}

/** Autorização com alçada por valor, dupla aprovação e segregação de funções. */
export async function autorizarTitulo(req: AuthenticatedRequest, id: string) {
  const tenantId = tid(req), user = uid(req), papel = papelDe(req)
  const t = await buscarTitulo(tenantId, id)
  exigirTransicao(t.status as StatusTitulo, 'AUTORIZADO')
  const cfg = await getConfig(tenantId)
  const faixas = await carregarAlcadas(tenantId)
  const faixa = faixaDoValor(faixas, t.valorBruto)
  if (!papelPodeAutorizar(faixa, papel)) throw httpError(403, `Alçada: valores até ${faixa.valorAte ?? 'sem limite'} nesta faixa só podem ser autorizados por ${faixa.papeis.join(', ')} (ou diretoria).`, { code: 'ALCADA' })
  const anteriores = (await prisma.tesAprovacao.findMany({ where: { tenantId, tituloId: id, tipo: 'AUTORIZACAO' }, select: { userId: true } })).map((a) => a.userId)
  validarAutorizador(user, { criadoPorId: t.criadoPorId, conferidoPorId: t.conferidoPorId, aprovadoresAnteriores: anteriores, conferenteNaoAutoriza: cfg.conferenteNaoAutoriza })
  const pend = pendenciasPagamento(t)
  if (pend.length) throw httpError(422, `Dados do pagamento incompletos: ${pend.join('; ')}.`, { code: 'DADOS_INCOMPLETOS', pendencias: pend })
  const usou2fa = await exigir2fa(req, t.valorBruto, faixa.exige2fa)
  const necessarias = aprovacoesNecessarias(faixa, t.valorBruto, cfg.limiteDuplaAprovacao)
  const nivel = anteriores.length + 1
  // O unique parcial (tituloId, tipo, nivel) não existe; a trava é o claim por contagem de aprovações.
  const claim = await prisma.tesTitulo.updateMany({ where: { id, tenantId, status: 'CONFERIDO', aprovacoesFeitas: anteriores.length }, data: { aprovacoesFeitas: nivel, aprovacoesNecessarias: necessarias } })
  if (claim.count === 0) throw httpError(409, 'Título já foi processado por outra pessoa.')
  await prisma.tesAprovacao.create({ data: { tenantId, tituloId: id, tipo: 'AUTORIZACAO', nivel, userId: user, papel, valor: t.valorBruto, usou2fa } })
  if (nivel < necessarias) {
    await eventoTitulo(prisma, { tenantId, tituloId: id, acao: 'APROVACAO_PARCIAL', de: 'CONFERIDO', para: 'CONFERIDO', userId: user, papel, detalhe: { nivel, necessarias } })
    await log(req, 'TITULO_APROVACAO_PARCIAL', 'TesTitulo', id, { nivel, necessarias })
    return { titulo: await prisma.tesTitulo.findUniqueOrThrow({ where: { id } }), aguardandoSegundaAprovacao: true, aprovacoesFeitas: nivel, aprovacoesNecessarias: necessarias }
  }
  // Aprovações completas: congela o conteúdo (hash) e cria a obrigação no contas a pagar legado (alimenta fluxo de caixa/DRE).
  const ap = await prisma.accountPayable.create({
    data: { tenantId, costCenterId: t.centroCustoId ?? undefined, descricao: `${t.numero} — ${t.descricao}`, fornecedor: t.fornecedor, categoria: t.categoria ?? t.origem.toLowerCase(), valor: t.valorBruto, dataVencimento: t.vencimento },
  })
  await prisma.tesTitulo.update({ where: { id }, data: { status: 'AUTORIZADO', autorizadoPorId: user, autorizadoEm: new Date(), hashAutorizado: hashAutorizacao(t), accountPayableId: ap.id } })
  await eventoTitulo(prisma, { tenantId, tituloId: id, acao: 'AUTORIZADO', de: 'CONFERIDO', para: 'AUTORIZADO', userId: user, papel, detalhe: { nivel, necessarias, usou2fa, accountPayableId: ap.id } })
  await log(req, 'TITULO_AUTORIZADO', 'TesTitulo', id, { valor: t.valorBruto, nivel, necessarias, usou2fa })
  return { titulo: await prisma.tesTitulo.findUniqueOrThrow({ where: { id } }), aguardandoSegundaAprovacao: false, aprovacoesFeitas: nivel, aprovacoesNecessarias: necessarias }
}

/** Baixa do título (pagamento efetivado): contas a pagar legado + lançamento contábil + saída no banco. */
export async function baixarTitulo(p: { tenantId: string; id: string; contaId?: string; data?: Date; userId?: string; papel?: string; comprovante?: string; permutaId?: string; via: string }) {
  const { tenantId, id } = p
  const t = await buscarTitulo(tenantId, id)
  if (!['AUTORIZADO', 'ENVIADO_BANCO'].includes(t.status)) throw httpError(409, `Título ${t.numero} está ${t.status}; só é possível baixar títulos AUTORIZADOS ou ENVIADOS AO BANCO.`, { code: 'TRANSICAO_INVALIDA' })
  const data = p.data ?? new Date()
  const contaId = p.contaId ?? t.contaBancariaId ?? undefined
  if (!p.permutaId && t.formaPagamento !== 'DINHEIRO' && !contaId) throw httpError(400, 'Informe a conta pagadora (contaId).')
  if (t.formaPagamento === 'DINHEIRO' && !contaId && !p.permutaId) throw httpError(400, 'Informe o caixa (contaId) para pagamento em dinheiro.')
  if (contaId) await contaDoTenant(tenantId, contaId)
  if (t.hashAutorizado && t.hashAutorizado !== hashAutorizacao(t)) throw httpError(409, 'O conteúdo do título mudou após a autorização; devolva e autorize novamente.', { code: 'INTEGRIDADE' })
  if (p.permutaId) {
    const pm = await prisma.tesPermuta.findFirst({ where: { id: p.permutaId, tenantId } })
    if (!pm) throw httpError(404, 'Permuta não encontrada.')
    if (pm.sentido !== 'PAGAR') throw httpError(400, 'A permuta informada é do sentido RECEBER.')
    if (Math.abs(pm.valorEquivalente - t.valorLiquido) > 0.009) throw httpError(409, `O valor equivalente da permuta (${pm.valorEquivalente}) deve ser igual ao valor líquido do título (${t.valorLiquido}).`, { code: 'PERMUTA_VALOR' })
  }
  const claim = await prisma.tesTitulo.updateMany({ where: { id, tenantId, status: { in: ['AUTORIZADO', 'ENVIADO_BANCO'] } }, data: { status: 'PAGO', pagoEm: data, pagoValor: t.valorLiquido, pagoContaId: contaId, comprovante: p.comprovante } })
  if (claim.count === 0) throw httpError(409, 'Título já foi baixado.')
  const apClaim = t.accountPayableId ? await prisma.accountPayable.updateMany({ where: { id: t.accountPayableId, tenantId, status: { in: ['PENDENTE', 'ATRASADO'] } }, data: { status: 'PAGO', dataPagamento: data } }) : { count: 0 }
  try {
    if (p.permutaId) {
      // Pago com bens/serviços: não há saída de caixa nem PaymentTransaction; a contrapartida contábil é o lançamento da permuta (D Despesa / C Receitas de permuta).
      await liquidarPermuta(tenantId, p.permutaId, { tituloId: id }, data, { debitoId: t.contaContabilId ?? undefined })
    } else {
      const forma = ({ PIX: 'PIX', TED: 'TRANSFERENCIA', BOLETO: 'BOLETO', CREDITO_CONTA: 'TRANSFERENCIA', DINHEIRO: 'DINHEIRO' } as const)[t.formaPagamento]
      const baixa = await registrarBaixaComLancamento({ tenantId, tipo: 'DESPESA', valor: t.valorBruto, formaPagamento: forma, historico: `Pagamento ${t.numero} — ${t.descricao}`, accountPayableId: t.accountPayableId ?? undefined, dataTransacao: data })
      // classificação contábil da despesa: conta do título ou padrão por origem
      let debito = t.contaContabilId
      if (!debito && ['FOLHA', 'PROLABORE'].includes(t.origem)) debito = (await contaPadrao(tenantId, CONTAS_TES.FOLHA)).id
      if (!debito && t.origem === 'TERCEIRO') debito = (await contaPadrao(tenantId, CONTAS_TES.TERCEIROS)).id
      if (debito) await prisma.accountingEntry.update({ where: { id: baixa.lancamento.id }, data: { contaDebitoId: debito } })
      const ret = totalRet(t)
      if (ret > 0) await lancarRetencoes(tenantId, ret, `Retenções na fonte — ${t.numero}`, data)
      if (contaId) await lancarMovimento({ tenantId, contaId, data, valor: -t.valorLiquido, tipo: 'PAGAMENTO', descricao: `Pagamento ${t.numero} — ${t.fornecedor}`, refTipo: 'TITULO', refId: id, userId: p.userId })
    }
    await eventoTitulo(prisma, { tenantId, tituloId: id, acao: 'PAGO', de: t.status, para: 'PAGO', userId: p.userId, papel: p.papel, detalhe: { via: p.via, valorLiquido: t.valorLiquido, retencoes: totalRet(t), permutaId: p.permutaId } })
    return prisma.tesTitulo.findUniqueOrThrow({ where: { id } })
  } catch (e) {
    await prisma.tesTitulo.update({ where: { id }, data: { status: t.status, pagoEm: null, pagoValor: null, pagoContaId: null, comprovante: null } })
    if (t.accountPayableId && apClaim.count) await prisma.accountPayable.update({ where: { id: t.accountPayableId }, data: { status: 'PENDENTE', dataPagamento: null } })
    throw e
  }
}

export function mountTitulos(router: Router) {
  router.get('/titulos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { page, pageSize, skip, take } = pageParams(req.query)
    const where: any = { tenantId }
    const status = qs(req.query.status), origem = qs(req.query.origem), q = qs(req.query.q)
    if (status) where.status = status.includes(',') ? { in: status.split(',') } : status
    if (origem) where.origem = origem
    if (q) where.OR = [{ fornecedor: { contains: q, mode: 'insensitive' } }, { descricao: { contains: q, mode: 'insensitive' } }, { numero: { contains: q, mode: 'insensitive' } }]
    const de = qs(req.query.de), ate = qs(req.query.ate)
    if (de || ate) where.vencimento = { ...(de ? { gte: dia(de) } : {}), ...(ate ? { lte: new Date(dia(ate).getTime() + 12 * 3600_000) } : {}) }
    const [total, items, agg] = await Promise.all([
      prisma.tesTitulo.count({ where }),
      prisma.tesTitulo.findMany({ where, orderBy: [{ vencimento: 'asc' }, { createdAt: 'desc' }], skip, take }),
      prisma.tesTitulo.groupBy({ by: ['status'], where: { tenantId }, _sum: { valorBruto: true }, _count: true }),
    ])
    res.json({ total, page, pageSize, items, resumo: agg.map((a) => ({ status: a.status, qtd: a._count, valor: r2(a._sum.valorBruto ?? 0) })) })
  }))

  // Fila de conferência e autorização: o que o usuário atual pode agir + o que aguarda terceiros.
  router.get('/titulos/fila', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const [cfg, faixas] = await Promise.all([getConfig(tenantId), carregarAlcadas(tenantId)])
    const rows = await prisma.tesTitulo.findMany({ where: { tenantId, status: { in: ['RASCUNHO', 'CONFERIDO'] } }, include: { aprovacoes: true }, orderBy: [{ vencimento: 'asc' }, { createdAt: 'asc' }], take: 500 })
    const nomes = await nomesUsuarios(tenantId, rows.flatMap((r) => [r.criadoPorId, r.conferidoPorId]))
    const items: any[] = []
    for (const t of rows) {
      const v = await visao(req, t, faixas, cfg)
      const { aprovacoes, ...resto } = t as any
      items.push({ ...resto, ...v, criadoPorNome: nomes[t.criadoPorId], conferidoPorNome: t.conferidoPorId ? nomes[t.conferidoPorId] : null, pendencias: t.status === 'RASCUNHO' ? pendenciasPagamento(t) : [] })
    }
    const meus = items.filter((i) => i.podeConferir || i.podeAutorizar)
    res.json({
      items, paraMim: meus.length, aConferir: items.filter((i) => i.status === 'RASCUNHO').length, aAutorizar: items.filter((i) => i.status === 'CONFERIDO').length,
      valorAAutorizar: r2(items.filter((i) => i.status === 'CONFERIDO').reduce((a, i) => a + i.valorBruto, 0)),
    })
  }))

  router.post('/titulos', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const d = parseBody(tituloSchema, req.body)
    res.status(201).json(await criarTitulo(req, d))
  }))

  router.get('/titulos/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const t = await prisma.tesTitulo.findFirst({ where: { id: String(req.params.id), tenantId }, include: { eventos: { orderBy: { createdAt: 'asc' } }, aprovacoes: { orderBy: { createdAt: 'asc' } } } })
    if (!t) throw httpError(404, 'Título não encontrado.')
    const [cfg, faixas] = await Promise.all([getConfig(tenantId), carregarAlcadas(tenantId)])
    const nomes = await nomesUsuarios(tenantId, [t.criadoPorId, t.conferidoPorId, t.autorizadoPorId, ...t.eventos.map((e) => e.userId), ...t.aprovacoes.map((a) => a.userId)])
    const nota = t.notaFiscalId ? await prisma.tesNotaFiscal.findFirst({ where: { id: t.notaFiscalId, tenantId } }) : null
    const remessa = t.remessaId ? await prisma.tesRemessa.findFirst({ where: { id: t.remessaId, tenantId }, select: { id: true, numero: true, status: true, nomeArquivo: true } }) : null
    res.json({
      ...t, ...(await visao(req, t, faixas, cfg)), pendencias: pendenciasPagamento(t), nomes, nota, remessa,
      integridadeOk: t.hashAutorizado ? t.hashAutorizado === hashAutorizacao(t) : null,
      eventos: t.eventos.map((e) => ({ ...e, userNome: e.userId ? nomes[e.userId] : null })),
    })
  }))

  router.put('/titulos/:id', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const t = await buscarTitulo(tenantId, String(req.params.id))
    if (!['RASCUNHO', 'REJEITADO'].includes(t.status)) throw httpError(409, `Título ${t.status}: só RASCUNHO ou REJEITADO pode ser editado (devolva para rascunho antes).`, { code: 'NAO_EDITAVEL' })
    const d = parseBody(tituloSchema.partial(), req.body)
    const merged = { ...t, ...d }
    await validarReferencias(tenantId, { ...d, valorBruto: merged.valorBruto, retencaoInss: merged.retencaoInss, retencaoIrrf: merged.retencaoIrrf, retencaoIss: merged.retencaoIss, retencaoOutras: merged.retencaoOutras })
    const upd = await prisma.tesTitulo.update({
      where: { id: t.id },
      data: { ...(d as any), ...(d.fornecedorDocumento ? { fornecedorDocumento: soDigitos(d.fornecedorDocumento) } : {}), valorLiquido: r2(merged.valorBruto - totalRet(merged as any)), status: 'RASCUNHO', motivoRejeicao: null, conferidoPorId: null, conferidoEm: null, aprovacoesFeitas: 0 },
    })
    await prisma.tesAprovacao.deleteMany({ where: { tenantId, tituloId: t.id } })
    await eventoTitulo(prisma, { tenantId, tituloId: t.id, acao: 'EDITADO', de: t.status, para: 'RASCUNHO', userId: uid(req), papel: papelDe(req), detalhe: { campos: Object.keys(d) } })
    await log(req, 'TITULO_EDITADO', 'TesTitulo', t.id, { campos: Object.keys(d) })
    res.json(upd)
  }))

  router.post('/titulos/:id/conferir', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await conferirTitulo(req, String(req.params.id), typeof req.body?.observacao === 'string' ? req.body.observacao.slice(0, 300) : undefined))
  }))

  router.post('/titulos/:id/autorizar', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await autorizarTitulo(req, String(req.params.id)))
  }))

  // Lote para a fila do coordenador: cada título passa pelas mesmas regras; falhas não derrubam o lote.
  const loteSchema = z.object({ ids: z.array(z.string()).min(1).max(100), acao: z.enum(['conferir', 'autorizar']), codigo2fa: z.string().optional() })
  router.post('/titulos/lote', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const d = parseBody(loteSchema, req.body)
    const resultados: any[] = []
    for (const id of d.ids) {
      try {
        const r = d.acao === 'conferir' ? { titulo: await conferirTitulo(req, id) } : await autorizarTitulo(req, id)
        resultados.push({ id, ok: true, status: r.titulo.status, aguardandoSegundaAprovacao: (r as any).aguardandoSegundaAprovacao || false })
      } catch (e: any) {
        resultados.push({ id, ok: false, erro: e.message, code: e.code })
      }
    }
    res.json({ total: resultados.length, ok: resultados.filter((r) => r.ok).length, falhas: resultados.filter((r) => !r.ok).length, resultados })
  }))

  const motivoSchema = z.object({ motivo: z.string().min(5).max(300) })
  router.post('/titulos/:id/rejeitar', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), id = String(req.params.id)
    const { motivo } = parseBody(motivoSchema, req.body)
    const t = await buscarTitulo(tenantId, id)
    exigirTransicao(t.status as StatusTitulo, 'REJEITADO')
    if (t.criadoPorId === uid(req)) throw httpError(403, 'Segregação de funções: quem lançou não decide sobre o próprio título (use cancelar).', { code: 'SEGREGACAO' })
    const c = await prisma.tesTitulo.updateMany({ where: { id, tenantId, status: 'CONFERIDO' }, data: { status: 'REJEITADO', motivoRejeicao: motivo, aprovacoesFeitas: 0 } })
    if (c.count === 0) throw httpError(409, 'Título já foi processado por outra pessoa.')
    await prisma.tesAprovacao.deleteMany({ where: { tenantId, tituloId: id, tipo: 'AUTORIZACAO' } })
    await eventoTitulo(prisma, { tenantId, tituloId: id, acao: 'REJEITADO', de: 'CONFERIDO', para: 'REJEITADO', userId: uid(req), papel: papelDe(req), detalhe: { motivo } })
    await log(req, 'TITULO_REJEITADO', 'TesTitulo', id, { motivo })
    res.json(await prisma.tesTitulo.findUniqueOrThrow({ where: { id } }))
  }))

  router.post('/titulos/:id/devolver', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), id = String(req.params.id)
    const { motivo } = parseBody(motivoSchema, req.body)
    const t = await buscarTitulo(tenantId, id)
    exigirTransicao(t.status as StatusTitulo, 'RASCUNHO')
    if (t.remessaId) throw httpError(409, 'Título incluído em remessa: cancele a remessa antes de devolver.', { code: 'EM_REMESSA' })
    const c = await prisma.tesTitulo.updateMany({ where: { id, tenantId, status: { in: ['CONFERIDO', 'AUTORIZADO', 'REJEITADO'] } }, data: { status: 'RASCUNHO', conferidoPorId: null, conferidoEm: null, autorizadoPorId: null, autorizadoEm: null, aprovacoesFeitas: 0, hashAutorizado: null, motivoRejeicao: motivo, accountPayableId: null } })
    if (c.count === 0) throw httpError(409, 'Título já foi processado por outra pessoa.')
    if (t.accountPayableId) await prisma.accountPayable.updateMany({ where: { id: t.accountPayableId, tenantId, status: { in: ['PENDENTE', 'ATRASADO'] } }, data: { status: 'CANCELADO' } })
    await prisma.tesAprovacao.deleteMany({ where: { tenantId, tituloId: id } })
    await eventoTitulo(prisma, { tenantId, tituloId: id, acao: 'DEVOLVIDO', de: t.status, para: 'RASCUNHO', userId: uid(req), papel: papelDe(req), detalhe: { motivo } })
    await log(req, 'TITULO_DEVOLVIDO', 'TesTitulo', id, { motivo })
    res.json(await prisma.tesTitulo.findUniqueOrThrow({ where: { id } }))
  }))

  router.post('/titulos/:id/cancelar', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), id = String(req.params.id)
    const { motivo } = parseBody(motivoSchema, req.body)
    const t = await buscarTitulo(tenantId, id)
    exigirTransicao(t.status as StatusTitulo, 'CANCELADO')
    if (t.remessaId) throw httpError(409, 'Título incluído em remessa: cancele a remessa antes.', { code: 'EM_REMESSA' })
    // Cancelar título já autorizado exige não ser o próprio lançador (para evitar sumiço de pagamentos) - exceto rascunho.
    if (t.status !== 'RASCUNHO' && t.criadoPorId === uid(req) && !ehSuper(papelDe(req))) throw httpError(403, 'Segregação de funções: título já conferido/autorizado só pode ser cancelado por outra pessoa.', { code: 'SEGREGACAO' })
    const c = await prisma.tesTitulo.updateMany({ where: { id, tenantId, status: { in: EM_ABERTO.filter((s) => !['ENVIADO_BANCO'].includes(s)) as any } }, data: { status: 'CANCELADO', motivoRejeicao: motivo } })
    if (c.count === 0) throw httpError(409, 'Título já foi processado por outra pessoa.')
    if (t.accountPayableId) await prisma.accountPayable.updateMany({ where: { id: t.accountPayableId, tenantId, status: { in: ['PENDENTE', 'ATRASADO'] } }, data: { status: 'CANCELADO' } })
    await eventoTitulo(prisma, { tenantId, tituloId: id, acao: 'CANCELADO', de: t.status, para: 'CANCELADO', userId: uid(req), papel: papelDe(req), detalhe: { motivo } })
    await log(req, 'TITULO_CANCELADO', 'TesTitulo', id, { motivo })
    res.json(await prisma.tesTitulo.findUniqueOrThrow({ where: { id } }))
  }))

  // Baixa manual (pago fora do arquivo de remessa: caixa, cartão corporativo, permuta...).
  const baixaSchema = z.object({ contaId: z.string().optional(), data: dateISO().optional(), comprovante: z.string().max(200).optional(), permutaId: z.string().optional() })
  router.post('/titulos/:id/baixa', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), id = String(req.params.id)
    const d = parseBody(baixaSchema, req.body ?? {})
    const t = await buscarTitulo(tenantId, id)
    await exigir2fa(req, t.valorBruto)
    const out = await baixarTitulo({ tenantId, id, contaId: d.contaId, data: d.data, userId: uid(req), papel: papelDe(req), comprovante: d.comprovante, permutaId: d.permutaId, via: d.permutaId ? 'PERMUTA' : 'MANUAL' })
    await log(req, 'TITULO_BAIXADO', 'TesTitulo', id, { via: d.permutaId ? 'PERMUTA' : 'MANUAL', valor: out.valorLiquido })
    res.json(out)
  }))

  router.get('/titulos/:id/trilha', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), id = String(req.params.id)
    await buscarTitulo(tenantId, id)
    const [eventos, auditoria] = await Promise.all([
      prisma.tesTituloEvento.findMany({ where: { tenantId, tituloId: id }, orderBy: { createdAt: 'asc' } }),
      prisma.eduAuditEvent.findMany({ where: { tenantId, modulo: 'tesouraria', refType: 'TesTitulo', refId: id }, orderBy: { createdAt: 'asc' } }),
    ])
    const nomes = await nomesUsuarios(tenantId, [...eventos.map((e) => e.userId), ...auditoria.map((a) => a.userId)])
    res.json({ eventos: eventos.map((e) => ({ ...e, userNome: e.userId ? nomes[e.userId] : null })), auditoria: auditoria.map((a) => ({ ...a, userNome: a.userId ? nomes[a.userId] : null })) })
  }))
}
