// Linha digitável e código de barras de boletos (Febraban): validação de dígitos verificadores, fator de vencimento e valor.
// Funções puras (sem I/O). Cobre boleto bancário (47 dígitos / 44 de barras) e arrecadação/convênio (48 / 44, iniciado em 8).

export const soDigitos = (s?: string | null) => String(s ?? '').replace(/\D+/g, '')

export type TipoBoleto = 'BANCARIO' | 'ARRECADACAO'

/** DV módulo 10 (pesos 2,1 da direita para a esquerda; soma dos algarismos dos produtos). */
export function dvMod10(base: string): number {
  let soma = 0
  let peso = 2
  for (let i = base.length - 1; i >= 0; i--) {
    const p = Number(base[i]) * peso
    soma += p > 9 ? Math.floor(p / 10) + (p % 10) : p
    peso = peso === 2 ? 1 : 2
  }
  return (10 - (soma % 10)) % 10
}

/** DV módulo 11 do código de barras bancário (pesos 2..9; resto 0/10/11 => 1). */
export function dvMod11Barras(base43: string): number {
  let soma = 0
  let peso = 2
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += Number(base43[i]) * peso
    peso = peso === 9 ? 2 : peso + 1
  }
  const dv = 11 - (soma % 11)
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv
}

/** DV módulo 11 de arrecadação (pesos 2..9; resto 0 ou 1 => 0). */
export function dvMod11Arrecadacao(base: string): number {
  let soma = 0
  let peso = 2
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso
    peso = peso === 9 ? 2 : peso + 1
  }
  const resto = soma % 11
  return resto <= 1 ? 0 : 11 - resto
}

const BASE_FATOR = Date.UTC(1997, 9, 7, 12) // 07/10/1997
const BASE_FATOR_NOVO = Date.UTC(2025, 1, 22, 12) // 22/02/2025 = fator 1000 (reinício do ciclo)
const DIA = 86_400_000

/**
 * Data de vencimento a partir do fator (4 dígitos). O fator reinicia em 1000 em 22/02/2025:
 * escolhe-se a data (ciclo antigo ou novo) mais próxima da data de referência. 0000 = sem vencimento.
 */
export function fatorParaData(fator: number, referencia: Date = new Date()): Date | null {
  if (!Number.isFinite(fator) || fator <= 0) return null
  const antigo = new Date(BASE_FATOR + fator * DIA)
  if (fator < 1000) return antigo
  const novo = new Date(BASE_FATOR_NOVO + (fator - 1000) * DIA)
  const dAnt = Math.abs(antigo.getTime() - referencia.getTime())
  const dNovo = Math.abs(novo.getTime() - referencia.getTime())
  return dNovo <= dAnt ? novo : antigo
}

/** Fator de vencimento (4 dígitos) para uma data (ciclo vigente após 22/02/2025). */
export function dataParaFator(d: Date): number {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)
  if (t >= BASE_FATOR_NOVO) return 1000 + Math.round((t - BASE_FATOR_NOVO) / DIA)
  return Math.round((t - BASE_FATOR) / DIA)
}

export interface LeituraLinha {
  ok: boolean                 // dígitos verificadores todos corretos
  formato: 'LINHA_47' | 'LINHA_48' | 'BARRAS_44' | 'INVALIDO'
  tipo?: TipoBoleto
  digitos: string
  codigoBarras?: string       // 44 dígitos
  banco?: string              // 3 dígitos (boleto bancário)
  moeda?: string
  valor?: number | null       // em reais (null = valor livre / não informado)
  vencimento?: Date | null    // data embutida (bancário)
  erros: string[]             // motivos objetivos da invalidez
  dvsInvalidos: string[]
}

function barrasDeLinha47(d: string) {
  return d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31)
}

/** Remonta a linha digitável de 47 dígitos a partir do código de barras de 44 (utilitário de seed/teste). */
export function barrasParaLinha47(barras: string): string {
  const b = soDigitos(barras)
  if (b.length !== 44) throw new Error('Código de barras deve ter 44 dígitos.')
  const c1 = b.slice(0, 4) + b.slice(19, 24)
  const c2 = b.slice(24, 34)
  const c3 = b.slice(34, 44)
  return c1 + dvMod10(c1) + c2 + dvMod10(c2) + c3 + dvMod10(c3) + b[4] + b.slice(5, 19)
}

/** Monta um código de barras bancário (44) com DV geral correto. `campoLivre` deve ter 25 dígitos. */
export function montarBarrasBancario(p: { banco: string; moeda?: string; vencimento?: Date | null; valor: number; campoLivre: string }): string {
  const fator = p.vencimento ? String(dataParaFator(p.vencimento)).padStart(4, '0') : '0000'
  const valor = String(Math.round(p.valor * 100)).padStart(10, '0')
  const livre = soDigitos(p.campoLivre).padStart(25, '0').slice(0, 25)
  const sem = p.banco.padStart(3, '0') + (p.moeda ?? '9') + fator + valor + livre
  return sem.slice(0, 4) + dvMod11Barras(sem.slice(0, 4) + sem.slice(4)) + sem.slice(4)
}

/** Linha digitável de 47 dígitos formatada (AAAAA.BBBBB CCCCC.CCCCCC DDDDD.DDDDDD E FFFFFFFFFFFFFF). */
export function formatarLinha47(l: string): string {
  const d = soDigitos(l)
  if (d.length !== 47) return l
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`
}

/** Monta uma linha de arrecadação (48) a partir de um código de barras de 44 que já traz o DV geral. */
export function montarBarrasArrecadacao(p: { segmento: string; valor: number; empresa: string; livre: string; modulo?: 10 | 11 }): string {
  const idValor = p.modulo === 11 ? '8' : '6'
  const valor = String(Math.round(p.valor * 100)).padStart(11, '0')
  const resto = soDigitos(p.empresa).padStart(8, '0').slice(0, 8) + soDigitos(p.livre).padStart(21, '0').slice(0, 21)
  const sem = '8' + p.segmento.slice(0, 1) + idValor + valor + resto
  const dv = p.modulo === 11 ? dvMod11Arrecadacao(sem) : dvMod10(sem)
  return sem.slice(0, 3) + dv + sem.slice(3)
}

export function barrasParaLinha48(barras: string): string {
  const b = soDigitos(barras)
  if (b.length !== 44) throw new Error('Código de barras deve ter 44 dígitos.')
  const m11 = b[2] === '8' || b[2] === '9'
  const dv = (bloco: string) => (m11 ? dvMod11Arrecadacao(bloco) : dvMod10(bloco))
  let out = ''
  for (let i = 0; i < 4; i++) { const bl = b.slice(i * 11, i * 11 + 11); out += bl + dv(bl) }
  return out
}

/**
 * Lê e valida uma linha digitável (47/48 dígitos) ou código de barras (44). Não lança: devolve `ok:false` com os motivos.
 * `referencia` define o ciclo do fator de vencimento (padrão: hoje).
 */
export function lerLinhaDigitavel(entrada: string | null | undefined, referencia: Date = new Date()): LeituraLinha {
  const d = soDigitos(entrada)
  const base: LeituraLinha = { ok: false, formato: 'INVALIDO', digitos: d, erros: [], dvsInvalidos: [] }
  if (![44, 47, 48].includes(d.length)) {
    base.erros.push(`quantidade de dígitos inválida (${d.length}); esperado 47 (boleto bancário), 48 (arrecadação) ou 44 (código de barras)`)
    return base
  }
  if (d.length === 48 || (d.length === 44 && d[0] === '8')) {
    const barras = d.length === 48 ? d.replace(/(\d{11})\d/g, '$1') : d
    const out: LeituraLinha = { ...base, formato: d.length === 48 ? 'LINHA_48' : 'BARRAS_44', tipo: 'ARRECADACAO', codigoBarras: barras }
    if (d[0] !== '8') { out.erros.push('linha de 48 dígitos deve iniciar em 8 (arrecadação/convênio)'); return out }
    const m11 = d[2] === '8' || d[2] === '9'
    if (!['6', '7', '8', '9'].includes(d[2])) out.erros.push('identificação de valor/módulo inválida (3º dígito deve ser 6, 7, 8 ou 9)')
    if (d.length === 48) {
      for (let i = 0; i < 4; i++) {
        const bl = d.slice(i * 12, i * 12 + 11)
        const dv = Number(d[i * 12 + 11])
        const esperado = m11 ? dvMod11Arrecadacao(bl) : dvMod10(bl)
        if (esperado !== dv) { out.dvsInvalidos.push(`campo ${i + 1}`); out.erros.push(`dígito verificador do campo ${i + 1} inválido (esperado ${esperado}, informado ${dv})`) }
      }
    }
    const semDv = barras.slice(0, 3) + barras.slice(4)
    const dvGeral = m11 ? dvMod11Arrecadacao(semDv) : dvMod10(semDv)
    if (dvGeral !== Number(barras[3])) { out.dvsInvalidos.push('geral'); out.erros.push(`dígito verificador geral inválido (esperado ${dvGeral}, informado ${barras[3]})`) }
    out.valor = d[2] === '6' || d[2] === '8' ? Number(barras.slice(4, 15)) / 100 : null
    out.vencimento = null
    out.ok = out.erros.length === 0
    return out
  }
  // boleto bancário
  const barras = d.length === 47 ? barrasDeLinha47(d) : d
  const out: LeituraLinha = { ...base, formato: d.length === 47 ? 'LINHA_47' : 'BARRAS_44', tipo: 'BANCARIO', codigoBarras: barras }
  if (d.length === 47) {
    const campos: Array<[string, number]> = [[d.slice(0, 9), Number(d[9])], [d.slice(10, 20), Number(d[20])], [d.slice(21, 31), Number(d[31])]]
    campos.forEach(([bl, dv], i) => {
      const esperado = dvMod10(bl)
      if (esperado !== dv) { out.dvsInvalidos.push(`campo ${i + 1}`); out.erros.push(`dígito verificador do campo ${i + 1} inválido (esperado ${esperado}, informado ${dv})`) }
    })
  }
  const esperadoGeral = dvMod11Barras(barras.slice(0, 4) + barras.slice(5))
  if (esperadoGeral !== Number(barras[4])) { out.dvsInvalidos.push('geral'); out.erros.push(`dígito verificador geral inválido (esperado ${esperadoGeral}, informado ${barras[4]})`) }
  out.banco = barras.slice(0, 3)
  out.moeda = barras[3]
  if (barras[3] !== '9') out.erros.push(`código de moeda inesperado (${barras[3]}); boletos em real usam 9`)
  const fator = Number(barras.slice(5, 9))
  out.vencimento = fatorParaData(fator, referencia)
  const centavos = Number(barras.slice(9, 19))
  out.valor = centavos > 0 ? centavos / 100 : null
  out.ok = out.erros.length === 0
  return out
}

/** Valida só a estrutura/DVs (true/false). */
export const linhaValida = (s: string | null | undefined, referencia?: Date) => lerLinhaDigitavel(s, referencia).ok
