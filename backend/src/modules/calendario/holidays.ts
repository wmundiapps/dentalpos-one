// Feriados nacionais brasileiros (PURO). Inclui os móveis a partir da Páscoa.

export interface Feriado {
  data: string            // YYYY-MM-DD
  nome: string
  tipo: 'FERIADO' | 'PONTO_FACULTATIVO'
  movel: boolean
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): { y: number; m: number; d: number } {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return { y: ano, m: mes, d: dia }
}

function key(dt: Date): string {
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function offset(ano: number, dias: number): string {
  const p = pascoa(ano)
  return key(new Date(Date.UTC(p.y, p.m - 1, p.d + dias)))
}

export function feriadosNacionais(ano: number): Feriado[] {
  const fx = (m: number, d: number) => `${ano}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const lista: Feriado[] = [
    { data: fx(1, 1), nome: 'Confraternização Universal', tipo: 'FERIADO', movel: false },
    { data: offset(ano, -48), nome: 'Carnaval (segunda-feira)', tipo: 'PONTO_FACULTATIVO', movel: true },
    { data: offset(ano, -47), nome: 'Carnaval (terça-feira)', tipo: 'PONTO_FACULTATIVO', movel: true },
    { data: offset(ano, -2), nome: 'Sexta-feira Santa', tipo: 'FERIADO', movel: true },
    { data: offset(ano, 0), nome: 'Páscoa', tipo: 'PONTO_FACULTATIVO', movel: true },
    { data: fx(4, 21), nome: 'Tiradentes', tipo: 'FERIADO', movel: false },
    { data: fx(5, 1), nome: 'Dia do Trabalho', tipo: 'FERIADO', movel: false },
    { data: offset(ano, 60), nome: 'Corpus Christi', tipo: 'PONTO_FACULTATIVO', movel: true },
    { data: fx(9, 7), nome: 'Independência do Brasil', tipo: 'FERIADO', movel: false },
    { data: fx(10, 12), nome: 'Nossa Senhora Aparecida', tipo: 'FERIADO', movel: false },
    { data: fx(10, 28), nome: 'Dia do Servidor Público', tipo: 'PONTO_FACULTATIVO', movel: false },
    { data: fx(11, 2), nome: 'Finados', tipo: 'FERIADO', movel: false },
    { data: fx(11, 15), nome: 'Proclamação da República', tipo: 'FERIADO', movel: false },
    { data: fx(12, 25), nome: 'Natal', tipo: 'FERIADO', movel: false },
  ]
  if (ano >= 2024) lista.push({ data: fx(11, 20), nome: 'Dia da Consciência Negra', tipo: 'FERIADO', movel: false })
  return lista.sort((a, b) => a.data.localeCompare(b.data))
}
