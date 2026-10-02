import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, dateISO, qs } from '../core/crud'
import { notify, audit } from '../core/notify'
import { scheduleReminder } from '../core/reminders'
import { MOD, DOCENTE, httpErr, isStudent, nomesAlunos } from './common'
import { desempenhoEixos } from './analise'
import { priorizarLacunas, gerarPlanoSemanal, projetarTendencia, round } from './logic'

const router = Router()
const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().nullable()
const DAY = 86_400_000

function alvoStudent(req: AuthenticatedRequest, bodyId?: string | null): string {
  if (isStudent(req)) { if (!req.user?.studentId) throw httpErr(403, 'Usuário não vinculado a um aluno.'); return req.user.studentId }
  if (!bodyId) throw httpErr(400, 'Informe studentId.')
  return bodyId
}
async function trilhaAcessivel(req: AuthenticatedRequest, id: string) {
  const t = await prisma.desTrilha.findFirst({ where: { id, tenantId: getTenantId(req) } })
  if (!t) throw httpErr(404, 'Trilha não encontrada.')
  if (isStudent(req) && t.studentId !== req.user?.studentId) throw httpErr(403, 'Trilha de outro aluno.')
  return t
}

// Calcula lacunas do aluno (última tentativa por eixo) + monta itens do plano
async function planejar(tenantId: string, studentId: string, exameId: string, meta: number, metaData: Date | null, horasSemana: number, inicio = new Date()) {
  const d = await desempenhoEixos(tenantId, exameId, [studentId])
  // a meta da trilha sobrescreve a meta do eixo quando for mais ambiciosa
  const lacunas = priorizarLacunas(d.eixos.map((e) => ({ ...e, meta: Math.max(e.meta, meta) })))
  const semanasMax = metaData ? Math.max(1, Math.ceil((metaData.getTime() - inicio.getTime()) / (7 * DAY))) : 8
  const semanas = Math.min(26, semanasMax)
  const nomes = new Map(d.eixos.map((e) => [e.eixoId, e.nome ?? e.eixoId]))
  const plano = gerarPlanoSemanal(lacunas, { inicio, semanas, horasSemana, eixoNome: (id) => nomes.get(id) ?? id })
  return { lacunas, plano, diagnosticoPendente: d.amostra === 0, semanas }
}

router.post('/trilhas', requireRole('STUDENT', ...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ studentId: opt(z.string()), exameId: z.string(), metaPercentual: z.number().min(10).max(100).default(60), metaData: opt(dateISO()), horasSemana: z.number().min(1).max(40).default(6) }), req.body)
  const studentId = alvoStudent(req, b.studentId)
  if (!(await prisma.student.findFirst({ where: { id: studentId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Aluno não encontrado.')
  if (!(await prisma.desExame.findFirst({ where: { id: b.exameId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Exame não encontrado.')
  if (b.metaData && b.metaData.getTime() < Date.now() + 7 * DAY) throw httpErr(400, 'A data-alvo deve estar a pelo menos 7 dias.')
  if (await prisma.desTrilha.count({ where: { tenantId, studentId, exameId: b.exameId, status: { in: ['ATIVA', 'PAUSADA'] } } })) throw httpErr(409, 'Já existe uma trilha ativa para este exame; use /regenerar.')
  const p = await planejar(tenantId, studentId, b.exameId, b.metaPercentual, b.metaData ?? null, b.horasSemana)
  const trilha = await prisma.desTrilha.create({
    data: { tenantId, studentId, exameId: b.exameId, metaPercentual: b.metaPercentual, metaData: b.metaData ?? undefined, horasSemana: b.horasSemana, lacunas: p.lacunas as any,
      itens: { create: p.plano.map((i) => ({ tenantId, eixoId: i.eixoId || undefined, semana: i.semana, tipo: i.tipo, titulo: i.titulo, minutos: i.minutos, dataPrevista: i.dataPrevista, revisaoN: i.revisaoN })) } },
    include: { itens: true },
  })
  if (b.metaData) await scheduleReminder({ tenantId, modulo: MOD, titulo: 'Data-alvo da sua trilha de preparação', dueAt: b.metaData, antecedenciaDias: 7, assigneeStudentId: studentId, refType: 'DesTrilha', refId: trilha.id, dedupeKey: `des:tr:${trilha.id}:meta` })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_TRILHA', refType: 'DesTrilha', refId: trilha.id, detalhes: { itens: p.plano.length } })
  res.status(201).json({ trilha, diagnosticoPendente: p.diagnosticoPendente, recomendacao: p.diagnosticoPendente ? 'Nenhum simulado realizado: faça um simulado diagnóstico e regenere a trilha para priorizar com dados reais.' : undefined })
}))

router.get('/trilhas', requireRole('STUDENT', ...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const where: any = { tenantId }
  if (isStudent(req)) where.studentId = req.user?.studentId ?? '__none__'
  else if (qs(req.query.studentId)) where.studentId = qs(req.query.studentId)
  for (const f of ['exameId', 'status']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
  const items = await prisma.desTrilha.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
  const nomes = await nomesAlunos(tenantId, items.map((i) => i.studentId))
  res.json({ items: items.map((i) => ({ ...i, aluno: nomes.get(i.studentId) ?? null })) })
}))

router.get('/trilhas/:id', requireRole('STUDENT', ...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const t = await trilhaAcessivel(req, String(req.params.id))
  const itens = await prisma.desTrilhaItem.findMany({ where: { trilhaId: t.id }, orderBy: { dataPrevista: 'asc' } })
  const semanas: Record<number, typeof itens> = {}
  for (const i of itens) (semanas[i.semana] ??= []).push(i)
  res.json({ ...t, itens, semanas })
}))

router.patch('/trilhas/:id', requireRole('STUDENT', ...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const t = await trilhaAcessivel(req, String(req.params.id))
  const b = parseBody(z.object({ metaPercentual: z.number().min(10).max(100), metaData: opt(dateISO()), horasSemana: z.number().min(1).max(40), status: z.enum(['ATIVA', 'PAUSADA', 'CANCELADA']) }).partial(), req.body)
  res.json(await prisma.desTrilha.update({ where: { id: t.id }, data: b as any }))
}))

// Regenera o plano com os resultados mais recentes: preserva itens concluídos, recria os pendentes.
router.post('/trilhas/:id/regenerar', requireRole('STUDENT', ...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const t = await trilhaAcessivel(req, String(req.params.id))
  if (t.status === 'CANCELADA' || t.status === 'CONCLUIDA') throw httpErr(409, 'Trilha finalizada.')
  const p = await planejar(tenantId, t.studentId, t.exameId, t.metaPercentual, t.metaData, t.horasSemana)
  await prisma.$transaction([
    prisma.desTrilhaItem.deleteMany({ where: { trilhaId: t.id, status: { not: 'CONCLUIDO' } } }),
    prisma.desTrilhaItem.createMany({ data: p.plano.map((i) => ({ tenantId, trilhaId: t.id, eixoId: i.eixoId || undefined, semana: i.semana, tipo: i.tipo, titulo: i.titulo, minutos: i.minutos, dataPrevista: i.dataPrevista, revisaoN: i.revisaoN })) }),
    prisma.desTrilha.update({ where: { id: t.id }, data: { lacunas: p.lacunas as any, geradaEm: new Date() } }),
  ])
  await recalcProgresso(t.id)
  res.json({ regenerada: true, itens: p.plano.length, lacunas: p.lacunas.filter((l) => l.gap > 0).slice(0, 5), diagnosticoPendente: p.diagnosticoPendente })
}))

async function recalcProgresso(trilhaId: string) {
  const [tot, ok] = await Promise.all([prisma.desTrilhaItem.count({ where: { trilhaId } }), prisma.desTrilhaItem.count({ where: { trilhaId, status: 'CONCLUIDO' } })])
  const progresso = tot ? round((ok / tot) * 100) : 0
  await prisma.desTrilha.update({ where: { id: trilhaId }, data: { progresso, ...(tot && ok === tot ? { status: 'CONCLUIDA' } : {}) } })
  return progresso
}

async function itemAcessivel(req: AuthenticatedRequest, id: string) {
  const it = await prisma.desTrilhaItem.findFirst({ where: { id, tenantId: getTenantId(req) } })
  if (!it) throw httpErr(404, 'Item não encontrado.')
  await trilhaAcessivel(req, it.trilhaId)
  return it
}
router.post('/trilhas/itens/:id/concluir', requireRole('STUDENT', ...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const it = await itemAcessivel(req, String(req.params.id))
  if (it.status === 'CONCLUIDO') throw httpErr(409, 'Item já concluído.')
  await prisma.desTrilhaItem.update({ where: { id: it.id }, data: { status: 'CONCLUIDO', concluidoEm: new Date() } })
  await prisma.eduReminder.updateMany({ where: { tenantId: it.tenantId, dedupeKey: `des:tr:item:${it.id}`, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: 'CONCLUIDO', concluidoEm: new Date() } })
  res.json({ progresso: await recalcProgresso(it.trilhaId) })
}))
router.post('/trilhas/itens/:id/adiar', requireRole('STUDENT', ...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const it = await itemAcessivel(req, String(req.params.id))
  const dias = Math.min(14, Math.max(1, Number(req.body?.dias) || 2))
  if (it.status === 'CONCLUIDO') throw httpErr(409, 'Item já concluído.')
  res.json(await prisma.desTrilhaItem.update({ where: { id: it.id }, data: { status: 'ADIADO', dataPrevista: new Date(it.dataPrevista.getTime() + dias * DAY) } }))
}))

// Progresso x meta: atual (último simulado) vs meta, tendência e atraso do plano
router.get('/trilhas/:id/progresso', requireRole('STUDENT', ...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const t = await trilhaAcessivel(req, String(req.params.id))
  const [itens, tent] = await Promise.all([
    prisma.desTrilhaItem.findMany({ where: { trilhaId: t.id } }),
    prisma.desTentativa.findMany({ where: { tenantId, studentId: t.studentId, status: { in: ['ENVIADA', 'EXPIRADA'] }, simulado: { exameId: t.exameId } }, orderBy: { enviadaEm: 'asc' }, select: { percentual: true, enviadaEm: true } }),
  ])
  const agora = new Date()
  const vencidos = itens.filter((i) => i.status !== 'CONCLUIDO' && i.dataPrevista < agora)
  const serie = tent.map((x) => x.percentual ?? 0)
  const atual = serie.length ? serie[serie.length - 1] : null
  res.json({
    progressoPlano: t.progresso, itensTotal: itens.length, concluidos: itens.filter((i) => i.status === 'CONCLUIDO').length, atrasados: vencidos.length,
    minutosEstudados: itens.filter((i) => i.status === 'CONCLUIDO').reduce((s, i) => s + i.minutos, 0),
    meta: t.metaPercentual, atual, faltamPontos: atual == null ? null : Math.max(0, round(t.metaPercentual - atual)), serie, projecaoProximoSimulado: projetarTendencia(serie), estimativa: true,
    situacao: atual == null ? 'SEM_DIAGNOSTICO' : atual >= t.metaPercentual ? 'META_ATINGIDA' : vencidos.length > 3 ? 'PLANO_ATRASADO' : 'EM_ANDAMENTO',
  })
}))

// Job: lembretes dos itens da trilha para os próximos 2 dias + alerta de plano atrasado
export async function lembrarItensTrilha(now = new Date()) {
  const itens = await prisma.desTrilhaItem.findMany({ where: { status: { in: ['PENDENTE', 'ADIADO'] }, dataPrevista: { gte: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + 2 * DAY) }, trilha: { status: 'ATIVA' } }, include: { trilha: { select: { studentId: true } } }, take: 2000 })
  let criados = 0
  for (const i of itens) {
    await scheduleReminder({ tenantId: i.tenantId, modulo: MOD, titulo: `Trilha de preparação: ${i.titulo} (${i.minutos} min)`, dueAt: new Date(i.dataPrevista.getTime() + DAY), remindAt: i.dataPrevista < now ? now : i.dataPrevista, assigneeStudentId: i.trilha.studentId, refType: 'DesTrilhaItem', refId: i.id, dedupeKey: `des:tr:item:${i.id}` })
    criados++
  }
  return { lembretes: criados }
}
export async function alertarTrilhasAtrasadas(now = new Date()) {
  const trilhas = await prisma.desTrilha.findMany({ where: { status: 'ATIVA' }, select: { id: true, tenantId: true, studentId: true, itens: { where: { status: { not: 'CONCLUIDO' }, dataPrevista: { lt: new Date(now.getTime() - 7 * DAY) } }, select: { id: true } } }, take: 2000 })
  let alertas = 0
  for (const t of trilhas.filter((x) => x.itens.length >= 4)) {
    const sem = `${now.getUTCFullYear()}-${Math.floor(now.getTime() / (7 * DAY))}`
    const key = `des:tr:${t.id}:atraso:${sem}`
    if (await prisma.eduNotification.count({ where: { tenantId: t.tenantId, refType: 'DesTrilha', refId: t.id, templateKey: key } })) continue
    await notify({ tenantId: t.tenantId, studentId: t.studentId, assunto: 'Sua trilha de preparação está atrasada', mensagem: `Você tem ${t.itens.length} atividades da trilha com mais de 7 dias de atraso. Ajuste o plano (adiar/regenerar) para voltar ao ritmo.`, refType: 'DesTrilha', refId: t.id, templateKey: key })
    alertas++
  }
  return { alertas }
}

export default router
