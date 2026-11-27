import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, pageParams, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { scheduleReminder, completeReminders } from '../core/reminders'
import { carregarCtx, gravarNota, recalcularTurma, roster } from './service'
import { role, isCoord, isMgmt, httpErr } from './common'

const router = Router()
const DAY = 86400000
const ABERTAS = ['SOLICITADA', 'PARECER_EMITIDO'] as const

// Escopo de leitura por papel.
async function escopo(req: AuthenticatedRequest) {
  const tenantId = getTenantId(req)
  const where: any = { tenantId }
  if (role(req) === 'STUDENT') where.studentId = req.user?.studentId ?? '__nenhum__'
  else if (role(req) === 'TEACHER') {
    const secs = await prisma.classSection.findMany({ where: { tenantId, professorUserId: getUserId(req) }, select: { id: true } })
    where.classSectionId = { in: secs.map((s) => s.id) }
  }
  return where
}

router.get('/revisoes', requireRole('STUDENT', 'TEACHER', 'COORDINATOR', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const where = await escopo(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  for (const f of ['status', 'classSectionId', 'studentId']) { const v = qs((req.query as any)[f]); if (v && !(f === 'studentId' && role(req) === 'STUDENT')) where[f] = v }
  const [items, total] = await Promise.all([
    prisma.ntRevisao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.ntRevisao.count({ where }),
  ])
  res.json({ items, total, page, pageSize })
}))

router.get('/revisoes/:id', requireRole('STUDENT', 'TEACHER', 'COORDINATOR', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const where = await escopo(req)
  const r = await prisma.ntRevisao.findFirst({ where: { ...where, id: String(req.params.id) } })
  if (!r) throw httpErr(404, 'Pedido de revisão não encontrado.')
  res.json(r)
}))

// 1) Aluno pede revisão (dentro do prazo após o fechamento do diário).
router.post('/revisoes', requireRole('STUDENT', 'SECRETARY', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({
    classSectionId: z.string(), componenteId: z.string(),
    justificativa: z.string().trim().min(20, 'Descreva o motivo da revisão (mín. 20 caracteres).'),
    studentId: z.string().optional(),
  }), req.body)
  const studentId = role(req) === 'STUDENT' ? req.user?.studentId : b.studentId
  if (!studentId) throw httpErr(400, role(req) === 'STUDENT' ? 'Usuário não vinculado a um aluno.' : 'Informe studentId.')
  const ctx = await carregarCtx(tenantId, b.classSectionId)
  if (!ctx) throw httpErr(404, 'Turma não encontrada.')
  if (!(await roster(tenantId, ctx.section.id)).some((a) => a.studentId === studentId)) throw httpErr(403, 'Aluno não matriculado nesta turma.')
  const comp = ctx.componentes.find((c) => c.id === b.componenteId)
  if (!comp) throw httpErr(404, 'Componente não encontrado.')
  const lanc = await prisma.ntLancamento.findUnique({ where: { componenteId_studentId: { componenteId: comp.id, studentId } } })
  if (!lanc || (lanc.valor == null && !lanc.ausente)) throw httpErr(422, 'Não há nota lançada neste componente para revisar.')
  if (ctx.diario.status === 'FECHADO' && ctx.diario.fechadoEm && Date.now() > ctx.diario.fechadoEm.getTime() + ctx.regra.diasRevisao * DAY && !isMgmt(req)) {
    throw httpErr(409, `Prazo de ${ctx.regra.diasRevisao} dias para pedir revisão encerrado em ${new Date(ctx.diario.fechadoEm.getTime() + ctx.regra.diasRevisao * DAY).toLocaleDateString('pt-BR')}. Abra um requerimento na secretaria.`)
  }
  const dup = await prisma.ntRevisao.findFirst({ where: { tenantId, studentId, componenteId: comp.id, status: { in: [...ABERTAS] } } })
  if (dup) throw httpErr(409, 'Já existe um pedido de revisão em andamento para este componente.')
  const prazoParecer = new Date(Date.now() + 3 * DAY)
  const rev = await prisma.ntRevisao.create({ data: { tenantId, studentId, classSectionId: ctx.section.id, componenteId: comp.id, lancamentoId: lanc.id, notaOriginal: lanc.valor, justificativa: b.justificativa, prazoParecer } })
  await scheduleReminder({ tenantId, modulo: 'notas', titulo: `Parecer de revisão de nota — ${comp.codigo} (${ctx.section.nome})`, descricao: b.justificativa, dueAt: prazoParecer, antecedenciaDias: 1, severity: 'ATENCAO', assigneeUserId: ctx.section.professorUserId, refType: 'NtRevisao', refId: rev.id, dedupeKey: `nt-rev-parecer-${rev.id}` })
  await notify({ tenantId, userId: ctx.section.professorUserId, assunto: 'Pedido de revisão de nota', mensagem: `Um aluno pediu revisão da nota de ${comp.nome} em ${ctx.section.nome}. Emita o parecer até ${prazoParecer.toLocaleDateString('pt-BR')}.`, refType: 'NtRevisao', refId: rev.id })
  await audit({ tenantId, userId: getUserId(req), modulo: 'notas', acao: 'REVISAO_SOLICITADA', refType: 'NtRevisao', refId: rev.id })
  res.status(201).json(rev)
}))

// 2) Professor emite parecer.
router.post('/revisoes/:id/parecer', requireRole('TEACHER', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const rev = await prisma.ntRevisao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!rev) throw httpErr(404, 'Pedido de revisão não encontrado.')
  const sec = await prisma.classSection.findFirst({ where: { id: rev.classSectionId, tenantId }, select: { professorUserId: true, nome: true } })
  if (!sec) throw httpErr(404, 'Turma não encontrada.')
  if (role(req) === 'TEACHER' && sec.professorUserId !== getUserId(req)) throw httpErr(403, 'Somente o professor da turma emite o parecer.')
  if (rev.status !== 'SOLICITADA') throw httpErr(409, `Pedido já está em "${rev.status}".`)
  const b = parseBody(z.object({ parecer: z.string().trim().min(10, 'Parecer deve ter ao menos 10 caracteres.'), notaSugerida: z.number().min(0).nullable().optional() }), req.body)
  const upd = await prisma.ntRevisao.update({ where: { id: rev.id }, data: { status: 'PARECER_EMITIDO', parecer: b.parecer, parecerNotaSugerida: b.notaSugerida ?? null, parecerPorId: getUserId(req), parecerEm: new Date() } })
  await completeReminders({ tenantId, refType: 'NtRevisao', refId: rev.id, userId: getUserId(req) })
  await scheduleReminder({ tenantId, modulo: 'notas', titulo: `Decidir revisão de nota — ${sec.nome}`, descricao: b.parecer, dueAt: new Date(Date.now() + 3 * DAY), antecedenciaDias: 1, assigneeRole: 'COORDINATOR', refType: 'NtRevisao', refId: rev.id, dedupeKey: `nt-rev-decisao-${rev.id}` })
  await notify({ tenantId, studentId: rev.studentId, assunto: 'Parecer sobre sua revisão de nota', mensagem: `O professor emitiu parecer sobre seu pedido de revisão em ${sec.nome}. A decisão final cabe à coordenação.`, refType: 'NtRevisao', refId: rev.id })
  await audit({ tenantId, userId: getUserId(req), modulo: 'notas', acao: 'REVISAO_PARECER', refType: 'NtRevisao', refId: rev.id, detalhes: { notaSugerida: b.notaSugerida } })
  res.json(upd)
}))

// 3) Coordenação decide; se deferida com nova nota, aplica (com trilha) e recalcula.
router.post('/revisoes/:id/decisao', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const userId = getUserId(req)
  if (!isCoord(req)) throw httpErr(403, 'Somente a coordenação decide revisões.')
  const rev = await prisma.ntRevisao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!rev) throw httpErr(404, 'Pedido de revisão não encontrado.')
  if (!ABERTAS.includes(rev.status as any)) throw httpErr(409, `Pedido já encerrado (${rev.status}).`)
  if (rev.status === 'SOLICITADA' && !(rev.prazoParecer && rev.prazoParecer.getTime() < Date.now())) throw httpErr(409, 'Aguardando o parecer do professor (prazo ainda não venceu).')
  const b = parseBody(z.object({ decisao: z.enum(['DEFERIDA', 'INDEFERIDA']), justificativa: z.string().trim().min(10), notaNova: z.number().min(0).optional(), ausente: z.boolean().optional() }), req.body)
  let notaNova: number | null = null
  if (b.decisao === 'DEFERIDA') {
    notaNova = b.notaNova ?? rev.parecerNotaSugerida ?? null
    if (notaNova == null) throw httpErr(400, 'Informe notaNova para deferir a revisão.')
    const comp = await prisma.ntComponente.findFirst({ where: { id: rev.componenteId, tenantId } })
    if (!comp) throw httpErr(404, 'Componente não encontrado.')
    await gravarNota({ tenantId, classSectionId: rev.classSectionId, componente: comp, studentId: rev.studentId, valor: notaNova, origem: 'REVISAO', motivo: `Revisão ${rev.id} deferida: ${b.justificativa}`, userId })
    await recalcularTurma(tenantId, rev.classSectionId)
  }
  const upd = await prisma.ntRevisao.update({ where: { id: rev.id }, data: { status: b.decisao, decisao: b.justificativa, notaNova, decididoPorId: userId, decididoEm: new Date() } })
  await completeReminders({ tenantId, refType: 'NtRevisao', refId: rev.id, userId })
  await notify({ tenantId, studentId: rev.studentId, assunto: `Revisão de nota ${b.decisao === 'DEFERIDA' ? 'deferida' : 'indeferida'}`, mensagem: b.decisao === 'DEFERIDA' ? `Sua revisão foi deferida. Nova nota: ${notaNova}. ${b.justificativa}` : `Sua revisão foi indeferida. ${b.justificativa}`, refType: 'NtRevisao', refId: rev.id })
  await audit({ tenantId, userId, modulo: 'notas', acao: `REVISAO_${b.decisao}`, refType: 'NtRevisao', refId: rev.id, detalhes: { de: rev.notaOriginal, para: notaNova, justificativa: b.justificativa } })
  res.json(upd)
}))

router.post('/revisoes/:id/cancelar', requireRole('STUDENT', 'COORDINATOR', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const rev = await prisma.ntRevisao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!rev) throw httpErr(404, 'Pedido de revisão não encontrado.')
  if (role(req) === 'STUDENT' && rev.studentId !== req.user?.studentId) throw httpErr(403, 'Este pedido não é seu.')
  if (!ABERTAS.includes(rev.status as any)) throw httpErr(409, `Pedido já encerrado (${rev.status}).`)
  const upd = await prisma.ntRevisao.update({ where: { id: rev.id }, data: { status: 'CANCELADA' } })
  await completeReminders({ tenantId, refType: 'NtRevisao', refId: rev.id })
  await audit({ tenantId, userId: getUserId(req), modulo: 'notas', acao: 'REVISAO_CANCELADA', refType: 'NtRevisao', refId: rev.id })
  res.json(upd)
}))

export default router
