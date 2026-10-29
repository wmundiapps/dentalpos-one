import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { qs } from '../core/crud'
import { LEITURA, dia, getConfig, httpError, iso10, periodo, r2, tid } from './common'
import { vencimentoTributoRetido } from './fiscal'
import { totalRet } from './titulos'

const DIA = 86_400_000
const inicioDoDia = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

function chaveBucket(d: Date, agrupar: string): string {
  if (agrupar === 'mes') return d.toISOString().slice(0, 7)
  if (agrupar === 'semana') {
    const x = inicioDoDia(d)
    const dow = (x.getUTCDay() + 6) % 7   // segunda = 0
    return iso10(new Date(x.getTime() - dow * DIA))
  }
  return iso10(d)
}

function listarBuckets(de: Date, ate: Date, agrupar: string): string[] {
  const out: string[] = []
  let cur = inicioDoDia(de)
  const fim = inicioDoDia(ate)
  let guard = 0
  while (cur <= fim && guard++ < 800) {
    const k = chaveBucket(cur, agrupar)
    if (out[out.length - 1] !== k) out.push(k)
    cur = new Date(cur.getTime() + DIA)
  }
  return out
}

export interface DadosFluxo {
  periodo: { de: Date; ate: Date }
  agrupar: string
  saldoInicial: number
  buckets: Array<{ chave: string; entradasRealizadas: number; saidasRealizadas: number; entradasPrevistas: number; saidasPrevistas: number; saldoFinal: number }>
  totais: Record<string, number>
  saidasPrevistasPorOrigem: Record<string, number>
  naoCaixa: { permutasAprovadasReceber: number; permutasAprovadasPagar: number }
  atrasados: { receber: number; pagar: number }
}

export async function calcularFluxo(tenantId: string, de: Date, ate: Date, agrupar: string, incluirTributos = true): Promise<DadosFluxo> {
  const hoje = inicioDoDia()
  const amanha = new Date(hoje.getTime() + DIA)
  const chaves = listarBuckets(de, ate, agrupar)
  const mapa = new Map(chaves.map((k) => [k, { chave: k, entradasRealizadas: 0, saidasRealizadas: 0, entradasPrevistas: 0, saidasPrevistas: 0, saldoFinal: 0 }]))
  const bucketDe = (d: Date) => {
    const pos = d < de ? de : d > ate ? ate : d
    return mapa.get(chaveBucket(pos, agrupar))
  }
  // saldo inicial = saldos das contas ativas antes de "de"
  const contas = await prisma.tesContaBancaria.findMany({ where: { tenantId, ativa: true }, select: { id: true, saldoInicial: true } })
  const antes = await prisma.tesMovimento.groupBy({ by: ['contaId'], where: { tenantId, data: { lt: de }, contaId: { in: contas.map((c) => c.id) } }, _sum: { valor: true } })
  const mAntes = new Map(antes.map((a) => [a.contaId, a._sum.valor ?? 0]))
  const saldoInicial = r2(contas.reduce((a, c) => a + c.saldoInicial + (mAntes.get(c.id) ?? 0), 0))

  // realizado: movimentos de caixa/banco no período e até agora (transferências entre contas não alteram o caixa total)
  const movs = await prisma.tesMovimento.findMany({ where: { tenantId, contaId: { in: contas.map((c) => c.id) }, data: { gte: de, lte: ate < amanha ? ate : new Date(amanha.getTime() - 1) }, tipo: { not: 'TRANSFERENCIA' } }, select: { valor: true, data: true } })
  for (const m of movs) { const b = bucketDe(m.data); if (b) { if (m.valor >= 0) b.entradasRealizadas += m.valor; else b.saidasRealizadas += -m.valor } }

  // previsto: a receber
  const recs = await prisma.accountReceivable.findMany({ where: { tenantId, status: { in: ['PENDENTE', 'ATRASADO'] }, dataVencimento: { lte: ate } }, select: { id: true, valor: true, dataVencimento: true } })
  const ajustes = recs.length ? await prisma.tesRecebivelAjuste.findMany({ where: { tenantId, receivableId: { in: recs.map((r) => r.id) } }, select: { receivableId: true, valorLiquido: true } }) : []
  const mAj = new Map(ajustes.map((a) => [a.receivableId, a.valorLiquido]))
  let atrasadosReceber = 0
  for (const r of recs) {
    const v = mAj.get(r.id) ?? r.valor
    const atrasado = r.dataVencimento < hoje
    if (atrasado) atrasadosReceber += v
    const alvo = atrasado ? (hoje < de ? de : hoje) : r.dataVencimento
    const b = bucketDe(alvo)
    if (b) b.entradasPrevistas += v
  }

  // previsto: a pagar (títulos Tes ainda não pagos)
  const origens: Record<string, number> = {}
  const abertos = await prisma.tesTitulo.findMany({ where: { tenantId, status: { in: ['RASCUNHO', 'CONFERIDO', 'AUTORIZADO', 'ENVIADO_BANCO'] }, vencimento: { lte: ate } }, select: { valorLiquido: true, vencimento: true, origem: true, status: true, accountPayableId: true } })
  let atrasadosPagar = 0
  for (const t of abertos) {
    const atrasado = t.vencimento < hoje
    if (atrasado) atrasadosPagar += t.valorLiquido
    const b = bucketDe(atrasado ? (hoje < de ? de : hoje) : t.vencimento)
    if (b) { b.saidasPrevistas += t.valorLiquido; origens[t.origem] = r2((origens[t.origem] ?? 0) + t.valorLiquido) }
  }
  // contas a pagar do financeiro legado que não nasceram na tesouraria
  const tesAps = (await prisma.tesTitulo.findMany({ where: { tenantId, accountPayableId: { not: null } }, select: { accountPayableId: true } })).map((t) => t.accountPayableId!)
  const legado = await prisma.accountPayable.findMany({ where: { tenantId, status: { in: ['PENDENTE', 'ATRASADO'] }, dataVencimento: { lte: ate }, ...(tesAps.length ? { id: { notIn: tesAps } } : {}) }, select: { valor: true, dataVencimento: true } })
  for (const p of legado) {
    const atrasado = p.dataVencimento < hoje
    if (atrasado) atrasadosPagar += p.valor
    const b = bucketDe(atrasado ? (hoje < de ? de : hoje) : p.dataVencimento)
    if (b) { b.saidasPrevistas += p.valor; origens.LEGADO = r2((origens.LEGADO ?? 0) + p.valor) }
  }
  // tributos retidos já descontados dos favorecidos e ainda a recolher (estimativa: dia 20 do mês seguinte)
  if (incluirTributos) {
    const pagos = await prisma.tesTitulo.findMany({ where: { tenantId, status: { in: ['PAGO', 'CONCILIADO'] }, pagoEm: { not: null } }, select: { pagoEm: true, retencaoInss: true, retencaoIrrf: true, retencaoIss: true, retencaoOutras: true } })
    for (const t of pagos) {
      const v = totalRet(t)
      if (v <= 0) continue
      const venc = vencimentoTributoRetido(t.pagoEm!)
      if (venc < hoje || venc < de || venc > ate) continue
      const b = bucketDe(venc)
      if (b) { b.saidasPrevistas += v; origens.TRIBUTOS_RETIDOS = r2((origens.TRIBUTOS_RETIDOS ?? 0) + v) }
    }
  }
  const perm = await prisma.tesPermuta.groupBy({ by: ['sentido'], where: { tenantId, status: 'APROVADA' }, _sum: { valorEquivalente: true } })

  let saldo = saldoInicial
  const buckets = chaves.map((k) => {
    const b = mapa.get(k)!
    b.entradasRealizadas = r2(b.entradasRealizadas); b.saidasRealizadas = r2(b.saidasRealizadas); b.entradasPrevistas = r2(b.entradasPrevistas); b.saidasPrevistas = r2(b.saidasPrevistas)
    saldo = r2(saldo + b.entradasRealizadas - b.saidasRealizadas + b.entradasPrevistas - b.saidasPrevistas)
    b.saldoFinal = saldo
    return b
  })
  const soma = (f: (b: (typeof buckets)[number]) => number) => r2(buckets.reduce((a, b) => a + f(b), 0))
  return {
    periodo: { de, ate }, agrupar, saldoInicial, buckets,
    totais: { entradasRealizadas: soma((b) => b.entradasRealizadas), saidasRealizadas: soma((b) => b.saidasRealizadas), entradasPrevistas: soma((b) => b.entradasPrevistas), saidasPrevistas: soma((b) => b.saidasPrevistas), saldoFinalProjetado: saldo },
    saidasPrevistasPorOrigem: origens,
    naoCaixa: { permutasAprovadasReceber: r2(perm.find((p) => p.sentido === 'RECEBER')?._sum.valorEquivalente ?? 0), permutasAprovadasPagar: r2(perm.find((p) => p.sentido === 'PAGAR')?._sum.valorEquivalente ?? 0) },
    atrasados: { receber: r2(atrasadosReceber), pagar: r2(atrasadosPagar) },
  }
}

export async function calcularDre(tenantId: string, de: Date, ate: Date) {
  const noPeriodo = { gte: de, lte: ate }
  const [txReceita, recebs, titulos, permutas] = await Promise.all([
    prisma.paymentTransaction.aggregate({ where: { tenantId, tipo: 'RECEITA', dataTransacao: noPeriodo }, _sum: { valor: true } }),
    prisma.tesRecebimento.aggregate({ where: { tenantId, data: noPeriodo }, _sum: { bolsa: true, desconto: true, juros: true, multa: true } }),
    prisma.tesTitulo.findMany({ where: { tenantId, status: { in: ['PAGO', 'CONCILIADO'] }, pagoEm: noPeriodo }, select: { origem: true, valorBruto: true, accountPayableId: true, retencaoInss: true, retencaoIrrf: true, retencaoIss: true, retencaoOutras: true, categoria: true } }),
    prisma.tesPermuta.findMany({ where: { tenantId, status: 'LIQUIDADA', liquidadaEm: noPeriodo }, select: { sentido: true, tipoContrapartida: true, valorEquivalente: true } }),
  ])
  const mensalidades = r2(txReceita._sum.valor ?? 0)
  const bolsas = r2(recebs._sum.bolsa ?? 0), descontos = r2(recebs._sum.desconto ?? 0)
  const permReceber = r2(permutas.filter((p) => p.sentido === 'RECEBER').reduce((a, p) => a + p.valorEquivalente, 0))
  const permPagar = r2(permutas.filter((p) => p.sentido === 'PAGAR').reduce((a, p) => a + p.valorEquivalente, 0))
  const permReceberDespesa = r2(permutas.filter((p) => p.sentido === 'RECEBER' && p.tipoContrapartida !== 'BEM').reduce((a, p) => a + p.valorEquivalente, 0))
  const receitaBrutaMens = r2(mensalidades + bolsas + descontos)
  const receitaPermuta = r2(permReceber + permPagar)
  const receitaBruta = r2(receitaBrutaMens + receitaPermuta)
  const deducoes = r2(bolsas + descontos)
  const receitaLiquida = r2(receitaBruta - deducoes)

  const por: Record<string, number> = { FOLHA: 0, PROLABORE: 0, TERCEIRO: 0, COMPRA: 0, CONTRATO: 0, NOTA_FISCAL: 0, IMPOSTO: 0, MANUAL: 0 }
  for (const t of titulos) por[t.origem] = r2((por[t.origem] ?? 0) + t.valorBruto)
  const apIds = titulos.map((t) => t.accountPayableId).filter(Boolean) as string[]
  const legado = await prisma.paymentTransaction.aggregate({ where: { tenantId, tipo: 'DESPESA', dataTransacao: noPeriodo, ...(apIds.length ? { OR: [{ accountPayableId: null }, { accountPayableId: { notIn: apIds } }] } : {}) }, _sum: { valor: true } })
  // despesas de títulos Tes pagos por permuta não geram PaymentTransaction; entram em permutas
  const despLegado = r2(legado._sum.valor ?? 0)
  const despPermuta = r2(permPagar + permReceberDespesa)
  const detalhe = [
    { chave: 'pessoal', rotulo: 'Pessoal (folha e encargos)', valor: por.FOLHA },
    { chave: 'prolabore', rotulo: 'Pró-labore', valor: por.PROLABORE },
    { chave: 'terceiros', rotulo: 'Serviços de terceiros (RPA/PJ)', valor: por.TERCEIRO },
    { chave: 'compras', rotulo: 'Compras e suprimentos', valor: por.COMPRA },
    { chave: 'contratos', rotulo: 'Contratos', valor: por.CONTRATO },
    { chave: 'notas', rotulo: 'Notas fiscais de entrada', valor: por.NOTA_FISCAL },
    { chave: 'impostos', rotulo: 'Impostos e taxas', valor: por.IMPOSTO },
    { chave: 'outras', rotulo: 'Outras despesas (lançadas na tesouraria)', valor: por.MANUAL },
    { chave: 'legado', rotulo: 'Outras despesas (financeiro geral)', valor: despLegado },
    { chave: 'permutas', rotulo: 'Despesas por permuta (não caixa)', valor: despPermuta },
  ]
  const totalDespesas = r2(detalhe.reduce((a, d) => a + d.valor, 0))
  const retidos = titulos.reduce((a, t) => ({ inss: a.inss + t.retencaoInss, irrf: a.irrf + t.retencaoIrrf, iss: a.iss + t.retencaoIss, outras: a.outras + t.retencaoOutras }), { inss: 0, irrf: 0, iss: 0, outras: 0 })
  return {
    periodo: { de, ate }, base: 'CAIXA',
    receitaBruta: { mensalidades: receitaBrutaMens, encargos: r2((recebs._sum.juros ?? 0) + (recebs._sum.multa ?? 0)), permutas: receitaPermuta, total: receitaBruta },
    deducoes: { bolsas, descontos, total: deducoes },
    receitaLiquida,
    despesas: { detalhe, total: totalDespesas },
    resultado: r2(receitaLiquida - totalDespesas),
    informativo: { tributosRetidosNaFonte: { inss: r2(retidos.inss), irrf: r2(retidos.irrf), iss: r2(retidos.iss), outras: r2(retidos.outras) }, permutaNaoCaixa: { receber: permReceber, pagar: permPagar }, observacao: 'DRE gerencial em regime de caixa; modelo a validar pelo contador. Despesas por permuta e receitas por permuta não movimentam caixa.' },
  }
}

const csv = (rows: Array<Array<unknown>>) => '﻿' + rows.map((r) => r.map((c) => { const s = c instanceof Date ? iso10(c) : typeof c === 'number' ? c.toFixed(2).replace('.', ',') : String(c ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(';')).join('\r\n') + '\r\n'

export async function exportarContabil(tenantId: string, conjunto: string, de: Date, ate: Date) {
  const cfg = await getConfig(tenantId)
  const cabecalho = { regime: cfg.regimeTributario, sistemaDestino: cfg.sistemaContabil, layout: cfg.layoutExportacao }
  if (conjunto === 'plano') {
    const cs = await prisma.chartOfAccount.findMany({ where: { tenantId }, orderBy: { codigo: 'asc' } })
    return { ...cabecalho, nomeArquivo: `plano-de-contas-${iso10(new Date())}.csv`, linhas: cs.length, conteudo: csv([['codigo', 'nome', 'tipo'], ...cs.map((c) => [c.codigo, c.nome, c.tipo])]) }
  }
  if (conjunto === 'centros') {
    const cs = await prisma.eduCostCenter.findMany({ where: { tenantId }, orderBy: { nome: 'asc' } })
    return { ...cabecalho, nomeArquivo: `centros-de-custo-${iso10(new Date())}.csv`, linhas: cs.length, conteudo: csv([['id', 'nome', 'descricao'], ...cs.map((c) => [c.id, c.nome, c.descricao])]) }
  }
  if (conjunto === 'notas') {
    const ns = await prisma.tesNotaFiscal.findMany({ where: { tenantId, emissao: { gte: de, lte: ate } }, orderBy: [{ direcao: 'asc' }, { emissao: 'asc' }] })
    const [contas, centros] = await Promise.all([prisma.chartOfAccount.findMany({ where: { tenantId } }), prisma.eduCostCenter.findMany({ where: { tenantId } })])
    const cc = new Map(contas.map((c) => [c.id, c.codigo])), cn = new Map(centros.map((c) => [c.id, c.nome]))
    const cab = ['direcao', 'modelo', 'serie', 'numero', 'chave', 'emissao', 'competencia', 'participante', 'documento', 'valor_total', 'iss', 'iss_retido', 'irrf', 'pis', 'cofins', 'csll', 'inss', 'outras_retencoes', 'total_retencoes', 'valor_liquido', 'conta_contabil', 'centro_custo', 'status']
    return {
      ...cabecalho, nomeArquivo: `notas-fiscais-${iso10(de)}-${iso10(ate)}.csv`, linhas: ns.length,
      conteudo: csv([cab, ...ns.map((n) => [n.direcao, n.modelo, n.serie, n.numero, n.chave, n.emissao, n.competencia, n.participanteNome, n.participanteDocumento, n.valorTotal, n.issValor, n.issRetido ? 'S' : 'N', n.retencaoIrrf, n.retencaoPis, n.retencaoCofins, n.retencaoCsll, n.retencaoInss, n.retencaoOutras, n.totalRetencoes, n.valorLiquido, n.contaContabilId ? cc.get(n.contaContabilId) : '', n.centroCustoId ? cn.get(n.centroCustoId) : '', n.status])]),
    }
  }
  if (conjunto === 'lancamentos') {
    const es = await prisma.accountingEntry.findMany({ where: { tenantId, data: { gte: de, lte: ate } }, include: { contaDebito: true, contaCredito: true, paymentTransaction: { include: { accountPayable: true } } }, orderBy: { data: 'asc' } })
    const centros = await prisma.eduCostCenter.findMany({ where: { tenantId } })
    const cn = new Map(centros.map((c) => [c.id, c.nome]))
    const cab = ['data', 'conta_debito', 'nome_debito', 'conta_credito', 'nome_credito', 'valor', 'historico', 'centro_custo', 'documento']
    return {
      ...cabecalho, nomeArquivo: `lancamentos-contabeis-${iso10(de)}-${iso10(ate)}.csv`, linhas: es.length,
      conteudo: csv([cab, ...es.map((e) => [e.data, e.contaDebito.codigo, e.contaDebito.nome, e.contaCredito.codigo, e.contaCredito.nome, e.valor, e.historico, cn.get(e.paymentTransaction?.accountPayable?.costCenterId ?? '') ?? '', e.paymentTransactionId ?? ''])]),
    }
  }
  throw httpError(400, 'conjunto deve ser: lancamentos, plano, centros ou notas.')
}

export function mountRelatorios(router: Router) {
  router.get('/painel', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const hoje = inicioDoDia(), em7 = new Date(hoje.getTime() + 7 * DIA), em30 = new Date(hoje.getTime() + 30 * DIA)
    const mesIni = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1))
    const [contas, somasMov, recs, ajs, titulosAbertos, filaC, filaA, remG, remE, itensPend, notasSem, notasDiv, bolsasDiv, permPend, recMes, recibosMes, pagoMes] = await Promise.all([
      prisma.tesContaBancaria.findMany({ where: { tenantId, ativa: true }, select: { id: true, nome: true, tipo: true, saldoInicial: true } }),
      prisma.tesMovimento.groupBy({ by: ['contaId'], where: { tenantId }, _sum: { valor: true } }),
      prisma.accountReceivable.findMany({ where: { tenantId, status: { in: ['PENDENTE', 'ATRASADO'] } }, select: { id: true, valor: true, dataVencimento: true } }),
      prisma.tesRecebivelAjuste.findMany({ where: { tenantId }, select: { receivableId: true, valorLiquido: true } }),
      prisma.tesTitulo.findMany({ where: { tenantId, status: { in: ['AUTORIZADO', 'ENVIADO_BANCO', 'CONFERIDO', 'RASCUNHO'] } }, select: { valorLiquido: true, vencimento: true, status: true } }),
      prisma.tesTitulo.count({ where: { tenantId, status: 'RASCUNHO' } }),
      prisma.tesTitulo.count({ where: { tenantId, status: 'CONFERIDO' } }),
      prisma.tesRemessa.count({ where: { tenantId, status: 'GERADA' } }),
      prisma.tesRemessa.count({ where: { tenantId, status: 'ENVIADA' } }),
      prisma.tesExtratoItem.count({ where: { tenantId, status: 'PENDENTE' } }),
      prisma.tesNotaFiscal.count({ where: { tenantId, status: 'LANCADA', tituloId: null, receivableId: null } }),
      prisma.tesNotaFiscal.count({ where: { tenantId, status: 'LANCADA', conciliacaoFiscal: 'DIVERGENTE' } }),
      prisma.tesRecebivelAjuste.count({ where: { tenantId, conferencia: 'DIVERGENTE' } }),
      prisma.tesPermuta.count({ where: { tenantId, status: { in: ['RASCUNHO', 'APROVADA'] } } }),
      prisma.tesRecebimento.aggregate({ where: { tenantId, data: { gte: mesIni } }, _sum: { valorRecebido: true }, _count: true }),
      prisma.tesRecibo.count({ where: { tenantId, status: 'EMITIDO', emitidoEm: { gte: mesIni } } }),
      prisma.tesTitulo.aggregate({ where: { tenantId, status: { in: ['PAGO', 'CONCILIADO'] }, pagoEm: { gte: mesIni } }, _sum: { valorLiquido: true }, _count: true }),
    ])
    const m = new Map(somasMov.map((s) => [s.contaId, s._sum.valor ?? 0]))
    const saldos = contas.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, saldo: r2(c.saldoInicial + (m.get(c.id) ?? 0)) }))
    const mAj = new Map(ajs.map((a) => [a.receivableId, a.valorLiquido]))
    const dev = (r: { id: string; valor: number }) => mAj.get(r.id) ?? r.valor
    const vencidos = recs.filter((r) => r.dataVencimento < hoje)
    const a7 = recs.filter((r) => r.dataVencimento >= hoje && r.dataVencimento < em7)
    const a30 = recs.filter((r) => r.dataVencimento >= hoje && r.dataVencimento < em30)
    const pagarAtras = titulosAbertos.filter((t) => t.vencimento < hoje)
    const pagar7 = titulosAbertos.filter((t) => t.vencimento >= hoje && t.vencimento < em7)
    const soma = (l: Array<{ valor?: number; valorLiquido?: number; id?: string }>, f: (x: any) => number) => r2(l.reduce((a, x) => a + f(x), 0))
    const alertas: Array<{ nivel: 'critico' | 'atencao' | 'info'; texto: string; secao: string }> = []
    if (vencidos.length) alertas.push({ nivel: 'atencao', texto: `${vencidos.length} mensalidade(s) vencida(s) em aberto`, secao: 'receber' })
    if (pagarAtras.length) alertas.push({ nivel: 'critico', texto: `${pagarAtras.length} título(s) a pagar vencido(s)`, secao: 'pagar' })
    if (filaA) alertas.push({ nivel: 'info', texto: `${filaA} título(s) aguardando autorização`, secao: 'fila' })
    if (filaC) alertas.push({ nivel: 'info', texto: `${filaC} título(s) aguardando conferência`, secao: 'fila' })
    if (itensPend) alertas.push({ nivel: 'atencao', texto: `${itensPend} lançamento(s) do extrato sem conciliação`, secao: 'bancos' })
    if (remE) alertas.push({ nivel: 'info', texto: `${remE} remessa(s) enviada(s) aguardando retorno`, secao: 'remessas' })
    if (bolsasDiv) alertas.push({ nivel: 'atencao', texto: `${bolsasDiv} mensalidade(s) com bolsa divergente da concessão`, secao: 'bolsas' })
    if (notasSem + notasDiv) alertas.push({ nivel: 'atencao', texto: `${notasSem} nota(s) sem vínculo e ${notasDiv} divergente(s)`, secao: 'notas' })
    res.json({
      saldos, saldoTotal: r2(saldos.reduce((a, s) => a + s.saldo, 0)),
      receber: { vencidos: { qtd: vencidos.length, valor: soma(vencidos, dev) }, proximos7: { qtd: a7.length, valor: soma(a7, dev) }, proximos30: { qtd: a30.length, valor: soma(a30, dev) }, recebidoNoMes: { qtd: recMes._count, valor: r2(recMes._sum.valorRecebido ?? 0) } },
      pagar: { vencidos: { qtd: pagarAtras.length, valor: soma(pagarAtras, (x) => x.valorLiquido) }, proximos7: { qtd: pagar7.length, valor: soma(pagar7, (x) => x.valorLiquido) }, pagoNoMes: { qtd: pagoMes._count, valor: r2(pagoMes._sum.valorLiquido ?? 0) } },
      fila: { aConferir: filaC, aAutorizar: filaA }, remessas: { aEnviar: remG, aguardandoRetorno: remE }, conciliacao: { itensPendentes: itensPend },
      notas: { semVinculo: notasSem, divergentes: notasDiv }, bolsas: { divergentes: bolsasDiv }, permutas: { emAndamento: permPend }, recibos: { emitidosNoMes: recibosMes }, alertas,
    })
  }))

  router.get('/relatorios/fluxo', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { de, ate } = periodo(req.query as any, 60)
    const agrupar = ['dia', 'semana', 'mes'].includes(String(qs(req.query.agrupar))) ? String(qs(req.query.agrupar)) : 'semana'
    if (ate.getTime() - de.getTime() > 400 * DIA) throw httpError(400, 'Período máximo de 400 dias.')
    res.json(await calcularFluxo(tid(req), de, ate, agrupar, qs(req.query.tributos) !== 'false'))
  }))

  router.get('/relatorios/dre', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { de, ate } = periodo(req.query as any, 30)
    res.json(await calcularDre(tid(req), de, ate))
  }))

  router.get('/contabil/exportar', requireRole('FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { de, ate } = periodo(req.query as any, 30)
    const out = await exportarContabil(tenantId, String(qs(req.query.conjunto) || 'lancamentos'), de, ate)
    if (qs(req.query.download) === '1') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${out.nomeArquivo}"`)
      return res.send(out.conteudo)
    }
    res.json(out)
  }))

  // Mapa de contas do plano usadas pela tesouraria (para conferência com o contador).
  router.get('/contabil/plano', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const [contas, centros, cfg] = await Promise.all([prisma.chartOfAccount.findMany({ where: { tenantId }, orderBy: { codigo: 'asc' } }), prisma.eduCostCenter.findMany({ where: { tenantId }, orderBy: { nome: 'asc' } }), getConfig(tenantId)])
    res.json({ contas, centros, regime: cfg.regimeTributario, sistemaContabil: cfg.sistemaContabil, layout: cfg.layoutExportacao })
  }))
  void dia
}
