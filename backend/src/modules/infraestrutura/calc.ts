// Funções PURAS do módulo infraestrutura (sem acesso a banco) — testadas em __selftest__.ts.

const DAY = 86_400_000

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY)
}

// Meses completos entre duas datas (não negativo).
export function mesesEntre(inicio: Date, fim: Date): number {
  if (fim <= inicio) return 0
  let m = (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth())
  if (fim.getDate() < inicio.getDate()) m -= 1
  return Math.max(0, m)
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export interface DepreciacaoInput {
  valorAquisicao: number
  dataAquisicao: Date
  vidaUtilMeses: number
  valorResidual?: number     // valor absoluto
  residualPct?: number       // alternativa (0-100) se valorResidual ausente
  dataReferencia?: Date
  dataBaixa?: Date | null    // depreciação para na baixa
}

export interface DepreciacaoResultado {
  mesesUsados: number
  depreciacaoMensal: number
  depreciacaoAcumulada: number
  valorContabil: number
  valorResidual: number
  totalmenteDepreciado: boolean
  percentualDepreciado: number
}

// Depreciação linear mensal: (valor - residual) / vida útil; limitada ao valor depreciável.
export function depreciacaoLinear(i: DepreciacaoInput): DepreciacaoResultado {
  const valor = Math.max(0, i.valorAquisicao)
  const vida = Math.max(1, Math.floor(i.vidaUtilMeses))
  const residual = Math.min(valor, Math.max(0, i.valorResidual ?? (valor * (i.residualPct ?? 0)) / 100))
  const ref = i.dataBaixa && (!i.dataReferencia || i.dataBaixa < i.dataReferencia) ? i.dataBaixa : i.dataReferencia ?? new Date()
  const usados = Math.min(vida, mesesEntre(i.dataAquisicao, ref))
  const mensal = (valor - residual) / vida
  const acumulada = Math.min(valor - residual, mensal * usados)
  const contabil = valor - acumulada
  return {
    mesesUsados: usados,
    depreciacaoMensal: r2(mensal),
    depreciacaoAcumulada: r2(acumulada),
    valorContabil: r2(contabil),
    valorResidual: r2(residual),
    totalmenteDepreciado: usados >= vida,
    percentualDepreciado: valor > 0 ? r2((acumulada / (valor - residual || 1)) * 100) : 0,
  }
}

// ---------- SLA ----------
export type Prioridade = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'
export const SLA_HORAS: Record<Prioridade, number> = { URGENTE: 4, ALTA: 24, MEDIA: 72, BAIXA: 168 }

export function prazoSla(abertaEm: Date, prioridade: Prioridade): Date {
  return new Date(abertaEm.getTime() + SLA_HORAS[prioridade] * 3_600_000)
}

export type SlaSituacao = 'NO_PRAZO' | 'EM_RISCO' | 'VENCIDO' | 'CUMPRIDO' | 'DESCUMPRIDO'
// Em risco = consumiu >= 75% do tempo do SLA.
export function situacaoSla(abertaEm: Date, prazo: Date, concluidaEm: Date | null, agora = new Date()): SlaSituacao {
  if (concluidaEm) return concluidaEm <= prazo ? 'CUMPRIDO' : 'DESCUMPRIDO'
  if (agora > prazo) return 'VENCIDO'
  const total = prazo.getTime() - abertaEm.getTime()
  const gasto = agora.getTime() - abertaEm.getTime()
  return total > 0 && gasto / total >= 0.75 ? 'EM_RISCO' : 'NO_PRAZO'
}

// ---------- Preventiva ----------
// Dado o plano, decide se já é hora de gerar a OS e devolve a próxima execução.
export function avaliarPlano(proximaExecucao: Date, periodicidadeDias: number, antecedenciaDias: number, agora = new Date()) {
  const gerarAPartirDe = addDays(proximaExecucao, -antecedenciaDias)
  const deveGerar = agora >= gerarAPartirDe
  let proxima = proximaExecucao
  if (deveGerar) {
    const p = Math.max(1, periodicidadeDias)
    proxima = addDays(proximaExecucao, p)
    // se ficou muito atrasado, pula ciclos perdidos (sem gerar OS em cascata)
    while (proxima <= agora) proxima = addDays(proxima, p)
  }
  return { deveGerar, gerarAPartirDe, proximaExecucao: proxima }
}

// ---------- Indicadores de manutenção ----------
export interface OsLite {
  abertaEm: Date
  concluidaEm?: Date | null
  tipo: string
  status: string
  bemParado?: boolean
  bemId?: string | null
}

// MTTR em horas: média (conclusão - abertura) das OS corretivas concluídas.
export function mttrHoras(os: OsLite[]): number | null {
  const f = os.filter((o) => o.tipo === 'CORRETIVA' && o.status === 'CONCLUIDA' && o.concluidaEm)
  if (f.length === 0) return null
  const soma = f.reduce((s, o) => s + (o.concluidaEm!.getTime() - o.abertaEm.getTime()), 0)
  return r2(soma / f.length / 3_600_000)
}

// Disponibilidade (%) = 1 - horas paradas / horas totais no período, para N ativos.
export function disponibilidadePct(os: OsLite[], inicio: Date, fim: Date, totalAtivos: number): number | null {
  if (totalAtivos <= 0 || fim <= inicio) return null
  const total = (fim.getTime() - inicio.getTime()) * totalAtivos
  let parado = 0
  for (const o of os) {
    if (!o.bemParado || !o.bemId) continue
    const a = Math.max(o.abertaEm.getTime(), inicio.getTime())
    const b = Math.min((o.concluidaEm ?? fim).getTime(), fim.getTime())
    if (b > a) parado += b - a
  }
  return r2(Math.max(0, (1 - parado / total) * 100))
}

export function custoPorM2(custoTotal: number, areaM2: number): number | null {
  return areaM2 > 0 ? r2(custoTotal / areaM2) : null
}

// ---------- Energia/água ----------
export interface LeituraLite {
  dataLeitura: Date
  valor: number
}

export interface ConsumoCalc {
  consumo: number
  dias: number
  mediaDiaria: number
}

// Consumo entre duas leituras acumuladas (trata virada de ponteiro/medidor trocado como erro de leitura).
export function consumoEntre(anterior: LeituraLite, atual: LeituraLite): ConsumoCalc {
  if (atual.dataLeitura <= anterior.dataLeitura) throw new Error('Data da leitura deve ser posterior à leitura anterior.')
  if (atual.valor < anterior.valor) throw new Error('Leitura menor que a anterior (medidor trocado ou erro de digitação).')
  const dias = Math.max(1, Math.round((atual.dataLeitura.getTime() - anterior.dataLeitura.getTime()) / DAY))
  const consumo = atual.valor - anterior.valor
  return { consumo: r2(consumo), dias, mediaDiaria: r2(consumo / dias) }
}

// Desvio da média diária atual vs. média das últimas N médias diárias (histórico). Alerta se |desvio| > limiar.
export function desvioConsumo(mediaDiariaAtual: number, historicoMediasDiarias: number[], limiarPct: number) {
  const h = historicoMediasDiarias.filter((x) => Number.isFinite(x) && x >= 0)
  if (h.length < 2) return { desvioPct: null as number | null, alerta: false, mediaHistorica: h.length ? r2(h.reduce((a, b) => a + b, 0) / h.length) : null }
  const media = h.reduce((a, b) => a + b, 0) / h.length
  if (media === 0) return { desvioPct: mediaDiariaAtual > 0 ? 100 : 0, alerta: mediaDiariaAtual > 0, mediaHistorica: 0 }
  const desvio = ((mediaDiariaAtual - media) / media) * 100
  return { desvioPct: r2(desvio), alerta: Math.abs(desvio) > limiarPct, mediaHistorica: r2(media) }
}

// ---------- Reservas ----------
export function conflitoHorario(a: { inicio: Date; fim: Date }, b: { inicio: Date; fim: Date }): boolean {
  return a.inicio < b.fim && b.inicio < a.fim
}

// ---------- Projetos ----------
export interface EtapaLite {
  peso: number
  percentual: number
  status: string
}
// % de execução ponderado pelo peso; etapa CONCLUIDA conta 100.
export function percentualProjeto(etapas: EtapaLite[]): number {
  const ativas = etapas.filter((e) => e.peso > 0)
  const pesoTotal = ativas.reduce((s, e) => s + e.peso, 0)
  if (pesoTotal === 0) return 0
  const s = ativas.reduce((acc, e) => acc + e.peso * (e.status === 'CONCLUIDA' ? 100 : Math.min(100, Math.max(0, e.percentual))), 0)
  return r2(s / pesoTotal)
}

// ---------- Inventário ----------
export interface ItemInventarioLite {
  contado: boolean
  spaceEsperadoId?: string | null
  spaceEncontradoId?: string | null
  estadoEsperado?: string | null
  estadoEncontrado?: string | null
  semBemCadastrado?: boolean
}
export type Divergencia = 'NENHUMA' | 'NAO_ENCONTRADO' | 'LOCAL_DIVERGENTE' | 'ESTADO_DIVERGENTE' | 'SOBRA'

export function classificarDivergencia(i: ItemInventarioLite): Divergencia {
  if (i.semBemCadastrado) return 'SOBRA'
  if (!i.contado) return 'NAO_ENCONTRADO'
  if (i.spaceEncontradoId && i.spaceEsperadoId && i.spaceEncontradoId !== i.spaceEsperadoId) return 'LOCAL_DIVERGENTE'
  if (i.estadoEncontrado && i.estadoEsperado && i.estadoEncontrado !== i.estadoEsperado) return 'ESTADO_DIVERGENTE'
  return 'NENHUMA'
}

export function resumoInventario(divs: Divergencia[]) {
  const r: Record<string, number> = { total: divs.length, NENHUMA: 0, NAO_ENCONTRADO: 0, LOCAL_DIVERGENTE: 0, ESTADO_DIVERGENTE: 0, SOBRA: 0 }
  for (const d of divs) r[d] = (r[d] ?? 0) + 1
  r.acuracidadePct = divs.length ? r2((r.NENHUMA / divs.length) * 100) : 100
  return r
}

// ---------- Adequação por curso ----------
export function quantidadeExigida(quantidadeMinima: number, porVagas: number | null | undefined, vagas: number | null | undefined): number {
  if (porVagas && porVagas > 0 && vagas && vagas > 0) return Math.max(quantidadeMinima, Math.ceil(vagas / porVagas))
  return quantidadeMinima
}

export type SituacaoRequisito = 'ATENDE' | 'PARCIAL' | 'NAO_ATENDE'
export function avaliarRequisito(exigido: number, existente: number): { situacao: SituacaoRequisito; lacuna: number; coberturaPct: number } {
  const lacuna = Math.max(0, exigido - existente)
  const cobertura = exigido > 0 ? Math.min(100, r2((existente / exigido) * 100)) : 100
  return { situacao: lacuna === 0 ? 'ATENDE' : existente > 0 ? 'PARCIAL' : 'NAO_ATENDE', lacuna, coberturaPct: cobertura }
}

// Conceito resumido 1-5 (escala MEC) a partir do % de requisitos obrigatórios atendidos.
export function conceitoAdequacao(pctObrigatoriosAtendidos: number): number {
  if (pctObrigatoriosAtendidos >= 100) return 5
  if (pctObrigatoriosAtendidos >= 85) return 4
  if (pctObrigatoriosAtendidos >= 70) return 3
  if (pctObrigatoriosAtendidos >= 50) return 2
  return 1
}

// ---------- Estacionamento ----------
export function normalizarPlaca(p: string): string {
  return p.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
// Placa antiga (AAA9999) ou Mercosul (AAA9A99).
export function placaValida(p: string): boolean {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizarPlaca(p))
}
export function credencialVigente(status: string, validade: Date | null | undefined, agora = new Date()): { ok: boolean; motivo?: string } {
  if (status === 'SUSPENSA') return { ok: false, motivo: 'Credencial suspensa.' }
  if (status === 'REVOGADA') return { ok: false, motivo: 'Credencial revogada.' }
  if (status === 'VENCIDA' || (validade && validade < agora)) return { ok: false, motivo: 'Credencial vencida.' }
  return { ok: true }
}
export function ocupacaoPct(ocupadas: number, total: number): number {
  return total > 0 ? r2((ocupadas / total) * 100) : 0
}
