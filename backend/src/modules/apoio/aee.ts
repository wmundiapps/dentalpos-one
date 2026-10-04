import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getUserId, requireRole } from '../academico/middleware'
import { dateISO, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders } from '../core/reminders'
import { APOIO, APOIO_COORD, DOCENTE, MODULO, REF, carregarAluno, hasRole, httpError, nomesAlunos, nomesUsuarios, tid, scheduleReminder } from './common'
import { addDays, estadoPlanoAee } from './logic'

const TIPOS_ADAPT = ['TEMPO_ADICIONAL', 'MATERIAL_AMPLIADO', 'INTERPRETE_LIBRAS', 'LEDOR', 'SALA_SEPARADA', 'PROVA_ADAPTADA', 'PAUSAS', 'TECNOLOGIA_ASSISTIVA', 'OUTRO'] as const

const planoSchema = z.object({
  studentId: z.string().min(1),
  necessidade: z.string().min(2).max(300),
  categoria: z.enum(['DEFICIENCIA', 'TEA', 'ALTAS_HABILIDADES', 'TRANSTORNO_APRENDIZAGEM', 'OUTRO']).default('DEFICIENCIA'),
  laudoReferencia: z.string().max(500).optional(),
  vigenciaInicio: dateISO(),
  vigenciaFim: dateISO(),
  responsavelId: z.string().optional(),
  recursos: z.array(z.string()).optional(),
  observacoes: z.string().max(4000).optional(),
})
const adaptSchema = z.object({
  disciplineId: z.string().optional(),
  classSectionId: z.string().optional(),
  professorUserId: z.string().optional(),
  tipo: z.enum(TIPOS_ADAPT),
  descricao: z.string().min(3).max(2000),
  tempoExtraPercent: z.number().int().min(0).max(200).optional(),
})

// Notifica o professor sobre a adaptação (sem expor diagnóstico) e pede ciência.
async function notificarProfessor(tenantId: string, plano: any, adapt: any) {
  let prof = adapt.professorUserId as string | null
  if (!prof && adapt.classSectionId) {
    const turma = await prisma.classSection.findFirst({ where: { id: adapt.classSectionId, tenantId }, select: { professorUserId: true } })
    prof = turma?.professorUserId ?? null
  }
  if (!prof) return null
  const aluno = await prisma.student.findFirst({ where: { id: plano.studentId, tenantId }, select: { nomeCompleto: true } })
  await notify({
    tenantId, userId: prof, assunto: 'Adaptação pedagógica para aluno com atendimento educacional especializado',
    mensagem: `Aluno(a) ${aluno?.nomeCompleto ?? ''}: ${adapt.tipo.replace(/_/g, ' ').toLowerCase()}${adapt.tempoExtraPercent ? ` (+${adapt.tempoExtraPercent}% de tempo)` : ''} — ${adapt.descricao}. Vigência até ${plano.vigenciaFim.toLocaleDateString('pt-BR')}. Confirme a ciência no sistema.`,
    refType: 'ApoAdaptacao', refId: adapt.id, templateKey: 'apoio.aee.adaptacao',
  })
  await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Confirmar ciência de adaptação pedagógica (AEE)', dueAt: addDays(new Date(), 5), assigneeUserId: prof, refType: 'ApoAdaptacao', refId: adapt.id, severity: 'ATENCAO', dedupeKey: `apo-adapt-ciencia-${adapt.id}` })
  await prisma.apoAdaptacao.update({ where: { id: adapt.id }, data: { notificadoEm: new Date(), professorUserId: prof } })
  return prof
}

export function mountAee(router: Router) {
  router.get('/aee/planos', requireRole(...APOIO_COORD), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const where: any = { tenantId }
    const st = qs(req.query.status), sid = qs(req.query.studentId)
    if (st) where.status = st
    if (sid) where.studentId = sid
    const items = await prisma.apoPlanoAee.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 200, include: { adaptacoes: { where: { ativo: true } } } })
    const alunos = await nomesAlunos(tenantId, items.map((i) => i.studentId))
    const podeDetalhe = hasRole(req, 'SUPPORT')
    res.json(items.map((p) => ({ ...p, laudoReferencia: podeDetalhe ? p.laudoReferencia : undefined, necessidade: podeDetalhe ? p.necessidade : p.categoria, statusEfetivo: estadoPlanoAee(p.vigenciaFim, p.status), aluno: alunos[p.studentId] })))
  }))

  router.post('/aee/planos', requireRole(...APOIO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(planoSchema, req.body)
    await carregarAluno(tenantId, b.studentId)
    if (b.vigenciaFim <= b.vigenciaInicio) throw httpError(400, 'Vigência final deve ser posterior à inicial.')
    const p = await prisma.apoPlanoAee.create({ data: { ...b, tenantId, responsavelId: b.responsavelId ?? getUserId(req) } as any })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'AEE_PLANO_CRIADO', refType: REF.planoAee, refId: p.id })
    res.status(201).json(p)
  }))

  router.get('/aee/planos/:id', requireRole(...APOIO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const p = await prisma.apoPlanoAee.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) }, include: { adaptacoes: true } })
    if (!p) throw httpError(404, 'Plano não encontrado.')
    await audit({ tenantId: p.tenantId, userId: getUserId(req), modulo: MODULO, acao: 'AEE_PLANO_LIDO', refType: REF.planoAee, refId: p.id })
    res.json(p)
  }))

  router.patch('/aee/planos/:id', requireRole(...APOIO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const cur = await prisma.apoPlanoAee.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) throw httpError(404, 'Plano não encontrado.')
    if (cur.status === 'ENCERRADO') throw httpError(409, 'Plano encerrado não pode ser alterado.')
    const b = parseBody(planoSchema.omit({ studentId: true }).partial(), req.body)
    res.json(await prisma.apoPlanoAee.update({ where: { id: cur.id }, data: b as any }))
  }))

  router.post('/aee/planos/:id/adaptacoes', requireRole(...APOIO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const plano = await prisma.apoPlanoAee.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!plano) throw httpError(404, 'Plano não encontrado.')
    if (plano.status === 'ENCERRADO') throw httpError(409, 'Plano encerrado.')
    const b = parseBody(adaptSchema, req.body)
    if (b.tipo === 'TEMPO_ADICIONAL' && !b.tempoExtraPercent) throw httpError(400, 'Informe tempoExtraPercent para TEMPO_ADICIONAL.')
    if (b.disciplineId && !(await prisma.discipline.findFirst({ where: { id: b.disciplineId, tenantId }, select: { id: true } }))) throw httpError(404, 'Disciplina não encontrada.')
    const ad = await prisma.apoAdaptacao.create({ data: { ...b, tenantId, planoId: plano.id } })
    if (plano.status === 'VIGENTE') await notificarProfessor(tenantId, plano, ad)
    res.status(201).json(ad)
  }))

  router.delete('/aee/adaptacoes/:id', requireRole(...APOIO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const ad = await prisma.apoAdaptacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!ad) throw httpError(404, 'Adaptação não encontrada.')
    await prisma.apoAdaptacao.update({ where: { id: ad.id }, data: { ativo: false } })
    await cancelReminders({ tenantId, refType: 'ApoAdaptacao', refId: ad.id })
    res.status(204).end()
  }))

  // Ativa o plano: exige adaptações, notifica cada professor, agenda lembrete de vencimento e reavaliação.
  router.post('/aee/planos/:id/ativar', requireRole(...APOIO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const plano = await prisma.apoPlanoAee.findFirst({ where: { id: String(req.params.id), tenantId }, include: { adaptacoes: { where: { ativo: true } } } })
    if (!plano) throw httpError(404, 'Plano não encontrado.')
    if (plano.status === 'VIGENTE') throw httpError(409, 'Plano já vigente.')
    if (plano.status === 'ENCERRADO') throw httpError(409, 'Plano encerrado.')
    if (!plano.adaptacoes.length) throw httpError(422, 'Cadastre ao menos uma adaptação antes de ativar o plano.')
    if (plano.vigenciaFim < new Date()) throw httpError(422, 'Vigência já expirada.')
    const atualizado = await prisma.apoPlanoAee.update({ where: { id: plano.id }, data: { status: 'VIGENTE' } })
    const notificados = new Set<string>()
    const semProfessor: string[] = []
    for (const ad of plano.adaptacoes) {
      const prof = await notificarProfessor(tenantId, plano, ad)
      if (prof) notificados.add(prof); else semProfessor.push(ad.id)
    }
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Plano AEE a vencer: reavaliar e renovar', dueAt: plano.vigenciaFim, antecedenciaDias: 30, assigneeUserId: plano.responsavelId ?? undefined, assigneeRole: plano.responsavelId ? undefined : 'SUPPORT', refType: REF.planoAee, refId: plano.id, severity: 'ATENCAO', dedupeKey: `apo-aee-venc-${plano.id}` })
    await notify({ tenantId, studentId: plano.studentId, assunto: 'Seu plano de acompanhamento foi ativado', mensagem: 'As adaptações acordadas com o NAPNE já estão valendo e seus professores foram avisados.', refType: REF.planoAee, refId: plano.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'AEE_PLANO_ATIVADO', refType: REF.planoAee, refId: plano.id })
    res.json({ plano: atualizado, professoresNotificados: notificados.size, adaptacoesSemProfessor: semProfessor })
  }))

  router.post('/aee/planos/:id/renovar', requireRole(...APOIO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const plano = await prisma.apoPlanoAee.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!plano) throw httpError(404, 'Plano não encontrado.')
    if (plano.status === 'ENCERRADO') throw httpError(409, 'Plano encerrado.')
    const b = parseBody(z.object({ vigenciaFim: dateISO() }), req.body)
    if (b.vigenciaFim <= plano.vigenciaFim) throw httpError(400, 'Nova vigência deve ser posterior à atual.')
    const p = await prisma.apoPlanoAee.update({ where: { id: plano.id }, data: { vigenciaFim: b.vigenciaFim, status: 'VIGENTE' } })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Plano AEE a vencer: reavaliar e renovar', dueAt: b.vigenciaFim, antecedenciaDias: 30, assigneeUserId: plano.responsavelId ?? undefined, assigneeRole: plano.responsavelId ? undefined : 'SUPPORT', refType: REF.planoAee, refId: plano.id, dedupeKey: `apo-aee-venc-${plano.id}` })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'AEE_PLANO_RENOVADO', refType: REF.planoAee, refId: plano.id })
    res.json(p)
  }))

  router.post('/aee/planos/:id/encerrar', requireRole(...APOIO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const plano = await prisma.apoPlanoAee.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!plano) throw httpError(404, 'Plano não encontrado.')
    const b = parseBody(z.object({ motivo: z.string().min(3).max(500) }), req.body)
    await prisma.apoPlanoAee.update({ where: { id: plano.id }, data: { status: 'ENCERRADO', encerradoMotivo: b.motivo } })
    await cancelReminders({ tenantId, refType: REF.planoAee, refId: plano.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'AEE_PLANO_ENCERRADO', refType: REF.planoAee, refId: plano.id })
    res.json({ ok: true })
  }))

  // Professor: adaptações dos seus alunos (SEM diagnóstico/laudo).
  router.get('/aee/minhas-adaptacoes', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const uid = getUserId(req)
    const itens = await prisma.apoAdaptacao.findMany({ where: { tenantId, professorUserId: uid, ativo: true, plano: { status: 'VIGENTE', vigenciaFim: { gte: new Date() } } }, include: { plano: { select: { studentId: true, vigenciaFim: true } } }, orderBy: { createdAt: 'desc' } })
    const alunos = await nomesAlunos(tenantId, itens.map((i) => i.plano.studentId))
    res.json(itens.map((a) => ({ id: a.id, tipo: a.tipo, descricao: a.descricao, tempoExtraPercent: a.tempoExtraPercent, disciplineId: a.disciplineId, classSectionId: a.classSectionId, vigenciaFim: a.plano.vigenciaFim, cienteEm: a.cienteEm, aluno: alunos[a.plano.studentId], studentId: a.plano.studentId })))
  }))

  router.post('/aee/adaptacoes/:id/ciencia', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const ad = await prisma.apoAdaptacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!ad || ad.professorUserId !== getUserId(req)) throw httpError(404, 'Adaptação não encontrada.')
    await prisma.apoAdaptacao.update({ where: { id: ad.id }, data: { cienteEm: new Date() } })
    await cancelReminders({ tenantId, refType: 'ApoAdaptacao', refId: ad.id })
    res.json({ ok: true })
  }))

  // Consumo por notas/provas/calendário: adaptações vigentes de um aluno (professor da turma, equipe).
  router.get('/aee/alunos/:studentId/adaptacoes-vigentes', requireRole('SUPPORT', 'COORDINATOR', 'TEACHER', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await adaptacoesVigentesDoAluno(tid(req), String(req.params.studentId), qs(req.query.classSectionId)))
  }))
}

// Exportada: usada por provas/notas para aplicar tempo extra etc.
export async function adaptacoesVigentesDoAluno(tenantId: string, studentId: string, classSectionId?: string, agora = new Date()) {
  const itens = await prisma.apoAdaptacao.findMany({
    where: { tenantId, ativo: true, plano: { studentId, status: 'VIGENTE', vigenciaInicio: { lte: agora }, vigenciaFim: { gte: agora } }, ...(classSectionId ? { OR: [{ classSectionId }, { classSectionId: null }] } : {}) },
    select: { id: true, tipo: true, descricao: true, tempoExtraPercent: true, disciplineId: true, classSectionId: true },
  })
  return itens
}
