// Simulação de progressão na carreira (função pura).

export type Titulacao = 'GRADUADO' | 'ESPECIALISTA' | 'MESTRE' | 'DOUTOR'
export const ORDEM_TITULACAO: Record<Titulacao, number> = { GRADUADO: 0, ESPECIALISTA: 1, MESTRE: 2, DOUTOR: 3 }

export interface NivelCarreira {
  id: string
  codigo: string
  nome: string
  ordem: number
  titulacaoMinima?: Titulacao | null
  intersticioMeses: number
  pontuacaoMinima: number
  avaliacaoMinima: number
  salarioBase: number
}
export interface Servidor { inicioNivel: Date; titulacao?: Titulacao | null; pontuacao: number; avaliacao: number }
export interface Criterio { criterio: string; exigido: string | number; atual: string | number; atende: boolean }
export interface SimulacaoProgressao {
  nivelAtual: NivelCarreira
  nivelDestino: NivelCarreira | null
  elegivel: boolean
  criterios: Criterio[]
  faltantes: string[]
  elegivelEm: Date | null          // data em que o interstício se completa
  mesesNoNivel: number
  impacto: { salarioAtual: number; salarioNovo: number; diferenca: number; percentual: number } | null
}

const addMeses = (d: Date, m: number) => { const r = new Date(d); r.setUTCMonth(r.getUTCMonth() + m); return r }
export const mesesCompletos = (a: Date, b: Date) => Math.max(0, Math.floor((b.getTime() - a.getTime()) / (86_400_000 * 30.4375)))

export function simularProgressao(args: { niveis: NivelCarreira[]; nivelAtualId: string; servidor: Servidor; destinoId?: string; now?: Date }): SimulacaoProgressao {
  const now = args.now ?? new Date()
  const ord = [...args.niveis].sort((a, b) => a.ordem - b.ordem)
  const atual = ord.find((n) => n.id === args.nivelAtualId)
  if (!atual) throw Object.assign(new Error('Nível atual não encontrado no plano.'), { status: 400 })
  const destino = args.destinoId ? ord.find((n) => n.id === args.destinoId) ?? null : ord.find((n) => n.ordem > atual.ordem) ?? null
  if (args.destinoId && !destino) throw Object.assign(new Error('Nível de destino não encontrado no plano.'), { status: 400 })
  const base = { nivelAtual: atual, mesesNoNivel: mesesCompletos(args.servidor.inicioNivel, now) }
  if (!destino || destino.ordem <= atual.ordem) {
    return { ...base, nivelDestino: null, elegivel: false, criterios: [], faltantes: ['Não há nível superior disponível.'], elegivelEm: null, impacto: null }
  }
  const s = args.servidor
  const criterios: Criterio[] = []
  const interstício = destino.intersticioMeses
  criterios.push({ criterio: 'Interstício (meses no nível)', exigido: interstício, atual: base.mesesNoNivel, atende: base.mesesNoNivel >= interstício })
  if (destino.titulacaoMinima) {
    const t = s.titulacao ?? 'GRADUADO'
    criterios.push({ criterio: 'Titulação mínima', exigido: destino.titulacaoMinima, atual: t, atende: ORDEM_TITULACAO[t] >= ORDEM_TITULACAO[destino.titulacaoMinima] })
  }
  if (destino.pontuacaoMinima > 0) criterios.push({ criterio: 'Pontuação de produção', exigido: destino.pontuacaoMinima, atual: s.pontuacao, atende: s.pontuacao >= destino.pontuacaoMinima })
  if (destino.avaliacaoMinima > 0) criterios.push({ criterio: 'Avaliação de desempenho (0-10)', exigido: destino.avaliacaoMinima, atual: s.avaliacao, atende: s.avaliacao >= destino.avaliacaoMinima })
  const faltantes = criterios.filter((c) => !c.atende).map((c) => `${c.criterio}: exigido ${c.exigido}, atual ${c.atual}`)
  const dif = Math.round((destino.salarioBase - atual.salarioBase) * 100) / 100
  return {
    ...base,
    nivelDestino: destino,
    elegivel: faltantes.length === 0,
    criterios,
    faltantes,
    elegivelEm: addMeses(s.inicioNivel, interstício),
    impacto: { salarioAtual: atual.salarioBase, salarioNovo: destino.salarioBase, diferenca: dif, percentual: atual.salarioBase > 0 ? Math.round((dif / atual.salarioBase) * 10000) / 100 : 0 },
  }
}

// Máquina de estados do processo de progressão.
export type StatusProgressao = 'SOLICITADA' | 'EM_ANALISE' | 'DEFERIDA' | 'INDEFERIDA' | 'EFETIVADA' | 'CANCELADA'
const TRANSICOES: Record<StatusProgressao, StatusProgressao[]> = {
  SOLICITADA: ['EM_ANALISE', 'CANCELADA'],
  EM_ANALISE: ['DEFERIDA', 'INDEFERIDA', 'CANCELADA'],
  DEFERIDA: ['EFETIVADA', 'CANCELADA'],
  INDEFERIDA: [],
  EFETIVADA: [],
  CANCELADA: [],
}
export const transicaoValida = (de: StatusProgressao, para: StatusProgressao) => TRANSICOES[de].includes(para)
export const proximosStatus = (de: StatusProgressao) => TRANSICOES[de]
