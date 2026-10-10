import { createHash, randomBytes } from 'crypto'

export const JOURNEYS = ['PRIMEIRA_CONSULTA', 'TRATAMENTO', 'FIM_TRATAMENTO'] as const
export type Journey = (typeof JOURNEYS)[number]

export const WEEK_MS = 7 * 24 * 3600 * 1000
export const LOW_SCORE_MAX = 6

export function newSurveyToken() {
  return randomBytes(24).toString('base64url')
}

export function hashSurveyToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/** No máximo 1 pesquisa por semana por paciente: nenhuma outra (não cancelada) a menos de 7 dias da data candidata. */
export function violatesWeeklyLimit(existing: Date[], candidate: Date) {
  return existing.some(date => Math.abs(candidate.getTime() - date.getTime()) < WEEK_MS)
}

export function isLowScore(nps: number) {
  return nps >= 0 && nps <= LOW_SCORE_MAX
}

/** NPS = % promotores (9-10) - % detratores (0-6). Retorna null sem respostas. */
export function calcNps(scores: number[]) {
  if (!scores.length) return null
  const promoters = scores.filter(s => s >= 9).length
  const detractors = scores.filter(s => s <= 6).length
  return Math.round(((promoters - detractors) / scores.length) * 100)
}
