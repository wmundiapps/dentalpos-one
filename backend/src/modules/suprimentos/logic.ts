// Funções PURAS do módulo Suprimentos (sem acesso a banco) — testadas em __selftest__.ts.

export const DAY = 86_400_000
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000

// ---------- Máquinas de estado ----------

export const REQ_TRANSICOES: Record<string, string[]> = {
  RASCUNHO: ['AGUARDANDO_APROVACAO', 'CANCELADA'],
  AGUARDANDO_APROVACAO: ['APROVADA', 'REPROVADA', 'CANCELADA'],
  APROVADA: ['EM_COTACAO', 'PEDIDO_EMITIDO', 'ATENDIDA', 'CANCELADA'],
  REPROVADA: ['RASCUNHO'],
  EM_COTACAO: ['COTADA', 'APROVADA', 'CANCELADA'],
  COTADA: ['PEDIDO_EMITIDO', 'EM_COTACAO', 'CANCELADA'],
  PEDIDO_EMITIDO: ['ATENDIDA', 'CANCELADA'],
  ATENDIDA: [],
  CANCELADA: [],
}

export const PEDIDO_TRANSICOES: Record<string, string[]> = {
  RASCUNHO: ['EMITIDO', 'CANCELADO'],
  EMITIDO: ['PARCIALMENTE_RECEBIDO', 'RECEBIDO', 'CANCELADO'],
  PARCIALMENTE_RECEBIDO: ['PARCIALMENTE_RECEBIDO', 'RECEBIDO', 'CANCELADO'],
  RECEBIDO: [],
  CANCELADO: [],
}

export function podeTransitar(mapa: Record<string, string[]>, de: string, para: string) {
  return (mapa[de] ?? []).includes(para)
}

// ---------- Alçadas de aprovação ----------

export interface Alcada { nivel: number; valorMinimo: number; papel: string }

// Devolve os níveis necessários para o valor: todos os níveis cuja faixa mínima <= valor
// (aprovação em cadeia: coordenação -> financeiro -> reitoria). Sem alçadas = aprovação única do papel padrão.
export function alcadasNecessarias(valor: number, alcadas: Alcada[], papelPadrao = 'COORDINATOR'): Alcada[] {
  const ord = [...alcadas].sort((a, b) => a.nivel - b.nivel)
  const req = ord.filter((a) => valor >= a.valorMinimo)
  if (req.length === 0) return ord.length ? [ord[0]] : [{ nivel: 1, valorMinimo: 0, papel: papelPadrao }]
  return req
}

// Próximo nível pendente (menor nível ainda não aprovado) ou null se todos aprovados.
export function proximoNivelPendente<T extends { nivel: number; status: string }>(aprovs: T[]) {
  const pend = aprovs.filter((a) => a.status === 'PENDENTE').sort((a, b) => a.nivel - b.nivel)
  return pend[0] ?? null
}

// ---------- Cotações ----------

export interface PropostaItem { requisicaoItemId: string; precoUnitario: number }
export interface Proposta {
  fornecedorId: string
  respondeu: boolean
  frete?: number
  prazoEntregaDias?: number | null
  notaFornecedor?: number | null // 0..5
  precos: PropostaItem[]
}
export interface ItemReq { id: string; quantidade: number; precoEstimado?: number | null }

export interface LinhaMapa {
  fornecedorId: string
  cobreTodos: boolean
  itensCotados: number
  subtotal: number
  frete: number
  total: number
  prazoEntregaDias: number | null
  nota: number | null
  score: number
  precos: Record<string, number | null>
}

// Mapa comparativo: um total por fornecedor (apenas propostas que cobrem TODOS os itens competem pelo global;
// parciais aparecem no mapa mas não vencem o critério global) e menor preço por item.
export function compararCotacoes(
  itens: ItemReq[],
  propostas: Proposta[],
  criterio: 'MENOR_PRECO' | 'MELHOR_PRAZO' | 'CUSTO_BENEFICIO' = 'MENOR_PRECO',
) {
  const resp = propostas.filter((p) => p.respondeu)
  const linhas: LinhaMapa[] = resp.map((p) => {
    const precos: Record<string, number | null> = {}
    let subtotal = 0
    let cotados = 0
    for (const it of itens) {
      const pr = p.precos.find((x) => x.requisicaoItemId === it.id)
      if (pr && pr.precoUnitario >= 0) {
        precos[it.id] = pr.precoUnitario
        subtotal += pr.precoUnitario * it.quantidade
        cotados++
      } else precos[it.id] = null
    }
    const frete = p.frete ?? 0
    return {
      fornecedorId: p.fornecedorId,
      cobreTodos: cotados === itens.length && itens.length > 0,
      itensCotados: cotados,
      subtotal: round2(subtotal),
      frete: round2(frete),
      total: round2(subtotal + frete),
      prazoEntregaDias: p.prazoEntregaDias ?? null,
      nota: p.notaFornecedor ?? null,
      score: 0,
      precos,
    }
  })

  const completas = linhas.filter((l) => l.cobreTodos)
  if (completas.length) {
    const minTotal = Math.min(...completas.map((l) => l.total))
    const prazos = completas.map((l) => l.prazoEntregaDias).filter((x): x is number => x != null)
    const minPrazo = prazos.length ? Math.min(...prazos) : null
    for (const l of completas) {
      const sPreco = minTotal > 0 ? minTotal / l.total : 1
      const sPrazo = minPrazo != null && l.prazoEntregaDias != null && l.prazoEntregaDias > 0 ? minPrazo / l.prazoEntregaDias : minPrazo == null ? 1 : 0.5
      const sNota = l.nota != null ? l.nota / 5 : 0.6
      l.score =
        criterio === 'MENOR_PRECO' ? sPreco : criterio === 'MELHOR_PRAZO' ? sPrazo * 0.7 + sPreco * 0.3 : sPreco * 0.5 + sPrazo * 0.25 + sNota * 0.25
      l.score = round3(l.score)
    }
  }

  const ranking = [...completas].sort((a, b) => b.score - a.score || a.total - b.total || (a.prazoEntregaDias ?? 999) - (b.prazoEntregaDias ?? 999))
  const vencedor = ranking[0] ?? null

  const melhorPorItem: Record<string, { fornecedorId: string; precoUnitario: number } | null> = {}
  for (const it of itens) {
    let best: { fornecedorId: string; precoUnitario: number } | null = null
    for (const l of linhas) {
      const p = l.precos[it.id]
      if (p != null && (!best || p < best.precoUnitario)) best = { fornecedorId: l.fornecedorId, precoUnitario: p }
    }
    melhorPorItem[it.id] = best
  }
  const totalMelhorPorItem = round2(itens.reduce((s, it) => s + (melhorPorItem[it.id]?.precoUnitario ?? 0) * it.quantidade, 0))

  // Economia: referência = preço estimado da requisição (se todos tiverem) senão média dos totais completos.
  const estimado = itens.every((i) => i.precoEstimado != null) ? round2(itens.reduce((s, i) => s + (i.precoEstimado as number) * i.quantidade, 0)) : null
  const media = completas.length ? round2(completas.reduce((s, l) => s + l.total, 0) / completas.length) : null
  const referencia = estimado ?? media
  const economia = vencedor && referencia != null ? round2(referencia - vencedor.total) : null

  return {
    linhas,
    ranking: ranking.map((l) => l.fornecedorId),
    vencedor: vencedor?.fornecedorId ?? null,
    totalVencedor: vencedor?.total ?? null,
    melhorPorItem,
    totalMelhorPorItem,
    referencia,
    economia,
    semProposta: itens.length > 0 && resp.length === 0,
  }
}

// ---------- Parcelamento ----------

// Divide em N parcelas em centavos (resto na última) e gera vencimentos a cada `intervaloDias`.
export function parcelar(valorTotal: number, n: number, primeiroVencimento: Date, intervaloDias = 30) {
  const parcelas = Math.max(1, Math.floor(n))
  const cents = Math.round(valorTotal * 100)
  const base = Math.floor(cents / parcelas)
  const resto = cents - base * parcelas
  const out: Array<{ numero: number; valor: number; vencimento: Date }> = []
  for (let i = 0; i < parcelas; i++) {
    const c = i === parcelas - 1 ? base + resto : base
    out.push({ numero: i + 1, valor: c / 100, vencimento: new Date(primeiroVencimento.getTime() + i * intervaloDias * DAY) })
  }
  return out
}

// ---------- Estoque ----------

// Custo médio ponderado após uma entrada.
export function custoMedioPonderado(qtdAtual: number, custoAtual: number, qtdEntrada: number, custoEntrada: number) {
  const totalQtd = qtdAtual + qtdEntrada
  if (totalQtd <= 0) return round2(custoEntrada)
  const base = Math.max(qtdAtual, 0)
  return Math.round(((base * custoAtual + qtdEntrada * custoEntrada) / (base + qtdEntrada)) * 10000) / 10000
}

export interface AplicacaoMov { saldo: number; custoMedio: number; valorTotal: number; custoUnitario: number }

// Aplica um movimento sobre (saldo, custoMedio). sentido=+1 entrada / -1 saída. Saída nunca vai abaixo de zero.
export function aplicarMovimento(saldo: number, custoMedio: number, sentido: 1 | -1, quantidade: number, custoEntrada?: number): AplicacaoMov {
  if (!(quantidade > 0)) throw Object.assign(new Error('Quantidade deve ser maior que zero.'), { status: 400 })
  if (sentido === 1) {
    const cu = custoEntrada ?? custoMedio
    const novoCm = custoMedioPonderado(saldo, custoMedio, quantidade, cu)
    return { saldo: round3(saldo + quantidade), custoMedio: novoCm, valorTotal: round2(quantidade * cu), custoUnitario: cu }
  }
  if (quantidade > saldo + 1e-9) {
    throw Object.assign(new Error(`Saldo insuficiente (disponível ${round3(saldo)}, solicitado ${round3(quantidade)}).`), { status: 409 })
  }
  const novo = round3(saldo - quantidade)
  return { saldo: novo, custoMedio: novo === 0 ? custoMedio : custoMedio, valorTotal: round2(quantidade * custoMedio), custoUnitario: custoMedio }
}

// Ponto de pedido = consumo diário * lead time + estoque de segurança.
export function pontoDePedido(consumoDiario: number, leadTimeDias: number, estoqueSeguranca = 0) {
  return round3(consumoDiario * leadTimeDias + estoqueSeguranca)
}

export interface ItemEstoque {
  itemId: string
  nome?: string
  saldo: number
  minimo: number
  maximo?: number | null
  pontoPedido?: number | null
  consumoDiario: number
  leadTimeDias: number
  emPedido?: number // já comprado e não recebido
}

// Sugestão de reposição: se (saldo+emPedido) <= ponto de pedido (ou mínimo) repõe até o máximo
// (ou cobertura de lead time + 30 dias de consumo). Prioridade por dias de cobertura.
export function sugerirReposicao(itens: ItemEstoque[]) {
  const out: Array<{ itemId: string; nome?: string; saldo: number; emPedido: number; pontoPedido: number; quantidadeSugerida: number; diasCobertura: number | null; prioridade: 'CRITICA' | 'ALTA' | 'NORMAL' }> = []
  for (const it of itens) {
    const emPedido = it.emPedido ?? 0
    const pp = it.pontoPedido != null && it.pontoPedido > 0 ? it.pontoPedido : Math.max(it.minimo, pontoDePedido(it.consumoDiario, it.leadTimeDias, it.minimo))
    const disponivel = it.saldo + emPedido
    if (disponivel > pp) continue
    const alvo = it.maximo != null && it.maximo > 0 ? it.maximo : Math.max(pp * 2, it.consumoDiario * (it.leadTimeDias + 30))
    const qtd = Math.ceil(Math.max(alvo - disponivel, 0) * 1000) / 1000
    if (qtd <= 0) continue
    const dias = it.consumoDiario > 0 ? round2(it.saldo / it.consumoDiario) : null
    const prioridade = it.saldo <= 0 || (dias != null && dias < it.leadTimeDias) ? 'CRITICA' : it.saldo <= it.minimo ? 'ALTA' : 'NORMAL'
    out.push({ itemId: it.itemId, nome: it.nome, saldo: it.saldo, emPedido, pontoPedido: pp, quantidadeSugerida: qtd, diasCobertura: dias, prioridade })
  }
  const peso = { CRITICA: 0, ALTA: 1, NORMAL: 2 }
  return out.sort((a, b) => peso[a.prioridade] - peso[b.prioridade] || (a.diasCobertura ?? 9999) - (b.diasCobertura ?? 9999))
}

// Curva ABC (Pareto): A até 80% do valor acumulado, B até 95%, C o restante.
export function curvaABC<T extends { id: string; valor: number }>(itens: T[], limiteA = 0.8, limiteB = 0.95) {
  const total = itens.reduce((s, i) => s + Math.max(i.valor, 0), 0)
  const ord = [...itens].sort((a, b) => b.valor - a.valor)
  let acum = 0
  return ord.map((i) => {
    const antes = total > 0 ? acum / total : 1
    acum += Math.max(i.valor, 0)
    const pct = total > 0 ? acum / total : 1
    const classe: 'A' | 'B' | 'C' = i.valor <= 0 ? 'C' : antes < limiteA ? 'A' : antes < limiteB ? 'B' : 'C'
    return { ...i, participacao: total > 0 ? round3(i.valor / total) : 0, acumulado: round3(pct), classe }
  })
}

export type ValidadeStatus = 'VENCIDO' | 'CRITICO' | 'ATENCAO' | 'OK' | 'SEM_VALIDADE'
export function statusValidade(validade: Date | null | undefined, hoje = new Date(), diasCritico = 15, diasAtencao = 60): ValidadeStatus {
  if (!validade) return 'SEM_VALIDADE'
  const d = Math.floor((validade.getTime() - hoje.getTime()) / DAY)
  if (d < 0) return 'VENCIDO'
  if (d <= diasCritico) return 'CRITICO'
  if (d <= diasAtencao) return 'ATENCAO'
  return 'OK'
}

// Seleção de lotes por FEFO (primeiro a vencer, primeiro a sair). Lotes sem validade vão por último.
export function selecionarLotesFEFO(lotes: Array<{ id: string; numero: string; validade: Date | null; quantidade: number }>, quantidade: number, hoje = new Date()) {
  const ord = [...lotes]
    .filter((l) => l.quantidade > 0 && !(l.validade && l.validade.getTime() < hoje.getTime()))
    .sort((a, b) => (a.validade?.getTime() ?? Infinity) - (b.validade?.getTime() ?? Infinity))
  let falta = quantidade
  const out: Array<{ loteId: string; numero: string; quantidade: number }> = []
  for (const l of ord) {
    if (falta <= 1e-9) break
    const q = Math.min(l.quantidade, falta)
    out.push({ loteId: l.id, numero: l.numero, quantidade: round3(q) })
    falta -= q
  }
  return { selecao: out, faltante: round3(Math.max(falta, 0)) }
}

// ---------- Kits de aula prática ----------

export function quantidadesKit(itens: Array<{ itemId: string; quantidadeFixa: number; quantidadePorAluno: number }>, numeroAlunos: number, multiplicador = 1) {
  return itens
    .map((i) => ({ itemId: i.itemId, quantidade: round3((i.quantidadeFixa + i.quantidadePorAluno * numeroAlunos) * multiplicador) }))
    .filter((i) => i.quantidade > 0)
}

// ---------- Contratos ----------

export function diasParaVencer(fim: Date, hoje = new Date()) {
  return Math.ceil((fim.getTime() - hoje.getTime()) / DAY)
}

export function statusContrato(c: { vigenciaInicio: Date; vigenciaFim: Date; avisoDias: number; status: string }, hoje = new Date()) {
  if (['RASCUNHO', 'RENOVADO', 'ENCERRADO'].includes(c.status)) return c.status
  if (c.vigenciaFim.getTime() < hoje.getTime()) return 'VENCIDO'
  if (diasParaVencer(c.vigenciaFim, hoje) <= c.avisoDias) return 'A_VENCER'
  return 'VIGENTE'
}

export function reajustar(valor: number, percentual: number) {
  return round2(valor * (1 + percentual / 100))
}

export function renovarVigencia(inicio: Date, fim: Date, meses?: number) {
  const dur = meses ?? Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / (30.4375 * DAY)))
  const novoInicio = new Date(fim.getTime() + DAY)
  const novoFim = new Date(novoInicio)
  novoFim.setMonth(novoFim.getMonth() + dur)
  novoFim.setDate(novoFim.getDate() - 1)
  return { inicio: novoInicio, fim: novoFim, meses: dur }
}

// ---------- Avaliação de fornecedor ----------

export function notaAvaliacao(n: { prazo: number; qualidade: number; preco: number; atendimento?: number }) {
  const a = n.atendimento ?? 3
  return round2(n.prazo * 0.3 + n.qualidade * 0.35 + n.preco * 0.2 + a * 0.15)
}

export function novaMedia(mediaAtual: number | null, total: number, nova: number) {
  return round2(((mediaAtual ?? 0) * total + nova) / (total + 1))
}

// ---------- Vendas / caixa ----------

export function totalVenda(itens: Array<{ quantidade: number; precoUnitario: number }>, desconto = 0) {
  const subtotal = round2(itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0))
  const d = Math.min(Math.max(desconto, 0), subtotal)
  return { subtotal, desconto: round2(d), total: round2(subtotal - d) }
}

export function fechamentoCaixa(p: { abertura: number; vendasDinheiro: number; devolucoesDinheiro: number; suprimentos: number; sangrias: number; contado?: number }) {
  const esperado = round2(p.abertura + p.vendasDinheiro - p.devolucoesDinheiro + p.suprimentos - p.sangrias)
  const diferenca = p.contado != null ? round2(p.contado - esperado) : null
  return { esperado, diferenca }
}

// Valida devolução: não pode exceder o que foi vendido e ainda não devolvido.
export function validarDevolucao(vendidos: Array<{ id: string; quantidade: number; quantidadeDevolvida: number; precoUnitario: number }>, pedido: Array<{ vendaItemId: string; quantidade: number }>) {
  let valor = 0
  for (const p of pedido) {
    const vi = vendidos.find((v) => v.id === p.vendaItemId)
    if (!vi) throw Object.assign(new Error('Item não pertence à venda.'), { status: 400 })
    const disponivel = vi.quantidade - vi.quantidadeDevolvida
    if (p.quantidade > disponivel + 1e-9) throw Object.assign(new Error(`Devolução excede o vendido (disponível ${disponivel}).`), { status: 409 })
    valor += p.quantidade * vi.precoUnitario
  }
  return round2(valor)
}

// ---------- Numeração ----------
export const formatarNumero = (prefixo: string, ano: number, seq: number) => `${prefixo}-${ano}-${String(seq).padStart(4, '0')}`

// Consumo diário médio a partir de saídas no período.
export function consumoDiarioMedio(saidas: Array<{ quantidade: number }>, dias: number) {
  if (dias <= 0) return 0
  return round3(saidas.reduce((s, m) => s + m.quantidade, 0) / dias)
}
