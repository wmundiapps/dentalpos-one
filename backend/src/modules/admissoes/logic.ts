// Lógica PURA do módulo de admissões (sem acesso a banco) — testada em __selftest__.ts.
import { randomInt } from 'crypto'

const DAY = 86_400_000

// ---------- CPF / protocolo / senha ----------

export function normalizarCpf(cpf?: string | null): string {
  return String(cpf ?? '').replace(/\D/g, '')
}

export function validarCpf(cpf?: string | null): boolean {
  const c = normalizarCpf(cpf)
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const dv = (len: number) => {
    let soma = 0
    for (let i = 0; i < len; i++) soma += Number(c[i]) * (len + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

export function gerarProtocolo(ano = new Date().getFullYear()): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += alfabeto[randomInt(alfabeto.length)]
  return `ADM${ano}-${s}`
}

export function gerarSenhaProvisoria(): string {
  const l = 'abcdefghjkmnpqrstuvwxyz'
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const n = '23456789'
  const pick = (set: string) => set[randomInt(set.length)]
  const todos = l + L + n
  let s = pick(L) + pick(l) + pick(n)
  for (let i = 0; i < 7; i++) s += pick(todos)
  return s
}

export function proximoRA(ano: number, maiorSequencialExistente: number): string {
  return `${ano}${String(maiorSequencialExistente + 1).padStart(6, '0')}`
}

// ---------- Funil ----------

export type StatusCandidato = 'LEAD' | 'INSCRITO' | 'PROVA' | 'APROVADO' | 'CONVOCADO' | 'MATRICULADO' | 'DESISTENTE' | 'REPROVADO'
export const ETAPAS_FUNIL: StatusCandidato[] = ['LEAD', 'INSCRITO', 'PROVA', 'APROVADO', 'CONVOCADO', 'MATRICULADO']

const TRANSICOES: Record<StatusCandidato, StatusCandidato[]> = {
  LEAD: ['INSCRITO', 'DESISTENTE'],
  INSCRITO: ['PROVA', 'APROVADO', 'REPROVADO', 'DESISTENTE'],
  PROVA: ['APROVADO', 'REPROVADO', 'DESISTENTE'],
  APROVADO: ['CONVOCADO', 'REPROVADO', 'DESISTENTE'],
  CONVOCADO: ['MATRICULADO', 'APROVADO', 'DESISTENTE'], // volta a APROVADO (lista de espera) se a convocação expira
  MATRICULADO: ['DESISTENTE'],
  DESISTENTE: ['LEAD', 'INSCRITO'],                      // reativação
  REPROVADO: ['INSCRITO'],                               // recurso deferido
}

export function podeTransicionar(de: StatusCandidato, para: StatusCandidato): boolean {
  return de === para ? false : TRANSICOES[de]?.includes(para) ?? false
}

export function etapaDe(status: StatusCandidato, etapaMaxima = 0): number {
  const i = ETAPAS_FUNIL.indexOf(status)
  if (i >= 0) return Math.max(i, etapaMaxima)
  if (status === 'REPROVADO') return Math.max(2, etapaMaxima)
  return etapaMaxima // DESISTENTE preserva a maior etapa atingida
}

export interface FunilEtapa { etapa: StatusCandidato; alcancou: number; conversaoAnterior: number | null; conversaoTotal: number | null }

export function calcularFunil(candidatos: Array<{ status: StatusCandidato; etapaMaxima?: number }>): { etapas: FunilEtapa[]; desistentes: number; reprovados: number; total: number } {
  const alcance = ETAPAS_FUNIL.map(() => 0)
  let desistentes = 0
  let reprovados = 0
  for (const c of candidatos) {
    const e = etapaDe(c.status, c.etapaMaxima ?? 0)
    for (let i = 0; i <= e && i < alcance.length; i++) alcance[i]++
    if (c.status === 'DESISTENTE') desistentes++
    if (c.status === 'REPROVADO') reprovados++
  }
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
  return {
    etapas: ETAPAS_FUNIL.map((etapa, i) => ({
      etapa,
      alcancou: alcance[i],
      conversaoAnterior: i === 0 ? null : pct(alcance[i], alcance[i - 1]),
      conversaoTotal: i === 0 ? null : pct(alcance[i], alcance[0]),
    })),
    desistentes,
    reprovados,
    total: candidatos.length,
  }
}

// ---------- Notas e classificação ----------

export interface NotaComp { componente: string; nota: number; notaMaxima?: number }

// Nota final na escala 0-100: média ponderada das notas normalizadas pela nota máxima.
// Componentes sem peso definido usam peso 1; sem pesos, média simples.
export function calcularNotaFinal(notas: NotaComp[], pesos?: Record<string, number> | null): number | null {
  if (!notas.length) return null
  let soma = 0
  let pesoTotal = 0
  for (const n of notas) {
    const max = n.notaMaxima && n.notaMaxima > 0 ? n.notaMaxima : 100
    const peso = pesos && pesos[n.componente] != null ? Number(pesos[n.componente]) : 1
    if (peso <= 0) continue
    soma += Math.min(100, Math.max(0, (n.nota / max) * 100)) * peso
    pesoTotal += peso
  }
  return pesoTotal > 0 ? Math.round((soma / pesoTotal) * 100) / 100 : null
}

export interface CandidatoClassif {
  id: string
  ofertaId?: string | null
  ofertaId2?: string | null
  notaFinal: number | null
  notas?: NotaComp[]
  dataNascimento?: Date | string | null
  criadoEm?: Date | string
  cota?: string | null
}

export type SituacaoClassif = 'CLASSIFICADO' | 'LISTA_ESPERA' | 'DESCLASSIFICADO'

export interface ResultadoClassif {
  id: string
  posicaoGeral: number | null
  situacao: SituacaoClassif
  ofertaAlocada: string | null
  posicaoNaOferta: number | null
  motivo?: string
}

function norm(n: NotaComp): number {
  return ((n.nota ?? 0) / (n.notaMaxima && n.notaMaxima > 0 ? n.notaMaxima : 100)) * 100
}

// Comparador com critérios de desempate. Critérios aceitos: nome de componente
// (PROVA, REDACAO, ...), 'IDADE' (mais velho vence — Estatuto do Idoso/praxe de vestibular),
// 'DATA_INSCRICAO' (mais antigo vence). Último recurso: id (determinístico).
export function comparadorClassificacao(criterios: string[] = ['REDACAO', 'PROVA', 'IDADE']) {
  return (a: CandidatoClassif, b: CandidatoClassif): number => {
    const na = a.notaFinal ?? -1
    const nb = b.notaFinal ?? -1
    if (na !== nb) return nb - na
    for (const c of criterios) {
      if (c === 'IDADE') {
        const da = a.dataNascimento ? new Date(a.dataNascimento).getTime() : Infinity
        const db = b.dataNascimento ? new Date(b.dataNascimento).getTime() : Infinity
        if (da !== db) return da - db
      } else if (c === 'DATA_INSCRICAO') {
        const da = a.criadoEm ? new Date(a.criadoEm).getTime() : Infinity
        const db = b.criadoEm ? new Date(b.criadoEm).getTime() : Infinity
        if (da !== db) return da - db
      } else {
        const va = a.notas?.find((x) => x.componente === c)
        const vb = b.notas?.find((x) => x.componente === c)
        const xa = va ? norm(va) : -1
        const xb = vb ? norm(vb) : -1
        if (xa !== xb) return xb - xa
      }
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  }
}

// Classifica candidatos: ordena por nota/desempate e aloca cada um na primeira opção com vaga;
// se não houver, tenta a segunda opção; sobrando, lista de espera (se habilitada).
export function classificar(
  candidatos: CandidatoClassif[],
  vagasPorOferta: Record<string, number>,
  opts: { notaMinima?: number; criterios?: string[]; listaEspera?: boolean } = {},
): { resultados: ResultadoClassif[]; filaPorOferta: Record<string, string[]> } {
  const cmp = comparadorClassificacao(opts.criterios)
  const notaMinima = opts.notaMinima ?? 0
  const ordenados = [...candidatos].sort(cmp)
  const restante: Record<string, number> = { ...vagasPorOferta }
  const contagemOferta: Record<string, number> = {}
  const resultados: ResultadoClassif[] = []
  const classificadosPorOferta: Record<string, string[]> = {}
  const esperaPorOferta: Record<string, string[]> = {}
  let pos = 0
  for (const c of ordenados) {
    if (c.notaFinal == null) {
      resultados.push({ id: c.id, posicaoGeral: null, situacao: 'DESCLASSIFICADO', ofertaAlocada: null, posicaoNaOferta: null, motivo: 'Sem nota lançada' })
      continue
    }
    pos++
    if (c.notaFinal < notaMinima) {
      resultados.push({ id: c.id, posicaoGeral: pos, situacao: 'DESCLASSIFICADO', ofertaAlocada: null, posicaoNaOferta: null, motivo: `Nota abaixo do mínimo (${notaMinima})` })
      continue
    }
    const opcoes = [c.ofertaId, c.ofertaId2].filter((x): x is string => !!x)
    const alocada = opcoes.find((o) => (restante[o] ?? 0) > 0)
    if (alocada) {
      restante[alocada]--
      contagemOferta[alocada] = (contagemOferta[alocada] ?? 0) + 1
      ;(classificadosPorOferta[alocada] ??= []).push(c.id)
      resultados.push({ id: c.id, posicaoGeral: pos, situacao: 'CLASSIFICADO', ofertaAlocada: alocada, posicaoNaOferta: contagemOferta[alocada] })
    } else if (opts.listaEspera !== false && opcoes.length) {
      for (const o of opcoes) (esperaPorOferta[o] ??= []).push(c.id)
      resultados.push({ id: c.id, posicaoGeral: pos, situacao: 'LISTA_ESPERA', ofertaAlocada: null, posicaoNaOferta: null })
    } else {
      resultados.push({ id: c.id, posicaoGeral: pos, situacao: 'DESCLASSIFICADO', ofertaAlocada: null, posicaoNaOferta: null, motivo: opcoes.length ? 'Sem vaga' : 'Sem opção de curso' })
    }
  }
  const filaPorOferta: Record<string, string[]> = {}
  for (const o of new Set([...Object.keys(classificadosPorOferta), ...Object.keys(esperaPorOferta), ...Object.keys(vagasPorOferta)])) {
    filaPorOferta[o] = [...(classificadosPorOferta[o] ?? []), ...(esperaPorOferta[o] ?? [])]
  }
  return { resultados, filaPorOferta }
}

// ---------- Convocação em chamadas ----------

export interface EstadoOfertaChamada {
  ofertaId: string
  vagas: number
  ocupadas: number          // matriculados + convocados ainda dentro do prazo
  fila: string[]            // candidatos em ordem de classificação (classificados, depois lista de espera)
}

// Gera a próxima chamada: para cada oferta, preenche as vagas livres com os próximos da fila
// que ainda não foram convocados/matriculados/excluídos. Um candidato só é convocado uma vez por chamada.
export function proximaChamada(
  ofertas: EstadoOfertaChamada[],
  jaConvocadosOuMatriculados: Set<string>,
  excluidos: Set<string> = new Set(),
): Array<{ candidatoId: string; ofertaId: string }> {
  const out: Array<{ candidatoId: string; ofertaId: string }> = []
  const usados = new Set<string>(jaConvocadosOuMatriculados)
  for (const o of ofertas) {
    let livres = Math.max(0, o.vagas - o.ocupadas)
    for (const id of o.fila) {
      if (livres <= 0) break
      if (usados.has(id) || excluidos.has(id)) continue
      usados.add(id)
      out.push({ candidatoId: id, ofertaId: o.ofertaId })
      livres--
    }
  }
  return out
}

// ---------- Campanhas / marketing ----------

export interface MetricasCampanhaIn {
  custo: number
  leads: number
  inscritos: number
  matriculas: number
  receitaPorMatricula?: number   // ex.: mensalidade x parcelas
  metaInscritos?: number
  metaMatriculas?: number
  orcamento?: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const div = (a: number, b: number) => (b > 0 ? r2(a / b) : null)

export function calcularMetricasCampanha(m: MetricasCampanhaIn) {
  const receita = (m.receitaPorMatricula ?? 0) * m.matriculas
  return {
    custo: r2(m.custo),
    leads: m.leads,
    inscritos: m.inscritos,
    matriculas: m.matriculas,
    cpl: div(m.custo, m.leads),
    custoPorInscrito: div(m.custo, m.inscritos),
    custoPorMatricula: div(m.custo, m.matriculas),
    receitaEstimada: r2(receita),
    roi: m.custo > 0 ? r2(((receita - m.custo) / m.custo) * 100) : null,   // %
    conversaoLeadMatricula: m.leads > 0 ? r2((m.matriculas / m.leads) * 100) : null,
    atingimentoMetaInscritos: m.metaInscritos ? r2((m.inscritos / m.metaInscritos) * 100) : null,
    atingimentoMetaMatriculas: m.metaMatriculas ? r2((m.matriculas / m.metaMatriculas) * 100) : null,
    usoOrcamento: m.orcamento ? r2((m.custo / m.orcamento) * 100) : null,
  }
}

// ---------- Bolsas e descontos ----------

export interface RegrasBolsa {
  notaMinima?: number
  cotas?: string[]
  niveis?: string[]
  programIds?: string[]
  tiposProcesso?: string[]
  convenioEmpresa?: string
}
export interface BolsaDef {
  id: string
  nome: string
  percentual: number
  valorFixo?: number | null
  cumulativa?: boolean
  ativo?: boolean
  vigenciaInicio?: Date | null
  vigenciaFim?: Date | null
  limiteConcessoes?: number | null
  concessoesAtuais?: number
  regras?: RegrasBolsa | null
}
export interface ContextoBolsa {
  notaFinal?: number | null
  cota?: string | null
  nivel?: string | null
  programId?: string | null
  tipoProcesso?: string | null
  empresaConvenio?: string | null
  hoje?: Date
}

export function avaliarElegibilidadeBolsa(b: BolsaDef, ctx: ContextoBolsa): { elegivel: boolean; motivos: string[] } {
  const motivos: string[] = []
  const hoje = ctx.hoje ?? new Date()
  const r = b.regras ?? {}
  if (b.ativo === false) motivos.push('Benefício inativo')
  if (b.vigenciaInicio && hoje < b.vigenciaInicio) motivos.push('Fora da vigência (ainda não iniciou)')
  if (b.vigenciaFim && hoje > b.vigenciaFim) motivos.push('Fora da vigência (encerrado)')
  if (b.limiteConcessoes != null && (b.concessoesAtuais ?? 0) >= b.limiteConcessoes) motivos.push('Limite de concessões atingido')
  if (r.notaMinima != null && (ctx.notaFinal ?? -1) < r.notaMinima) motivos.push(`Nota mínima ${r.notaMinima} não atingida`)
  if (r.cotas?.length && !(ctx.cota && r.cotas.includes(ctx.cota))) motivos.push('Cota não elegível')
  if (r.niveis?.length && !(ctx.nivel && r.niveis.includes(ctx.nivel))) motivos.push('Nível de ensino não elegível')
  if (r.programIds?.length && !(ctx.programId && r.programIds.includes(ctx.programId))) motivos.push('Curso não elegível')
  if (r.tiposProcesso?.length && !(ctx.tipoProcesso && r.tiposProcesso.includes(ctx.tipoProcesso))) motivos.push('Tipo de processo não elegível')
  if (r.convenioEmpresa && (ctx.empresaConvenio ?? '').toLowerCase() !== r.convenioEmpresa.toLowerCase()) motivos.push('Convênio não corresponde à empresa do candidato')
  return { elegivel: motivos.length === 0, motivos }
}

// Combina benefícios: o de maior percentual sempre vale; os marcados cumulativos somam,
// com teto de 100%. Não cumulativos concorrem entre si (vale o maior).
export function aplicarBeneficios(valorBase: number, bolsas: Array<{ id: string; percentual: number; cumulativa?: boolean; valorFixo?: number | null }>): { percentualTotal: number; valorDesconto: number; valorFinal: number; aplicados: string[] } {
  if (!bolsas.length || valorBase <= 0) return { percentualTotal: 0, valorDesconto: 0, valorFinal: r2(Math.max(0, valorBase)), aplicados: [] }
  const efetivo = (b: { percentual: number; valorFixo?: number | null }) => (b.valorFixo ? Math.min(100, (b.valorFixo / valorBase) * 100) : b.percentual)
  const naoCum = bolsas.filter((b) => !b.cumulativa).sort((a, b) => efetivo(b) - efetivo(a))
  const cum = bolsas.filter((b) => b.cumulativa)
  const escolhidos = [...(naoCum[0] ? [naoCum[0]] : []), ...cum]
  const pct = Math.min(100, r2(escolhidos.reduce((s, b) => s + efetivo(b), 0)))
  const desc = r2((valorBase * pct) / 100)
  return { percentualTotal: pct, valorDesconto: desc, valorFinal: r2(valorBase - desc), aplicados: escolhidos.map((b) => b.id) }
}

// ---------- Rematrícula ----------

export function calcularDescontoAntecipacao(valor: number, pct: number, dataLimite: Date | null | undefined, hoje = new Date()) {
  const aplica = pct > 0 && !!dataLimite && hoje.getTime() <= dataLimite.getTime()
  const desconto = aplica ? r2((valor * pct) / 100) : 0
  return { desconto, valorFinal: r2(valor - desconto), aplicado: aplica }
}

export interface ContextoRematricula {
  statusAluno: string
  temMatriculaAtiva: boolean
  parcelasVencidas: number
  valorVencido: number
  faltasExcessivas?: boolean
  disciplinasPendentesNaoCursadas?: number
  bloqueiaInadimplente: boolean
}

export function avaliarRematricula(c: ContextoRematricula): { status: 'ELEGIVEL' | 'PENDENTE_FINANCEIRO' | 'PENDENTE_ACADEMICO' | 'TRANCADA'; pendencias: string[] } {
  const pend: string[] = []
  if (c.statusAluno === 'TRANCADO') return { status: 'TRANCADA', pendencias: ['Matrícula trancada — requer reabertura pela secretaria'] }
  let academico = false
  let financeiro = false
  if (c.statusAluno !== 'ATIVO') { pend.push(`Situação do aluno: ${c.statusAluno}`); academico = true }
  if (!c.temMatriculaAtiva) { pend.push('Sem matrícula ativa no curso'); academico = true }
  if (c.faltasExcessivas) { pend.push('Frequência abaixo do mínimo exigido'); academico = true }
  if ((c.disciplinasPendentesNaoCursadas ?? 0) > 0) pend.push(`${c.disciplinasPendentesNaoCursadas} disciplina(s) em dependência`)
  if (c.parcelasVencidas > 0) {
    pend.push(`${c.parcelasVencidas} parcela(s) vencida(s) — R$ ${r2(c.valorVencido).toFixed(2)}`)
    if (c.bloqueiaInadimplente) financeiro = true
  }
  const status = financeiro ? 'PENDENTE_FINANCEIRO' : academico ? 'PENDENTE_ACADEMICO' : 'ELEGIVEL'
  return { status, pendencias: pend }
}

// Taxa de retenção = confirmados / base elegível (exclui trancados e formandos fora da base).
export function calcularRetencao(itens: Array<{ status: string }>) {
  const base = itens.filter((i) => i.status !== 'TRANCADA').length
  const confirmadas = itens.filter((i) => i.status === 'CONFIRMADA').length
  const naoRenovou = itens.filter((i) => i.status === 'NAO_RENOVOU').length
  return { base, confirmadas, naoRenovou, pendentes: base - confirmadas - naoRenovou, taxaRetencao: base > 0 ? r2((confirmadas / base) * 100) : null }
}

// Datas dos lembretes escalonados (D-30/D-15/D-7/D-1) que ainda estão no futuro.
export function datasLembretesRematricula(janelaFim: Date, hoje = new Date(), offsets = [30, 15, 7, 1]): Array<{ offset: number; remindAt: Date }> {
  return offsets
    .map((d) => ({ offset: d, remindAt: new Date(janelaFim.getTime() - d * DAY) }))
    .filter((x) => x.remindAt.getTime() > hoje.getTime())
}

// ---------- Parcelas ----------

export function somarMeses(base: Date, meses: number, dia?: number): Date {
  const d = new Date(base)
  d.setDate(1)
  d.setMonth(d.getMonth() + meses)
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(dia ?? base.getDate(), ultimo))
  return d
}
