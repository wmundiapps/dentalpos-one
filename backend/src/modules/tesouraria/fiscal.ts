import { r2, soDigitos } from './common'

// Validações e cálculos fiscais puros (sem I/O). Modelos a validar por contador.

export function validarCpf(v: string): boolean {
  const c = soDigitos(v)
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

export function validarCnpj(v: string): boolean {
  const c = soDigitos(v)
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * pesos[i]
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13])
}

export const validarDocumento = (v: string) => { const d = soDigitos(v); return d.length === 11 ? validarCpf(d) : d.length === 14 ? validarCnpj(d) : false }

/** Dígito verificador (módulo 11) da chave de acesso da NF-e/NFC-e (44 dígitos). */
export function validarChaveNFe(chave: string): boolean {
  const c = soDigitos(chave)
  if (c.length !== 44) return false
  let peso = 2, soma = 0
  for (let i = 42; i >= 0; i--) { soma += Number(c[i]) * peso; peso = peso === 9 ? 2 : peso + 1 }
  const resto = soma % 11
  const dv = resto < 2 ? 0 : 11 - resto
  return dv === Number(c[43])
}

/** Gera o DV e completa uma chave de 43 dígitos (utilitário de testes/seed). */
export function completarChaveNFe(base43: string): string {
  const c = soDigitos(base43).padStart(43, '0').slice(0, 43)
  let peso = 2, soma = 0
  for (let i = 42; i >= 0; i--) { soma += Number(c[i]) * peso; peso = peso === 9 ? 2 : peso + 1 }
  const resto = soma % 11
  return c + String(resto < 2 ? 0 : 11 - resto)
}

export function validarChavePix(tipo: string | null | undefined, chave: string | null | undefined): string | null {
  if (!chave) return 'chave Pix não informada'
  const t = String(tipo || '').toUpperCase()
  switch (t) {
    case 'CPF': return validarCpf(chave) ? null : 'chave Pix CPF inválida'
    case 'CNPJ': return validarCnpj(chave) ? null : 'chave Pix CNPJ inválida'
    case 'EMAIL': return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(chave) ? null : 'chave Pix e-mail inválida'
    case 'TELEFONE': return /^\+?55?\d{10,11}$/.test(chave.replace(/[\s()-]/g, '')) ? null : 'chave Pix telefone inválida'
    case 'ALEATORIA': return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chave) ? null : 'chave Pix aleatória inválida'
    default: return 'tipo da chave Pix não informado (CPF, CNPJ, EMAIL, TELEFONE ou ALEATORIA)'
  }
}

export function validarLinhaDigitavel(cod: string | null | undefined): boolean {
  const d = soDigitos(cod)
  return [44, 47, 48].includes(d.length)
}

export interface Retencoes { iss: number; irrf: number; pis: number; cofins: number; csll: number; inss: number; outras: number }

export function totalRetencoes(r: Partial<Retencoes>, issRetido: boolean): number {
  return r2((issRetido ? r.iss ?? 0 : 0) + (r.irrf ?? 0) + (r.pis ?? 0) + (r.cofins ?? 0) + (r.csll ?? 0) + (r.inss ?? 0) + (r.outras ?? 0))
}

/** Valor líquido da nota = total - descontos - retenções efetivas (ISS só reduz o líquido se for retido pelo tomador). */
export function liquidoNota(valorTotal: number, retencoes: Partial<Retencoes>, issRetido: boolean): number {
  return r2(valorTotal - totalRetencoes(retencoes, issRetido))
}

export function competenciaValida(c: string): boolean { return /^\d{4}-(0[1-9]|1[0-2])$/.test(c) }

/** Data estimada do recolhimento de tributos retidos (DARF/ISS): dia 20 do mês seguinte (modelo). */
export function vencimentoTributoRetido(pagamento: Date): Date {
  return new Date(Date.UTC(pagamento.getUTCFullYear(), pagamento.getUTCMonth() + 1, 20, 12))
}
