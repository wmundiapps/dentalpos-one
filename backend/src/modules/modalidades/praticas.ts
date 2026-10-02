import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, dateISO } from '../core/crud'
import { audit, notify } from '../core/notify'
import { scheduleReminder } from '../core/reminders'
import { MANAGE, TEACH, horasEntre } from './common'
import { resumoHorasPraticas } from './rules'

const router = Router()

const agendaSchema = z.object({
  tipo: z.enum(['AULA_PRATICA', 'LABORATORIO', 'ESTAGIO_SUPERVISIONADO', 'VISITA_TECNICA']), titulo: z.string().min(2), programId: z.string().optional().nullable(),
  classSectionId: z.string().optional().nullable(), classSessionId: z.string().optional().nullable(), poloId: z.string().optional().nullable(), spaceId: z.string().optional().nullable(),
  inicio: dateISO(), fim: dateISO(), vagas: z.number().int().min(0).optional(), supervisorNome: z.string().optional().nullable(), supervisorUserId: z.string().optional().nullable(),
})
mountCrud(router, {
  model: 'modAgendaPratica', path: '/agendas-praticas', read: [...TEACH, 'STUDENT'], write: [...MANAGE, 'TEACHER'], create: agendaSchema,
  filters: ['tipo', 'poloId', 'programId', 'classSectionId', 'status'], orderBy: { inicio: 'asc' }, modulo: 'modalidades',
  beforeCreate: async (d, req) => {
    const tenantId = getTenantId(req)
    if (d.fim <= d.inicio) throw Object.assign(new Error('Fim deve ser posterior ao início.'), { status: 422 })
    if (d.spaceId) {
      const sp = await prisma.eduSpace.findFirst({ where: { id: d.spaceId, tenantId } })
      if (!sp) throw Object.assign(new Error('Espaço não encontrado.'), { status: 404 })
      if (d.vagas && sp.capacidade > 0 && d.vagas > sp.capacidade) throw Object.assign(new Error(`Vagas (${d.vagas}) excedem a capacidade do espaço (${sp.capacidade}).`), { status: 422 })
      const c = await prisma.modAgendaPratica.findFirst({ where: { tenantId, spaceId: d.spaceId, status: 'AGENDADA', inicio: { lt: d.fim }, fim: { gt: d.inicio } } })
      if (c) throw Object.assign(new Error(`Espaço ocupado por "${c.titulo}" nesse horário.`), { status: 409 })
    }
    if (d.poloId) {
      const p = await prisma.modPolo.findFirst({ where: { id: d.poloId, tenantId } })
      if (!p) throw Object.assign(new Error('Polo não encontrado.'), { status: 404 })
      if (p.statusCredenciamento !== 'CREDENCIADO') throw Object.assign(new Error('Polo não credenciado.'), { status: 422 })
    }
    return d
  },
  afterCreate: async (row, req) => scheduleReminder({ tenantId: getTenantId(req), modulo: 'modalidades', titulo: `${row.tipo.replace(/_/g, ' ').toLowerCase()}: ${row.titulo}`, dueAt: row.inicio, antecedenciaDias: 3, assigneeRole: 'COORDINATOR', refType: 'ModAgendaPratica', refId: row.id, dedupeKey: `mod-prat-${row.id}` }),
})

router.post('/agendas-praticas/:id/inscrever', requireRole('STUDENT', ...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ studentId: z.string().optional() }), req.body ?? {})
  const studentId = req.user?.role === 'STUDENT' ? req.user.studentId : b.studentId
  if (!studentId) return res.status(400).json({ error: 'Aluno não identificado.' })
  const ag = await prisma.modAgendaPratica.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!ag) return res.status(404).json({ error: 'Agenda não encontrada.' })
  if (ag.status !== 'AGENDADA') return res.status(409).json({ error: 'Agenda não está aberta.' })
  const existente = await prisma.modPraticaInscricao.findUnique({ where: { agendaId_studentId: { agendaId: ag.id, studentId } } })
  if (existente && existente.status !== 'CANCELADO') return res.status(409).json({ error: 'Aluno já inscrito.' })
  if (ag.vagas > 0) {
    const n = await prisma.modPraticaInscricao.count({ where: { agendaId: ag.id, status: { not: 'CANCELADO' } } })
    if (n >= ag.vagas) return res.status(422).json({ error: 'Vagas esgotadas.' })
  }
  // conflito de horário do aluno
  const conf = await prisma.modPraticaInscricao.findFirst({ where: { tenantId, studentId, status: { not: 'CANCELADO' }, agenda: { status: 'AGENDADA', inicio: { lt: ag.fim }, fim: { gt: ag.inicio } } } })
  if (conf) return res.status(409).json({ error: 'Conflito com outra atividade prática do aluno.' })
  const row = await prisma.modPraticaInscricao.upsert({ where: { agendaId_studentId: { agendaId: ag.id, studentId } }, create: { tenantId, agendaId: ag.id, studentId }, update: { status: 'INSCRITO' } })
  await notify({ tenantId, studentId, assunto: `Inscrição confirmada: ${ag.titulo}`, mensagem: `Sua inscrição em "${ag.titulo}" em ${ag.inicio.toLocaleString('pt-BR')} foi confirmada.`, refType: 'ModAgendaPratica', refId: ag.id })
  res.status(201).json(row)
}))
router.post('/agendas-praticas/:id/cancelar-inscricao', requireRole('STUDENT', ...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = req.user?.role === 'STUDENT' ? req.user.studentId : String(req.body?.studentId ?? '')
  if (!studentId) return res.status(400).json({ error: 'Aluno não identificado.' })
  const r = await prisma.modPraticaInscricao.updateMany({ where: { tenantId, agendaId: String(req.params.id), studentId }, data: { status: 'CANCELADO' } })
  res.json({ cancelados: r.count })
}))

// Fechamento da agenda: lança presença e horas (gera ModHoraPratica já VALIDADA para presentes).
router.post('/agendas-praticas/:id/fechar', requireRole(...MANAGE, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ presentes: z.array(z.string()), horasPorAluno: z.number().min(0).max(24).optional() }), req.body)
  const ag = await prisma.modAgendaPratica.findFirst({ where: { id: String(req.params.id), tenantId }, include: { inscricoes: true } })
  if (!ag) return res.status(404).json({ error: 'Agenda não encontrada.' })
  if (ag.status === 'REALIZADA') return res.status(409).json({ error: 'Agenda já fechada.' })
  const horas = b.horasPorAluno ?? Math.round(horasEntre(ag.inicio, ag.fim) * 100) / 100
  const pres = new Set(b.presentes)
  for (const i of ag.inscricoes.filter((x) => x.status !== 'CANCELADO')) {
    const presente = pres.has(i.studentId)
    await prisma.modPraticaInscricao.update({ where: { id: i.id }, data: { status: presente ? 'PRESENTE' : 'FALTOU', horas: presente ? horas : 0 } })
    if (presente) {
      await prisma.modHoraPratica.create({ data: { tenantId, agendaId: ag.id, studentId: i.studentId, data: ag.inicio, horas, descricao: ag.titulo, status: 'VALIDADA', validadoPorId: getUserId(req), validadoEm: new Date() } })
    }
  }
  await prisma.modAgendaPratica.update({ where: { id: ag.id }, data: { status: 'REALIZADA' } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'FECHAR_PRATICA', refType: 'ModAgendaPratica', refId: ag.id, detalhes: { presentes: pres.size, horas } })
  res.json({ presentes: pres.size, horasPorAluno: horas })
}))

// ---------- Estágios ----------
const estSchema = z.object({
  studentId: z.string(), programId: z.string().optional().nullable(), concedente: z.string().min(2), concedenteCnpj: z.string().optional().nullable(),
  supervisorNome: z.string().optional().nullable(), orientadorUserId: z.string().optional().nullable(), horasExigidas: z.number().positive(),
  inicio: dateISO(), fim: dateISO().optional().nullable(), termoUrl: z.string().optional().nullable(),
})
mountCrud(router, {
  model: 'modEstagio', path: '/estagios', read: [...TEACH], write: [...MANAGE], create: estSchema, filters: ['studentId', 'programId', 'status'], search: ['concedente'], modulo: 'modalidades',
  beforeCreate: async (d, req) => {
    const tenantId = getTenantId(req)
    const st = await prisma.student.findFirst({ where: { id: d.studentId, tenantId } })
    if (!st) throw Object.assign(new Error('Aluno não encontrado.'), { status: 404 })
    if (d.fim && d.fim <= d.inicio) throw Object.assign(new Error('Fim deve ser posterior ao início.'), { status: 422 })
    return d
  },
  afterCreate: async (row, req) => {
    if (row.fim) await scheduleReminder({ tenantId: getTenantId(req), modulo: 'modalidades', titulo: `Fim do estágio (${row.concedente}): conferir horas`, dueAt: row.fim, antecedenciaDias: 15, assigneeRole: 'COORDINATOR', refType: 'ModEstagio', refId: row.id, dedupeKey: `mod-est-${row.id}` })
  },
})
router.get('/estagios/:id/horas', requireRole(...TEACH, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const e = await prisma.modEstagio.findFirst({ where: { id: String(req.params.id), tenantId, ...(req.user?.role === 'STUDENT' ? { studentId: req.user.studentId ?? '__none__' } : {}) }, include: { horas: { orderBy: { data: 'asc' } } } })
  if (!e) return res.status(404).json({ error: 'Estágio não encontrado.' })
  res.json({ estagio: e, resumo: resumoHorasPraticas(e.horas, e.horasExigidas) })
}))
router.post('/estagios/:id/horas', requireRole('STUDENT', ...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ data: dateISO(), horas: z.number().positive().max(12), descricao: z.string().optional() }), req.body)
  const e = await prisma.modEstagio.findFirst({ where: { id: String(req.params.id), tenantId, ...(req.user?.role === 'STUDENT' ? { studentId: req.user.studentId ?? '__none__' } : {}) } })
  if (!e) return res.status(404).json({ error: 'Estágio não encontrado.' })
  if (e.status !== 'EM_ANDAMENTO' && e.status !== 'PLANEJADO') return res.status(409).json({ error: 'Estágio não aceita lançamentos.' })
  if (b.data.getTime() > Date.now() + 86_400_000) return res.status(422).json({ error: 'Não é possível lançar horas futuras.' })
  if (b.data < new Date(e.inicio.getTime() - 86_400_000)) return res.status(422).json({ error: 'Data anterior ao início do estágio.' })
  const dia = new Date(b.data); dia.setUTCHours(0, 0, 0, 0)
  const fimDia = new Date(dia.getTime() + 86_400_000)
  const soma = await prisma.modHoraPratica.aggregate({ where: { tenantId, estagioId: e.id, status: { not: 'REJEITADA' }, data: { gte: dia, lt: fimDia } }, _sum: { horas: true } })
  if ((soma._sum.horas ?? 0) + b.horas > 12) return res.status(422).json({ error: 'Limite de 12h/dia excedido.' })
  const row = await prisma.modHoraPratica.create({ data: { tenantId, estagioId: e.id, studentId: e.studentId, ...b } })
  if (e.status === 'PLANEJADO') await prisma.modEstagio.update({ where: { id: e.id }, data: { status: 'EM_ANDAMENTO' } })
  res.status(201).json(row)
}))

async function recalcEstagio(tenantId: string, estagioId: string) {
  const e = await prisma.modEstagio.findFirst({ where: { id: estagioId, tenantId }, include: { horas: true } })
  if (!e) return null
  const r = resumoHorasPraticas(e.horas, e.horasExigidas)
  return prisma.modEstagio.update({ where: { id: e.id }, data: { horasCumpridas: r.validadas } })
}
router.post('/horas/:id/validar', requireRole(...MANAGE, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ aprovar: z.boolean(), motivo: z.string().optional() }), req.body)
  const h = await prisma.modHoraPratica.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!h) return res.status(404).json({ error: 'Lançamento não encontrado.' })
  if (h.status !== 'PENDENTE') return res.status(409).json({ error: 'Lançamento já decidido.' })
  if (!b.aprovar && !b.motivo) return res.status(422).json({ error: 'Informe o motivo da rejeição.' })
  const row = await prisma.modHoraPratica.update({ where: { id: h.id }, data: { status: b.aprovar ? 'VALIDADA' : 'REJEITADA', validadoPorId: getUserId(req), validadoEm: new Date(), descricao: b.aprovar ? h.descricao : `${h.descricao ?? ''} [rejeitada: ${b.motivo}]` } })
  if (h.estagioId) await recalcEstagio(tenantId, h.estagioId)
  if (!b.aprovar) await notify({ tenantId, studentId: h.studentId, assunto: 'Horas de prática rejeitadas', mensagem: `Seu lançamento de ${h.horas}h foi rejeitado: ${b.motivo}`, refType: 'ModHoraPratica', refId: h.id })
  res.json(row)
}))
router.post('/estagios/:id/concluir', requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const e = await recalcEstagio(tenantId, String(req.params.id))
  if (!e) return res.status(404).json({ error: 'Estágio não encontrado.' })
  if (e.horasCumpridas < e.horasExigidas) return res.status(422).json({ error: `Horas validadas (${e.horasCumpridas}h) abaixo das exigidas (${e.horasExigidas}h).` })
  res.json(await prisma.modEstagio.update({ where: { id: e.id }, data: { status: 'CONCLUIDO', fim: e.fim ?? new Date() } }))
}))

// Horas práticas do aluno consolidadas
router.get('/alunos/:studentId/horas', requireRole('STUDENT', ...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const sid = req.user?.role === 'STUDENT' ? req.user.studentId : String(req.params.studentId)
  if (!sid) return res.status(400).json({ error: 'Aluno não vinculado.' })
  const [horas, estagios] = await Promise.all([prisma.modHoraPratica.findMany({ where: { tenantId, studentId: sid } }), prisma.modEstagio.findMany({ where: { tenantId, studentId: sid } })])
  res.json({ geral: resumoHorasPraticas(horas, estagios.reduce((s, e) => s + e.horasExigidas, 0)), estagios })
}))

export default router
