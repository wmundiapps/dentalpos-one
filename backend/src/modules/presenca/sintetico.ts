// Embeddings SINTÉTICOS (determinísticos) para testes e demonstração sem câmera.
// NÃO representam rostos reais: servem para exercitar cifra, comparação por distância, liveness e revogação.
import { createHash } from 'node:crypto'

function prng(seed: string) {
  let h = createHash('sha256').update(seed).digest()
  let i = 0
  return () => {
    if (i + 4 > h.length) { h = createHash('sha256').update(h).digest(); i = 0 }
    const n = h.readUInt32BE(i); i += 4
    return n / 0xffffffff
  }
}

/** Vetor de 128 dimensões, com norma ~1 (como os descritores do face-api). `ruido` simula variação da mesma pessoa. */
export function vetorSintetico(pessoa: string, ruido = 0, amostra = 0, dim = 128): number[] {
  const base = prng('pessoa:' + pessoa)
  const v = Array.from({ length: dim }, () => base() * 2 - 1)
  if (ruido > 0) { const r = prng(`ruido:${pessoa}:${amostra}`); for (let i = 0; i < dim; i++) v[i] += (r() * 2 - 1) * ruido }
  const norma = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return v.map((x) => Math.round((x / norma) * 1e6) / 1e6)
}

/** Evidência de liveness plausível para o desafio recebido (somente testes/demonstração). */
export function evidenciaSintetica(nonce: string, acao: string) {
  return acao === 'PISCAR'
    ? { nonce, blinks: 1, earMin: 0.14, earMax: 0.31, duracaoMs: 2400, amostras: 36, movimento: 0.02 }
    : { nonce, blinks: 0, earMin: 0.28, earMax: 0.31, duracaoMs: 2600, amostras: 40, movimento: 0.34 }
}
