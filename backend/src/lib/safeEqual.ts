import { timingSafeEqual } from 'crypto'

// Comparação de segredos sem vazar, pelo tempo de resposta, quantos caracteres batem.
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  return left.length === right.length && timingSafeEqual(left, right)
}
