// Horários permitidos para ligações automáticas, no fuso da empresa.
// Padrão conservador (confirmar com o jurídico): seg–sex 09h–21h, sáb 10h–16h, sem domingos e feriados nacionais.

export interface CallWindow {
  days: number[] // 0 = domingo ... 6 = sábado
  start: string // "HH:MM"
  end: string // "HH:MM"
}

export const DEFAULT_WINDOWS: CallWindow[] = [
  { days: [1, 2, 3, 4, 5], start: '09:00', end: '21:00' },
  { days: [6], start: '10:00', end: '16:00' },
]

// Feriados nacionais fixos (MM-DD). Feriados móveis/municipais podem ser bloqueados pelas janelas.
const FIXED_HOLIDAYS = new Set(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'])

function parts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  })
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]))
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), wd }
}

// Converte um horário local (no fuso informado) para UTC.
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, timeZone: string) {
  let guess = Date.UTC(y, m - 1, d, h, min)
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(guess), timeZone)
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min)
    const diff = asUtc - Date.UTC(y, m - 1, d, h, min)
    if (diff === 0) break
    guess -= diff
  }
  return new Date(guess)
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function isHoliday(date: Date, timeZone: string) {
  const p = parts(date, timeZone)
  return FIXED_HOLIDAYS.has(`${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`)
}

export function isWithinWindows(date: Date, windows: CallWindow[], timeZone: string, skipHolidays = true) {
  if (skipHolidays && isHoliday(date, timeZone)) return false
  const p = parts(date, timeZone)
  const now = p.h * 60 + p.min
  return windows.some((w) => w.days.includes(p.wd) && now >= toMin(w.start) && now < toMin(w.end))
}

// Próximo instante permitido (a própria data se já estiver dentro).
export function nextAllowedTime(from: Date, windows: CallWindow[], timeZone: string, skipHolidays = true): Date | null {
  if (!windows.length) return null
  if (isWithinWindows(from, windows, timeZone, skipHolidays)) return from
  for (let offset = 0; offset < 21; offset++) {
    const base = new Date(from.getTime() + offset * 86_400_000)
    const p = parts(base, timeZone)
    const dayStart = zonedToUtc(p.y, p.m, p.d, 0, 0, timeZone)
    const localWd = parts(new Date(dayStart.getTime() + 12 * 3_600_000), timeZone).wd
    const candidates = windows
      .filter((w) => w.days.includes(localWd))
      .map((w) => {
        const [h, m] = w.start.split(':').map(Number)
        return zonedToUtc(p.y, p.m, p.d, h, m || 0, timeZone)
      })
      .filter((c) => c.getTime() > from.getTime())
      .sort((a, b) => a.getTime() - b.getTime())
    for (const c of candidates) if (isWithinWindows(c, windows, timeZone, skipHolidays)) return c
  }
  return null
}

export function validateWindows(input: unknown): CallWindow[] {
  if (!Array.isArray(input)) throw new Error('Janelas inválidas.')
  return input.map((w: any) => {
    const days = Array.isArray(w.days) ? w.days.map(Number).filter((d: number) => d >= 0 && d <= 6) : []
    if (!/^\d{2}:\d{2}$/.test(w.start) || !/^\d{2}:\d{2}$/.test(w.end) || toMin(w.start) >= toMin(w.end) || !days.length) {
      throw new Error('Cada janela precisa de dias e horário inicial menor que o final (HH:MM).')
    }
    return { days, start: w.start, end: w.end }
  })
}
