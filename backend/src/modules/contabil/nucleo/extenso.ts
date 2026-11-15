// Valor por extenso em reais (recibos). Cobre até 999.999.999,99.
const U = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function ate999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100), r = n % 100
  const partes: string[] = []
  if (c) partes.push(C[c])
  if (r) partes.push(r < 20 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' e ' + U[r % 10] : ''))
  return partes.join(' e ')
}

function inteiro(n: number): string {
  if (n === 0) return 'zero'
  const mi = Math.floor(n / 1_000_000), mil = Math.floor((n % 1_000_000) / 1000), resto = n % 1000
  const partes: string[] = []
  if (mi) partes.push(mi === 1 ? 'um milhão' : `${ate999(mi)} milhões`)
  if (mil) partes.push(mil === 1 ? 'mil' : `${ate999(mil)} mil`)
  if (resto) partes.push(ate999(resto))
  // "e" entre as classes quando a última é < 100 ou múltiplo de 100
  return partes.reduce((acc, p, i) => (i === 0 ? p : acc + (i === partes.length - 1 && (resto % 100 === 0 || resto < 100) ? ' e ' : ' ') + p), '')
}

export function valorPorExtenso(valor: number): string {
  const v = Math.round(Math.abs(valor) * 100)
  const reais = Math.floor(v / 100), cent = v % 100
  const r = reais ? `${inteiro(reais)} ${reais === 1 ? 'real' : reais % 1_000_000 === 0 && reais >= 1_000_000 ? 'de reais' : 'reais'}` : ''
  const c = cent ? `${inteiro(cent)} ${cent === 1 ? 'centavo' : 'centavos'}` : ''
  return r && c ? `${r} e ${c}` : r || c || 'zero real'
}
