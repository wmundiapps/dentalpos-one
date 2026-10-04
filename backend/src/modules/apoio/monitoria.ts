import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getUserId, requireRole } from '../academico/middleware'
import { dateISO, mountCrud, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { ALUNO, APOIO, APOIO_COORD, DOCENTE, MODULO, alunoAlvo, carregarAluno, hasRole, httpError, nomesAlunos, tid, scheduleReminder } from './common'
import { addDays, addBusinessDays, pontuacaoMonitoria } from './logic'
import { desempenhoAluno } from './metricas'

const GEST: any[] = ['SUPPORT', 'COORDINATOR', 'TEACHER']

const vagaSchema = z.object({
  disciplineId: z.string(), termId: z.string().optional(), professorUserId: z.string(),
  vagas: z.number().int().min(1).max(50).default(1), cargaHorariaSemanal: z.number().int().min(1).max(20).default(8),
  programaBolsaId: z.string().optional(), mediaMinima: z.number().min(0).max(10).default(7), requisitos: z.string().max(2000).optional(),
  inscricaoInicio: dateISO().optional(), inscricaoFim: dateISO().optional(),
})

export function mountMonitoria(router: Router) {
  mountCrud(router, {
    model: 'apoMonitoriaVaga', path: '/monitoria/vagas', read: GEST, write: ['SUPPORT', 'COORDINATOR'], create: vagaSchema, filters: ['status', 'disciplineId', 'professorUserId'], modulo: MODULO,
    readAll: true,
    beforeCreate: async (d: any, req: AuthenticatedRequest) => {
      const tenantId = tid(req)
      if (!(await prisma.discipline.findFirst({ where: { id: d.disciplineId, tenantId }, select: { id: true } }))) throw httpError(404, 'Disciplina não encontrada.')
      if (d.inscricaoInicio && d.inscricaoFim && d.inscricaoFim <= d.inscricaoInicio) throw httpError(400, 'Período de inscrição inválido.')
      return d
    },
  })

  router.post('/monitoria/vagas/:id/abrir', requireRole('SUPPORT', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const v = await prisma.apoMonitoriaVaga.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!v) throw httpError(404, 'Vaga não encontrada.')
    if (v.status !== 'RASCUNHO') throw httpError(409, 'Somente rascunhos podem ser abertos.')
    if (!v.inscricaoFim) throw httpError(422, 'Defina o fim das inscrições antes de abrir.')
    const upd = await prisma.apoMonitoriaVaga.update({ where: { id: v.id }, data: { status: 'ABERTA' } })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Encerrar inscrições e selecionar monitor', dueAt: v.inscricaoFim, antecedenciaDias: 0, assigneeUserId: v.professorUserId, refType: 'ApoMonitoriaVaga', refId: v.id, severity: 'ATENCAO', dedupeKey: `apo-mon-sel-${v.id}` })
    res.json(upd)
  }))

  router.post('/monitoria/vagas/:id/candidatar', requireRole(...ALUNO, 'SUPPORT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const studentId = alunoAlvo(req, req.body?.studentId)
    await carregarAluno(tenantId, studentId)
    const v = await prisma.apoMonitoriaVaga.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!v) throw httpError(404, 'Vaga não encontrada.')
    const agora = new Date()
    if (v.status !== 'ABERTA') throw httpError(422, 'Vaga não está aberta a inscrições.')
    if (v.inscricaoInicio && agora < v.inscricaoInicio) throw httpError(422, 'Inscrições ainda não iniciadas.')
    if (v.inscricaoFim && agora > v.inscricaoFim) throw httpError(422, 'Inscrições encerradas.')
    // Nota do aluno na disciplina (NtResultado, tolerante)
    let notaDisciplina: number | null = null
    try { const r = await (prisma as any).ntResultado.findFirst({ where: { tenantId, studentId, disciplineId: v.disciplineId }, orderBy: { calculadoEm: 'desc' } }); notaDisciplina = r?.mediaFinal ?? r?.mediaParcial ?? null } catch { /* sem módulo notas */ }
    if (notaDisciplina != null && notaDisciplina < v.mediaMinima) throw httpError(422, `Nota na disciplina (${notaDisciplina}) abaixo do mínimo exigido (${v.mediaMinima}).`)
    const ativos = await prisma.apoMonitor.count({ where: { tenantId, studentId, status: 'ATIVO' } })
    if (ativos >= 2) throw httpError(422, 'Limite de 2 monitorias simultâneas atingido.')
    const c = await prisma.apoMonitoriaCandidatura.create({ data: { tenantId, vagaId: v.id, studentId, notaDisciplina, pontuacao: pontuacaoMonitoria(notaDisciplina, null) } })
    await notify({ tenantId, userId: v.professorUserId, assunto: 'Nova candidatura à monitoria', mensagem: 'Um aluno se candidatou à sua vaga de monitoria.', refType: 'ApoMonitoriaVaga', refId: v.id })
    res.status(201).json(c)
  }))

  router.get('/monitoria/vagas/:id/candidaturas', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const v = await prisma.apoMonitoriaVaga.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!v) throw httpError(404, 'Vaga não encontrada.')
    if (req.user?.role === 'TEACHER' && v.professorUserId !== req.user.id) throw httpError(403, 'Vaga de outro professor.')
    const items = await prisma.apoMonitoriaCandidatura.findMany({ where: { tenantId, vagaId: v.id }, orderBy: { pontuacao: 'desc' } })
    const al = await nomesAlunos(tenantId, items.map((i) => i.studentId))
    res.json(items.map((i) => ({ ...i, aluno: al[i.studentId] })))
  }))

  router.post('/monitoria/candidaturas/:id/entrevista', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ nota: z.number().min(0).max(10) }), req.body)
    const c = await prisma.apoMonitoriaCandidatura.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) throw httpError(404, 'Candidatura não encontrada.')
    res.json(await prisma.apoMonitoriaCandidatura.update({ where: { id: c.id }, data: { notaEntrevista: b.nota, pontuacao: pontuacaoMonitoria(c.notaDisciplina, b.nota) } }))
  }))

  // Seleção: ordena por pontuação; os N melhores viram monitores, o resto suplente. Exige entrevista para todos.
  router.post('/monitoria/vagas/:id/selecionar', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const v = await prisma.apoMonitoriaVaga.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!v) throw httpError(404, 'Vaga não encontrada.')
    if (req.user?.role === 'TEACHER' && v.professorUserId !== req.user.id) throw httpError(403, 'Vaga de outro professor.')
    if (!['ABERTA', 'EM_SELECAO'].includes(v.status)) throw httpError(409, `Vaga ${v.status}.`)
    const cands = await prisma.apoMonitoriaCandidatura.findMany({ where: { tenantId, vagaId: v.id, status: 'INSCRITA' }, orderBy: { pontuacao: 'desc' } })
    if (!cands.length) throw httpError(422, 'Sem candidaturas para selecionar.')
    if (cands.some((c) => c.notaEntrevista == null) && !req.body?.semEntrevista) throw httpError(422, 'Registre a nota de entrevista de todos (ou envie semEntrevista=true).')
    const ocupadas = await prisma.apoMonitor.count({ where: { tenantId, vagaId: v.id, status: 'ATIVO' } })
    const livres = Math.max(0, v.vagas - ocupadas)
    const sel = cands.slice(0, livres), sup = cands.slice(livres)
    const inicio = new Date()
    for (const c of sel) {
      await prisma.apoMonitoriaCandidatura.update({ where: { id: c.id }, data: { status: 'SELECIONADA' } })
      await prisma.apoMonitor.create({ data: { tenantId, vagaId: v.id, studentId: c.studentId, inicio, horasMeta: v.cargaHorariaSemanal * 18 } })
      await notify({ tenantId, studentId: c.studentId, assunto: 'Você foi selecionado(a) para monitoria', mensagem: 'Parabéns! Procure o professor orientador para iniciar as atividades e registre sua frequência no sistema.', refType: 'ApoMonitoriaVaga', refId: v.id })
    }
    for (const c of sup) {
      await prisma.apoMonitoriaCandidatura.update({ where: { id: c.id }, data: { status: 'SUPLENTE' } })
      await notify({ tenantId, studentId: c.studentId, assunto: 'Resultado da seleção de monitoria', mensagem: 'Você ficou como suplente na seleção de monitoria.', refType: 'ApoMonitoriaVaga', refId: v.id })
    }
    const total = ocupadas + sel.length
    await prisma.apoMonitoriaVaga.update({ where: { id: v.id }, data: { status: total >= v.vagas ? 'PREENCHIDA' : 'EM_SELECAO' } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'MONITORIA_SELECAO', refType: 'ApoMonitoriaVaga', refId: v.id })
    res.json({ selecionados: sel.map((c) => c.studentId), suplentes: sup.map((c) => c.studentId) })
  }))

  // Frequência: monitor lança; professor orientador valida (limite diário de 8h e semanal da vaga).
  router.post('/monitoria/monitores/:id/frequencia', requireRole(...ALUNO, 'SUPPORT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.apoMonitor.findFirst({ where: { id: String(req.params.id), tenantId }, include: { vaga: true } })
    if (!m || m.status !== 'ATIVO') throw httpError(404, 'Monitoria ativa não encontrada.')
    if (req.user?.role === 'STUDENT' && m.studentId !== req.user.studentId) throw httpError(403, 'Não é o seu registro.')
    const b = parseBody(z.object({ data: dateISO(), horas: z.number().min(0.25).max(8), atividade: z.string().min(3).max(500) }), req.body)
    if (b.data > addDays(new Date(), 1)) throw httpError(422, 'Não é possível lançar frequência futura.')
    if (b.data < addDays(new Date(), -30)) throw httpError(422, 'Lançamento retroativo máximo de 30 dias.')
    const ini = new Date(b.data); ini.setUTCDate(ini.getUTCDate() - ((ini.getUTCDay() + 6) % 7)); ini.setUTCHours(0, 0, 0, 0)
    const sem = await prisma.apoMonitoriaFrequencia.aggregate({ where: { tenantId, monitorId: m.id, data: { gte: ini, lt: addDays(ini, 7) } }, _sum: { horas: true } })
    if ((sem._sum.horas ?? 0) + b.horas > m.vaga.cargaHorariaSemanal) throw httpError(422, `Excede a carga semanal da monitoria (${m.vaga.cargaHorariaSemanal}h).`)
    const f = await prisma.apoMonitoriaFrequencia.create({ data: { tenantId, monitorId: m.id, ...b } })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Validar frequência de monitor', dueAt: addBusinessDays(new Date(), 5), assigneeUserId: m.vaga.professorUserId, refType: 'ApoMonitoriaFrequencia', refId: f.id, dedupeKey: `apo-mon-freq-${f.id}` })
    res.status(201).json(f)
  }))

  router.post('/monitoria/frequencias/:id/validar', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const f = await prisma.apoMonitoriaFrequencia.findFirst({ where: { id: String(req.params.id), tenantId }, include: { monitor: { include: { vaga: true } } } })
    if (!f) throw httpError(404, 'Registro não encontrado.')
    if (req.user?.role === 'TEACHER' && f.monitor.vaga.professorUserId !== req.user.id) throw httpError(403, 'Somente o professor orientador valida.')
    const aprov = req.body?.aprovado !== false
    if (!aprov) { await prisma.apoMonitoriaFrequencia.delete({ where: { id: f.id } }); return res.json({ removido: true }) }
    const { completeReminders } = await import('../core/reminders')
    await completeReminders({ tenantId, refType: 'ApoMonitoriaFrequencia', refId: f.id })
    res.json(await prisma.apoMonitoriaFrequencia.update({ where: { id: f.id }, data: { validado: true, validadoPorId: getUserId(req), validadoEm: new Date() } }))
  }))

  router.get('/monitoria/monitores', requireRole(...GEST, ...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const where: any = { tenantId }
    if (req.user?.role === 'STUDENT') where.studentId = req.user.studentId
    else if (qs(req.query.studentId)) where.studentId = qs(req.query.studentId)
    if (req.user?.role === 'TEACHER') where.vaga = { professorUserId: req.user.id }
    const ms = await prisma.apoMonitor.findMany({ where, include: { vaga: true, frequencias: true }, orderBy: { inicio: 'desc' }, take: 200 })
    const al = await nomesAlunos(tenantId, ms.map((m) => m.studentId))
    res.json(ms.map((m) => ({ ...m, aluno: al[m.studentId], horasValidadas: m.frequencias.filter((f) => f.validado).reduce((s, f) => s + f.horas, 0), horasPendentes: m.frequencias.filter((f) => !f.validado).reduce((s, f) => s + f.horas, 0) })))
  }))

  router.post('/monitoria/monitores/:id/concluir', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.apoMonitor.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) throw httpError(404, 'Monitor não encontrado.')
    const desligar = req.body?.desligar === true
    const upd = await prisma.apoMonitor.update({ where: { id: m.id }, data: { status: desligar ? 'DESLIGADO' : 'CONCLUIDO', fim: new Date() } })
    const h = await prisma.apoMonitoriaFrequencia.aggregate({ where: { tenantId, monitorId: m.id, validado: true }, _sum: { horas: true } })
    await notify({ tenantId, studentId: m.studentId, assunto: desligar ? 'Monitoria encerrada' : 'Monitoria concluída', mensagem: `Total de horas validadas: ${h._sum.horas ?? 0}h (pode ser aproveitada como atividade complementar).` })
    res.json({ ...upd, horasValidadas: h._sum.horas ?? 0 })
  }))
}
