import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, qs, dateISO } from '../core/crud'
import { audit, notify } from '../core/notify'
import { scheduleReminder, completeReminders, cancelReminders } from '../core/reminders'
import { MANAGE, TEACH, getConfig } from './common'
import { relacaoAlunoTutor, slaLimite, estadoSla } from './rules'

const router = Router()

const tutorSchema = z.object({
  userId: z.string().optional().nullable(), nome: z.string().min(2), email: z.string().email().optional().nullable(), telefone: z.string().optional().nullable(),
  tipo: z.enum(['PRESENCIAL', 'DISTANCIA']).optional(), poloId: z.string().optional().nullable(), capacidadeAlunos: z.number().int().min(1).optional(),
  titulacao: z.string().optional().nullable(), ativo: z.boolean().optional(),
})
mountCrud(router, { model: 'modTutor', path: '/tutores', read: [...TEACH], write: [...MANAGE], create: tutorSchema, search: ['nome', 'email'], filters: ['tipo', 'poloId', 'ativo'], orderBy: { nome: 'asc' }, modulo: 'modalidades', removeMode: 'soft' })

// Alocação por turma/polo
const alocSchema = z.object({
  tutorId: z.string(), classSectionId: z.string().optional().nullable(), poloId: z.string().optional().nullable(), programId: z.string().optional().nullable(),
  termId: z.string().optional().nullable(), alunosPrevistos: z.number().int().min(0).optional(), inicio: dateISO().optional(), fim: dateISO().optional().nullable(), ativo: z.boolean().optional(),
})
mountCrud(router, {
  model: 'modTutorAlocacao', path: '/alocacoes', read: [...TEACH], write: [...MANAGE], create: alocSchema, filters: ['tutorId', 'classSectionId', 'poloId', 'programId', 'ativo'], modulo: 'modalidades',
  beforeCreate: async (d, req) => {
    const tenantId = getTenantId(req)
    if (!d.classSectionId && !d.poloId && !d.programId) throw Object.assign(new Error('Informe turma, polo ou curso para a alocação.'), { status: 422 })
    const tutor = await prisma.modTutor.findFirst({ where: { id: d.tutorId, tenantId } })
    if (!tutor || !tutor.ativo) throw Object.assign(new Error('Tutor inexistente ou inativo.'), { status: 404 })
    if (tutor.tipo === 'PRESENCIAL' && !d.poloId && !tutor.poloId) throw Object.assign(new Error('Tutor presencial exige polo.'), { status: 422 })
    const ativas = await prisma.modTutorAlocacao.aggregate({ where: { tenantId, tutorId: d.tutorId, ativo: true }, _sum: { alunosPrevistos: true } })
    const total = (ativas._sum.alunosPrevistos ?? 0) + (d.alunosPrevistos ?? 0)
    if (total > tutor.capacidadeAlunos) throw Object.assign(new Error(`Alocação excede a capacidade do tutor (${total}/${tutor.capacidadeAlunos} alunos).`), { status: 422 })
    return d
  },
})

// Relação aluno/tutor por curso ou polo
router.get('/relacao-aluno-tutor', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const programId = qs(req.query.programId), poloId = qs(req.query.poloId)
  const cfg = await getConfig(tenantId)
  const modalidade = qs(req.query.modalidade) === 'SEMIPRESENCIAL' ? 'SEMIPRESENCIAL' : 'EAD'
  const limite = parseInt(qs(req.query.limite) ?? '', 10) || (modalidade === 'EAD' ? cfg.alunosPorTutorEad : cfg.alunosPorTutorSemi)
  let alunos = 0
  if (poloId) alunos = await prisma.modPoloAluno.count({ where: { tenantId, poloId, ativo: true, ...(programId ? { programId } : {}) } })
  else if (programId) alunos = await prisma.enrollment.count({ where: { programId, status: 'ATIVA', student: { tenantId } } })
  else alunos = await prisma.enrollment.count({ where: { status: 'ATIVA', student: { tenantId } } })
  const aloc = await prisma.modTutorAlocacao.findMany({ where: { tenantId, ativo: true, ...(programId ? { programId } : {}), ...(poloId ? { poloId } : {}) }, select: { tutorId: true } })
  res.json(relacaoAlunoTutor(alunos, new Set(aloc.map((a) => a.tutorId)).size, limite))
}))

// ---------- Atendimentos com SLA ----------
const atSchema = z.object({
  studentId: z.string().optional(), tutorId: z.string().optional().nullable(), classSectionId: z.string().optional().nullable(),
  canal: z.string().optional(), assunto: z.string().min(3), mensagem: z.string().min(1), prioridade: z.enum(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE']).optional(),
})

// Escolhe o tutor ativo com menos atendimentos abertos dentre os alocados à turma.
async function escolherTutor(tenantId: string, classSectionId?: string | null, studentId?: string) {
  let tutorIds: string[] = []
  if (classSectionId) tutorIds = (await prisma.modTutorAlocacao.findMany({ where: { tenantId, classSectionId, ativo: true }, select: { tutorId: true } })).map((a) => a.tutorId)
  if (!tutorIds.length && studentId) {
    const polo = await prisma.modPoloAluno.findFirst({ where: { tenantId, studentId, ativo: true } })
    if (polo) tutorIds = (await prisma.modTutorAlocacao.findMany({ where: { tenantId, poloId: polo.poloId, ativo: true }, select: { tutorId: true } })).map((a) => a.tutorId)
  }
  if (!tutorIds.length) return null
  const tutores = await prisma.modTutor.findMany({ where: { tenantId, id: { in: tutorIds }, ativo: true } })
  if (!tutores.length) return null
  const cargas = await Promise.all(tutores.map(async (t) => ({ t, n: await prisma.modAtendimento.count({ where: { tenantId, tutorId: t.id, status: { in: ['ABERTO', 'EM_ATENDIMENTO'] } } }) })))
  cargas.sort((a, b) => a.n - b.n)
  return cargas[0].t
}

router.post('/atendimentos', requireRole('STUDENT', ...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(atSchema, req.body)
  const studentId = req.user?.role === 'STUDENT' ? req.user.studentId : b.studentId
  if (!studentId) return res.status(400).json({ error: 'Aluno não identificado.' })
  const cfg = await getConfig(tenantId)
  const prioridade = b.prioridade ?? 'NORMAL'
  const agora = new Date()
  const tutor = b.tutorId ? await prisma.modTutor.findFirst({ where: { id: b.tutorId, tenantId, ativo: true } }) : await escolherTutor(tenantId, b.classSectionId, studentId)
  const limite = slaLimite(agora, prioridade, cfg)
  const at = await prisma.modAtendimento.create({
    data: { tenantId, studentId, tutorId: tutor?.id, classSectionId: b.classSectionId, canal: b.canal ?? 'AVA', assunto: b.assunto, prioridade, slaLimite: limite, mensagens: { create: { tenantId, autorTipo: req.user?.role === 'STUDENT' ? 'ALUNO' : 'TUTOR', autorId: getUserId(req), texto: b.mensagem } } },
  })
  const lembrete = { tenantId, modulo: 'modalidades', refType: 'ModAtendimento', refId: at.id }
  // aviso de risco a 75% do prazo e vencimento
  const t75 = new Date(agora.getTime() + (limite.getTime() - agora.getTime()) * 0.75)
  await scheduleReminder({ ...lembrete, titulo: `Atendimento perto do SLA: ${b.assunto}`, dueAt: limite, remindAt: t75, severity: 'ATENCAO', assigneeUserId: tutor?.userId ?? undefined, assigneeRole: tutor?.userId ? undefined : 'SUPPORT', dedupeKey: `mod-at-${at.id}` })
  if (!tutor) await notify({ tenantId, userId: undefined, mensagem: `Atendimento sem tutor alocado: ${b.assunto}`, assunto: 'Atendimento sem tutor', refType: 'ModAtendimento', refId: at.id })
  res.status(201).json({ ...at, tutor: tutor ? { id: tutor.id, nome: tutor.nome } : null })
}))

router.get('/atendimentos', requireRole('STUDENT', ...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const where: any = { tenantId }
  if (req.user?.role === 'STUDENT') where.studentId = req.user.studentId ?? '__none__'
  for (const f of ['status', 'tutorId', 'studentId', 'prioridade']) { const v = qs((req.query as any)[f]); if (v && req.user?.role !== 'STUDENT') where[f] = v }
  if (qs(req.query.vencidos) === 'true') { where.slaLimite = { lt: new Date() }; where.primeiraRespostaEm = null; where.status = { in: ['ABERTO', 'EM_ATENDIMENTO', 'ESCALADO'] } }
  const items = await prisma.modAtendimento.findMany({ where, orderBy: { slaLimite: 'asc' }, take: 200 })
  const now = new Date()
  res.json({ items: items.map((a) => ({ ...a, sla: estadoSla(now, a.createdAt, a.slaLimite, a.primeiraRespostaEm) })) })
}))

router.get('/atendimentos/:id', requireRole('STUDENT', ...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const a = await prisma.modAtendimento.findFirst({ where: { id: String(req.params.id), tenantId, ...(req.user?.role === 'STUDENT' ? { studentId: req.user.studentId ?? '__none__' } : {}) }, include: { mensagens: { orderBy: { createdAt: 'asc' } } } })
  if (!a) return res.status(404).json({ error: 'Atendimento não encontrado.' })
  res.json({ ...a, sla: estadoSla(new Date(), a.createdAt, a.slaLimite, a.primeiraRespostaEm) })
}))

router.post('/atendimentos/:id/mensagens', requireRole('STUDENT', ...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ texto: z.string().min(1) }), req.body)
  const a = await prisma.modAtendimento.findFirst({ where: { id: String(req.params.id), tenantId, ...(req.user?.role === 'STUDENT' ? { studentId: req.user.studentId ?? '__none__' } : {}) } })
  if (!a) return res.status(404).json({ error: 'Atendimento não encontrado.' })
  if (a.status === 'ENCERRADO') return res.status(409).json({ error: 'Atendimento encerrado.' })
  const doAluno = req.user?.role === 'STUDENT'
  const msg = await prisma.modAtendimentoMensagem.create({ data: { tenantId, atendimentoId: a.id, autorTipo: doAluno ? 'ALUNO' : 'TUTOR', autorId: getUserId(req), texto: b.texto } })
  const patch: any = {}
  if (!doAluno) {
    const agora = new Date()
    if (!a.primeiraRespostaEm) { patch.primeiraRespostaEm = agora; patch.slaCumprido = agora <= a.slaLimite }
    patch.status = 'RESPONDIDO'
    await completeReminders({ tenantId, refType: 'ModAtendimento', refId: a.id, userId: getUserId(req) })
    await notify({ tenantId, studentId: a.studentId, assunto: `Resposta ao seu atendimento: ${a.assunto}`, mensagem: b.texto.slice(0, 300), refType: 'ModAtendimento', refId: a.id })
  } else if (a.status === 'RESPONDIDO') {
    patch.status = 'EM_ATENDIMENTO' // aluno retomou
  }
  if (Object.keys(patch).length) await prisma.modAtendimento.update({ where: { id: a.id }, data: patch })
  res.status(201).json(msg)
}))

router.post('/atendimentos/:id/encerrar', requireRole('STUDENT', ...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const a = await prisma.modAtendimento.findFirst({ where: { id: String(req.params.id), tenantId, ...(req.user?.role === 'STUDENT' ? { studentId: req.user.studentId ?? '__none__' } : {}) } })
  if (!a) return res.status(404).json({ error: 'Atendimento não encontrado.' })
  if (a.status === 'ENCERRADO') return res.status(409).json({ error: 'Já encerrado.' })
  if (req.user?.role !== 'STUDENT' && !a.primeiraRespostaEm) return res.status(422).json({ error: 'Responda ao aluno antes de encerrar.' })
  await cancelReminders({ tenantId, refType: 'ModAtendimento', refId: a.id })
  res.json(await prisma.modAtendimento.update({ where: { id: a.id }, data: { status: 'ENCERRADO', encerradoEm: new Date() } }))
}))

router.post('/atendimentos/:id/reatribuir', requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ tutorId: z.string() }), req.body)
  const [a, t] = await Promise.all([prisma.modAtendimento.findFirst({ where: { id: String(req.params.id), tenantId } }), prisma.modTutor.findFirst({ where: { id: b.tutorId, tenantId, ativo: true } })])
  if (!a || !t) return res.status(404).json({ error: 'Atendimento ou tutor não encontrado.' })
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'REATRIBUIR_ATENDIMENTO', refType: 'ModAtendimento', refId: a.id, detalhes: { de: a.tutorId, para: t.id } })
  res.json(await prisma.modAtendimento.update({ where: { id: a.id }, data: { tutorId: t.id, status: a.status === 'ESCALADO' ? 'EM_ATENDIMENTO' : a.status } }))
}))

// ---------- Avaliação do tutor ----------
router.post('/tutores/:id/avaliacoes', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ nota: z.number().int().min(1).max(5), comentario: z.string().optional(), atendimentoId: z.string().optional() }), req.body)
  const sid = req.user?.studentId
  if (!sid) return res.status(400).json({ error: 'Aluno não vinculado.' })
  const tutor = await prisma.modTutor.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!tutor) return res.status(404).json({ error: 'Tutor não encontrado.' })
  if (b.atendimentoId) {
    const at = await prisma.modAtendimento.findFirst({ where: { id: b.atendimentoId, tenantId, studentId: sid, tutorId: tutor.id } })
    if (!at) return res.status(422).json({ error: 'Atendimento não pertence a este aluno/tutor.' })
    const dup = await prisma.modTutorAvaliacao.findFirst({ where: { tenantId, atendimentoId: at.id, studentId: sid } })
    if (dup) return res.status(409).json({ error: 'Atendimento já avaliado.' })
  } else {
    const teve = await prisma.modAtendimento.count({ where: { tenantId, studentId: sid, tutorId: tutor.id } })
    if (!teve) return res.status(422).json({ error: 'Só é possível avaliar tutores que já atenderam você.' })
  }
  res.status(201).json(await prisma.modTutorAvaliacao.create({ data: { tenantId, tutorId: tutor.id, studentId: sid, ...b } }))
}))

router.get('/tutores/:id/desempenho', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const id = String(req.params.id)
  const tutor = await prisma.modTutor.findFirst({ where: { id, tenantId } })
  if (!tutor) return res.status(404).json({ error: 'Tutor não encontrado.' })
  const [av, ats, aloc] = await Promise.all([
    prisma.modTutorAvaliacao.aggregate({ where: { tenantId, tutorId: id }, _avg: { nota: true }, _count: true }),
    prisma.modAtendimento.findMany({ where: { tenantId, tutorId: id }, select: { status: true, slaCumprido: true, createdAt: true, primeiraRespostaEm: true } }),
    prisma.modTutorAlocacao.aggregate({ where: { tenantId, tutorId: id, ativo: true }, _sum: { alunosPrevistos: true } }),
  ])
  const resp = ats.filter((a) => a.primeiraRespostaEm)
  const tempoMedioH = resp.length ? Math.round((resp.reduce((s, a) => s + (a.primeiraRespostaEm!.getTime() - a.createdAt.getTime()), 0) / resp.length / 3_600_000) * 10) / 10 : null
  const comSla = ats.filter((a) => a.slaCumprido != null)
  res.json({
    tutor: { id: tutor.id, nome: tutor.nome }, notaMedia: av._avg.nota ? Math.round(av._avg.nota * 100) / 100 : null, avaliacoes: av._count,
    atendimentos: ats.length, abertos: ats.filter((a) => ['ABERTO', 'EM_ATENDIMENTO', 'ESCALADO'].includes(a.status)).length,
    slaCumpridoPct: comSla.length ? Math.round((comSla.filter((a) => a.slaCumprido).length / comSla.length) * 1000) / 10 : null,
    tempoMedioPrimeiraRespostaHoras: tempoMedioH, alunosAlocados: aloc._sum.alunosPrevistos ?? 0, capacidade: tutor.capacidadeAlunos,
  })
}))

// Job: escalona atendimentos com SLA vencido (reminder crítico para coordenação + notify).
export async function escalonarAtendimentosVencidos(now = new Date()) {
  const venc = await prisma.modAtendimento.findMany({ where: { primeiraRespostaEm: null, slaLimite: { lt: now }, status: { in: ['ABERTO', 'EM_ATENDIMENTO'] } }, take: 500 })
  let escalonados = 0
  for (const a of venc) {
    await prisma.modAtendimento.update({ where: { id: a.id }, data: { status: 'ESCALADO', escalonadoEm: now, slaCumprido: false } })
    await scheduleReminder({ tenantId: a.tenantId, modulo: 'modalidades', titulo: `SLA VENCIDO: atendimento "${a.assunto}" sem resposta`, dueAt: now, remindAt: now, severity: 'CRITICO', assigneeRole: 'COORDINATOR', refType: 'ModAtendimento', refId: a.id, dedupeKey: `mod-at-esc-${a.id}`, recorrenciaDias: 1 })
    escalonados++
  }
  return { avaliados: venc.length, escalonados }
}

export default router
