import { randomBytes, createHmac } from 'node:crypto'
import { cifrar, decifrar } from '../seguranca/cripto'

// ============================================================
// Núcleo do reconhecimento facial (sem câmera, sem imagem).
// O navegador calcula o embedding (vetor de 128 números, ex.: @vladmandic/face-api) e envia só o vetor.
// Aqui: validação do vetor, cifra do template (AES-256-GCM do módulo de segurança), comparação por
// distância euclidiana com margem de ambiguidade, e validação do liveness básico (piscar/movimento).
// ============================================================

export const DIMENSOES_ACEITAS = [128]
export const MAX_AMOSTRAS = 5

export class FacialError extends Error {
  status: number
  codigo?: string
  constructor(status: number, message: string, codigo?: string) { super(message); this.status = status; this.codigo = codigo }
}

/** Valida e normaliza o vetor recebido do navegador (somente números finitos, dimensão esperada, não degenerado). */
export function validarEmbedding(v: unknown, dimEsperada?: number): number[] {
  if (!Array.isArray(v)) throw new FacialError(400, 'Embedding inválido: esperado um vetor numérico.')
  if (!DIMENSOES_ACEITAS.includes(v.length)) throw new FacialError(400, `Embedding inválido: dimensão ${v.length} não suportada (esperado ${DIMENSOES_ACEITAS.join(', ')}).`)
  if (dimEsperada && v.length !== dimEsperada) throw new FacialError(400, 'Dimensão do embedding difere do modelo cadastrado.')
  const out: number[] = []
  for (const x of v) {
    if (typeof x !== 'number' || !Number.isFinite(x) || Math.abs(x) > 10) throw new FacialError(400, 'Embedding inválido: valores fora do intervalo esperado.')
    out.push(Math.round(x * 1e6) / 1e6)
  }
  const media = out.reduce((a, b) => a + b, 0) / out.length
  const variancia = out.reduce((a, b) => a + (b - media) ** 2, 0) / out.length
  if (variancia < 1e-6) throw new FacialError(400, 'Embedding inválido: vetor sem informação (constante).')
  return out
}

export function distanciaEuclidiana(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity
  let s = 0
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d }
  return Math.sqrt(s)
}

// ---------- template cifrado ----------
interface Payload { t: string; k: string; m: string; v: number[] }

/** Cifra o vetor amarrando-o ao tenant e à pessoa (impede trocar linhas entre pessoas/instituições). */
export function cifrarTemplate(tenantId: string, pessoaKey: string, modelo: string, vetor: number[]): string {
  return cifrar(JSON.stringify({ t: tenantId, k: pessoaKey, m: modelo, v: vetor } satisfies Payload))
}

export function decifrarTemplate(tenantId: string, pessoaKey: string, cifrado: string): number[] {
  const p = JSON.parse(decifrar(cifrado)) as Payload
  if (p.t !== tenantId || p.k !== pessoaKey) throw new Error('Template não pertence a esta pessoa/instituição.')
  return p.v
}

// ---------- comparação ----------
export interface Candidato { pessoaKey: string; vetor: number[] }
export interface ResultadoMatch { resultado: 'OK' | 'NAO_RECONHECIDO' | 'AMBIGUO'; pessoaKey?: string; distancia?: number; segundaDistancia?: number }

/** 1:N — melhor pessoa (menor distância entre seus templates). Aceita só se < limiar e a 2ª pessoa estiver a mais de `margem` de distância. */
export function identificar(consulta: number[], candidatos: Candidato[], limiar: number, margem: number): ResultadoMatch {
  const melhorPorPessoa = new Map<string, number>()
  for (const c of candidatos) {
    const d = distanciaEuclidiana(consulta, c.vetor)
    const atual = melhorPorPessoa.get(c.pessoaKey)
    if (atual === undefined || d < atual) melhorPorPessoa.set(c.pessoaKey, d)
  }
  const ordenado = [...melhorPorPessoa.entries()].sort((a, b) => a[1] - b[1])
  if (!ordenado.length) return { resultado: 'NAO_RECONHECIDO' }
  const [k1, d1] = ordenado[0]
  const d2 = ordenado[1]?.[1]
  if (d1 > limiar) return { resultado: 'NAO_RECONHECIDO', distancia: round(d1) }
  if (d2 !== undefined && d2 - d1 < margem && d2 <= limiar + margem) return { resultado: 'AMBIGUO', distancia: round(d1), segundaDistancia: round(d2) }
  return { resultado: 'OK', pessoaKey: k1, distancia: round(d1), segundaDistancia: d2 === undefined ? undefined : round(d2) }
}

/** 1:1 — verificação contra os templates de uma pessoa específica. */
export function verificar(consulta: number[], vetores: number[][], limiar: number): { ok: boolean; distancia: number } {
  let melhor = Infinity
  for (const v of vetores) melhor = Math.min(melhor, distanciaEuclidiana(consulta, v))
  return { ok: melhor <= limiar, distancia: round(melhor) }
}

const round = (n: number) => Math.round(n * 10000) / 10000

// ---------- liveness básico ----------
export interface EvidenciaLiveness {
  nonce: string
  blinks?: number
  movimento?: number      // deslocamento normalizado da cabeça (0..1)
  duracaoMs?: number
  amostras?: number
  earMin?: number
  earMax?: number
}

export const ACOES_LIVENESS = ['PISCAR', 'VIRAR_CABECA'] as const
export type AcaoLiveness = (typeof ACOES_LIVENESS)[number]

export function sortearAcao(): AcaoLiveness { return randomBytes(1)[0] % 2 === 0 ? 'PISCAR' : 'VIRAR_CABECA' }
export function novoNonce(): string { return randomBytes(18).toString('base64url') }

/** Verifica a evidência de vivacidade enviada pelo dispositivo para a ação pedida. Retorna motivo da falha ou null. */
export function avaliarLiveness(acao: string, e: Partial<EvidenciaLiveness> | undefined): string | null {
  if (!e || typeof e !== 'object') return 'Evidência de vivacidade ausente.'
  const dur = Number(e.duracaoMs), am = Number(e.amostras)
  if (!Number.isFinite(dur) || dur < 800 || dur > 30_000) return 'Duração da verificação de vivacidade fora do esperado.'
  if (!Number.isFinite(am) || am < 5) return 'Poucas amostras para verificar vivacidade.'
  if (acao === 'PISCAR') {
    const bl = Number(e.blinks), amp = Number(e.earMax) - Number(e.earMin)
    if (!(bl >= 1 && bl <= 12)) return 'Nenhum piscar detectado.'
    if (!(amp >= 0.08)) return 'Variação ocular insuficiente para confirmar o piscar.'
    return null
  }
  if (acao === 'VIRAR_CABECA') {
    const mv = Number(e.movimento)
    if (!(mv >= 0.15 && mv <= 1)) return 'Movimento de cabeça não detectado.'
    return null
  }
  return 'Ação de vivacidade desconhecida.'
}

/** Assinatura curta do desafio (anti-adulteração do tipo de ação enviado ao cliente). */
export function assinarDesafio(nonce: string, acao: string, exp: number): string {
  const segredo = process.env.SECURITY_ENC_KEY || process.env.JWT_SECRET || 'dev-presenca'
  return createHmac('sha256', segredo).update(`pre-desafio:${nonce}:${acao}:${exp}`).digest('base64url').slice(0, 22)
}
