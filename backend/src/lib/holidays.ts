// Feriados nacionais do Brasil (só os de lei federal). Carnaval e Corpus Christi são ponto facultativo e NÃO entram.
export type Holiday = { date: string; name: string }

// Páscoa (algoritmo de Meeus/Jones/Butcher), em UTC ao meio-dia.
function easter(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day, 12))
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

export function nationalHolidays(year: number): Holiday[] {
  const goodFriday = new Date(easter(year).getTime() - 2 * 86400000)
  const fixed: Array<[string, string]> = [
    ['01-01', 'Confraternização Universal'],
    ['04-21', 'Tiradentes'],
    ['05-01', 'Dia do Trabalho'],
    ['09-07', 'Independência do Brasil'],
    ['10-12', 'Nossa Senhora Aparecida'],
    ['11-02', 'Finados'],
    ['11-15', 'Proclamação da República'],
    ['11-20', 'Consciência Negra'],
    ['12-25', 'Natal'],
  ]
  return [...fixed.map(([md, name]) => ({ date: `${year}-${md}`, name })), { date: iso(goodFriday), name: 'Sexta-feira Santa' }]
    .sort((a, b) => a.date.localeCompare(b.date))
}
