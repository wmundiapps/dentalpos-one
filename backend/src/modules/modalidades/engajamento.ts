import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { parseBody, qs, dateISO } from '../core/crud'
import { notify } from '../core/notify'
import { scheduleReminder, completeReminders } from '../core/reminders'
import { TEACH, getConfig } from './common'
import { calcularRiscoEngajamento, diasEntre } from './rules'

const router = Router()
const TIPOS = ['LOGIN', 'ACESSO_CONTEUDO', 'VIDEO', 'ATIVIDADE_ENTREGUE', 'FORUM', 'AVALIACAO', 'LIVE', 'OUTRO'] as const
const evSchema = z.object({
  studentId: z.string().optional(), classSectionId: z.string().optional().nullable(), disciplineId: z.string().optional().nullable(),
  tipo: z.enum(TIPOS), duracaoSeg: z.number().int().min(0).max(86_400).optional(), refType: z.string().optional(), refId: z.string().optional(), ocorridoEm: dateISO().optional(),
})

// Registro de evento de engajamento (AVA / ContentProgress). Aluno logado registra o seu; staff informa studentId.
router.post('/eventos', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.union([evSchema, z.object({ eventos: z.array(evSchema).min(1).max(500) })]), req.body)
  const lista = 'eventos' in b ? b.eventos : [b]
  const role = req.user?.role
  const rows = lista.map((e) => {
    const studentId = role === 'STUDENT' ? req.user?.studentId : e.studentId
    if (!studentId) throw Object.assign(new Error('studentId obrigatório.'), { status: 400 })
    if (role !== 'STUDENT' && !['COORDINATOR', 'SECRETARY', 'TEACHER', 'SUPPORT', 'STAFF', 'ADMIN', 'OWNER', 'RECTOR', 'BOARD'].includes(String(role))) throw Object.assign(new Error('Sem permissão.'), { status: 403 })
    const ocorridoEm = e.ocorridoEm && e.ocorridoEm.getTime() <= Date.now() + 60_000 ? e.ocorridoEm : new Date()
    return { tenantId, studentId, classSectionId: e.classSectionId, disciplineId: e.disciplineId, tipo: e.tipo, duracaoSeg: e.duracaoSeg ?? 0, refType: e.refType, refId: e.refId, ocorridoEm }
  })
  const r = await prisma.modEngajamentoEvento.createMany({ data: rows })
  // Aluno voltou a acessar: resolve alertas de inatividade.
  const ids = [...new Set(rows.map((x) => x.studentId as string))]
  const resolvidos = await prisma.modAlertaInatividade.updateMany({ where: { tenantId, studentId: { in: ids }, status: 'ABERTO' }, data: { status: 'RESOLVIDO', resolvidoEm: new Date() } })
  for (const sid of ids) if (resolvidos.count) await completeReminders({ tenantId, refType: 'ModInatividade', refId: sid })
  res.status(201).json({ registrados: r.count })
}))

export async function calcularMetricasAluno(tenantId: string, studentId: string, now = new Date(), classSectionId?: string) {
  const desde = new Date(now.getTime() - 30 * 86_400_000)
  const base: any = { tenantId, studentId, ...(classSectionId ? { classSectionId } : {}) }
  const [ult, ev30, semResp] = await Promise.all([
    prisma.modEngajamentoEvento.findFirst({ where: base, orderBy: { ocorridoEm: 'desc' }, select: { ocorridoEm: true } }),
    prisma.modEngajamentoEvento.findMany({ where: { ...base, ocorridoEm: { gte: desde } }, select: { tipo: true, duracaoSeg: true, ocorridoEm: true } }),
    prisma.modAtendimento.count({ where: { tenantId, studentId, status: 'ESCALADO' } }),
  ])
  const dias = new Set(ev30.map((e) => e.ocorridoEm.toISOString().slice(0, 10)))
  const ref = ult?.ocorridoEm ?? null
  return {
    ultimoAcesso: ref,
    diasSemAcesso: ref ? Math.max(0, diasEntre(ref, now)) : 999,
    horas30d: Math.round((ev30.reduce((s, e) => s + e.duracaoSeg, 0) / 3600) * 10) / 10,
    acessos30d: dias.size,
    tarefas30d: ev30.filter((e) => e.tipo === 'ATIVIDADE_ENTREGUE' || e.tipo === 'AVALIACAO').length,
    atendimentosSemResposta: semResp,
  }
}

// Exportada p/ outros módulos (desempenho, jornadas, secretaria): risco de evasão com base no engajamento.
export async function getRiscoEvasaoEngajamento(tenantId: string, studentId: string, persistir = true) {
  const cfg = await getConfig(tenantId)
  const m = await calcularMetricasAluno(tenantId, studentId)
  const r = calcularRiscoEngajamento(m, cfg)
  const data = { ultimoAcesso: m.ultimoAcesso, diasSemAcesso: m.diasSemAcesso === 999 ? 999 : m.diasSemAcesso, horas30d: m.horas30d, acessos30d: m.acessos30d, tarefas30d: m.tarefas30d, score: r.score, nivel: r.nivel, fatores: r.fatores as any, calculadoEm: new Date() }
  if (persistir) await prisma.modEngajamentoResumo.upsert({ where: { tenantId_studentId: { tenantId, studentId } }, create: { tenantId, studentId, ...data }, update: data })
  return { studentId, ...r, metricas: m }
}

router.get('/alunos/:studentId', requireRole('STUDENT', ...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const sid = req.user?.role === 'STUDENT' ? req.user.studentId : String(req.params.studentId)
  if (!sid) return res.status(400).json({ error: 'Aluno não vinculado.' })
  res.json(await getRiscoEvasaoEngajamento(tenantId, sid, req.user?.role !== 'STUDENT'))
}))

// Métricas por turma: desengajados, médias e ranking.
router.get('/turmas/:classSectionId', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const classSectionId = String(req.params.classSectionId)
  const matr = await prisma.classSectionEnrollment.findMany({ where: { classSectionId, classSection: { tenantId } }, include: { enrollment: { select: { studentId: true } } } })
  const studentIds = [...new Set(matr.map((m) => m.enrollment.studentId))]
  const cfg = await getConfig(tenantId)
  const alunos = []
  for (const studentId of studentIds.slice(0, 500)) {
    const m = await calcularMetricasAluno(tenantId, studentId, new Date(), classSectionId)
    alunos.push({ studentId, ...m, risco: calcularRiscoEngajamento(m, cfg) })
  }
  const n = alunos.length || 1
  res.json({
    classSectionId, totalAlunos: studentIds.length,
    mediaHoras30d: Math.round((alunos.reduce((s, a) => s + a.horas30d, 0) / n) * 10) / 10,
    mediaTarefas30d: Math.round((alunos.reduce((s, a) => s + a.tarefas30d, 0) / n) * 10) / 10,
    semAcessoAtencao: alunos.filter((a) => a.diasSemAcesso >= cfg.diasInatividadeAtencao).length,
    semAcessoCritico: alunos.filter((a) => a.diasSemAcesso >= cfg.diasInatividadeCritico).length,
    alunos: alunos.sort((a, b) => b.risco.score - a.risco.score),
  })
}))

router.get('/alertas', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const status = qs(req.query.status) ?? 'ABERTO'
  res.json(await prisma.modAlertaInatividade.findMany({ where: { tenantId, status }, orderBy: [{ diasSemAcesso: 'desc' }], take: 300 }))
}))
router.get('/resumos', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const nivel = qs(req.query.nivel)
  res.json(await prisma.modEngajamentoResumo.findMany({ where: { tenantId, ...(nivel ? { nivel } : {}) }, orderBy: { score: 'desc' }, take: 300 }))
}))

// Job: varre alunos com matrícula ativa em cursos EAD/semipresencial, detecta inatividade, gera alertas e lembretes.
export async function varrerInatividade(now = new Date()) {
  const matriculas = await prisma.enrollment.findMany({
    where: { status: 'ATIVA', program: { modalidade: { in: ['EAD', 'SEMIPRESENCIAL'] } } },
    select: { studentId: true, student: { select: { tenantId: true, status: true } } }, take: 5000,
  })
  const vistos = new Set<string>()
  const cfgs = new Map<string, any>()
  let alertas = 0, avaliados = 0
  for (const m of matriculas) {
    const tenantId = m.student.tenantId
    if (m.student.status !== 'ATIVO' || vistos.has(m.studentId)) continue
    vistos.add(m.studentId)
    avaliados++
    if (!cfgs.has(tenantId)) cfgs.set(tenantId, await getConfig(tenantId))
    const cfg = cfgs.get(tenantId)
    const r = await getRiscoEvasaoEngajamento(tenantId, m.studentId)
    const d = r.metricas.diasSemAcesso
    if (d >= cfg.diasInatividadeAtencao) {
      const nivel = d >= cfg.diasInatividadeCritico ? 'CRITICO' : 'ATENCAO'
      const existente = await prisma.modAlertaInatividade.findFirst({ where: { tenantId, studentId: m.studentId, status: 'ABERTO' } })
      if (!existente || (existente.nivel === 'ATENCAO' && nivel === 'CRITICO')) {
        if (existente) await prisma.modAlertaInatividade.update({ where: { id: existente.id }, data: { nivel, diasSemAcesso: d } })
        else await prisma.modAlertaInatividade.create({ data: { tenantId, studentId: m.studentId, nivel, diasSemAcesso: d } })
        alertas++
        await notify({ tenantId, studentId: m.studentId, assunto: 'Sentimos sua falta no ambiente virtual', mensagem: `Faz ${d === 999 ? 'algum tempo' : d + ' dias'} que você não acessa o AVA. Precisa de ajuda? Fale com seu tutor.`, templateKey: 'mod-inatividade', refType: 'ModInatividade', refId: m.studentId })
        await scheduleReminder({ tenantId, modulo: 'modalidades', titulo: `Aluno inativo no AVA há ${d === 999 ? 'muito tempo' : d + ' dias'} (risco ${r.nivel})`, dueAt: new Date(now.getTime() + 2 * 86_400_000), remindAt: now, severity: nivel === 'CRITICO' ? 'CRITICO' : 'ATENCAO', assigneeRole: 'SUPPORT', refType: 'ModInatividade', refId: m.studentId, dedupeKey: `mod-inat-${m.studentId}-${nivel}` })
      }
    }
  }
  return { avaliados, alertas }
}

export default router
