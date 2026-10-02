import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, dateISO, qs, pageParams } from '../core/crud'
import { scheduleReminder, cancelReminders } from '../core/reminders'
import { notify, audit } from '../core/notify'
import { aplicarCatalogo } from './catalogo'
import { MOD, GESTAO, LEITURA, httpErr, nomesAlunos } from './common'
import { distribuirPorPeso } from './logic'

const router = Router()
const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().nullable()

// ---------- Bootstrap ----------
router.post('/bootstrap', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await aplicarCatalogo(tenantId)
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'BOOTSTRAP', detalhes: r })
  res.json({ ok: true, ...r, mensagem: 'Catálogo de exames (OAB, ENADE por área, ENAMED, Residência, Revalida) garantido.' })
}))

// ---------- CRUD ----------
mountCrud(router, {
  model: 'desExame', path: '/exames', read: LEITURA, write: GESTAO, readAll: true, modulo: MOD,
  create: z.object({
    codigo: z.string().min(2).max(40), nome: z.string().min(3),
    tipo: z.enum(['ENADE', 'OAB_1FASE', 'OAB_2FASE', 'ENAMED', 'RESIDENCIA', 'REVALIDA', 'CONCURSO', 'OUTRO']),
    descricao: opt(z.string()), numQuestoes: opt(z.number().int().positive()), duracaoMin: opt(z.number().int().positive()),
    notaCorte: opt(z.number().min(0).max(100)), ativo: z.boolean().optional(),
  }),
  search: ['nome', 'codigo'], filters: ['tipo', 'ativo'], orderBy: { nome: 'asc' },
})

mountCrud(router, {
  model: 'desEixo', path: '/eixos', read: LEITURA, write: GESTAO, readAll: true, modulo: MOD,
  create: z.object({
    exameId: z.string(), parentId: opt(z.string()), codigo: z.string().min(1).max(40), nome: z.string().min(2),
    tipo: z.enum(['AREA', 'EIXO', 'COMPETENCIA']).optional(), peso: z.number().min(0).optional(),
    metaAcerto: z.number().min(0).max(100).optional(), ordem: z.number().int().optional(), descricao: opt(z.string()), ativo: z.boolean().optional(),
  }),
  filters: ['exameId', 'tipo', 'ativo'], search: ['nome', 'codigo'], orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
  beforeCreate: async (d, req) => {
    const ex = await prisma.desExame.findFirst({ where: { id: d.exameId, tenantId: getTenantId(req) } })
    if (!ex) throw httpErr(404, 'Exame não encontrado.')
  },
})

const edicaoSchema = z.object({
  exameId: z.string(), ano: z.number().int().min(2000).max(2100), titulo: z.string().optional(),
  dataProva: opt(dateISO()), inscricaoInicio: opt(dateISO()), inscricaoFim: opt(dateISO()), dataResultado: opt(dateISO()),
  status: z.enum(['PLANEJADA', 'INSCRICOES_ABERTAS', 'INSCRICOES_ENCERRADAS', 'REALIZADA', 'RESULTADO_PUBLICADO', 'CANCELADA']).optional(),
  observacoes: opt(z.string()),
})

// Lembretes do calendário do exame (dedupe por edição/marco)
async function agendarMarcos(tenantId: string, ed: any, nomeExame: string) {
  const marcos: Array<[string, Date | null, string, number, 'INFO' | 'ATENCAO' | 'CRITICO']> = [
    ['inscricao', ed.inscricaoFim, `Fim das inscrições — ${nomeExame} ${ed.ano}`, 15, 'ATENCAO'],
    ['prova', ed.dataProva, `Prova — ${nomeExame} ${ed.ano}`, 30, 'ATENCAO'],
    ['resultado', ed.dataResultado, `Divulgação de resultado — ${nomeExame} ${ed.ano}`, 3, 'INFO'],
  ]
  if (['CANCELADA'].includes(ed.status)) { await cancelReminders({ tenantId, refType: 'DesEdicao', refId: ed.id }); return }
  for (const [k, data, titulo, antec, sev] of marcos) {
    if (!data) continue
    for (const role of ['COORDINATOR', 'TEACHER']) {
      await scheduleReminder({ tenantId, modulo: MOD, titulo, dueAt: new Date(data), antecedenciaDias: antec, severity: sev, assigneeRole: role, refType: 'DesEdicao', refId: ed.id, dedupeKey: `des:ed:${ed.id}:${k}:${role}`, recorrenciaDias: k === 'inscricao' ? 7 : undefined })
    }
  }
}
const nomeExame = async (tenantId: string, exameId: string) => (await prisma.desExame.findFirst({ where: { id: exameId, tenantId } }))?.nome ?? 'Exame'

mountCrud(router, {
  model: 'desEdicao', path: '/edicoes', read: LEITURA, write: GESTAO, readAll: true, modulo: MOD, create: edicaoSchema,
  filters: ['exameId', 'ano', 'status'], include: { exame: { select: { nome: true, codigo: true, tipo: true } } }, orderBy: { dataProva: 'desc' },
  beforeCreate: async (d, req) => {
    const ex = await prisma.desExame.findFirst({ where: { id: d.exameId, tenantId: getTenantId(req) } })
    if (!ex) throw httpErr(404, 'Exame não encontrado.')
    if (d.inscricaoInicio && d.inscricaoFim && d.inscricaoFim < d.inscricaoInicio) throw httpErr(400, 'Fim das inscrições anterior ao início.')
  },
  afterCreate: async (row, req) => agendarMarcos(getTenantId(req), row, await nomeExame(getTenantId(req), row.exameId)),
  afterUpdate: async (row, req) => agendarMarcos(getTenantId(req), row, await nomeExame(getTenantId(req), row.exameId)),
})

mountCrud(router, {
  model: 'desMetaCurso', path: '/metas', read: LEITURA, write: GESTAO, modulo: MOD,
  create: z.object({ programId: z.string(), exameId: z.string(), ano: z.number().int(), metaAcerto: z.number().min(0).max(100), conceitoAlvo: opt(z.number().int().min(1).max(5)) }),
  filters: ['programId', 'exameId', 'ano'],
})

// ---------- Matriz do exame (pesos -> distribuição de questões) ----------
router.get('/exames/:id/matriz', requireRole(...LEITURA, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ex = await prisma.desExame.findFirst({ where: { id: String(req.params.id), tenantId }, include: { eixos: { where: { ativo: true }, orderBy: [{ ordem: 'asc' }] } } })
  if (!ex) throw httpErr(404, 'Exame não encontrado.')
  const total = Number(qs(req.query.total)) || ex.numQuestoes || 40
  const dist = distribuirPorPeso(total, ex.eixos.map((e) => ({ id: e.id, peso: e.peso })))
  const somaPeso = ex.eixos.reduce((s, e) => s + e.peso, 0) || 1
  res.json({ exame: { id: ex.id, nome: ex.nome, tipo: ex.tipo }, total, matriz: ex.eixos.map((e) => ({ eixoId: e.id, codigo: e.codigo, nome: e.nome, pesoPercentual: Math.round((e.peso / somaPeso) * 1000) / 10, quantidade: dist[e.id] ?? 0, metaAcerto: e.metaAcerto })) })
}))

// ---------- Inscrições / regularidade ----------
router.get('/edicoes/:id/inscricoes', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId, edicaoId: String(req.params.id) }
  for (const f of ['situacao', 'categoria', 'programId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
  const [rows, total] = await Promise.all([prisma.desInscricao.findMany({ where, skip, take, orderBy: { createdAt: 'asc' } }), prisma.desInscricao.count({ where })])
  const nomes = await nomesAlunos(tenantId, rows.map((r) => r.studentId))
  res.json({ items: rows.map((r) => ({ ...r, aluno: nomes.get(r.studentId) ?? null })), total, page, pageSize })
}))

// Gera a lista de ingressantes/concluintes de um curso (heurística por data de matrícula — conferir antes de enviar ao INEP)
router.post('/edicoes/:id/gerar-inscritos', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({
    programId: z.string(), categoria: z.enum(['INGRESSANTE', 'CONCLUINTE', 'CANDIDATO']).default('CONCLUINTE'),
    mesesMinimosConcluinte: z.number().int().min(0).default(24), studentIds: z.array(z.string()).optional(),
  }), req.body)
  const ed = await prisma.desEdicao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!ed) throw httpErr(404, 'Edição não encontrada.')
  const prog = await prisma.academicProgram.findFirst({ where: { id: b.programId, tenantId } })
  if (!prog) throw httpErr(404, 'Curso não encontrado.')
  const ref = ed.dataProva ?? new Date(`${ed.ano}-12-31`)
  const limiteIng = new Date(ref.getTime() - 365 * 86_400_000)
  const limiteConc = new Date(ref.getTime() - b.mesesMinimosConcluinte * 30 * 86_400_000)
  const enr = await prisma.enrollment.findMany({
    where: { programId: b.programId, student: { tenantId }, ...(b.studentIds ? { studentId: { in: b.studentIds } } : {}),
      ...(b.categoria === 'INGRESSANTE' ? { status: 'ATIVA', dataMatricula: { gte: limiteIng } } : b.categoria === 'CONCLUINTE' ? { status: { in: ['ATIVA', 'CONCLUIDA'] }, dataMatricula: { lte: limiteConc } } : {}) },
    select: { studentId: true },
  })
  const ids = [...new Set(enr.map((e) => e.studentId))]
  const exist = new Set((await prisma.desInscricao.findMany({ where: { edicaoId: ed.id, studentId: { in: ids } }, select: { studentId: true } })).map((x) => x.studentId))
  const novos = ids.filter((i) => !exist.has(i))
  if (novos.length) await prisma.desInscricao.createMany({ data: novos.map((studentId) => ({ tenantId, edicaoId: ed.id, studentId, programId: b.programId, categoria: b.categoria, situacao: 'PENDENTE' as const })) })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'GERAR_INSCRITOS', refType: 'DesEdicao', refId: ed.id, detalhes: { criados: novos.length } })
  res.json({ criados: novos.length, jaExistiam: exist.size, aviso: 'Lista gerada por critério interno (data de matrícula); valide com o regulatório antes de enviar ao INEP.' })
}))

router.post('/edicoes/:id/inscricoes', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ studentId: z.string(), programId: opt(z.string()), categoria: z.enum(['INGRESSANTE', 'CONCLUINTE', 'CANDIDATO']).optional(), situacao: z.enum(['PENDENTE', 'INSCRITO', 'REGULAR', 'DISPENSADO', 'IRREGULAR', 'AUSENTE']).optional(), protocolo: opt(z.string()) }), req.body)
  const ed = await prisma.desEdicao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!ed) throw httpErr(404, 'Edição não encontrada.')
  const st = await prisma.student.findFirst({ where: { id: b.studentId, tenantId } })
  if (!st) throw httpErr(404, 'Aluno não encontrado.')
  const row = await prisma.desInscricao.upsert({
    where: { edicaoId_studentId: { edicaoId: ed.id, studentId: b.studentId } },
    create: { tenantId, edicaoId: ed.id, studentId: b.studentId, programId: b.programId ?? undefined, categoria: b.categoria, situacao: b.situacao, protocolo: b.protocolo ?? undefined },
    update: { programId: b.programId ?? undefined, categoria: b.categoria, situacao: b.situacao, protocolo: b.protocolo ?? undefined },
  })
  res.status(201).json(row)
}))

const SITUACOES = ['PENDENTE', 'INSCRITO', 'REGULAR', 'DISPENSADO', 'IRREGULAR', 'AUSENTE'] as const
router.patch('/inscricoes/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ situacao: z.enum(SITUACOES).optional(), protocolo: opt(z.string()), nota: opt(z.number().min(0).max(100)), conceito: opt(z.number().int().min(1).max(5)), observacao: opt(z.string()) }), req.body)
  const cur = await prisma.desInscricao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!cur) throw httpErr(404, 'Inscrição não encontrada.')
  if ((b.situacao === 'INSCRITO' || b.situacao === 'REGULAR') && !(b.protocolo ?? cur.protocolo)) throw httpErr(400, 'Informe o protocolo/comprovante para marcar como inscrito/regular.')
  const row = await prisma.desInscricao.update({ where: { id: cur.id }, data: b as any })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ATUALIZAR_INSCRICAO', refType: 'DesInscricao', refId: cur.id, detalhes: { de: cur.situacao, para: b.situacao } })
  res.json(row)
}))

router.post('/edicoes/:id/inscricoes/lote', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ ids: z.array(z.string()).min(1).max(1000), situacao: z.enum(SITUACOES) }), req.body)
  const r = await prisma.desInscricao.updateMany({ where: { tenantId, edicaoId: String(req.params.id), id: { in: b.ids } }, data: { situacao: b.situacao } })
  res.json({ atualizados: r.count })
}))

async function pendencias(tenantId: string, edicaoId: string) {
  const ed = await prisma.desEdicao.findFirst({ where: { id: edicaoId, tenantId }, include: { exame: true } })
  if (!ed) throw httpErr(404, 'Edição não encontrada.')
  const pend = await prisma.desInscricao.findMany({ where: { tenantId, edicaoId, situacao: { in: ['PENDENTE', 'IRREGULAR'] } } })
  const nomes = await nomesAlunos(tenantId, pend.map((p) => p.studentId))
  const diasRestantes = ed.inscricaoFim ? Math.ceil((ed.inscricaoFim.getTime() - Date.now()) / 86_400_000) : null
  return { ed, pend, nomes, diasRestantes }
}

router.get('/edicoes/:id/pendencias', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { ed, pend, nomes, diasRestantes } = await pendencias(getTenantId(req), String(req.params.id))
  res.json({ edicaoId: ed.id, exame: ed.exame.nome, ano: ed.ano, diasRestantes, urgencia: diasRestantes == null ? null : diasRestantes < 0 ? 'ENCERRADO' : diasRestantes <= 7 ? 'CRITICO' : diasRestantes <= 15 ? 'ATENCAO' : 'NORMAL', total: pend.length, items: pend.map((p) => ({ ...p, aluno: nomes.get(p.studentId) ?? null })) })
}))

router.post('/edicoes/:id/notificar-pendentes', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { ed, pend, nomes, diasRestantes } = await pendencias(tenantId, String(req.params.id))
  let enviados = 0
  for (const p of pend) {
    const al = nomes.get(p.studentId)
    await notify({ tenantId, studentId: p.studentId, userId: al?.userId, assunto: `Regularize sua inscrição — ${ed.exame.nome} ${ed.ano}`, mensagem: `Olá${al ? ', ' + al.nome.split(' ')[0] : ''}! Sua inscrição no ${ed.exame.nome} ${ed.ano} está ${p.situacao === 'IRREGULAR' ? 'irregular' : 'pendente'}.${diasRestantes != null && diasRestantes >= 0 ? ` Restam ${diasRestantes} dia(s).` : ''} Procure a coordenação do curso.`, refType: 'DesInscricao', refId: p.id, templateKey: 'des.inscricao.pendente' })
    enviados++
  }
  res.json({ notificados: enviados })
}))

router.get('/edicoes/:id/resumo', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const g = await prisma.desInscricao.groupBy({ by: ['situacao', 'categoria', 'programId'], where: { tenantId, edicaoId: String(req.params.id) }, _count: { _all: true } })
  const por = (k: 'situacao' | 'categoria') => g.reduce((m: Record<string, number>, r) => ((m[r[k]] = (m[r[k]] ?? 0) + r._count._all), m), {})
  const total = g.reduce((s, r) => s + r._count._all, 0)
  const ok = g.filter((r) => ['INSCRITO', 'REGULAR', 'DISPENSADO'].includes(r.situacao)).reduce((s, r) => s + r._count._all, 0)
  const cursos: Record<string, { total: number; regulares: number }> = {}
  for (const r of g) {
    const c = (cursos[r.programId ?? 'SEM_CURSO'] ??= { total: 0, regulares: 0 })
    c.total += r._count._all
    if (['INSCRITO', 'REGULAR', 'DISPENSADO'].includes(r.situacao)) c.regulares += r._count._all
  }
  res.json({ total, regularidadePercentual: total ? Math.round((ok / total) * 1000) / 10 : null, porSituacao: por('situacao'), porCategoria: por('categoria'), porCurso: cursos })
}))

export default router
