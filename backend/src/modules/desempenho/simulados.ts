import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, dateISO, qs, pageParams } from '../core/crud'
import { notify, audit } from '../core/notify'
import { scheduleReminder } from '../core/reminders'
import { MOD, GESTAO, DOCENTE, httpErr, requireStudentId, resolverAlunos, nomesAlunos, chunk, media } from './common'
import { montarSimulado, distribuirPorPeso, corrigir, estimarConceitoEnade, projecaoOAB, QuestaoPool } from './logic'
import { recalcularEstatisticas } from './questoes'

const router = Router()
const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().nullable()

async function getSimulado(tenantId: string, id: string) {
  const s = await prisma.desSimulado.findFirst({ where: { id, tenantId } })
  if (!s) throw httpErr(404, 'Simulado não encontrado.')
  return s
}

// ---------- Montagem ----------
const montarSchema = z.object({
  exameId: z.string(), titulo: z.string().min(3), descricao: opt(z.string()),
  total: z.number().int().min(1).max(200).optional(),
  matriz: z.array(z.object({ eixoId: z.string(), quantidade: z.number().int().min(1).max(100), niveis: z.object({ FACIL: z.number().min(0).optional(), MEDIO: z.number().min(0).optional(), DIFICIL: z.number().min(0).optional() }).optional() })).optional(),
  niveis: z.object({ FACIL: z.number().min(0).optional(), MEDIO: z.number().min(0).optional(), DIFICIL: z.number().min(0).optional() }).optional(),
  disciplineId: opt(z.string()), seed: z.number().int().optional(),
  abreEm: opt(dateISO()), fechaEm: opt(dateISO()), duracaoMin: z.number().int().min(10).max(600).optional(),
  alvos: z.array(z.object({ classSectionId: opt(z.string()), programId: opt(z.string()), studentId: opt(z.string()) })).optional(),
  dryRun: z.boolean().optional(),
})

// Alvos (turma/curso/aluno) precisam existir no tenant — evita vínculo com ids de outra instituição.
async function validarAlvos(tenantId: string, alvos: Array<{ classSectionId?: string | null; programId?: string | null; studentId?: string | null }>) {
  for (const a of alvos) {
    if (a.classSectionId && !(await prisma.classSection.findFirst({ where: { id: a.classSectionId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Turma não encontrada.')
    if (a.programId && !(await prisma.academicProgram.findFirst({ where: { id: a.programId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Curso não encontrado.')
    if (a.studentId && !(await prisma.student.findFirst({ where: { id: a.studentId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Aluno não encontrado.')
  }
}

router.post('/simulados/montar', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(montarSchema, req.body)
  const ex = await prisma.desExame.findFirst({ where: { id: b.exameId, tenantId }, include: { eixos: { where: { ativo: true } } } })
  if (!ex) throw httpErr(404, 'Exame não encontrado.')
  if (b.abreEm && b.fechaEm && b.fechaEm <= b.abreEm) throw httpErr(400, 'Fechamento deve ser posterior à abertura.')
  if (b.alvos?.length) await validarAlvos(tenantId, b.alvos)
  const eixoIds = new Set(ex.eixos.map((e) => e.id))
  let matriz = b.matriz
  if (matriz) { for (const l of matriz) if (!eixoIds.has(l.eixoId)) throw httpErr(400, `Eixo ${l.eixoId} não pertence ao exame.`) }
  else {
    const total = b.total ?? Math.min(ex.numQuestoes ?? 40, 40)
    const dist = distribuirPorPeso(total, ex.eixos.map((e) => ({ id: e.id, peso: e.peso })))
    matriz = Object.entries(dist).filter(([, n]) => n > 0).map(([eixoId, quantidade]) => ({ eixoId, quantidade, niveis: b.niveis }))
  }
  const pool = await prisma.desQuestao.findMany({ where: { tenantId, exameId: ex.id, status: 'PUBLICADO', tipo: 'OBJETIVA', ...(b.disciplineId ? { disciplineId: b.disciplineId } : {}) }, select: { id: true, eixoId: true, nivel: true, totalRespostas: true } })
  const sel = montarSimulado(pool.map((p): QuestaoPool => ({ id: p.id, eixoId: p.eixoId, nivel: p.nivel as any, usos: p.totalRespostas })), matriz as any, b.seed ?? Date.now() % 100000)
  if (b.dryRun) return res.json({ dryRun: true, selecionadas: sel.selecionadas.length, faltantes: sel.faltantes, matriz })
  if (!sel.selecionadas.length) throw httpErr(422, 'Não há questões PUBLICADAS suficientes no banco para esta matriz.')
  const sim = await prisma.desSimulado.create({
    data: {
      tenantId, exameId: ex.id, titulo: b.titulo, descricao: b.descricao ?? undefined, abreEm: b.abreEm ?? undefined, fechaEm: b.fechaEm ?? undefined,
      duracaoMin: b.duracaoMin ?? Math.max(30, Math.round((ex.duracaoMin ?? 240) * (sel.selecionadas.length / (ex.numQuestoes || sel.selecionadas.length)))),
      matriz: matriz as any, criadoPorId: getUserId(req),
      questoes: { create: sel.selecionadas.map((s, i) => ({ tenantId, questaoId: s.questaoId, eixoId: s.eixoId, ordem: i + 1 })) },
      alvos: b.alvos?.length ? { create: b.alvos.map((a) => ({ tenantId, classSectionId: a.classSectionId ?? undefined, programId: a.programId ?? undefined, studentId: a.studentId ?? undefined })) } : undefined,
    },
    include: { questoes: true, alvos: true },
  })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'MONTAR_SIMULADO', refType: 'DesSimulado', refId: sim.id, detalhes: { questoes: sel.selecionadas.length, faltantes: sel.faltantes } })
  res.status(201).json({ simulado: sim, faltantes: sel.faltantes, aviso: sel.faltantes.length ? 'Alguns eixos não têm questões publicadas suficientes.' : undefined })
}))

router.get('/simulados', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId }
  for (const f of ['exameId', 'status']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
  const [items, total] = await Promise.all([prisma.desSimulado.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { _count: { select: { questoes: true, tentativas: true, alvos: true } } } }), prisma.desSimulado.count({ where })])
  res.json({ items, total, page, pageSize })
}))

// Aluno: simulados disponíveis para ele (declarar ANTES de /simulados/:id)
router.get('/simulados/meus', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = requireStudentId(req)
  const [turmas, cursos] = await Promise.all([
    prisma.classSectionEnrollment.findMany({ where: { enrollment: { studentId, status: 'ATIVA' }, classSection: { tenantId } }, select: { classSectionId: true } }),
    prisma.enrollment.findMany({ where: { studentId, status: 'ATIVA' }, select: { programId: true } }),
  ])
  const sims = await prisma.desSimulado.findMany({
    where: { tenantId, status: { in: ['PUBLICADO', 'ENCERRADO'] }, alvos: { some: { OR: [{ studentId }, { classSectionId: { in: turmas.map((t) => t.classSectionId) } }, { programId: { in: cursos.map((c) => c.programId) } }] } } },
    include: { _count: { select: { questoes: true } }, tentativas: { where: { studentId }, select: { id: true, status: true, percentual: true, enviadaEm: true } } },
    orderBy: { fechaEm: 'asc' },
  })
  const agora = Date.now()
  res.json({ items: sims.map((s) => ({ id: s.id, titulo: s.titulo, abreEm: s.abreEm, fechaEm: s.fechaEm, duracaoMin: s.duracaoMin, questoes: s._count.questoes, tentativa: s.tentativas[0] ?? null,
    disponivel: s.status === 'PUBLICADO' && (!s.abreEm || s.abreEm.getTime() <= agora) && (!s.fechaEm || s.fechaEm.getTime() >= agora) && !s.tentativas[0] })) })
}))

router.get('/simulados/:id', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const s = await prisma.desSimulado.findFirst({ where: { id: String(req.params.id), tenantId }, include: { questoes: { orderBy: { ordem: 'asc' } }, alvos: true, _count: { select: { tentativas: true } } } })
  if (!s) throw httpErr(404, 'Simulado não encontrado.')
  res.json(s)
}))

router.patch('/simulados/:id', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const s = await getSimulado(tenantId, String(req.params.id))
  const b = parseBody(z.object({ titulo: z.string().min(3), descricao: opt(z.string()), abreEm: opt(dateISO()), fechaEm: opt(dateISO()), duracaoMin: z.number().int().min(10).max(600) }).partial(), req.body)
  if (s.status === 'ENCERRADO') throw httpErr(409, 'Simulado encerrado não pode ser alterado.')
  if (s.status === 'PUBLICADO' && (b.abreEm !== undefined || b.duracaoMin !== undefined)) throw httpErr(409, 'Simulado publicado: só é possível alterar título, descrição e prazo de fechamento.')
  const abre = b.abreEm === undefined ? s.abreEm : b.abreEm, fecha = b.fechaEm === undefined ? s.fechaEm : b.fechaEm
  if (abre && fecha && fecha <= abre) throw httpErr(400, 'Fechamento deve ser posterior à abertura.')
  res.json(await prisma.desSimulado.update({ where: { id: s.id }, data: b as any }))
}))

router.post('/simulados/:id/questoes', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const s = await getSimulado(tenantId, String(req.params.id))
  if (s.status !== 'RASCUNHO') throw httpErr(409, 'Só é possível editar questões de simulado em RASCUNHO.')
  const b = parseBody(z.object({ questaoId: z.string() }), req.body)
  const q = await prisma.desQuestao.findFirst({ where: { id: b.questaoId, tenantId, exameId: s.exameId, status: 'PUBLICADO' } })
  if (!q) throw httpErr(404, 'Questão publicada não encontrada para este exame.')
  const ordem = (await prisma.desSimuladoQuestao.count({ where: { simuladoId: s.id } })) + 1
  res.status(201).json(await prisma.desSimuladoQuestao.create({ data: { tenantId, simuladoId: s.id, questaoId: q.id, eixoId: q.eixoId, ordem } }))
}))
router.delete('/simulados/:id/questoes/:questaoId', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const s = await getSimulado(tenantId, String(req.params.id))
  if (s.status !== 'RASCUNHO') throw httpErr(409, 'Só é possível editar questões de simulado em RASCUNHO.')
  await prisma.desSimuladoQuestao.deleteMany({ where: { simuladoId: s.id, tenantId, questaoId: String(req.params.questaoId) } })
  const rest = await prisma.desSimuladoQuestao.findMany({ where: { simuladoId: s.id }, orderBy: { ordem: 'asc' } })
  for (const [i, r] of rest.entries()) if (r.ordem !== i + 1) await prisma.desSimuladoQuestao.update({ where: { id: r.id }, data: { ordem: i + 1 } })
  res.status(204).end()
}))

router.put('/simulados/:id/alvos', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const s = await getSimulado(tenantId, String(req.params.id))
  if (s.status === 'ENCERRADO') throw httpErr(409, 'Simulado encerrado.')
  const b = parseBody(z.object({ alvos: z.array(z.object({ classSectionId: opt(z.string()), programId: opt(z.string()), studentId: opt(z.string()) }).refine((a) => a.classSectionId || a.programId || a.studentId, 'Informe turma, curso ou aluno')).min(1) }), req.body)
  await validarAlvos(tenantId, b.alvos)
  await prisma.$transaction([
    prisma.desSimuladoAlvo.deleteMany({ where: { simuladoId: s.id, tenantId } }),
    prisma.desSimuladoAlvo.createMany({ data: b.alvos.map((a) => ({ tenantId, simuladoId: s.id, classSectionId: a.classSectionId ?? undefined, programId: a.programId ?? undefined, studentId: a.studentId ?? undefined })) }),
  ])
  const alunos = await resolverAlunos(tenantId, b.alvos)
  res.json({ alvos: b.alvos.length, alunosAlcancados: alunos.length })
}))

router.post('/simulados/:id/publicar', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const s = await prisma.desSimulado.findFirst({ where: { id: String(req.params.id), tenantId }, include: { questoes: true, alvos: true } })
  if (!s) throw httpErr(404, 'Simulado não encontrado.')
  if (s.status !== 'RASCUNHO') throw httpErr(409, 'Simulado já publicado/encerrado.')
  if (!s.questoes.length) throw httpErr(400, 'Simulado sem questões.')
  if (!s.alvos.length) throw httpErr(400, 'Defina turmas/cursos/alunos-alvo antes de publicar.')
  if (!s.abreEm || !s.fechaEm) throw httpErr(400, 'Defina a janela (abertura e fechamento).')
  if (s.fechaEm.getTime() <= Date.now()) throw httpErr(400, 'A janela já terminou.')
  const naoPub = await prisma.desQuestao.count({ where: { tenantId, id: { in: s.questoes.map((q) => q.questaoId) }, status: { not: 'PUBLICADO' } } })
  if (naoPub) throw httpErr(409, `${naoPub} questão(ões) do simulado deixaram de estar PUBLICADAS.`)
  const alunos = await resolverAlunos(tenantId, s.alvos)
  if (!alunos.length) throw httpErr(422, 'Os alvos não contêm alunos ativos.')
  await prisma.desSimulado.update({ where: { id: s.id }, data: { status: 'PUBLICADO' } })
  const nomes = await nomesAlunos(tenantId, alunos)
  for (const lote of chunk(alunos, 50)) {
    await Promise.all(lote.flatMap((studentId) => [
      notify({ tenantId, studentId, userId: nomes.get(studentId)?.userId, assunto: `Simulado disponível: ${s.titulo}`, mensagem: `O simulado "${s.titulo}" abre em ${s.abreEm!.toLocaleString('pt-BR')} e fecha em ${s.fechaEm!.toLocaleString('pt-BR')}. Duração: ${s.duracaoMin} min.`, refType: 'DesSimulado', refId: s.id, templateKey: 'des.simulado.publicado' }),
      scheduleReminder({ tenantId, modulo: MOD, titulo: `Realizar o simulado "${s.titulo}"`, dueAt: s.fechaEm!, antecedenciaDias: 2, severity: 'ATENCAO', assigneeStudentId: studentId, refType: 'DesSimulado', refId: s.id, dedupeKey: `des:sim:${s.id}:al:${studentId}` }),
    ]))
  }
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'PUBLICAR_SIMULADO', refType: 'DesSimulado', refId: s.id, detalhes: { alunos: alunos.length } })
  res.json({ ok: true, alunosNotificados: alunos.length })
}))

// ---------- Aplicação (aluno) ----------
async function alunoNoSimulado(tenantId: string, simuladoId: string, studentId: string) {
  const [turmas, cursos] = await Promise.all([
    prisma.classSectionEnrollment.findMany({ where: { enrollment: { studentId, status: 'ATIVA' }, classSection: { tenantId } }, select: { classSectionId: true } }),
    prisma.enrollment.findMany({ where: { studentId, status: 'ATIVA' }, select: { programId: true } }),
  ])
  return (await prisma.desSimuladoAlvo.count({ where: { tenantId, simuladoId, OR: [{ studentId }, { classSectionId: { in: turmas.map((t) => t.classSectionId) } }, { programId: { in: cursos.map((c) => c.programId) } }] } })) > 0
}

async function questoesSemGabarito(tenantId: string, simuladoId: string) {
  const sq = await prisma.desSimuladoQuestao.findMany({ where: { tenantId, simuladoId }, orderBy: { ordem: 'asc' } })
  const qs_ = await prisma.desQuestao.findMany({ where: { tenantId, id: { in: sq.map((x) => x.questaoId) } }, select: { id: true, enunciado: true, alternativas: true, tipo: true } })
  const m = new Map(qs_.map((q) => [q.id, q]))
  return sq.map((x) => ({ ordem: x.ordem, questaoId: x.questaoId, eixoId: x.eixoId, enunciado: m.get(x.questaoId)?.enunciado, alternativas: m.get(x.questaoId)?.alternativas }))
}

router.post('/simulados/:id/iniciar', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = requireStudentId(req)
  const s = await getSimulado(tenantId, String(req.params.id))
  const agora = new Date()
  if (s.status !== 'PUBLICADO') throw httpErr(409, 'Simulado não está disponível.')
  if (s.abreEm && agora < s.abreEm) throw httpErr(409, `O simulado abre em ${s.abreEm.toLocaleString('pt-BR')}.`)
  if (s.fechaEm && agora > s.fechaEm) throw httpErr(409, 'A janela do simulado já foi encerrada.')
  if (!(await alunoNoSimulado(tenantId, s.id, studentId))) throw httpErr(403, 'Este simulado não foi atribuído a você.')
  let t = await prisma.desTentativa.findUnique({ where: { simuladoId_studentId: { simuladoId: s.id, studentId } } })
  if (t && t.status !== 'EM_ANDAMENTO') throw httpErr(409, 'Você já realizou este simulado.')
  if (t && t.expiraEm && t.expiraEm < agora) { await finalizarTentativa(tenantId, t.id, 'EXPIRADA'); throw httpErr(409, 'Seu tempo esgotou; a prova foi corrigida automaticamente.') }
  if (!t) {
    const expira = new Date(Math.min(agora.getTime() + s.duracaoMin * 60_000, s.fechaEm?.getTime() ?? Infinity))
    const total = await prisma.desSimuladoQuestao.count({ where: { simuladoId: s.id } })
    try {
      t = await prisma.desTentativa.create({ data: { tenantId, simuladoId: s.id, studentId, expiraEm: expira, total } })
    } catch (e: any) {
      // duplo clique / duas abas: a outra requisição já criou a tentativa — retoma em vez de falhar com 409
      if (e?.code !== 'P2002') throw e
      t = await prisma.desTentativa.findUnique({ where: { simuladoId_studentId: { simuladoId: s.id, studentId } } })
      if (!t) throw e
    }
  }
  const salvas = await prisma.desResposta.findMany({ where: { tentativaId: t.id }, select: { questaoId: true, alternativa: true } })
  res.status(201).json({ tentativaId: t.id, expiraEm: t.expiraEm, questoes: await questoesSemGabarito(tenantId, s.id), respostasSalvas: Object.fromEntries(salvas.map((r) => [r.questaoId, r.alternativa])) })
}))

async function tentativaDoAluno(req: AuthenticatedRequest, id: string) {
  const tenantId = getTenantId(req)
  const t = await prisma.desTentativa.findFirst({ where: { id, tenantId } })
  if (!t) throw httpErr(404, 'Tentativa não encontrada.')
  if (String(req.user?.role).toUpperCase() === 'STUDENT' && t.studentId !== req.user?.studentId) throw httpErr(403, 'Tentativa de outro aluno.')
  return t
}

router.put('/tentativas/:id/respostas', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const t = await tentativaDoAluno(req, String(req.params.id))
  if (t.status !== 'EM_ANDAMENTO') throw httpErr(409, 'Tentativa já finalizada.')
  if (t.expiraEm && t.expiraEm < new Date(Date.now() - 15_000)) throw httpErr(409, 'Tempo esgotado.') // 15s de tolerância de rede
  const b = parseBody(z.object({ respostas: z.record(z.string(), z.string().length(1).nullable()) }), req.body)
  const sq = await prisma.desSimuladoQuestao.findMany({ where: { simuladoId: t.simuladoId }, select: { questaoId: true, eixoId: true } })
  const mapa = new Map(sq.map((x) => [x.questaoId, x.eixoId]))
  let salvas = 0
  for (const [questaoId, alt] of Object.entries(b.respostas)) {
    if (!mapa.has(questaoId)) continue
    await prisma.desResposta.upsert({ where: { tentativaId_questaoId: { tentativaId: t.id, questaoId } }, create: { tenantId, tentativaId: t.id, questaoId, eixoId: mapa.get(questaoId), alternativa: alt?.toUpperCase() ?? null }, update: { alternativa: alt?.toUpperCase() ?? null } })
    salvas++
  }
  res.json({ salvas })
}))

// Correção automática: grava correta por resposta, resultado por eixo e fecha a tentativa.
export async function finalizarTentativa(tenantId: string, tentativaId: string, status: 'ENVIADA' | 'EXPIRADA' = 'ENVIADA') {
  const t = await prisma.desTentativa.findFirst({ where: { id: tentativaId, tenantId } })
  if (!t || t.status !== 'EM_ANDAMENTO') return t
  const sq = await prisma.desSimuladoQuestao.findMany({ where: { simuladoId: t.simuladoId, tenantId } })
  const qs_ = await prisma.desQuestao.findMany({ where: { tenantId, id: { in: sq.map((x) => x.questaoId) } }, select: { id: true, gabarito: true } })
  const gab = new Map(qs_.map((q) => [q.id, q.gabarito]))
  const resp = await prisma.desResposta.findMany({ where: { tentativaId } })
  const r = corrigir(sq.map((x) => ({ questaoId: x.questaoId, eixoId: x.eixoId, gabarito: gab.get(x.questaoId) })), Object.fromEntries(resp.map((x) => [x.questaoId, x.alternativa])))
  const det = new Map(r.detalhe.map((d) => [d.questaoId, d.correta]))
  await prisma.$transaction([
    // questões sem resposta também entram como erro (para estatística da questão)
    ...sq.filter((x) => !resp.some((y) => y.questaoId === x.questaoId)).map((x) => prisma.desResposta.create({ data: { tenantId, tentativaId, questaoId: x.questaoId, eixoId: x.eixoId, alternativa: null, correta: false } })),
    ...resp.map((x) => prisma.desResposta.update({ where: { id: x.id }, data: { correta: det.get(x.questaoId) ?? false } })),
    prisma.desTentativa.update({ where: { id: tentativaId }, data: { status, enviadaEm: new Date(), acertos: r.acertos, total: r.total, percentual: r.percentual, porEixo: r.porEixo as any, tempoSegundos: Math.round((Date.now() - t.iniciadaEm.getTime()) / 1000) } }),
  ])
  await prisma.eduReminder.updateMany({ where: { tenantId, dedupeKey: `des:sim:${t.simuladoId}:al:${t.studentId}`, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: 'CONCLUIDO', concluidoEm: new Date() } })
  return prisma.desTentativa.findUnique({ where: { id: tentativaId } })
}

router.post('/tentativas/:id/enviar', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const t = await tentativaDoAluno(req, String(req.params.id))
  if (t.status !== 'EM_ANDAMENTO') throw httpErr(409, 'Tentativa já finalizada.')
  if (req.body?.respostas) {
    const b = parseBody(z.object({ respostas: z.record(z.string(), z.string().length(1).nullable()) }), req.body)
    const sq = await prisma.desSimuladoQuestao.findMany({ where: { simuladoId: t.simuladoId }, select: { questaoId: true, eixoId: true } })
    const mapa = new Map(sq.map((x) => [x.questaoId, x.eixoId]))
    for (const [questaoId, alt] of Object.entries(b.respostas)) if (mapa.has(questaoId)) await prisma.desResposta.upsert({ where: { tentativaId_questaoId: { tentativaId: t.id, questaoId } }, create: { tenantId, tentativaId: t.id, questaoId, eixoId: mapa.get(questaoId), alternativa: alt?.toUpperCase() ?? null }, update: { alternativa: alt?.toUpperCase() ?? null } })
  }
  const exp = t.expiraEm && t.expiraEm < new Date(Date.now() - 15_000)
  const f = await finalizarTentativa(tenantId, t.id, exp ? 'EXPIRADA' : 'ENVIADA')
  res.json({ status: f?.status, acertos: f?.acertos, total: f?.total, percentual: f?.percentual, porEixo: f?.porEixo, avisoTempo: exp ? 'Envio fora do prazo: contabilizadas apenas as respostas salvas até o limite.' : undefined })
}))

router.get('/tentativas/:id/resultado', requireRole('STUDENT', ...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const t = await tentativaDoAluno(req, String(req.params.id))
  if (t.status === 'EM_ANDAMENTO') throw httpErr(409, 'Tentativa em andamento.')
  const s = await prisma.desSimulado.findFirst({ where: { id: t.simuladoId, tenantId }, include: { questoes: { orderBy: { ordem: 'asc' } } } })
  const ex = await prisma.desExame.findFirst({ where: { id: s!.exameId, tenantId }, include: { eixos: true } })
  const eixos = new Map(ex!.eixos.map((e) => [e.id, e]))
  const porEixo = ((t.porEixo as any[]) ?? []).map((e) => ({ ...e, nome: eixos.get(e.eixoId)?.nome ?? 'Sem eixo', meta: eixos.get(e.eixoId)?.metaAcerto ?? null, atingiuMeta: eixos.get(e.eixoId) ? e.percentual >= eixos.get(e.eixoId)!.metaAcerto : null }))
  // gabarito comentado só depois do fechamento da janela (evita vazamento para quem ainda vai fazer)
  const liberado = String(req.user?.role).toUpperCase() !== 'STUDENT' || s!.status === 'ENCERRADO' || (s!.fechaEm && s!.fechaEm < new Date())
  let revisao: any = undefined
  if (liberado) {
    const qs_ = await prisma.desQuestao.findMany({ where: { tenantId, id: { in: s!.questoes.map((x) => x.questaoId) } } })
    const resp = await prisma.desResposta.findMany({ where: { tentativaId: t.id } })
    const rm = new Map(resp.map((r) => [r.questaoId, r]))
    revisao = qs_.map((q) => ({ questaoId: q.id, enunciado: q.enunciado, marcada: rm.get(q.id)?.alternativa ?? null, gabarito: q.gabarito, correta: rm.get(q.id)?.correta ?? false, comentario: q.comentario }))
  }
  const corte = ex!.notaCorte ?? 50
  res.json({
    tentativaId: t.id, simulado: s!.titulo, status: t.status, acertos: t.acertos, total: t.total, percentual: t.percentual, porEixo,
    projecao: ex!.tipo === 'ENADE' ? { ...estimarConceitoEnade(t.percentual ?? 0), rotulo: 'ESTIMATIVA' } : ['OAB_1FASE', 'RESIDENCIA', 'REVALIDA', 'ENAMED'].includes(ex!.tipo) ? projecaoOAB(t.percentual ?? 0, corte) : null,
    revisao, gabaritoLiberado: !!liberado,
  })
}))

// ---------- Resultados / encerramento (docente) ----------
router.get('/simulados/:id/resultados', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const s = await prisma.desSimulado.findFirst({ where: { id: String(req.params.id), tenantId }, include: { alvos: true } })
  if (!s) throw httpErr(404, 'Simulado não encontrado.')
  const [tent, alunos] = await Promise.all([prisma.desTentativa.findMany({ where: { simuladoId: s.id, tenantId } }), resolverAlunos(tenantId, s.alvos)])
  const nomes = await nomesAlunos(tenantId, [...new Set([...alunos, ...tent.map((t) => t.studentId)])])
  const fin = tent.filter((t) => t.status !== 'EM_ANDAMENTO')
  const ex = await prisma.desExame.findFirst({ where: { id: s.exameId, tenantId }, include: { eixos: true } })
  const eixoMap = new Map(ex!.eixos.map((e) => [e.id, e]))
  const agg = new Map<string, { a: number; t: number }>()
  for (const t of fin) for (const e of (t.porEixo as any[]) ?? []) { const c = agg.get(e.eixoId) ?? { a: 0, t: 0 }; c.a += e.acertos; c.t += e.total; agg.set(e.eixoId, c) }
  res.json({
    simulado: { id: s.id, titulo: s.titulo, status: s.status }, alvoTotal: alunos.length, realizaram: fin.length, participacaoPercentual: alunos.length ? Math.round((fin.length / alunos.length) * 1000) / 10 : null,
    mediaPercentual: media(fin.map((t) => t.percentual ?? 0)),
    porEixo: [...agg.entries()].map(([eixoId, c]) => ({ eixoId, nome: eixoMap.get(eixoId)?.nome, percentual: Math.round((c.a / (c.t || 1)) * 1000) / 10, meta: eixoMap.get(eixoId)?.metaAcerto })),
    ausentes: alunos.filter((a) => !tent.some((t) => t.studentId === a)).map((id) => ({ studentId: id, aluno: nomes.get(id) ?? null })),
    alunos: fin.sort((a, b) => (b.percentual ?? 0) - (a.percentual ?? 0)).map((t) => ({ studentId: t.studentId, aluno: nomes.get(t.studentId) ?? null, acertos: t.acertos, total: t.total, percentual: t.percentual, status: t.status })),
  })
}))

export async function encerrarSimulado(tenantId: string, simuladoId: string, userId?: string) {
  const s = await prisma.desSimulado.findFirst({ where: { id: simuladoId, tenantId } })
  if (!s) throw httpErr(404, 'Simulado não encontrado.')
  if (s.status === 'ENCERRADO') return { jaEncerrado: true }
  const abertas = await prisma.desTentativa.findMany({ where: { tenantId, simuladoId, status: 'EM_ANDAMENTO' }, select: { id: true } })
  for (const t of abertas) await finalizarTentativa(tenantId, t.id, 'EXPIRADA')
  await prisma.desSimulado.update({ where: { id: s.id }, data: { status: 'ENCERRADO' } })
  await cancelStudentReminders(tenantId, s.id)
  const est = await recalcularEstatisticas(tenantId, s.exameId)
  await audit({ tenantId, userId, modulo: MOD, acao: 'ENCERRAR_SIMULADO', refType: 'DesSimulado', refId: s.id, detalhes: { expiradas: abertas.length } })
  return { expiradas: abertas.length, estatisticas: est }
}
async function cancelStudentReminders(tenantId: string, simuladoId: string) {
  await prisma.eduReminder.updateMany({ where: { tenantId, refType: 'DesSimulado', refId: simuladoId, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: 'CONCLUIDO', concluidoEm: new Date() } })
}
router.post('/simulados/:id/encerrar', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await encerrarSimulado(getTenantId(req), String(req.params.id), getUserId(req)))
}))

// Evolução do aluno entre simulados
router.get('/alunos/:studentId/evolucao', requireRole('STUDENT', ...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = String(req.params.studentId)
  if (String(req.user?.role).toUpperCase() === 'STUDENT' && req.user?.studentId !== studentId) throw httpErr(403, 'Sem permissão.')
  const t = await prisma.desTentativa.findMany({ where: { tenantId, studentId, status: { in: ['ENVIADA', 'EXPIRADA'] } }, orderBy: { enviadaEm: 'asc' }, include: { simulado: { select: { titulo: true, exameId: true } } } })
  res.json({ pontos: t.map((x, i) => ({ simulado: x.simulado.titulo, exameId: x.simulado.exameId, data: x.enviadaEm, percentual: x.percentual, variacao: i && x.percentual != null && t[i - 1].percentual != null ? Math.round((x.percentual - t[i - 1].percentual!) * 10) / 10 : null, porEixo: x.porEixo })) })
}))

export default router
