import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getUserId, requireRole } from '../academico/middleware'
import { dateISO, mountCrud, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { completeReminders } from '../core/reminders'
import { ALUNO, MODULO, REF, alunoAlvo, andamento, carregarAluno, hasRole, httpError, nomesAlunos, nomesUsuarios, tid, scheduleReminder } from './common'
import { addDays } from './logic'

// Nivelamento / tutoria / reforço + mentoria (discente e docente)

const turmaSchema = z.object({
  tipo: z.enum(['NIVELAMENTO', 'TUTORIA', 'REFORCO']).default('NIVELAMENTO'), titulo: z.string().min(3).max(200),
  disciplineId: z.string().optional(), programId: z.string().optional(), responsavelUserId: z.string().optional(),
  vagas: z.number().int().min(1).max(500).default(30), cargaHoraria: z.number().int().min(1).max(400).default(20),
  inicio: dateISO().optional(), fim: dateISO().optional(), frequenciaMinima: z.number().min(0).max(100).default(75),
  status: z.enum(['PLANEJADA', 'INSCRICOES', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA']).optional(), descricao: z.string().max(3000).optional(),
})

export function mountAcompanhamento(router: Router) {
  mountCrud(router, { model: 'apoTurmaApoio', path: '/turmas-apoio', read: ['SUPPORT', 'COORDINATOR', 'TEACHER'], write: ['SUPPORT', 'COORDINATOR'], readAll: true, create: turmaSchema, filters: ['tipo', 'status'], search: ['titulo'], modulo: MODULO })

  router.post('/turmas-apoio/:id/inscrever', requireRole(...ALUNO, 'SUPPORT', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const studentId = alunoAlvo(req, req.body?.studentId)
    await carregarAluno(tenantId, studentId)
    const t = await prisma.apoTurmaApoio.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!t) throw httpError(404, 'Turma não encontrada.')
    if (!['PLANEJADA', 'INSCRICOES', 'EM_ANDAMENTO'].includes(t.status)) throw httpError(422, `Turma ${t.status}.`)
    const ocupadas = await prisma.apoTurmaApoioParticipante.count({ where: { tenantId, turmaId: t.id, status: { in: ['INSCRITO', 'CONCLUIDO'] } } })
    const origem = ['ESPONTANEA', 'INDICACAO', 'RISCO_EVASAO', 'DIAGNOSTICO'].includes(req.body?.origem) ? req.body.origem : 'ESPONTANEA'
    const status = ocupadas >= t.vagas ? 'LISTA_ESPERA' : 'INSCRITO'
    const p = await prisma.apoTurmaApoioParticipante.create({ data: { tenantId, turmaId: t.id, studentId, status, origem } })
    await notify({ tenantId, studentId, assunto: `${t.titulo}: ${status === 'INSCRITO' ? 'inscrição confirmada' : 'lista de espera'}`, mensagem: status === 'INSCRITO' ? `Inscrição confirmada${t.inicio ? ' — início em ' + t.inicio.toLocaleDateString('pt-BR') : ''}.` : 'Turma lotada: você entrou na lista de espera.', refType: 'ApoTurmaApoio', refId: t.id })
    res.status(201).json(p)
  }))

  router.get('/turmas-apoio/:id/participantes', requireRole('SUPPORT', 'COORDINATOR', 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const ps = await prisma.apoTurmaApoioParticipante.findMany({ where: { tenantId, turmaId: String(req.params.id) }, orderBy: { createdAt: 'asc' } })
    const al = await nomesAlunos(tenantId, ps.map((p) => p.studentId))
    res.json(ps.map((p) => ({ ...p, aluno: al[p.studentId] })))
  }))

  // Lançamento de frequência/notas e conclusão: aprova quando freq >= mínima (e nota final >= 6 se houver).
  router.post('/turmas-apoio/:id/encerrar', requireRole('SUPPORT', 'COORDINATOR', 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const t = await prisma.apoTurmaApoio.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!t) throw httpError(404, 'Turma não encontrada.')
    const b = parseBody(z.object({ resultados: z.array(z.object({ studentId: z.string(), frequenciaPercent: z.number().min(0).max(100), notaFinal: z.number().min(0).max(10).optional(), notaDiagnostica: z.number().min(0).max(10).optional() })).min(1) }), req.body)
    let aprovados = 0, reprovados = 0
    for (const r of b.resultados) {
      const p = await prisma.apoTurmaApoioParticipante.findFirst({ where: { tenantId, turmaId: t.id, studentId: r.studentId, status: 'INSCRITO' } })
      if (!p) continue
      const ok = r.frequenciaPercent >= t.frequenciaMinima && (r.notaFinal == null || r.notaFinal >= 6)
      await prisma.apoTurmaApoioParticipante.update({ where: { id: p.id }, data: { frequenciaPercent: r.frequenciaPercent, notaFinal: r.notaFinal, notaDiagnostica: r.notaDiagnostica, status: ok ? 'CONCLUIDO' : 'REPROVADO' } })
      ok ? aprovados++ : reprovados++
      await notify({ tenantId, studentId: r.studentId, assunto: `${t.titulo}: resultado`, mensagem: ok ? `Concluído com ${r.frequenciaPercent}% de frequência. Certificado disponível na secretaria.` : `Não concluído (frequência ${r.frequenciaPercent}%).`, refType: 'ApoTurmaApoio', refId: t.id })
    }
    await prisma.apoTurmaApoio.update({ where: { id: t.id }, data: { status: 'CONCLUIDA' } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'TURMA_APOIO_ENCERRADA', refType: 'ApoTurmaApoio', refId: t.id })
    res.json({ aprovados, reprovados })
  }))

  // ---------- mentoria ----------
  const mentoriaSchema = z.object({
    categoria: z.enum(['DISCENTE', 'DOCENTE']).default('DISCENTE'), modalidade: z.enum(['MENTORIA', 'TUTORIA_PARES', 'MENTORIA_PEDAGOGICA']).default('MENTORIA'),
    mentorUserId: z.string().optional(), mentorStudentId: z.string().optional(), menteeStudentId: z.string().optional(), menteeUserId: z.string().optional(),
    objetivos: z.string().max(3000).optional(), inicio: dateISO().optional(), fim: dateISO().optional(), frequenciaEncontrosDias: z.number().int().min(1).max(90).default(15),
  })
  router.post('/mentorias', requireRole('SUPPORT', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(mentoriaSchema, req.body)
    if (!b.mentorUserId && !b.mentorStudentId) throw httpError(400, 'Informe o mentor (usuário ou aluno).')
    if (b.categoria === 'DISCENTE' && !b.menteeStudentId) throw httpError(400, 'Informe o aluno mentorado.')
    if (b.categoria === 'DOCENTE' && !b.menteeUserId) throw httpError(400, 'Informe o docente mentorado.')
    if (b.mentorStudentId && b.mentorStudentId === b.menteeStudentId) throw httpError(400, 'Mentor e mentorado não podem ser a mesma pessoa.')
    if (b.mentorUserId && b.mentorUserId === b.menteeUserId) throw httpError(400, 'Mentor e mentorado não podem ser a mesma pessoa.')
    if (b.menteeStudentId) await carregarAluno(tenantId, b.menteeStudentId)
    if (b.mentorStudentId) await carregarAluno(tenantId, b.mentorStudentId)
    const prox = addDays(b.inicio ?? new Date(), b.frequenciaEncontrosDias)
    const m = await prisma.apoMentoria.create({ data: { ...b, tenantId, inicio: b.inicio ?? new Date(), proximoEncontroEm: prox } })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Encontro de mentoria', dueAt: prox, antecedenciaDias: 2, assigneeUserId: b.mentorUserId, assigneeStudentId: b.mentorStudentId, refType: REF.mentoria, refId: m.id, dedupeKey: `apo-mentoria-${m.id}` })
    if (b.menteeStudentId) await notify({ tenantId, studentId: b.menteeStudentId, assunto: 'Você tem um(a) mentor(a)', mensagem: 'Foi criada uma mentoria para apoiar sua trajetória. Aguarde o contato para o primeiro encontro.', refType: REF.mentoria, refId: m.id })
    if (b.menteeUserId) await notify({ tenantId, userId: b.menteeUserId, assunto: 'Mentoria pedagógica', mensagem: 'Você foi vinculado(a) a um programa de mentoria pedagógica.', refType: REF.mentoria, refId: m.id })
    res.status(201).json(m)
  }))

  router.get('/mentorias', requireRole('SUPPORT', 'COORDINATOR', 'TEACHER', ...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const where: any = { tenantId }
    for (const f of ['categoria', 'status', 'modalidade']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (req.user?.role === 'STUDENT') where.OR = [{ menteeStudentId: req.user.studentId }, { mentorStudentId: req.user.studentId }]
    else if (req.user?.role === 'TEACHER') where.OR = [{ menteeUserId: req.user.id }, { mentorUserId: req.user.id }]
    const items = await prisma.apoMentoria.findMany({ where, include: { encontros: { orderBy: { data: 'desc' }, take: 5 } }, orderBy: { createdAt: 'desc' }, take: 200 })
    res.json(items)
  }))

  router.post('/mentorias/:id/encontros', requireRole('SUPPORT', 'COORDINATOR', 'TEACHER', ...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.apoMentoria.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) throw httpError(404, 'Mentoria não encontrada.')
    const uid = getUserId(req)
    const participa = m.mentorUserId === uid || m.menteeUserId === uid || (req.user?.studentId && (m.mentorStudentId === req.user.studentId || m.menteeStudentId === req.user.studentId)) || hasRole(req, 'SUPPORT', 'COORDINATOR')
    if (!participa) throw httpError(403, 'Você não participa desta mentoria.')
    if (m.status !== 'ATIVA') throw httpError(409, 'Mentoria não está ativa.')
    const b = parseBody(z.object({ data: dateISO().optional(), duracaoMin: z.number().int().min(10).max(480).default(60), resumo: z.string().max(4000).optional(), proximosPassos: z.string().max(2000).optional() }), req.body)
    const data = b.data ?? new Date()
    const e = await prisma.apoMentoriaEncontro.create({ data: { tenantId, mentoriaId: m.id, ...b, data } })
    const prox = addDays(data, m.frequenciaEncontrosDias)
    await prisma.apoMentoria.update({ where: { id: m.id }, data: { proximoEncontroEm: prox } })
    await completeReminders({ tenantId, refType: REF.mentoria, refId: m.id })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Encontro de mentoria', dueAt: prox, antecedenciaDias: 2, assigneeUserId: m.mentorUserId ?? undefined, assigneeStudentId: m.mentorStudentId ?? undefined, refType: REF.mentoria, refId: m.id, dedupeKey: `apo-mentoria-${m.id}` })
    res.status(201).json(e)
  }))

  router.post('/mentorias/:id/encerrar', requireRole('SUPPORT', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.apoMentoria.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) throw httpError(404, 'Mentoria não encontrada.')
    await prisma.apoMentoria.update({ where: { id: m.id }, data: { status: req.body?.cancelar ? 'CANCELADA' : 'CONCLUIDA', fim: new Date() } })
    await completeReminders({ tenantId, refType: REF.mentoria, refId: m.id })
    res.json({ ok: true })
  }))
}

// Job: mentorias ativas sem encontro dentro do ciclo geram lembrete para a coordenação.
export async function jobMentorias() {
  const atrasadas = await prisma.apoMentoria.findMany({ where: { status: 'ATIVA', proximoEncontroEm: { lt: addDays(new Date(), -7) } }, take: 500 })
  let n = 0
  for (const m of atrasadas) {
    await scheduleReminder({ tenantId: m.tenantId, modulo: MODULO, titulo: 'Mentoria sem encontro há mais de 7 dias do previsto', dueAt: addDays(new Date(), 2), assigneeRole: 'SUPPORT', refType: REF.mentoria, refId: m.id, severity: 'ATENCAO', dedupeKey: `apo-mentoria-parada-${m.id}-${m.proximoEncontroEm?.toISOString().slice(0, 10)}` })
    n++
  }
  return { sinalizadas: n }
}
