// Funções PURAS do PDI (sem acesso a banco).

export type Sentido = 'MAIOR_MELHOR' | 'MENOR_MELHOR'
export type Periodicidade = 'MENSAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL'
export type Semaforo = 'VERDE' | 'AMARELO' | 'VERMELHO' | 'CINZA'

const clamp = (n: number, a = 0, b = 100) => Math.min(b, Math.max(a, n))

// % de atingimento da meta (0..100). A fórmula (atual-base)/(meta-base) vale para
// os dois sentidos: quando a meta é menor que a base os sinais se cancelam.
export function percentualMeta(p: { linhaBase: number; valorMeta: number; valorAtual?: number | null; sentido?: Sentido }): number {
  const { linhaBase, valorMeta, valorAtual } = p
  if (valorAtual == null || Number.isNaN(valorAtual)) return 0
  if (linhaBase === valorMeta) {
    const ok = p.sentido === 'MENOR_MELHOR' ? valorAtual <= valorMeta : valorAtual >= valorMeta
    return ok ? 100 : 0
  }
  return round1(clamp(((valorAtual - linhaBase) / (valorMeta - linhaBase)) * 100))
}

export const round1 = (n: number) => Math.round(n * 10) / 10

export function mediaPonderada(items: Array<{ valor: number; peso?: number }>): number {
  let soma = 0
  let pesos = 0
  for (const i of items) {
    const w = i.peso == null ? 1 : i.peso
    if (w <= 0) continue
    soma += i.valor * w
    pesos += w
  }
  return pesos === 0 ? 0 : round1(soma / pesos)
}

// Fração do tempo decorrido entre início e fim (0..1).
export function fracaoTempo(inicio: Date, fim: Date, now = new Date()): number {
  const t = fim.getTime() - inicio.getTime()
  if (t <= 0) return 1
  return Math.min(1, Math.max(0, (now.getTime() - inicio.getTime()) / t))
}

// Semáforo: compara o realizado com o esperado linear pelo tempo.
// VERDE: realizado >= 90% do esperado; AMARELO: >= 60%; senão VERMELHO.
export function semaforo(percentual: number, esperadoPercent: number, semDados = false): Semaforo {
  if (semDados) return 'CINZA'
  if (percentual >= 100) return 'VERDE'
  if (esperadoPercent <= 0) return 'VERDE'
  const razao = percentual / esperadoPercent
  if (razao >= 0.9) return 'VERDE'
  if (razao >= 0.6) return 'AMARELO'
  return 'VERMELHO'
}

const MESES: Record<Periodicidade, number> = { MENSAL: 1, BIMESTRAL: 2, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 }

export function addMeses(d: Date, meses: number): Date {
  const r = new Date(d.getTime())
  const dia = r.getUTCDate()
  r.setUTCDate(1)
  r.setUTCMonth(r.getUTCMonth() + meses)
  const ultimo = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()
  r.setUTCDate(Math.min(dia, ultimo))
  return r
}

export function proximaColeta(base: Date, periodicidade: Periodicidade): Date {
  return addMeses(base, MESES[periodicidade])
}

export interface MetaCalc {
  id: string
  peso: number
  linhaBase: number
  valorMeta: number
  valorAtual?: number | null
  sentido?: Sentido
}
export interface ObjetivoCalc { id: string; peso: number; metas: MetaCalc[] }
export interface EixoCalc { id: string; peso: number; objetivos: ObjetivoCalc[] }

// % de execução do PDI: metas -> objetivos -> eixos -> PDI (médias ponderadas).
export function execucaoPdi(eixos: EixoCalc[]) {
  const eixosOut = eixos.map((e) => {
    const objsOut = e.objetivos.map((o) => {
      const metasOut = o.metas.map((m) => ({ id: m.id, peso: m.peso, percentual: percentualMeta(m) }))
      return { id: o.id, peso: o.peso, percentual: mediaPonderada(metasOut.map((m) => ({ valor: m.percentual, peso: m.peso }))), metas: metasOut }
    })
    return { id: e.id, peso: e.peso, percentual: mediaPonderada(objsOut.map((o) => ({ valor: o.percentual, peso: o.peso }))), objetivos: objsOut }
  })
  return { percentual: mediaPonderada(eixosOut.map((e) => ({ valor: e.percentual, peso: e.peso }))), eixos: eixosOut }
}

export type SituacaoAcao = 'PLANEJADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA'
export function acaoAtrasada(a: { status: SituacaoAcao; prazo: Date }, now = new Date()) {
  return (a.status === 'PLANEJADA' || a.status === 'EM_ANDAMENTO') && a.prazo.getTime() < now.getTime()
}
