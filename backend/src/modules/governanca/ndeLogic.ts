// Validação PURA dos requisitos do NDE (Resolução CONAES nº 1/2010).

export type Titulacao = 'GRADUADO' | 'ESPECIALISTA' | 'MESTRE' | 'DOUTOR'
export type Regime = 'INTEGRAL' | 'PARCIAL' | 'HORISTA'
export interface MembroNde {
  id?: string
  nome?: string
  titulacao: Titulacao
  regime: Regime
  inicio: Date
  fim?: Date | null
  ativo?: boolean
  presidente?: boolean
}
export interface NdeOpts { minMembros?: number; minStricto?: number; minIntegral?: number; mandatoMeses?: number; avisoDias?: number }
export interface Violacao { codigo: string; gravidade: 'ERRO' | 'AVISO'; mensagem: string }
export interface ResultadoNde {
  conforme: boolean
  ativos: number
  metricas: { pctStricto: number; pctDoutor: number; pctIntegral: number; tempoMedioMeses: number }
  violacoes: Violacao[]
}

const DAY = 86_400_000
const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 1000) / 10)
export const mesesEntre = (a: Date, b: Date) => Math.max(0, Math.floor((b.getTime() - a.getTime()) / (DAY * 30.4375)))
export const addMesesUTC = (d: Date, m: number) => { const r = new Date(d); r.setUTCMonth(r.getUTCMonth() + m); return r }

export function fimMandato(m: MembroNde, mandatoMeses: number): Date {
  return m.fim ?? addMesesUTC(m.inicio, mandatoMeses)
}

export function validarNde(membros: MembroNde[], now = new Date(), opts: NdeOpts = {}): ResultadoNde {
  const o = { minMembros: 5, minStricto: 60, minIntegral: 20, mandatoMeses: 36, avisoDias: 90, ...opts }
  const ativos = membros.filter((m) => m.ativo !== false && m.inicio <= now && fimMandato(m, o.mandatoMeses) >= now)
  const total = ativos.length
  const stricto = ativos.filter((m) => m.titulacao === 'MESTRE' || m.titulacao === 'DOUTOR').length
  const doutor = ativos.filter((m) => m.titulacao === 'DOUTOR').length
  const integral = ativos.filter((m) => m.regime === 'INTEGRAL').length
  const metricas = {
    pctStricto: pct(stricto, total),
    pctDoutor: pct(doutor, total),
    pctIntegral: pct(integral, total),
    tempoMedioMeses: total ? Math.round(ativos.reduce((s, m) => s + mesesEntre(m.inicio, now), 0) / total) : 0,
  }
  const v: Violacao[] = []
  if (total < o.minMembros) v.push({ codigo: 'MIN_MEMBROS', gravidade: 'ERRO', mensagem: `NDE com ${total} docente(s) ativo(s); mínimo exigido: ${o.minMembros}.` })
  if (total > 0 && metricas.pctStricto < o.minStricto) v.push({ codigo: 'STRICTO_SENSU', gravidade: 'ERRO', mensagem: `${metricas.pctStricto}% com mestrado/doutorado; mínimo exigido: ${o.minStricto}%.` })
  if (total > 0 && metricas.pctIntegral < o.minIntegral) v.push({ codigo: 'TEMPO_INTEGRAL', gravidade: 'ERRO', mensagem: `${metricas.pctIntegral}% em tempo integral; mínimo exigido: ${o.minIntegral}%.` })
  if (total > 0 && !ativos.some((m) => m.presidente)) v.push({ codigo: 'SEM_PRESIDENTE', gravidade: 'AVISO', mensagem: 'NDE sem presidente designado.' })

  // mandatos vencidos (membros marcados ativos cujo mandato já terminou) e a vencer
  for (const m of membros) {
    if (m.ativo === false) continue
    const f = fimMandato(m, o.mandatoMeses)
    if (f < now) v.push({ codigo: 'MANDATO_VENCIDO', gravidade: 'ERRO', mensagem: `Mandato de ${m.nome ?? 'membro'} venceu em ${f.toISOString().slice(0, 10)}.` })
    else if (f.getTime() - now.getTime() <= o.avisoDias * DAY) v.push({ codigo: 'MANDATO_A_VENCER', gravidade: 'AVISO', mensagem: `Mandato de ${m.nome ?? 'membro'} vence em ${f.toISOString().slice(0, 10)}.` })
  }

  // Renovação parcial: evitar troca em bloco (mais de 50% dos mandatos terminando na mesma janela de 180 dias).
  if (total >= 2) {
    const fins = ativos.map((m) => fimMandato(m, o.mandatoMeses).getTime()).sort((a, b) => a - b)
    let maxJanela = 0
    for (let i = 0; i < fins.length; i++) {
      let c = 0
      for (let j = i; j < fins.length && fins[j] - fins[i] <= 180 * DAY; j++) c++
      maxJanela = Math.max(maxJanela, c)
    }
    if (maxJanela / total > 0.5) v.push({ codigo: 'RENOVACAO_PARCIAL', gravidade: 'AVISO', mensagem: `${maxJanela} de ${total} mandatos terminam em janela de 180 dias; escalone as renovações para manter parte do núcleo (renovação parcial).` })
  }
  return { conforme: !v.some((x) => x.gravidade === 'ERRO'), ativos: total, metricas, violacoes: v }
}
