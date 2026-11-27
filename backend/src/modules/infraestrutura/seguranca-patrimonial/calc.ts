// Funções puras da segurança patrimonial.
export const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Intervalo em minutos desde 00:00 do dia; turno que cruza a meia-noite termina no dia seguinte (fim += 24h). */
export function intervalo(inicio: string, fim: string): [number, number] {
  const a = hm(inicio); let b = hm(fim)
  if (b <= a) b += 1440
  return [a, b]
}
/** Dois turnos do MESMO agente se sobrepõem? `diaOffset` = dias de diferença (b - a). */
export function turnosSobrepoem(a: { inicio: string; fim: string }, b: { inicio: string; fim: string }, diaOffset = 0): boolean {
  const [a0, a1] = intervalo(a.inicio, a.fim)
  const [b0, b1] = intervalo(b.inicio, b.fim)
  const o = diaOffset * 1440
  return a0 < b1 + o && b0 + o < a1
}
/** Minutos de atraso na entrada (0 se dentro da tolerância). */
export function atrasoMin(inicioPrevisto: string, entrada: Date, dia: Date, toleranciaMin = 10): number {
  const base = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate())).getTime() + hm(inicioPrevisto) * 60_000
  // as horas da escala são locais do cadastro; comparamos em minutos do dia usando UTC-3 (America/Sao_Paulo) como referência fixa
  const entradaMin = (entrada.getTime() - 3 * 3600_000 - Date.UTC(entrada.getUTCFullYear(), entrada.getUTCMonth(), entrada.getUTCDate())) / 60_000
  void base
  const esperado = hm(inicioPrevisto)
  const d = ((entradaMin % 1440) + 1440) % 1440 - esperado
  return d > toleranciaMin && d < 720 ? Math.round(d) : 0
}
export const statusRonda = (esperados: number, lidos: number) => (esperados > 0 && lidos >= esperados ? 'CONCLUIDA' : 'INCOMPLETA')
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
/** Datas (YYYY-MM-DD) entre de e ate, filtradas por dias da semana (0=dom). */
export function diasEntre(de: string, ate: string, diasSemana?: number[]): string[] {
  const out: string[] = []
  for (let d = new Date(de + 'T00:00:00Z'); d <= new Date(ate + 'T00:00:00Z') && out.length < 366; d = new Date(d.getTime() + 86_400_000)) {
    if (!diasSemana?.length || diasSemana.includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10))
  }
  return out
}
/** Plantão 12x36: dias alternados a partir de `de`. */
export function dias12x36(de: string, ate: string): string[] { return diasEntre(de, ate).filter((_, i) => i % 2 === 0) }
