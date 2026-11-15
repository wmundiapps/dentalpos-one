// Validação de CPF e CNPJ (inclui o CNPJ alfanumérico, em vigor a partir de julho de 2026). Sem dependências.

/** Normaliza: remove máscara; letras em maiúsculas (CNPJ alfanumérico). */
export const limparDocumento = (v: unknown): string => String(v ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()

export function validarCPF(valor: unknown): boolean {
  const c = limparDocumento(valor)
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

const valor = (ch: string) => ch.charCodeAt(0) - 48 // '0'..'9' => 0..9; 'A'..'Z' => 17..42 (regra do CNPJ alfanumérico)
function dvCnpj(base: string): number {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  let s = 0
  for (let i = 0; i < base.length; i++) s += valor(base[i]) * pesos[i]
  const r = s % 11
  return r < 2 ? 0 : 11 - r
}

export function validarCNPJ(v: unknown): boolean {
  const c = limparDocumento(v)
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false
  const d1 = dvCnpj(c.slice(0, 12))
  const d2 = dvCnpj(c.slice(0, 12) + d1)
  return d1 === Number(c[12]) && d2 === Number(c[13])
}

/** Tipo de pessoa pelo tamanho: 11 = PF (CPF), 14 = PJ (CNPJ). */
export const tipoPorDocumento = (v: unknown): 'PF' | 'PJ' | null => {
  const c = limparDocumento(v)
  return c.length === 11 ? 'PF' : c.length === 14 ? 'PJ' : null
}

export const documentoValido = (v: unknown, tipo?: string) => {
  const t = tipoPorDocumento(v)
  if (!t || (tipo && tipo !== t)) return false
  return t === 'PF' ? validarCPF(v) : validarCNPJ(v)
}

export function formatarDocumento(v: unknown): string {
  const c = limparDocumento(v)
  if (c.length === 11) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`
  if (c.length === 14) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
  return String(v ?? '')
}

/** Mascara para telas/relatórios de baixo privilégio: ***.123.456-** */
export function mascararDocumento(v: unknown): string {
  const c = limparDocumento(v)
  if (c.length === 11) return `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**`
  if (c.length === 14) return `**.${c.slice(2, 5)}.${c.slice(5, 8)}/****-**`
  return ''
}

/** Gera um CPF/CNPJ válido a partir de uma base (usado pelo seed e pelos testes; dados fictícios). */
export function completarCPF(base9: string): string {
  const b = base9.replace(/\D/g, '').padStart(9, '1').slice(0, 9)
  const dv = (s: string) => { let t = 0; for (let i = 0; i < s.length; i++) t += Number(s[i]) * (s.length + 1 - i); const r = (t * 10) % 11; return r === 10 ? 0 : r }
  const d1 = dv(b); const d2 = dv(b + d1)
  return `${b}${d1}${d2}`
}
export function completarCNPJ(base12: string): string {
  const b = limparDocumento(base12).padEnd(12, '0').slice(0, 12)
  const d1 = dvCnpj(b)
  return `${b}${d1}${dvCnpj(b + d1)}`
}
