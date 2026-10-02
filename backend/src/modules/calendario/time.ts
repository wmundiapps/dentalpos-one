// Utilitários PUROS de data/hora (fuso fixo de Brasília, UTC-3, sem horário de verão)
// e expansão de recorrência simples.

export const TZ_OFFSET_MIN = -180
export const DAY_MS = 86_400_000
export const DIAS_SEMANA = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
export const DIAS_SEMANA_CURTO = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

/** Data "deslocada" para o fuso local: use somente getUTC* nela. */
export function toLocal(d: Date): Date {
  return new Date(d.getTime() + TZ_OFFSET_MIN * 60_000)
}

/** Constrói um instante UTC a partir de uma data/hora local (mês 0-11). */
export function fromLocal(y: number, m0: number, d: number, min = 0): Date {
  return new Date(Date.UTC(y, m0, d, 0, min) - TZ_OFFSET_MIN * 60_000)
}

export function localDateKey(d: Date): string {
  const l = toLocal(d)
  return `${l.getUTCFullYear()}-${String(l.getUTCMonth() + 1).padStart(2, '0')}-${String(l.getUTCDate()).padStart(2, '0')}`
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map((x) => parseInt(x, 10))
  return fromLocal(y, m - 1, d, 0)
}

export function localMinutes(d: Date): number {
  const l = toLocal(d)
  return l.getUTCHours() * 60 + l.getUTCMinutes()
}

/** 1 = segunda ... 7 = domingo (fuso local). */
export function isoWeekday(d: Date): number {
  const w = toLocal(d).getUTCDay()
  return w === 0 ? 7 : w
}

export function startOfLocalDay(d: Date): Date {
  const l = toLocal(d)
  return fromLocal(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate(), 0)
}

export function endOfLocalDay(d: Date): Date {
  return new Date(startOfLocalDay(d).getTime() + DAY_MS - 1)
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS)
}

export function minToHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function hhmmToMin(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) throw new Error(`Horário inválido: ${s}`)
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

/** Interseção estrita de intervalos [a1,a2) x [b1,b2). */
export function overlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2
}

/** Primeira data (início do dia local) >= `from` com o dia da semana pedido (1-7). */
export function nextWeekdayOnOrAfter(from: Date, dia: number): Date {
  const s = startOfLocalDay(from)
  const diff = (dia - isoWeekday(s) + 7) % 7
  return addDays(s, diff)
}

/** Instante de um slot semanal numa data (início do dia local) específica. */
export function slotInstant(day: Date, min: number): Date {
  return new Date(startOfLocalDay(day).getTime() + min * 60_000)
}

export type Recorrencia = 'NENHUMA' | 'DIARIA' | 'SEMANAL' | 'QUINZENAL' | 'MENSAL' | 'ANUAL'

export interface ExpandOpts {
  inicio: Date
  fim: Date
  recorrencia?: Recorrencia
  intervalo?: number
  ate?: Date | null
  diasSemana?: number[]          // só para SEMANAL: 1-7
  max?: number                   // teto de ocorrências (padrão 400)
  janelaDe?: Date                // filtra ocorrências que intersectam [janelaDe, janelaAte]
  janelaAte?: Date
}

function clampDay(y: number, m0: number, d: number): number {
  const last = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()
  return Math.min(d, last)
}

/** Expande uma recorrência simples em ocorrências {inicio, fim}. A 1ª é sempre o próprio evento. */
export function expandRecorrencia(o: ExpandOpts): Array<{ inicio: Date; fim: Date }> {
  const rec = o.recorrencia ?? 'NENHUMA'
  const intervalo = Math.max(1, o.intervalo ?? 1)
  const max = o.max ?? 400
  const dur = o.fim.getTime() - o.inicio.getTime()
  const out: Array<{ inicio: Date; fim: Date }> = []
  const inWindow = (i: Date, f: Date) =>
    (!o.janelaDe || f.getTime() >= o.janelaDe.getTime()) && (!o.janelaAte || i.getTime() <= o.janelaAte.getTime())
  const push = (i: Date) => {
    const f = new Date(i.getTime() + dur)
    if (inWindow(i, f)) out.push({ inicio: i, fim: f })
  }
  if (rec === 'NENHUMA') {
    push(o.inicio)
    return out
  }
  const limite = o.ate ? o.ate.getTime() : o.janelaAte ? o.janelaAte.getTime() : o.inicio.getTime() + 366 * DAY_MS
  const l = toLocal(o.inicio)
  const y0 = l.getUTCFullYear()
  const m0 = l.getUTCMonth()
  const d0 = l.getUTCDate()
  const min0 = l.getUTCHours() * 60 + l.getUTCMinutes()
  let guard = 0
  const GUARD = 5000

  if (rec === 'SEMANAL' && o.diasSemana && o.diasSemana.length) {
    const dias = [...new Set(o.diasSemana)].filter((x) => x >= 1 && x <= 7).sort((a, b) => a - b)
    const monday = addDays(startOfLocalDay(o.inicio), -(isoWeekday(o.inicio) - 1))
    for (let k = 0; guard++ < GUARD; k++) {
      for (const dia of dias) {
        const day = addDays(monday, k * 7 * intervalo + (dia - 1))
        const i = slotInstant(day, min0)
        if (i.getTime() < o.inicio.getTime()) continue
        if (i.getTime() > limite) return out
        push(i)
        if (out.length >= max) return out
      }
      if (addDays(monday, k * 7 * intervalo).getTime() > limite) break
    }
    return out
  }

  for (let k = 0; guard++ < GUARD; k++) {
    let i: Date
    if (rec === 'DIARIA') i = addDays(o.inicio, k * intervalo)
    else if (rec === 'SEMANAL') i = addDays(o.inicio, 7 * intervalo * k)
    else if (rec === 'QUINZENAL') i = addDays(o.inicio, 14 * intervalo * k)
    else if (rec === 'MENSAL') {
      const mm = m0 + k * intervalo
      const y = y0 + Math.floor(mm / 12)
      const m = ((mm % 12) + 12) % 12
      i = fromLocal(y, m, clampDay(y, m, d0), min0)
    } else {
      const y = y0 + k * intervalo
      i = fromLocal(y, m0, clampDay(y, m0, d0), min0)
    }
    if (i.getTime() > limite) break
    push(i)
    if (out.length >= max) break
  }
  return out
}
