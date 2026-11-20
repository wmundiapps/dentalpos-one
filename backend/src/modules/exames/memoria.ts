import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { parseBody, qs } from '../core/crud'
import { DOCENTE, httpErr, isStudent, requireStudentId } from './common'

// Jogo da memória (ENADE · ENAMED · OAB): guarda o melhor resultado do aluno por série e alimenta o portal do aluno.
// As perguntas ficam no frontend; o servidor só registra o desempenho. A nota é calculada no navegador (jogo de treino, sem valor de prova).
const router = Router()

const resultado = z.object({
  serieId: z.string().regex(/^[a-z0-9-]{3,120}$/),
  prova: z.enum(['ENADE', 'ENAMED', 'OAB']),
  curso: z.string().min(2).max(60),
  disciplina: z.string().min(2).max(80),
  tema: z.string().min(2).max(120),
  numero: z.number().int().min(1).max(50),
  nota: z.number().min(0).max(10),
  erros: z.number().int().min(0).max(100),
  ajudas: z.number().int().min(0).max(100),
  perfeita: z.boolean(),
})

/** Regra: a "melhor" tentativa é a de maior nota; empate favorece quem fez a série perfeita. */
export function ehMelhor(nova: { nota: number; perfeita: boolean }, atual: { melhorNota: number; perfeita: boolean }) {
  if (nova.perfeita && !atual.perfeita) return true
  if (atual.perfeita && !nova.perfeita) return false
  return nova.nota > atual.melhorNota
}

export function resumir(items: Array<{ melhorNota: number; perfeita: boolean; tentativas: number; curso: string; disciplina: string }>) {
  const media = items.length ? items.reduce((a, b) => a + b.melhorNota, 0) / items.length : null
  const faixa = (min: number, max: number) => items.filter((i) => !i.perfeita && i.melhorNota >= min && i.melhorNota < max).length
  return {
    series: items.length,
    media: media === null ? null : Math.round(media * 10) / 10,
    tentativas: items.reduce((a, b) => a + b.tentativas, 0),
    tacas: items.filter((i) => i.perfeita).length,
    ouro: faixa(9, 10.01), prata: faixa(7, 9), bronze: faixa(5, 7),
  }
}

router.post('/memoria/resultado', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = requireStudentId(req)
  const b = parseBody(resultado, req.body)
  const perfeita = b.perfeita && b.erros === 0 && b.ajudas === 0
  const ja = await prisma.exaMemoriaSerie.findUnique({ where: { tenantId_studentId_serieId: { tenantId, studentId, serieId: b.serieId } } })
  if (!ja) {
    const novo = await prisma.exaMemoriaSerie.create({ data: { tenantId, studentId, serieId: b.serieId, prova: b.prova, curso: b.curso, disciplina: b.disciplina, tema: b.tema, numero: b.numero, melhorNota: b.nota, perfeita, erros: b.erros, ajudas: b.ajudas, ultimaNota: b.nota } })
    return res.status(201).json(novo)
  }
  const melhor = ehMelhor({ nota: b.nota, perfeita }, ja)
  const atualizado = await prisma.exaMemoriaSerie.update({
    where: { id: ja.id },
    data: { tentativas: { increment: 1 }, ultimaNota: b.nota, ...(melhor ? { melhorNota: b.nota, perfeita, erros: b.erros, ajudas: b.ajudas, prova: b.prova, melhorEm: new Date() } : {}) },
  })
  res.json(atualizado)
}))

/** Progresso do aluno logado. Gestão/docente pode consultar outro aluno do mesmo tenant com ?studentId=. */
router.get('/memoria/meu', requireRole('STUDENT', ...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  let studentId: string
  if (isStudent(req)) studentId = requireStudentId(req)
  else {
    studentId = qs(req.query.studentId) || ''
    if (!studentId) throw httpErr(400, 'Informe o aluno.')
    const aluno = await prisma.student.findFirst({ where: { id: studentId, tenantId }, select: { id: true } })
    if (!aluno) throw httpErr(404, 'Aluno não encontrado.')
  }
  const items = await prisma.exaMemoriaSerie.findMany({ where: { tenantId, studentId }, orderBy: [{ curso: 'asc' }, { disciplina: 'asc' }, { tema: 'asc' }, { numero: 'asc' }], take: 1000 })
  const porDisciplina = new Map<string, typeof items>()
  for (const i of items) { const k = `${i.curso} · ${i.disciplina}`; porDisciplina.set(k, [...(porDisciplina.get(k) ?? []), i]) }
  res.json({
    ...resumir(items),
    disciplinas: [...porDisciplina.entries()].map(([nome, l]) => ({ nome, ...resumir(l) })),
    items,
  })
}))

/** Visão da coordenação: quantos alunos jogam e a média por curso/disciplina. */
router.get('/memoria/resumo', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const items = await prisma.exaMemoriaSerie.findMany({ where: { tenantId }, select: { studentId: true, curso: true, disciplina: true, melhorNota: true, perfeita: true, tentativas: true }, take: 20000 })
  const por = new Map<string, typeof items>()
  for (const i of items) { const k = `${i.curso} · ${i.disciplina}`; por.set(k, [...(por.get(k) ?? []), i]) }
  res.json({
    alunos: new Set(items.map((i) => i.studentId)).size,
    ...resumir(items),
    disciplinas: [...por.entries()].map(([nome, l]) => ({ nome, alunos: new Set(l.map((x) => x.studentId)).size, ...resumir(l) })).sort((a, b) => b.series - a.series),
  })
}))

export default router
