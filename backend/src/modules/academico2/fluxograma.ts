import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { registerEduJob } from '../core/jobs'
import { datasBloqueadas, requireTerm } from '../calendario/service'
import { alunosDaTurma } from '../calendario/provas'
import { DIAS_SEMANA_CURTO, addDays, isoWeekday, localDateKey, minToHHMM, startOfLocalDay } from '../calendario/time'
import { CUR_READ, CUR_WRITE, MOD, fail, tid, uid } from './common'
import { carregarCtx, enriquecer } from './salas'

const LOCAIS_PRATICOS = ['LABORATORIO', 'CLINICA_ESCOLA']
const dm = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`

/** Aulas datadas, semana a semana, descontando feriados e recessos: base do fluxograma e dos avisos. */
export async function montarSemanas(tenantId: string, termId: string, opt: { de?: Date; semanas: number; classSectionIds?: string[]; programId?: string; spaceId?: string }) {
  const term = await requireTerm(tenantId, termId)
  const ctx = await carregarCtx(tenantId, termId)
  let slots = ctx.slots
  if (opt.classSectionIds?.length) slots = slots.filter((s) => opt.classSectionIds!.includes(s.classSectionId))
  if (opt.programId) slots = slots.filter((s) => s.programId === opt.programId)
  if (opt.spaceId) slots = slots.filter((s) => s.spaceId === opt.spaceId)
  const base = startOfLocalDay(opt.de ?? (new Date() > term.dataInicio && new Date() < term.dataFim ? new Date() : term.dataInicio))
  const segunda = addDays(base, -(isoWeekday(base) - 1))
  const fimTermo = startOfLocalDay(term.dataFim).getTime()
  const iniTermo = startOfLocalDay(term.dataInicio).getTime()
  const bloq = await datasBloqueadas(tenantId, segunda, addDays(segunda, opt.semanas * 7))
  const semanas: any[] = []
  for (let w = 0; w < opt.semanas; w++) {
    const ini = addDays(segunda, w * 7)
    const dias: any[] = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(ini, i)
      const key = localDateKey(d)
      const dentro = d.getTime() >= iniTermo && d.getTime() <= fimTermo
      const aulas = !dentro ? [] : slots.filter((s) => s.diaSemana === i + 1).sort((a, b) => a.inicioMin - b.inicioMin).map((s) => {
        const e = enriquecer(ctx, s, new Set())
        const esp = s.spaceId ? ctx.espacos.get(s.spaceId) : null
        return { slotId: s.id, horario: e.horario, inicioMin: s.inicioMin, disciplina: e.disciplina ?? e.turma, turma: e.turma, professor: e.professor, sala: e.sala, pratica: esp ? LOCAIS_PRATICOS.includes(esp.tipo) : false, tipoLocal: esp?.tipo ?? (s.tipoAula === 'ONLINE' ? 'ONLINE' : null), turno: e.turno, curso: e.curso }
      })
      if (!aulas.length && !bloq.has(key)) continue
      dias.push({ data: key, rotulo: `${DIAS_SEMANA_CURTO[i + 1]} ${dm(key)}`, suspenso: bloq.has(key) ? bloq.get(key) : null, aulas })
    }
    if (dias.some((d) => d.aulas.length || d.suspenso)) semanas.push({ numero: w + 1, de: localDateKey(ini), ate: localDateKey(addDays(ini, 6)), rotulo: `${dm(localDateKey(ini))} a ${dm(localDateKey(addDays(ini, 6)))}`, dias, totalAulas: dias.reduce((a, d) => a + (d.suspenso ? 0 : d.aulas.length), 0) })
  }
  return { term, ctx, semanas }
}

/** Uma mensagem por aluno com o resumo das aulas dos próximos dias (não repete na mesma semana). */
export async function avisarAulas(tenantId: string, termId: string, o: { dias: number; classSectionId?: string }) {
  const hoje = startOfLocalDay(new Date())
  const { ctx, semanas } = await montarSemanas(tenantId, termId, { de: hoje, semanas: Math.ceil(o.dias / 7) + 1, classSectionIds: o.classSectionId ? [o.classSectionId] : undefined })
  const limite = localDateKey(addDays(hoje, o.dias))
  const hojeKey = localDateKey(hoje)
  const porTurma = new Map<string, string[]>()
  for (const sm of semanas) for (const d of sm.dias) {
    if (d.data < hojeKey || d.data > limite || d.suspenso) continue
    for (const a of d.aulas) {
      const slot = ctx.slots.find((s: any) => s.id === a.slotId)
      if (!slot) continue
      const l = porTurma.get(slot.classSectionId) ?? []
      l.push(`${d.rotulo} ${a.horario} · ${a.disciplina ?? 'Aula'}${a.sala ? ` · ${a.sala}` : ''}${a.pratica ? ' (prática)' : ''}`)
      porTurma.set(slot.classSectionId, l)
    }
  }
  const porAluno = new Map<string, string[]>()
  for (const [turmaId, linhas] of porTurma) for (const studentId of await alunosDaTurma(tenantId, turmaId)) porAluno.set(studentId, [...(porAluno.get(studentId) ?? []), ...linhas])
  const semana = localDateKey(addDays(hoje, -(isoWeekday(hoje) - 1)))
  let enviados = 0, jaAvisados = 0
  for (const [studentId, linhas] of porAluno) {
    const refId = `${studentId}:${semana}`
    if (await prisma.eduNotification.findFirst({ where: { tenantId, refType: 'AulasSemana', refId }, select: { id: true } })) { jaAvisados++; continue }
    await notify({ tenantId, studentId, assunto: 'Suas aulas dos próximos dias', mensagem: `Suas aulas dos próximos ${o.dias} dias:\n${[...new Set(linhas)].sort().join('\n')}\nEm caso de mudança de sala ou horário, você será avisado.`, refType: 'AulasSemana', refId, templateKey: 'academico.aulas-semana' })
    enviados++
  }
  return { alunos: porAluno.size, enviados, jaAvisados, turmas: porTurma.size }
}

export function registerFluxograma(router: Router) {
  const leitura = requireRole(...CUR_READ)
  const escrita = requireRole(...CUR_WRITE)

  // Fluxograma das aulas: semana a semana, com sala/laboratório, horário e dia, montado a partir da grade (que o gerador automático preenche).
  router.get('/salas/fluxograma', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const termId = qs(req.query.termId)
    if (!termId) fail(400, 'Informe o período letivo (termId).')
    const semanas = Math.min(26, Math.max(1, Number(qs(req.query.semanas)) || 8))
    const de = qs(req.query.de) ? new Date(`${qs(req.query.de)}T12:00:00-03:00`) : undefined
    if (de && isNaN(de.getTime())) fail(400, 'Data inválida.')
    const r = await montarSemanas(tenantId, termId, { de, semanas, classSectionIds: qs(req.query.classSectionId) ? [String(qs(req.query.classSectionId))] : undefined, programId: qs(req.query.programId) || undefined, spaceId: qs(req.query.spaceId) || undefined })
    const locais = new Map<string, { sala: string; pratica: boolean; aulas: number }>()
    for (const sm of r.semanas) for (const d of sm.dias) for (const a of d.aulas) {
      const k = a.sala ?? 'Sem sala'
      const l = locais.get(k) ?? { sala: k, pratica: a.pratica, aulas: 0 }
      l.aulas++
      locais.set(k, l)
    }
    const total = r.semanas.reduce((a: number, s: any) => a + s.totalAulas, 0)
    res.json({ periodo: r.term.codigo, semanas: r.semanas, resumo: { semanas: r.semanas.length, aulas: total, locais: [...locais.values()].sort((a, b) => b.aulas - a.aulas), aulasPraticas: r.semanas.reduce((a: number, s: any) => a + s.dias.reduce((x: number, d: any) => x + d.aulas.filter((q: any) => q.pratica).length, 0), 0) } })
  }))

  router.post('/salas/avisar-alunos', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ termId: z.string().min(1), dias: z.number().int().min(1).max(30).default(7), classSectionId: z.string().optional() }), req.body)
    await requireTerm(tenantId, b.termId)
    const r = await avisarAulas(tenantId, b.termId, b)
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'AVISAR_AULAS', detalhes: r })
    res.json(r)
  }))

  registerEduJob('academico.avisos-aulas', async () => {
    const hoje = new Date()
    const termos = await prisma.academicTerm.findMany({ where: { dataInicio: { lte: hoje }, dataFim: { gte: hoje } }, take: 200 })
    let enviados = 0
    for (const t of termos) enviados += (await avisarAulas(t.tenantId, t.id, { dias: 7 })).enviados
    return { termos: termos.length, enviados }
  })
}
