// Código de barras Code 128 (ISO/IEC 15417) — conjuntos B e C com troca automática. Funções puras.

const PADROES = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]
const START_B = 104
const START_C = 105
const CODE_B = 100
const CODE_C = 99
const STOP = 106

/** Remove caracteres fora de ASCII 32..126 (Code 128 B). */
export function sanitizarCode128(texto: string): string {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?')
}

/** Sequência de símbolos (valores 0..106), incluindo START, dados, dígito verificador e STOP. */
export function codificarCode128(texto: string): number[] {
  const s = sanitizarCode128(texto)
  if (!s.length) throw Object.assign(new Error('Texto vazio para o código de barras.'), { status: 400 })
  const cod: number[] = []
  let modo: 'B' | 'C' | null = null
  let i = 0
  const digitosAdiante = (p: number) => { let n = 0; while (p + n < s.length && s[p + n] >= '0' && s[p + n] <= '9') n++; return n }
  while (i < s.length) {
    const d = digitosAdiante(i)
    const querC = d >= 4 || (d >= 2 && i === 0 && d === s.length) || (d >= 2 && modo === 'C')
    if (querC && d >= 2) {
      if (modo === null) { cod.push(START_C); modo = 'C' } else if (modo !== 'C') { cod.push(CODE_C); modo = 'C' }
      const pares = Math.floor(d / 2)
      for (let k = 0; k < pares; k++) cod.push(parseInt(s.slice(i + k * 2, i + k * 2 + 2), 10))
      i += pares * 2
    } else {
      if (modo === null) { cod.push(START_B); modo = 'B' } else if (modo !== 'B') { cod.push(CODE_B); modo = 'B' }
      cod.push(s.charCodeAt(i) - 32)
      i++
    }
  }
  let soma = cod[0]
  for (let k = 1; k < cod.length; k++) soma += cod[k] * k
  cod.push(soma % 103)
  cod.push(STOP)
  return cod
}

/** Larguras alternadas barra/espaço (em módulos), começando por barra. */
export function larguraBarras(texto: string): number[] {
  const out: number[] = []
  for (const sim of codificarCode128(texto)) for (const ch of PADROES[sim]) out.push(Number(ch))
  return out
}

/** Retângulos (x, largura) das barras em unidades de módulo + largura total (inclui 10 módulos de zona silenciosa de cada lado). */
export function barrasCode128(texto: string, quiet = 10): { barras: Array<[number, number]>; largura: number } {
  const w = larguraBarras(texto)
  const barras: Array<[number, number]> = []
  let x = quiet
  w.forEach((l, idx) => { if (idx % 2 === 0) barras.push([x, l]); x += l })
  return { barras, largura: x + quiet }
}
