import { addDays, isoWeekday, localDateKey, startOfLocalDay } from './time'

// Cálculo PURO de dias letivos de um período, descontando feriados/recessos
// (eventos que bloqueiam aulas) e somando dias letivos extras (ex.: sábado letivo).

export interface Bloqueio {
  inicio: Date
  fim: Date
  titulo: string
}

export interface ResultadoDiasLetivos {
  totalDias: number                       // dias letivos efetivos
  porDiaSemana: Record<number, number>    // 1..7
  semanasLetivas: number                  // semanas com ao menos 1 dia letivo
  naoLetivos: Array<{ data: string; motivo: string }>
  extras: string[]
  datasLetivas: string[]
}

export function calcularDiasLetivos(opts: {
  inicio: Date
  fim: Date
  diasSemana?: number[]       // dias que normalmente têm aula (padrão seg-sex)
  bloqueios?: Bloqueio[]
  extras?: Bloqueio[]         // dias letivos extras
}): ResultadoDiasLetivos {
  const dias = opts.diasSemana ?? [1, 2, 3, 4, 5]
  const bloq = new Map<string, string>()
  for (const b of opts.bloqueios ?? []) {
    let d = startOfLocalDay(b.inicio)
    const ultimo = startOfLocalDay(new Date(Math.max(b.fim.getTime() - 1, b.inicio.getTime())))
    for (let g = 0; d.getTime() <= ultimo.getTime() && g < 800; g++) {
      const k = localDateKey(d)
      if (!bloq.has(k)) bloq.set(k, b.titulo)
      d = addDays(d, 1)
    }
  }
  const extraSet = new Set<string>()
  for (const e of opts.extras ?? []) {
    let d = startOfLocalDay(e.inicio)
    const ultimo = startOfLocalDay(new Date(Math.max(e.fim.getTime() - 1, e.inicio.getTime())))
    for (let g = 0; d.getTime() <= ultimo.getTime() && g < 800; g++) {
      extraSet.add(localDateKey(d))
      d = addDays(d, 1)
    }
  }
  const porDiaSemana: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 }
  const naoLetivos: Array<{ data: string; motivo: string }> = []
  const datasLetivas: string[] = []
  const semanas = new Set<string>()
  const extras: string[] = []
  let d = startOfLocalDay(opts.inicio)
  const fimDia = startOfLocalDay(opts.fim)
  for (let g = 0; d.getTime() <= fimDia.getTime() && g < 800; g++) {
    const k = localDateKey(d)
    const wd = isoWeekday(d)
    const extra = extraSet.has(k)
    const normal = dias.includes(wd)
    if (normal || extra) {
      if (bloq.has(k) && !extra) naoLetivos.push({ data: k, motivo: bloq.get(k)! })
      else {
        porDiaSemana[wd]++
        datasLetivas.push(k)
        if (extra && !normal) extras.push(k)
        const monday = addDays(d, -(wd - 1))
        semanas.add(localDateKey(monday))
      }
    }
    d = addDays(d, 1)
  }
  return { totalDias: datasLetivas.length, porDiaSemana, semanasLetivas: semanas.size, naoLetivos, extras, datasLetivas }
}
