// Dinheiro, datas e documentos. Sem dependências externas.
export const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
export const soDigitos = (s?: string | null) => String(s ?? '').replace(/\D+/g, '')
export const iso10 = (d: Date) => d.toISOString().slice(0, 10)
export const brl = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const pct = (n: number, casas = 2) => `${(Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`

/** Data de calendário (meio-dia UTC) a partir de 'AAAA-MM-DD' ou Date. */
export function dia(v: string | Date): Date {
  const d = new Date(v)
  if (isNaN(d.getTime())) throw Object.assign(new Error('Data inválida.'), { status: 400 })
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) d.setUTCHours(12, 0, 0, 0)
  return d
}
export const meioDia = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12))
export const hojeMeioDia = () => meioDia(new Date())
export const somaDias = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)

export const COMPETENCIA_RE = /^\d{4}-(0[1-9]|1[0-2])$/
export const competenciaDe = (d: Date) => d.toISOString().slice(0, 7)
/** Competência N meses depois (negativo = antes). */
export function somaMeses(comp: string, n: number) {
  const [a, m] = comp.split('-').map(Number)
  const t = a * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
/** Últimas 12 competências terminando em `ate` (inclusive), em ordem cronológica. */
export const ultimas12 = (ate: string) => Array.from({ length: 12 }, (_, i) => somaMeses(ate, i - 11))
export const inicioCompetencia = (c: string) => new Date(`${c}-01T00:00:00.000Z`)
export const fimCompetencia = (c: string) => new Date(inicioCompetencia(somaMeses(c, 1)).getTime() - 1)
export const nomeMes = (c: string) => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(c.slice(5, 7)) - 1] + '/' + c.slice(2, 4)

// Feriados nacionais FIXOS (Carnaval, Sexta-feira Santa e Corpus Christi móveis NÃO estão incluídos: confira no calendário oficial).
const FERIADOS_FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']
export const ehDiaUtil = (d: Date) => { const w = d.getUTCDay(); return w !== 0 && w !== 6 && !FERIADOS_FIXOS.includes(d.toISOString().slice(5, 10)) }
/** Antecipa para o dia útil anterior (regra usual de tributos federais). */
export function anteciparDiaUtil(d: Date) { let x = meioDia(d); while (!ehDiaUtil(x)) x = somaDias(x, -1); return x }
/** Dia `n` do mês seguinte à competência (ou do mês `mesesDepois`), limitado ao último dia, antecipado para dia útil. */
export function vencimentoDia(comp: string, n: number, mesesDepois = 1) {
  const alvo = somaMeses(comp, mesesDepois)
  const ultimo = fimCompetencia(alvo).getUTCDate()
  return anteciparDiaUtil(new Date(`${alvo}-${String(Math.min(n, ultimo)).padStart(2, '0')}T12:00:00.000Z`))
}
export function ultimoDiaUtilDoMes(comp: string) { return anteciparDiaUtil(meioDia(fimCompetencia(comp))) }

export function cnpjValido(v: string) {
  const c = soDigitos(v)
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const s = base.split('').reduce((a, d, i) => a + Number(d) * pesos[i], 0)
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = dv(c.slice(0, 12))
  return d1 === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13])
}
export function cpfValido(v: string) {
  const c = soDigitos(v)
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}
export const documentoValido = (v: string) => { const d = soDigitos(v); return d.length === 14 ? cnpjValido(d) : d.length === 11 ? cpfValido(d) : false }
export const fmtDoc = (v?: string | null) => {
  const d = soDigitos(v)
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  return v ?? ''
}
/** Gera um CNPJ válido a partir de 12 dígitos-base (usado só em dados fictícios de seed/teste). */
export function cnpjComDv(base12: string) {
  const dv = (b: string) => {
    const pesos = b.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const s = b.split('').reduce((a, d, i) => a + Number(d) * pesos[i], 0)
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = dv(base12)
  return base12 + d1 + dv(base12 + d1)
}

/** Escapa texto para HTML (espelhos imprimíveis). */
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export const AVISO_LEGAL = 'Este sistema não substitui um contador. Cálculos e guias são estimativas/simulações; valide com seu contador antes de enviar ou pagar. Seus dados são tratados conforme a LGPD.'
