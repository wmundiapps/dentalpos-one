import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, qs, dateISO } from '../core/crud'
import { audit, notify } from '../core/notify'
import { scheduleReminder, cancelReminders } from '../core/reminders'
import { MANAGE, TEACH, getConfig, conformidadeCurso } from './common'
import { calcularPresencaLive, Modalidade } from './rules'

const MOD = z.enum(['PRESENCIAL', 'SEMIPRESENCIAL', 'EAD', 'HIBRIDO'])
const router = Router()

// ---------- Configuração por tenant ----------
const cfgSchema = z.object({
  maxPctEadPresencial: z.number().min(0).max(100),
  minPctPresencialSemi: z.number().min(0).max(100),
  maxPctEadSemi: z.number().min(0).max(100),
  minEncontrosPresenciaisEad: z.number().int().min(0),
  minAvaliacoesPresenciaisEad: z.number().int().min(0),
  alunosPorTutorEad: z.number().int().min(1),
  alunosPorTutorSemi: z.number().int().min(1),
  slaRespostaHoras: z.number().int().min(1),
  slaUrgenteHoras: z.number().int().min(1),
  diasInatividadeAtencao: z.number().int().min(1),
  diasInatividadeCritico: z.number().int().min(1),
  presencaMinimaLivePct: z.number().min(0).max(100),
  cargaMinimaLato: z.number().int().min(1),
  prazoMaxMesesMestrado: z.number().int().min(1),
  prazoMaxMesesDoutorado: z.number().int().min(1),
  prazoMaxMesesLato: z.number().int().min(1),
  maxOrientandosPorDocente: z.number().int().min(1),
}).partial()

router.get('/config', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await getConfig(getTenantId(req)))
}))
router.put('/config', requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const data = parseBody(cfgSchema, req.body)
  if ((data.diasInatividadeCritico ?? 99) < (data.diasInatividadeAtencao ?? 0)) throw Object.assign(new Error('Dias críticos devem ser maiores que dias de atenção.'), { status: 400 })
  const row = await prisma.modConfig.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data })
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'CONFIG', refType: 'ModConfig', refId: row.id, detalhes: data })
  res.json(row)
}))

// ---------- Conformidade ----------
router.get('/conformidade/programas/:programId', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const mod = qs(req.query.modalidade)
  const r = await conformidadeCurso(tenantId, String(req.params.programId), mod ? (MOD.parse(mod) as Modalidade) : undefined)
  if (qs(req.query.registrar) === 'true') {
    await prisma.modVerificacao.create({ data: { tenantId, programId: r.program.id, modalidade: r.modalidade, conforme: r.conforme, percentualEad: r.percentualEad, resultado: r as any, executadoPorId: getUserId(req) } })
  }
  res.json(r)
}))

// Simulação: dada uma distribuição hipotética, avalia sem gravar.
router.post('/conformidade/simular', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const body = parseBody(z.object({
    modalidade: MOD, cargaHorariaTotal: z.number().optional(), alunos: z.number().int().optional(), tutores: z.number().int().optional(),
    disciplinas: z.array(z.object({ id: z.string(), nome: z.string(), cargaPresencial: z.number().min(0), cargaOnline: z.number().min(0), encontrosPresenciais: z.number().int().optional(), avaliacoesPresenciais: z.number().int().optional() })),
  }), req.body)
  const { avaliarConformidade } = await import('./rules')
  res.json(avaliarConformidade({ ...body, regras: await getConfig(getTenantId(req)) }))
}))

router.get('/conformidade', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const programas = await prisma.academicProgram.findMany({ where: { tenantId }, select: { id: true } })
  const out: any[] = []
  for (const p of programas) {
    try { out.push(await conformidadeCurso(tenantId, p.id)) } catch { /* ignora */ }
  }
  const porModalidade: Record<string, { cursos: number; conformes: number; naoConformes: number }> = {}
  for (const r of out) {
    const m = (porModalidade[r.modalidade] ??= { cursos: 0, conformes: 0, naoConformes: 0 })
    m.cursos++
    r.conforme ? m.conformes++ : m.naoConformes++
  }
  res.json({ resumo: porModalidade, cursos: out.map((r) => ({ programId: r.program.id, nome: r.program.nome, modalidade: r.modalidade, conforme: r.conforme, percentualEad: r.percentualEad, alertas: r.alertas })) })
}))

// ---------- Ofertas por disciplina ----------
const ofertaSchema = z.object({
  disciplineId: z.string().min(1), programId: z.string().optional().nullable(), termId: z.string().optional().nullable(),
  classSectionId: z.string().optional().nullable(), modalidade: MOD,
  cargaPresencial: z.number().int().min(0).default(0), cargaOnline: z.number().int().min(0).default(0),
  diasEncontro: z.any().optional(), minEncontros: z.number().int().min(0).default(0), avaliacoesPresenciais: z.number().int().min(0).default(0),
  poloId: z.string().optional().nullable(), ativo: z.boolean().optional(), observacoes: z.string().optional().nullable(),
})
mountCrud(router, {
  model: 'modOferta', path: '/ofertas', read: [...TEACH, 'STUDENT'], write: [...MANAGE], create: ofertaSchema,
  filters: ['programId', 'termId', 'modalidade', 'disciplineId', 'classSectionId', 'poloId', 'ativo'], modulo: 'modalidades',
  beforeCreate: async (data, req) => validarOferta(getTenantId(req), data),
  beforeUpdate: async (data, req, cur) => { await validarOferta(getTenantId(req), { ...cur, ...data }, true); return data },
})

async function validarOferta(tenantId: string, d: any, _soValidar = false) {
  const disc = await prisma.discipline.findFirst({ where: { id: d.disciplineId, tenantId } })
  if (!disc) throw Object.assign(new Error('Disciplina não encontrada.'), { status: 404 })
  const total = (d.cargaPresencial ?? 0) + (d.cargaOnline ?? 0)
  if (total !== disc.cargaHoraria) throw Object.assign(new Error(`Carga presencial + online (${total}h) deve ser igual à carga da disciplina (${disc.cargaHoraria}h).`), { status: 422 })
  if (d.modalidade === 'PRESENCIAL' && d.cargaOnline > 0) {
    const cfg = await getConfig(tenantId)
    if ((d.cargaOnline / total) * 100 > cfg.maxPctEadPresencial) throw Object.assign(new Error(`Oferta presencial excede ${cfg.maxPctEadPresencial}% de carga online.`), { status: 422 })
  }
  if (d.programId) {
    const p = await prisma.academicProgram.findFirst({ where: { id: d.programId, tenantId } })
    if (!p) throw Object.assign(new Error('Curso não encontrado.'), { status: 404 })
  }
  return d
}

// ---------- Encontros presenciais / provas presenciais ----------
const encSchema = z.object({
  ofertaId: z.string(), tipo: z.enum(['ENCONTRO_PRESENCIAL', 'PROVA_PRESENCIAL', 'AULA_PRATICA', 'DEFESA_TCC', 'OUTRO']),
  titulo: z.string().min(2), inicio: dateISO(), fim: dateISO(), poloId: z.string().optional().nullable(), spaceId: z.string().optional().nullable(),
  calendarEventId: z.string().optional().nullable(), classSessionId: z.string().optional().nullable(), obrigatorio: z.boolean().optional(),
})
mountCrud(router, {
  model: 'modEncontro', path: '/encontros', read: [...TEACH, 'STUDENT'], write: [...MANAGE, 'TEACHER'], create: encSchema,
  filters: ['ofertaId', 'tipo', 'status', 'poloId'], orderBy: { inicio: 'asc' }, modulo: 'modalidades',
  beforeCreate: async (d, req) => {
    const tenantId = getTenantId(req)
    if (d.fim <= d.inicio) throw Object.assign(new Error('Fim deve ser posterior ao início.'), { status: 422 })
    const of = await prisma.modOferta.findFirst({ where: { id: d.ofertaId, tenantId } })
    if (!of) throw Object.assign(new Error('Oferta não encontrada.'), { status: 404 })
    if (d.spaceId) {
      const conflito = await prisma.modEncontro.findFirst({ where: { tenantId, spaceId: d.spaceId, status: 'AGENDADO', inicio: { lt: d.fim }, fim: { gt: d.inicio } } })
      if (conflito) throw Object.assign(new Error(`Espaço já reservado para "${conflito.titulo}" nesse horário.`), { status: 409 })
    }
    return d
  },
  afterCreate: async (row, req) => {
    const tenantId = getTenantId(req)
    await scheduleReminder({
      tenantId, modulo: 'modalidades', titulo: `${row.tipo === 'PROVA_PRESENCIAL' ? 'Prova presencial' : 'Encontro presencial'}: ${row.titulo}`,
      dueAt: row.inicio, antecedenciaDias: 7, severity: row.tipo === 'PROVA_PRESENCIAL' ? 'ATENCAO' : 'INFO', assigneeRole: 'COORDINATOR',
      refType: 'ModEncontro', refId: row.id, dedupeKey: `mod-enc-${row.id}`,
    })
  },
})
router.post('/encontros/:id/cancelar', requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const id = String(req.params.id)
  const e = await prisma.modEncontro.findFirst({ where: { id, tenantId } })
  if (!e) return res.status(404).json({ error: 'Encontro não encontrado.' })
  if (e.status !== 'AGENDADO') return res.status(409).json({ error: `Encontro já está ${e.status}.` })
  const row = await prisma.modEncontro.update({ where: { id }, data: { status: 'CANCELADO' } })
  await cancelReminders({ tenantId, refType: 'ModEncontro', refId: id })
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'CANCELAR_ENCONTRO', refType: 'ModEncontro', refId: id })
  res.json(row)
}))
router.post('/encontros/:id/realizar', requireRole(...MANAGE, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const id = String(req.params.id)
  const e = await prisma.modEncontro.findFirst({ where: { id, tenantId } })
  if (!e) return res.status(404).json({ error: 'Encontro não encontrado.' })
  if (e.status !== 'AGENDADO') return res.status(409).json({ error: `Encontro já está ${e.status}.` })
  const row = await prisma.modEncontro.update({ where: { id }, data: { status: 'REALIZADO' } })
  await cancelReminders({ tenantId, refType: 'ModEncontro', refId: id })
  res.json(row)
}))

// ---------- Webconferência / aulas ao vivo ----------
const liveSchema = z.object({
  ofertaId: z.string().optional().nullable(), classSectionId: z.string().optional().nullable(), titulo: z.string().min(2),
  professorUserId: z.string().optional().nullable(), plataforma: z.string().optional(), sala: z.string().optional().nullable(),
  linkUrl: z.string().url().optional().nullable(), inicio: dateISO(), fim: dateISO(), presencaMinimaPct: z.number().min(0).max(100).optional(),
})
mountCrud(router, {
  model: 'modAulaLive', path: '/lives', read: [...TEACH, 'STUDENT'], write: [...MANAGE, 'TEACHER'], create: liveSchema,
  filters: ['ofertaId', 'classSectionId', 'status', 'professorUserId'], orderBy: { inicio: 'asc' }, modulo: 'modalidades',
  beforeCreate: async (d, req) => {
    if (d.fim <= d.inicio) throw Object.assign(new Error('Fim deve ser posterior ao início.'), { status: 422 })
    if (d.presencaMinimaPct == null) d.presencaMinimaPct = (await getConfig(getTenantId(req))).presencaMinimaLivePct
    return d
  },
  afterCreate: async (row, req) => {
    await scheduleReminder({ tenantId: getTenantId(req), modulo: 'modalidades', titulo: `Aula ao vivo: ${row.titulo}`, dueAt: row.inicio, antecedenciaDias: 1, assigneeUserId: row.professorUserId ?? undefined, assigneeRole: row.professorUserId ? undefined : 'TEACHER', refType: 'ModAulaLive', refId: row.id, dedupeKey: `mod-live-${row.id}` })
  },
})

router.post('/lives/:id/iniciar', requireRole(...MANAGE, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const l = await prisma.modAulaLive.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!l) return res.status(404).json({ error: 'Aula ao vivo não encontrada.' })
  if (l.status !== 'AGENDADA') return res.status(409).json({ error: `Transição inválida a partir de ${l.status}.` })
  res.json(await prisma.modAulaLive.update({ where: { id: l.id }, data: { status: 'AO_VIVO', iniciadaEm: new Date() } }))
}))

// Registro de evento de presença (ENTRADA/SAIDA) — chamado pelo AVA/webhook da plataforma ou pelo próprio aluno.
router.post('/lives/:id/eventos', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const body = parseBody(z.object({ studentId: z.string().optional(), tipo: z.enum(['ENTRADA', 'SAIDA']), em: dateISO().optional() }), req.body)
  const role = req.user?.role
  const studentId = role === 'STUDENT' ? req.user?.studentId : body.studentId
  if (!studentId) return res.status(400).json({ error: 'studentId obrigatório.' })
  if (role !== 'STUDENT' && !['COORDINATOR', 'SECRETARY', 'TEACHER', 'SUPPORT', 'STAFF', 'ADMIN', 'OWNER', 'RECTOR', 'BOARD'].includes(String(role))) return res.status(403).json({ error: 'Sem permissão.' })
  const live = await prisma.modAulaLive.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!live) return res.status(404).json({ error: 'Aula ao vivo não encontrada.' })
  if (live.status === 'CANCELADA') return res.status(409).json({ error: 'Aula cancelada.' })
  // aluno não informa o horário (evita forjar presença); equipe/webhook pode informar, mas nunca no futuro
  const agora = new Date()
  const em = role === 'STUDENT' ? agora : body.em && body.em.getTime() <= agora.getTime() + 60_000 ? body.em : agora
  if (role === 'STUDENT' && live.status === 'ENCERRADA') return res.status(409).json({ error: 'Aula encerrada: a presença já foi consolidada.' })
  const ev = await prisma.modLiveEvento.create({ data: { tenantId, liveId: live.id, studentId, tipo: body.tipo, em } })
  if (body.tipo === 'ENTRADA') {
    await prisma.modEngajamentoEvento.create({ data: { tenantId, studentId, classSectionId: live.classSectionId, tipo: 'LIVE', refType: 'ModAulaLive', refId: live.id } }).catch(() => null)
  }
  res.status(201).json(ev)
}))

async function consolidarPresenca(tenantId: string, liveId: string) {
  const live = await prisma.modAulaLive.findFirst({ where: { id: liveId, tenantId } })
  if (!live) throw Object.assign(new Error('Aula ao vivo não encontrada.'), { status: 404 })
  const eventos = await prisma.modLiveEvento.findMany({ where: { liveId, tenantId } })
  const porAluno = new Map<string, typeof eventos>()
  for (const e of eventos) porAluno.set(e.studentId, [...(porAluno.get(e.studentId) ?? []), e])
  const out: any[] = []
  for (const [studentId, evs] of porAluno) {
    const manual = await prisma.modLivePresenca.findUnique({ where: { liveId_studentId: { liveId, studentId } } })
    if (manual?.manual) { out.push(manual); continue }
    const r = calcularPresencaLive(evs.map((e) => ({ tipo: e.tipo as 'ENTRADA' | 'SAIDA', em: e.em })), live.inicio, live.fim, live.presencaMinimaPct)
    out.push(await prisma.modLivePresenca.upsert({
      where: { liveId_studentId: { liveId, studentId } },
      create: { tenantId, liveId, studentId, minutos: r.minutos, percentual: r.percentual, presente: r.presente },
      update: { minutos: r.minutos, percentual: r.percentual, presente: r.presente },
    }))
  }
  return { live, presencas: out }
}

router.post('/lives/:id/encerrar', requireRole(...MANAGE, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const body = parseBody(z.object({ gravacaoUrl: z.string().url().optional() }), req.body ?? {})
  const l = await prisma.modAulaLive.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!l) return res.status(404).json({ error: 'Aula ao vivo não encontrada.' })
  if (!['AGENDADA', 'AO_VIVO'].includes(l.status)) return res.status(409).json({ error: `Transição inválida a partir de ${l.status}.` })
  // fecha entradas abertas no horário final
  const abertas = await prisma.modLiveEvento.findMany({ where: { liveId: l.id, tenantId } })
  const estado = new Map<string, string>()
  for (const e of [...abertas].sort((a, b) => a.em.getTime() - b.em.getTime())) estado.set(e.studentId, e.tipo)
  for (const [studentId, t] of estado) if (t === 'ENTRADA') await prisma.modLiveEvento.create({ data: { tenantId, liveId: l.id, studentId, tipo: 'SAIDA', em: l.fim } })
  const upd = await prisma.modAulaLive.update({ where: { id: l.id }, data: { status: 'ENCERRADA', encerradaEm: new Date(), gravacaoUrl: body.gravacaoUrl ?? l.gravacaoUrl, gravacaoDisponivelEm: body.gravacaoUrl ? new Date() : l.gravacaoDisponivelEm } })
  const { presencas } = await consolidarPresenca(tenantId, l.id)
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'ENCERRAR_LIVE', refType: 'ModAulaLive', refId: l.id, detalhes: { presentes: presencas.filter((p) => p.presente).length } })
  res.json({ live: upd, presencas })
}))

router.post('/lives/:id/consolidar-presenca', requireRole(...MANAGE, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await consolidarPresenca(getTenantId(req), String(req.params.id)))
}))
router.get('/lives/:id/presencas', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await prisma.modLivePresenca.findMany({ where: { tenantId: getTenantId(req), liveId: String(req.params.id) }, orderBy: { percentual: 'desc' } }))
}))
router.put('/lives/:id/presencas/:studentId', requireRole(...MANAGE, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ presente: z.boolean() }), req.body)
  const liveId = String(req.params.id)
  const l = await prisma.modAulaLive.findFirst({ where: { id: liveId, tenantId } })
  if (!l) return res.status(404).json({ error: 'Aula ao vivo não encontrada.' })
  const studentId = String(req.params.studentId)
  res.json(await prisma.modLivePresenca.upsert({ where: { liveId_studentId: { liveId, studentId } }, create: { tenantId, liveId, studentId, presente: b.presente, manual: true }, update: { presente: b.presente, manual: true } }))
}))
router.post('/lives/:id/gravacao', requireRole(...MANAGE, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ gravacaoUrl: z.string().url() }), req.body)
  const l = await prisma.modAulaLive.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!l) return res.status(404).json({ error: 'Aula ao vivo não encontrada.' })
  res.json(await prisma.modAulaLive.update({ where: { id: l.id }, data: { gravacaoUrl: b.gravacaoUrl, gravacaoDisponivelEm: new Date() } }))
}))
router.get('/lives/:id/minha-presenca', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const sid = req.user?.studentId
  if (!sid) return res.status(400).json({ error: 'Aluno não vinculado.' })
  res.json(await prisma.modLivePresenca.findUnique({ where: { liveId_studentId: { liveId: String(req.params.id), studentId: sid } } }))
}))

// Agenda do aluno: encontros e lives das ofertas das turmas em que está matriculado.
router.get('/minha-agenda', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const sid = req.user?.studentId
  if (!sid) return res.status(400).json({ error: 'Aluno não vinculado.' })
  const secs = await prisma.classSectionEnrollment.findMany({ where: { enrollment: { studentId: sid } }, select: { classSectionId: true } })
  const ids = secs.map((s) => s.classSectionId)
  const ofertas = await prisma.modOferta.findMany({ where: { tenantId, classSectionId: { in: ids } }, select: { id: true } })
  const now = new Date()
  const [encontros, lives] = await Promise.all([
    prisma.modEncontro.findMany({ where: { tenantId, ofertaId: { in: ofertas.map((o) => o.id) }, inicio: { gte: now }, status: 'AGENDADO' }, orderBy: { inicio: 'asc' }, take: 50 }),
    prisma.modAulaLive.findMany({ where: { tenantId, OR: [{ classSectionId: { in: ids } }, { ofertaId: { in: ofertas.map((o) => o.id) } }], fim: { gte: now }, status: { in: ['AGENDADA', 'AO_VIVO'] } }, orderBy: { inicio: 'asc' }, take: 50 }),
  ])
  res.json({ encontros, lives })
}))

export default router
