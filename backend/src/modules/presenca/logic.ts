// Funções puras do módulo Presença (testáveis sem banco, sem câmera).

export const MIN = 60_000
export const HORA = 3_600_000
export const DIA = 86_400_000
const TZ_MS = 3 * HORA // America/Sao_Paulo (UTC-3, sem horário de verão desde 2019)

export const TIPOS_MARCACAO = ['ENTRADA', 'INTERVALO_SAIDA', 'INTERVALO_VOLTA', 'SAIDA'] as const
export type TipoMarcacao = (typeof TIPOS_MARCACAO)[number]
export type StatusFrequencia = 'PRESENTE' | 'ATRASO' | 'SAIDA_ANTECIPADA' | 'ATRASO_SAIDA_ANTECIPADA' | 'FALTA' | 'JUSTIFICADA'
export const STATUS_FREQUENCIA: StatusFrequencia[] = ['PRESENTE', 'ATRASO', 'SAIDA_ANTECIPADA', 'ATRASO_SAIDA_ANTECIPADA', 'FALTA', 'JUSTIFICADA']
export const STATUS_COMPUTA_PRESENCA: StatusFrequencia[] = ['PRESENTE', 'ATRASO', 'SAIDA_ANTECIPADA', 'ATRASO_SAIDA_ANTECIPADA']
export const presencaComputada = (s: string) => (STATUS_COMPUTA_PRESENCA as string[]).includes(s)

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Dia (YYYY-MM-DD) e dia da semana no fuso de Brasília. */
export function diaLocal(d: Date): { ymd: string; diaSemana: number } {
  const s = new Date(d.getTime() - TZ_MS)
  return { ymd: s.toISOString().slice(0, 10), diaSemana: s.getUTCDay() }
}

/** Combina o dia (local) de `base` com "HH:mm" (local) -> instante absoluto. */
export function combinarHora(base: Date, hhmm: string): Date {
  const { ymd } = diaLocal(base)
  return new Date(`${ymd}T${hhmm}:00-03:00`)
}

export function horaLocal(d: Date): string {
  const s = new Date(d.getTime() - TZ_MS)
  return s.toISOString().slice(11, 16)
}

export interface RegrasChamada {
  inicio: Date
  fim: Date
  intervaloInicio?: Date | null
  intervaloFim?: Date | null
  toleranciaAtrasoMin: number
  limiteFaltaMin: number
  toleranciaSaidaMin: number
  toleranciaIntervaloMin?: number
}
export interface MarcLite { tipo: string; em: Date }

export interface ResultadoFrequencia {
  status: StatusFrequencia
  entradaEm: Date | null
  saidaEm: Date | null
  minutosAtraso: number
  minutosSaidaAntecipada: number
  minutosForaIntervalo: number
  intervaloExcedido: boolean
}

const minutos = (ms: number) => Math.max(0, Math.round(ms / MIN))

/** Consolida as marcações de um aluno em presença/atraso/saída antecipada conforme as tolerâncias. */
export function calcularFrequencia(r: RegrasChamada, marcs: MarcLite[], encerrada: boolean): ResultadoFrequencia {
  const ord = [...marcs].sort((a, b) => a.em.getTime() - b.em.getTime())
  const entrada = ord.find((m) => m.tipo === 'ENTRADA')?.em ?? null
  const base: ResultadoFrequencia = { status: 'FALTA', entradaEm: entrada, saidaEm: null, minutosAtraso: 0, minutosSaidaAntecipada: 0, minutosForaIntervalo: 0, intervaloExcedido: false }
  if (!entrada) return base

  const atrasoMin = minutos(entrada.getTime() - r.inicio.getTime())
  let atrasado = false
  if (atrasoMin > r.limiteFaltaMin) return { ...base, minutosAtraso: atrasoMin } // chegou tarde demais: presença não computada
  if (atrasoMin > r.toleranciaAtrasoMin) atrasado = true
  base.minutosAtraso = atrasado ? atrasoMin : 0

  // intervalo: pares saída/volta
  let foraMs = 0
  let aberto: Date | null = null
  for (const m of ord) {
    if (m.tipo === 'INTERVALO_SAIDA' && !aberto) aberto = m.em
    else if (m.tipo === 'INTERVALO_VOLTA' && aberto) { foraMs += m.em.getTime() - aberto.getTime(); aberto = null }
  }
  base.minutosForaIntervalo = minutos(foraMs)
  if (r.intervaloInicio && r.intervaloFim && foraMs > 0) {
    const previsto = r.intervaloFim.getTime() - r.intervaloInicio.getTime()
    base.intervaloExcedido = foraMs > previsto + (r.toleranciaIntervaloMin ?? 5) * MIN
  }

  // saída
  let saida = [...ord].reverse().find((m) => m.tipo === 'SAIDA' && m.em > entrada)?.em ?? null
  if (!saida && aberto && encerrada) saida = aberto // saiu no intervalo e não voltou
  base.saidaEm = saida
  let antecipada = false
  if (saida) {
    const limite = r.fim.getTime() - r.toleranciaSaidaMin * MIN
    if (saida.getTime() < limite) { antecipada = true; base.minutosSaidaAntecipada = minutos(r.fim.getTime() - saida.getTime()) }
  }
  base.status = atrasado && antecipada ? 'ATRASO_SAIDA_ANTECIPADA' : atrasado ? 'ATRASO' : antecipada ? 'SAIDA_ANTECIPADA' : 'PRESENTE'
  return base
}

/** Decide o tipo da marcação quando o quiosque está em modo AUTO. */
export function proximoTipo(modo: string, marcs: MarcLite[], agora: Date, r: Pick<RegrasChamada, 'inicio' | 'fim' | 'intervaloInicio' | 'intervaloFim'>): TipoMarcacao {
  if (modo === 'ENTRADA') return 'ENTRADA'
  if (modo === 'SAIDA') return 'SAIDA'
  const ord = [...marcs].sort((a, b) => a.em.getTime() - b.em.getTime())
  const ultima = ord[ord.length - 1]
  if (modo === 'INTERVALO') return ultima?.tipo === 'INTERVALO_SAIDA' ? 'INTERVALO_VOLTA' : 'INTERVALO_SAIDA'
  if (!ultima) return 'ENTRADA'
  if (ultima.tipo === 'INTERVALO_SAIDA') return 'INTERVALO_VOLTA'
  if (ultima.tipo === 'SAIDA') return 'ENTRADA'
  const t = agora.getTime()
  const dentroIntervalo = r.intervaloInicio && r.intervaloFim && t >= r.intervaloInicio.getTime() - 10 * MIN && t <= r.intervaloFim.getTime() + 10 * MIN
  if (dentroIntervalo) return 'INTERVALO_SAIDA'
  return 'SAIDA'
}

/** Janela em que uma marcação é aceita: [início - antecedência, fim + 30 min]. */
export function dentroDaJanela(agora: Date, r: Pick<RegrasChamada, 'inicio' | 'fim'>, antecedenciaMin: number): boolean {
  return agora.getTime() >= r.inicio.getTime() - antecedenciaMin * MIN && agora.getTime() <= r.fim.getTime() + 30 * MIN
}

// ---------- empréstimos ----------
export function diasDeAtraso(prevista: Date, devolucao: Date): number {
  const dif = devolucao.getTime() - prevista.getTime()
  return dif <= 0 ? 0 : Math.ceil(dif / DIA)
}
export function calcularMultaItem(dias: number, multaDia: number, maximo: number): number {
  return Math.round(Math.min(dias * multaDia, maximo) * 100) / 100
}

// ---------- ocupação ----------
export function percentualOcupacao(ocupacao: number, capacidade: number | null | undefined): number | null {
  if (!capacidade || capacidade <= 0) return null
  return Math.round((ocupacao / capacidade) * 100)
}

export const pessoaKey = (tipo: 'ALUNO' | 'USUARIO', id: string) => `${tipo}:${id}`
export function parsePessoaKey(k: string): { tipo: 'ALUNO' | 'USUARIO'; id: string } | null {
  const m = /^(ALUNO|USUARIO):([\w-]{8,64})$/.exec(String(k || ''))
  return m ? { tipo: m[1] as 'ALUNO' | 'USUARIO', id: m[2] } : null
}

export function mascararDoc(d?: string | null): string | null {
  const s = String(d ?? '').replace(/\D+/g, '')
  if (!s) return null
  return s.length >= 11 ? `${s.slice(0, 3)}.***.***-${s.slice(-2)}` : `***${s.slice(-3)}`
}
