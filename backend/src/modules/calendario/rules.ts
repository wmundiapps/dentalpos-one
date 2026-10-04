import { localDateKey } from './time'

// Regras PURAS de choque para provas e reservas.

export interface ExameLike {
  id: string
  grupo?: string | null
  classSectionId: string
  spaceId?: string | null
  professorUserId?: string | null
  fiscais?: string[]
  inicio: Date
  fim: Date
  status?: string
}

export interface ChoqueExame {
  tipo: 'PROVA' | 'ESPACO' | 'FISCAL'
  ref: string
  outroId: string
  descricao: string
}

const ativo = (e: ExameLike) => e.status !== 'CANCELADA' && e.status !== 'REMARCADA'
const sobrepoe = (a: { inicio: Date; fim: Date }, b: { inicio: Date; fim: Date }) => a.inicio.getTime() < b.fim.getTime() && b.inicio.getTime() < a.fim.getTime()

/**
 * - PROVA: duas provas da mesma turma/grupo no mesmo dia (fuso local) — proibido.
 * - ESPACO: mesma sala em horários que se sobrepõem.
 * - FISCAL: fiscal/professor escalado em duas provas simultâneas.
 */
export function conflitosExame(cand: ExameLike, existentes: ExameLike[]): ChoqueExame[] {
  const out: ChoqueExame[] = []
  const dia = localDateKey(cand.inicio)
  const pessoas = new Set([...(cand.fiscais ?? []), ...(cand.professorUserId ? [cand.professorUserId] : [])])
  for (const e of existentes) {
    if (e.id === cand.id || !ativo(e)) continue
    const mesmaTurma = (cand.grupo && e.grupo && cand.grupo === e.grupo) || cand.classSectionId === e.classSectionId
    if (mesmaTurma && localDateKey(e.inicio) === dia) {
      out.push({ tipo: 'PROVA', ref: cand.grupo || cand.classSectionId, outroId: e.id, descricao: 'A turma já tem outra avaliação neste dia.' })
    }
    if (cand.spaceId && e.spaceId === cand.spaceId && sobrepoe(cand, e)) {
      out.push({ tipo: 'ESPACO', ref: cand.spaceId, outroId: e.id, descricao: 'Sala já reservada para outra avaliação neste horário.' })
    }
    if (pessoas.size && sobrepoe(cand, e)) {
      const deles = [...(e.fiscais ?? []), ...(e.professorUserId ? [e.professorUserId] : [])]
      for (const p of deles) {
        if (pessoas.has(p)) out.push({ tipo: 'FISCAL', ref: p, outroId: e.id, descricao: 'Fiscal/professor já escalado em outra avaliação no mesmo horário.' })
      }
    }
  }
  return out
}

export interface ReservaLike {
  id: string
  spaceId: string
  inicio: Date
  fim: Date
  status?: string
}

/** Reservas que ocupam efetivamente o espaço (aprovadas/bloqueios). */
export function conflitosReserva(cand: ReservaLike, existentes: ReservaLike[]): ReservaLike[] {
  return existentes.filter((e) => e.id !== cand.id && e.spaceId === cand.spaceId && (e.status ?? 'APROVADA') === 'APROVADA' && sobrepoe(cand, e))
}
