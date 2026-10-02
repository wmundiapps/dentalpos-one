import { addDays, startOfLocalDay, localDateKey } from './time'

// Gerador PURO de iCalendar (RFC 5545) — importável no Google Agenda, Outlook, Apple.
// Horários em UTC (sem VTIMEZONE), dias inteiros como VALUE=DATE.

export interface IcsEvento {
  uid: string
  titulo: string
  descricao?: string | null
  local?: string | null
  inicio: Date
  fim: Date
  diaInteiro?: boolean
  rrule?: string | null            // sem o prefixo "RRULE:"
  exdates?: Date[]
  categorias?: string[]
  cancelado?: boolean
}

export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Dobra linhas em 75 octetos (UTF-8), continuação iniciada por espaço. */
export function icsFold(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let curBytes = 0
  let limit = 75
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8')
    if (curBytes + b > limit) {
      parts.push(cur)
      cur = ''
      curBytes = 0
      limit = 74
    }
    cur += ch
    curBytes += b
  }
  if (cur) parts.push(cur)
  return parts.join('\r\n ')
}

export function icsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function icsDate(d: Date): string {
  return localDateKey(d).replace(/-/g, '')
}

export function rruleSemanal(ate?: Date | null, intervalo = 1): string {
  return `FREQ=WEEKLY;INTERVAL=${intervalo}${ate ? ';UNTIL=' + icsUtc(ate) : ''}`
}

export function buildIcs(eventos: IcsEvento[], opts: { nome: string; prodId?: string; agora?: Date } = { nome: 'Calendário' }): string {
  const agora = opts.agora ?? new Date()
  const L: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${opts.prodId ?? '-//EduMaster Pro//Calendario Academico//PT-BR'}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(opts.nome)}`,
    'X-WR-TIMEZONE:America/Sao_Paulo',
  ]
  for (const e of eventos) {
    L.push('BEGIN:VEVENT')
    L.push(`UID:${e.uid}`)
    L.push(`DTSTAMP:${icsUtc(agora)}`)
    if (e.diaInteiro) {
      const ini = startOfLocalDay(e.inicio)
      // DTEND exclusivo: dia seguinte ao último dia
      const ultimo = startOfLocalDay(new Date(Math.max(e.fim.getTime() - 1, e.inicio.getTime())))
      L.push(`DTSTART;VALUE=DATE:${icsDate(ini)}`)
      L.push(`DTEND;VALUE=DATE:${icsDate(addDays(ultimo, 1))}`)
    } else {
      L.push(`DTSTART:${icsUtc(e.inicio)}`)
      L.push(`DTEND:${icsUtc(e.fim)}`)
    }
    L.push(`SUMMARY:${icsEscape(e.titulo)}`)
    if (e.descricao) L.push(`DESCRIPTION:${icsEscape(e.descricao)}`)
    if (e.local) L.push(`LOCATION:${icsEscape(e.local)}`)
    if (e.categorias?.length) L.push(`CATEGORIES:${e.categorias.map(icsEscape).join(',')}`)
    if (e.rrule) L.push(`RRULE:${e.rrule}`)
    if (e.exdates?.length) L.push(`EXDATE:${e.exdates.map(icsUtc).join(',')}`)
    if (e.cancelado) L.push('STATUS:CANCELLED')
    L.push('END:VEVENT')
  }
  L.push('END:VCALENDAR')
  return L.map(icsFold).join('\r\n') + '\r\n'
}
