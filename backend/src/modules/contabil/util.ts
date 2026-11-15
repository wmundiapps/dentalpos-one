// Utilitários puros do bloco contábil parte 2 (sem dependência do hospedeiro).
export const FAIXA_AVISO = 'Este sistema não substitui um contador. Cálculos e guias são estimativas/simulações; valide com seu contador antes de enviar ou pagar. Seus dados são tratados conforme a LGPD.'
export const AVISO_SIMULACAO = 'SIMULAÇÃO: nenhuma informação foi enviada a órgão público real (Receita Federal, Junta Comercial, SEFAZ, prefeituras, eSocial). O fluxo existe para treino, acompanhamento interno e futura integração por provedor.'

export const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
export const soDigitos = (s?: string | null) => String(s ?? '').replace(/\D+/g, '')
export const iso10 = (d: Date) => d.toISOString().slice(0, 10)
export const meioDia = (v: string | Date): Date => {
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00.000Z`) : new Date(v)
  if (isNaN(d.getTime())) throw Object.assign(new Error('Data inválida.'), { status: 400 })
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12))
}
export const somaDias = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
export const diffDias = (a: Date, b: Date) => Math.round((meioDia(a).getTime() - meioDia(b).getTime()) / 86_400_000)
export const brl = (v: number) => `R$ ${r2(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const dataBr = (d: Date | string | null | undefined) => (d ? `${new Date(d).toISOString().slice(8, 10)}/${new Date(d).toISOString().slice(5, 7)}/${new Date(d).getUTCFullYear()}` : '—')

export function validarCpf(v: string): boolean {
  const c = soDigitos(v)
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}
export function dvCnpj(base12: string): string {
  const calc = (b: string) => { const pesos = b.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < b.length; i++) s += Number(b[i]) * pesos[i]; const r = s % 11; return r < 2 ? 0 : 11 - r }
  const d1 = calc(base12)
  return `${d1}${calc(base12 + d1)}`
}
export function validarCnpj(v: string): boolean {
  const c = soDigitos(v)
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false
  return dvCnpj(c.slice(0, 12)) === c.slice(12)
}
export const fmtCnpj = (c: string) => { const d = soDigitos(c); return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : c }
export const fmtCpf = (c: string) => { const d = soDigitos(c); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : c }
export const mascaraCpf = (c?: string | null) => { const d = soDigitos(c); return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : c ? '***' : null }

/** CNPJ FICTÍCIO (base 99xxxxxx, dígitos verificadores válidos). Nunca existe na Receita: marcado como simulado. */
export function gerarCnpjSimulado(seed: string): string {
  let h = 7
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const base = ('99' + String(h).padStart(6, '0').slice(-6) + '0001').slice(0, 12)
  return base + dvCnpj(base)
}
export function protocoloSim(prefixo: string, seed: string): string {
  let h = 5381
  for (const ch of seed + Date.now() + Math.random()) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0
  const d = new Date()
  return `SIM-${prefixo}-${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}-${h.toString(36).toUpperCase().padStart(7, '0').slice(-7)}`
}

/** N-ésimo dia útil do mês (seg-sex, sem feriados — "conferir" no calendário oficial). mes: 1-12. */
export function enesimoDiaUtil(ano: number, mes: number, n: number): Date {
  let c = 0
  for (let dia = 1; dia <= 31; dia++) {
    const d = new Date(Date.UTC(ano, mes - 1, dia, 12))
    if (d.getUTCMonth() !== mes - 1) break
    const w = d.getUTCDay()
    if (w !== 0 && w !== 6 && ++c === n) return d
  }
  return new Date(Date.UTC(ano, mes - 1, 28, 12))
}
export function ultimoDiaUtil(ano: number, mes: number): Date {
  for (let dia = 31; dia >= 1; dia--) {
    const d = new Date(Date.UTC(ano, mes - 1, dia, 12))
    if (d.getUTCMonth() !== mes - 1) continue
    const w = d.getUTCDay()
    if (w !== 0 && w !== 6) return d
  }
  return new Date(Date.UTC(ano, mes - 1, 28, 12))
}
export const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate()

/** Remove dados pessoais óbvios (CPF, e-mail, telefone) de um texto — usado em logs, notificações e LLM externo. */
export function redigirPii(t: string): { texto: string; redigidos: number } {
  let n = 0
  const sub = (re: RegExp, rep: string) => { t = t.replace(re, () => { n++; return rep }) }
  sub(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ]')
  sub(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
  sub(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[EMAIL]')
  sub(/\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, '[TELEFONE]')
  return { texto: t, redigidos: n }
}
