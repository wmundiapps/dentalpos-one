import crypto from 'crypto'
import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { audit } from '../core/notify'
import { calcularTurma, carregarCtx } from '../notas/service'
import { bodyOf, DAY, httpErr, isMgmt, nomesUsuarios, pct, qs, role, turmaAcesso } from './common'
import { whereTurma } from './ambientes'
import { CRITERIOS_DOCENTE } from './aluno'

// Portal do professor: turmas/horários, diário de classe (chamada lista/manual/QR + conteúdo ministrado), desempenho e risco de
// evasão, banco de questões, avaliações docentes recebidas, disponibilidade e carga horária.
// Lançamento de notas, regras e revisões usam o módulo /notas; materiais, fórum e recados estão em ead.ts.
const router = Router()
const PROF = ['TEACHER', 'COORDINATOR', 'SECRETARY'] as const
router.use('/prof', requireRole(...PROF))

/** Professor: só o próprio. Gestão: ?professorUserId= (ou o próprio). */
function alvoProf(req: AuthenticatedRequest) {
  if (role(req) === 'TEACHER') return getUserId(req)
  return qs(req.query.professorUserId) || getUserId(req)
}

async function minhasTurmas(req: AuthenticatedRequest, opts: { todas?: boolean } = {}) {
  const tenantId = getTenantId(req), prof = alvoProf(req), now = new Date()
  return prisma.classSection.findMany({
    where: { tenantId, professorUserId: prof, ...whereTurma(req), ...(opts.todas ? {} : { term: { dataFim: { gte: now } } }) },
    include: { discipline: { select: { id: true, nome: true, cargaHoraria: true } }, term: { select: { codigo: true, dataInicio: true, dataFim: true } }, _count: { select: { matriculados: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

router.get('/prof/turmas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const secs = await minhasTurmas(req, { todas: qs(req.query.todas) === '1' })
  const ids = secs.map((s) => s.id)
  const [mats, ents, sess] = ids.length ? await Promise.all([
    prisma.porMaterial.groupBy({ by: ['classSectionId'], where: { tenantId, classSectionId: { in: ids }, status: 'PUBLICADO' }, _count: true }),
    prisma.porEntrega.groupBy({ by: ['classSectionId'], where: { tenantId, classSectionId: { in: ids }, status: 'ENVIADA' }, _count: true }),
    prisma.classSession.groupBy({ by: ['classSectionId', 'status'], where: { classSectionId: { in: ids } }, _count: true }),
  ]) : [[], [], []] as any[]
  res.json({ itens: secs.map((s) => ({
    id: s.id, nome: s.nome, disciplina: s.discipline.nome, disciplineId: s.disciplineId, cargaHoraria: s.discipline.cargaHoraria, periodo: s.term.codigo, alunos: s._count.matriculados, vagas: s.vagas,
    materiais: (mats as any[]).find((m) => m.classSectionId === s.id)?._count ?? 0, entregasParaCorrigir: (ents as any[]).find((m) => m.classSectionId === s.id)?._count ?? 0,
    aulasRealizadas: (sess as any[]).filter((x) => x.classSectionId === s.id && x.status === 'REALIZADA').reduce((a, x) => a + x._count, 0), aulasAgendadas: (sess as any[]).filter((x) => x.classSectionId === s.id && x.status === 'AGENDADA').reduce((a, x) => a + x._count, 0),
  })) })
}))

router.get('/prof/painel', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), prof = alvoProf(req), now = new Date()
  const secs = await minhasTurmas(req)
  const ids = secs.map((s) => s.id)
  const nome = new Map(secs.map((s) => [s.id, s.discipline.nome]))
  const [proximas, entregas, revisoes, justif, forum, semChamada] = ids.length ? await Promise.all([
    prisma.classSession.findMany({ where: { classSectionId: { in: ids }, status: 'AGENDADA', dataHoraInicio: { gte: new Date(now.getTime() - 3 * 3600_000), lte: new Date(now.getTime() + 14 * DAY) } }, orderBy: { dataHoraInicio: 'asc' }, take: 12 }),
    prisma.porEntrega.count({ where: { tenantId, classSectionId: { in: ids }, status: 'ENVIADA' } }),
    prisma.ntRevisao.count({ where: { tenantId, classSectionId: { in: ids }, status: 'SOLICITADA' } }),
    prisma.porJustificativa.count({ where: { tenantId, classSectionId: { in: ids }, status: 'PENDENTE' } }),
    prisma.porForumTopico.count({ where: { tenantId, classSectionId: { in: ids }, createdAt: { gte: new Date(now.getTime() - 7 * DAY) }, autorPapel: 'ALUNO' } }),
    prisma.classSession.count({ where: { classSectionId: { in: ids }, status: 'AGENDADA', dataHoraFim: { lt: now } } }),
  ]) : [[], 0, 0, 0, 0, 0] as any[]
  const alertas = await alertasEvasao(tenantId, secs.map((s) => ({ id: s.id, disciplina: s.discipline.nome })))
  const avs = await prisma.porAvaliacaoDocente.aggregate({ where: { tenantId, professorUserId: prof }, _avg: { media: true }, _count: true })
  res.json({
    turmas: secs.map((s) => ({ id: s.id, nome: s.nome, disciplina: s.discipline.nome, periodo: s.term.codigo, alunos: s._count.matriculados })),
    proximasAulas: (proximas as any[]).map((a) => ({ id: a.id, classSectionId: a.classSectionId, disciplina: nome.get(a.classSectionId), titulo: a.titulo, tipo: a.tipo, inicio: a.dataHoraInicio, fim: a.dataHoraFim, local: a.local })),
    pendencias: { entregasParaCorrigir: entregas, revisoesDeNota: revisoes, justificativasPendentes: justif, aulasSemChamada: semChamada, topicosNovosNoForum: forum },
    risco: { alto: alertas.filter((a) => a.nivel === 'ALTO').length, medio: alertas.filter((a) => a.nivel === 'MEDIO').length, top: alertas.slice(0, 5) },
    avaliacaoDocente: { media: avs._avg.media != null ? Math.round(avs._avg.media * 100) / 100 : null, respostas: avs._count },
  })
}))

router.get('/prof/horario', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), prof = alvoProf(req), now = new Date()
  const secs = await minhasTurmas(req)
  const ids = secs.map((s) => s.id)
  const nome = new Map(secs.map((s) => [s.id, `${s.discipline.nome} — ${s.nome}`]))
  const [slots, aulas, disp] = await Promise.all([
    ids.length ? ((prisma as any).calSlot?.findMany({ where: { tenantId, ativo: true, OR: [{ classSectionId: { in: ids } }, { professorUserId: prof }] }, orderBy: [{ diaSemana: 'asc' }, { inicioMin: 'asc' }] }).catch(() => []) ?? []) : [],
    ids.length ? prisma.classSession.findMany({ where: { classSectionId: { in: ids }, dataHoraInicio: { gte: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + 30 * DAY) } }, orderBy: { dataHoraInicio: 'asc' }, take: 150 }) : [],
    prisma.porDisponibilidade.findMany({ where: { tenantId, userId: prof }, orderBy: [{ diaSemana: 'asc' }, { inicioMin: 'asc' }] }),
  ])
  res.json({
    gradeSemanal: (slots as any[]).map((s) => ({ classSectionId: s.classSectionId, turma: nome.get(s.classSectionId) ?? null, diaSemana: s.diaSemana, inicioMin: s.inicioMin, fimMin: s.fimMin, tipoAula: s.tipoAula, spaceId: s.spaceId })),
    aulas: (aulas as any[]).map((a) => ({ id: a.id, classSectionId: a.classSectionId, turma: nome.get(a.classSectionId), titulo: a.titulo, tipo: a.tipo, inicio: a.dataHoraInicio, fim: a.dataHoraFim, local: a.local, status: a.status })),
    disponibilidade: disp,
  })
}))

// ---------------------------------------------------------------------------------------------
// Diário de classe
// ---------------------------------------------------------------------------------------------
router.get('/prof/turmas/:id/aulas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { sec } = await turmaAcesso(req, String(req.params.id), { soDocente: true })
  const [aulas, matric] = await Promise.all([
    prisma.classSession.findMany({ where: { classSectionId: sec.id }, orderBy: { dataHoraInicio: 'desc' }, take: 200 }),
    prisma.classSectionEnrollment.count({ where: { classSectionId: sec.id } }),
  ])
  const ids = aulas.map((a) => a.id)
  const [att, cont] = ids.length ? await Promise.all([
    prisma.attendance.groupBy({ by: ['classSessionId', 'presente'], where: { classSessionId: { in: ids } }, _count: true }),
    prisma.porDiarioConteudo.findMany({ where: { tenantId, classSessionId: { in: ids } } }),
  ]) : [[], []] as any[]
  res.json({ alunos: matric, itens: aulas.map((a) => {
    const p = (att as any[]).find((x) => x.classSessionId === a.id && x.presente)?._count ?? 0
    const f = (att as any[]).find((x) => x.classSessionId === a.id && !x.presente)?._count ?? 0
    return { id: a.id, titulo: a.titulo, tipo: a.tipo, inicio: a.dataHoraInicio, fim: a.dataHoraFim, local: a.local, status: a.status, presentes: p, faltas: f, chamadaFeita: p + f > 0, conteudo: (cont as any[]).find((c) => c.classSessionId === a.id)?.conteudo ?? null }
  }) })
}))

const aulaSchema = z.object({ titulo: z.string().trim().min(2).max(200), tipo: z.enum(['TEORICA', 'PRATICA']).default('TEORICA'), dataHoraInicio: z.coerce.date(), dataHoraFim: z.coerce.date(), local: z.string().trim().max(120).optional().nullable() })
router.post('/prof/turmas/:id/aulas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sec } = await turmaAcesso(req, String(req.params.id), { soDocente: true })
  const d = bodyOf(aulaSchema, req)
  if (d.dataHoraFim <= d.dataHoraInicio) throw httpErr(400, 'O horário final deve ser depois do inicial.')
  if ((d.dataHoraFim.getTime() - d.dataHoraInicio.getTime()) > 12 * 3600_000) throw httpErr(400, 'Uma aula não pode durar mais de 12 horas.')
  res.status(201).json(await prisma.classSession.create({ data: { classSectionId: sec.id, ...d } }))
}))

async function aulaDoProf(req: AuthenticatedRequest, sessionId: string) {
  const tenantId = getTenantId(req)
  const a = await prisma.classSession.findFirst({ where: { id: sessionId, classSection: { tenantId } } })
  if (!a) throw httpErr(404, 'Aula não encontrada.')
  const t = await turmaAcesso(req, a.classSectionId, { soDocente: true })
  return { aula: a, ...t }
}

router.get('/prof/aulas/:sid/chamada', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { aula, sec } = await aulaDoProf(req, String(req.params.sid))
  const [matric, att, cont, qr] = await Promise.all([
    prisma.classSectionEnrollment.findMany({ where: { classSectionId: sec.id, enrollment: { status: { not: 'CANCELADA' } } }, select: { enrollment: { select: { student: { select: { id: true, ra: true, nomeCompleto: true, status: true } } } } } }),
    prisma.attendance.findMany({ where: { classSessionId: aula.id } }),
    prisma.porDiarioConteudo.findUnique({ where: { classSessionId: aula.id } }),
    prisma.porChamadaQr.findFirst({ where: { tenantId, classSessionId: aula.id, expiraEm: { gt: new Date() } }, orderBy: { createdAt: 'desc' } }),
  ])
  const alunos = matric.map((m) => m.enrollment.student).sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto)).map((s) => {
    const a = att.find((x) => x.studentId === s.id)
    return { ...s, presente: a ? a.presente : null, justificativa: a?.justificativa ?? null }
  })
  res.json({ aula, turma: { id: sec.id, nome: sec.nome, disciplina: sec.discipline.nome }, alunos, conteudo: cont, qrAtivo: qr ? { token: qr.token, expiraEm: qr.expiraEm } : null, resumo: { total: alunos.length, presentes: alunos.filter((a) => a.presente === true).length, faltas: alunos.filter((a) => a.presente === false).length, semRegistro: alunos.filter((a) => a.presente === null).length } })
}))

// modo: LISTA (marca tudo e ajusta exceções), MANUAL (um a um) — ambos gravam em lote. O modo QR usa /qr + /aluno/chamada-qr.
router.put('/prof/aulas/:sid/chamada', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { aula, sec } = await aulaDoProf(req, String(req.params.sid))
  const d = bodyOf(z.object({
    modo: z.enum(['LISTA', 'MANUAL']).default('MANUAL'), todosPresentes: z.boolean().optional(),
    registros: z.array(z.object({ studentId: z.string(), presente: z.boolean(), justificativa: z.string().trim().max(500).optional().nullable() })).max(1000).default([]),
    fechar: z.boolean().default(true),
  }), req)
  if (aula.status === 'CANCELADA') throw httpErr(409, 'Aula cancelada: não há chamada.')
  if (aula.dataHoraInicio.getTime() > Date.now() + 2 * 3600_000) throw httpErr(409, 'A chamada só pode ser feita a partir de 2 horas antes da aula.')
  const matric = await prisma.classSectionEnrollment.findMany({ where: { classSectionId: sec.id }, select: { enrollment: { select: { studentId: true } } } })
  const validos = new Set(matric.map((m) => m.enrollment.studentId))
  const mapa = new Map<string, { presente: boolean; justificativa?: string | null }>()
  if (d.todosPresentes) for (const id of validos) mapa.set(id, { presente: true })
  for (const r of d.registros) { if (!validos.has(r.studentId)) throw httpErr(400, 'Há aluno que não pertence a esta turma.'); mapa.set(r.studentId, { presente: r.presente, justificativa: r.presente ? null : r.justificativa || null }) }
  if (!mapa.size) throw httpErr(400, 'Nenhum registro de presença informado.')
  await prisma.$transaction([
    ...[...mapa].map(([studentId, v]) => prisma.attendance.upsert({ where: { classSessionId_studentId: { classSessionId: aula.id, studentId } }, update: { presente: v.presente, justificativa: v.justificativa ?? null, registradoEm: new Date() }, create: { classSessionId: aula.id, studentId, presente: v.presente, justificativa: v.justificativa ?? null } })),
    ...(d.fechar ? [prisma.classSession.update({ where: { id: aula.id }, data: { status: 'REALIZADA' } })] : []),
  ])
  await audit({ tenantId, userId: getUserId(req), modulo: 'portal2', acao: 'CHAMADA_REGISTRADA', refType: 'ClassSession', refId: aula.id, detalhes: { modo: d.modo, registros: mapa.size } })
  res.json({ ok: true, registros: mapa.size, status: d.fechar ? 'REALIZADA' : aula.status })
}))

router.put('/prof/aulas/:sid/conteudo', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { aula, sec } = await aulaDoProf(req, String(req.params.sid))
  const d = bodyOf(z.object({ conteudo: z.string().trim().min(3, 'Descreva o conteúdo ministrado.').max(8000), metodologia: z.string().trim().max(500).optional().nullable(), tarefa: z.string().trim().max(1000).optional().nullable() }), req)
  res.json(await prisma.porDiarioConteudo.upsert({ where: { classSessionId: aula.id }, update: { ...d, registradoPor: getUserId(req) }, create: { tenantId, classSessionId: aula.id, classSectionId: sec.id, ...d, registradoPor: getUserId(req) } }))
}))

router.post('/prof/aulas/:sid/qr', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { aula, sec } = await aulaDoProf(req, String(req.params.sid))
  const { minutos } = bodyOf(z.object({ minutos: z.number().int().min(1).max(120).default(15) }), req)
  if (aula.status === 'CANCELADA') throw httpErr(409, 'Aula cancelada.')
  await prisma.porChamadaQr.deleteMany({ where: { tenantId, classSessionId: aula.id } })
  const q = await prisma.porChamadaQr.create({ data: { tenantId, classSessionId: aula.id, classSectionId: sec.id, token: crypto.randomBytes(18).toString('base64url'), expiraEm: new Date(Date.now() + minutos * 60_000), criadoPor: getUserId(req) } })
  if (aula.status === 'AGENDADA') await prisma.classSession.update({ where: { id: aula.id }, data: { status: 'REALIZADA' } })
  res.status(201).json({ token: q.token, expiraEm: q.expiraEm, qrTexto: q.token })
}))

// ---------------------------------------------------------------------------------------------
// Desempenho da turma + alertas de risco de evasão
// ---------------------------------------------------------------------------------------------
type Alerta = { classSectionId: string; disciplina: string; studentId: string; aluno: string; ra: string; score: number; nivel: 'ALTO' | 'MEDIO' | 'BAIXO'; motivos: string[] }

async function riscoTurma(tenantId: string, classSectionId: string, disciplina: string): Promise<{ alunos: any[]; aulasChamada: number; media: number | null }> {
  const ctx = await carregarCtx(tenantId, classSectionId)
  if (!ctx) return { alunos: [], aulasChamada: 0, media: null }
  const calc = await calcularTurma(tenantId, ctx)
  const ids = calc.alunos.map((a) => a.aluno.studentId)
  const since = new Date(Date.now() - 14 * DAY)
  const [acessos, mats, ents, fin] = await Promise.all([
    prisma.porAcesso.groupBy({ by: ['studentId'], where: { tenantId, studentId: { in: ids }, createdAt: { gte: since } }, _count: true }),
    prisma.porMaterial.findMany({ where: { tenantId, classSectionId, status: 'PUBLICADO', aceitaEntrega: true, prazoEntrega: { lt: new Date() } }, select: { id: true } }),
    prisma.porEntrega.findMany({ where: { tenantId, classSectionId }, select: { materialId: true, studentId: true } }),
    prisma.accountReceivable.groupBy({ by: ['studentId'], where: { tenantId, studentId: { in: ids }, status: { in: ['PENDENTE', 'ATRASADO'] }, dataVencimento: { lt: new Date(Date.now() - 30 * DAY) } }, _count: true }),
  ])
  const alunos = calc.alunos.map((a) => {
    const motivos: string[] = []
    let score = 0
    if (a.risco.nivel === 'ALTO') { score += 40; motivos.push(...a.risco.motivos) } else if (a.risco.nivel === 'ATENCAO') { score += 20; motivos.push(...a.risco.motivos) }
    const semAcesso = !(acessos.find((x) => x.studentId === a.aluno.studentId)?._count)
    if (semAcesso) { score += 15; motivos.push('Sem acesso à sala virtual/chamada por QR nos últimos 14 dias') }
    const atrasos = mats.filter((m) => !ents.find((e) => e.materialId === m.id && e.studentId === a.aluno.studentId)).length
    if (atrasos >= 2) { score += 20; motivos.push(`${atrasos} atividades com prazo vencido sem entrega`) } else if (atrasos === 1) { score += 8; motivos.push('1 atividade com prazo vencido sem entrega') }
    if (fin.find((x) => x.studentId === a.aluno.studentId)) { score += 15; motivos.push('Inadimplência acima de 30 dias') }
    if (a.frequencia.pct != null && a.frequencia.pct < 60) score += 10
    score = Math.min(100, score)
    return { studentId: a.aluno.studentId, aluno: a.aluno.nome ?? a.aluno.studentId, ra: a.aluno.ra, mediaParcial: a.resultado.mediaParcial, situacao: a.resultado.situacao, frequenciaPct: a.frequencia.pct, faltas: a.frequencia.faltas, atividadesAtrasadas: atrasos, semAcesso, score, nivel: score >= 60 ? 'ALTO' : score >= 30 ? 'MEDIO' : 'BAIXO', motivos }
  })
  const medias = alunos.map((a) => a.mediaParcial).filter((x): x is number => typeof x === 'number')
  return { alunos, aulasChamada: calc.aulasChamada, media: medias.length ? Math.round((medias.reduce((s, x) => s + x, 0) / medias.length) * 100) / 100 : null }
}

async function alertasEvasao(tenantId: string, secs: { id: string; disciplina: string }[]): Promise<Alerta[]> {
  const out: Alerta[] = []
  for (const s of secs) {
    const r = await riscoTurma(tenantId, s.id, s.disciplina)
    for (const a of r.alunos) if (a.nivel !== 'BAIXO') out.push({ classSectionId: s.id, disciplina: s.disciplina, studentId: a.studentId, aluno: a.aluno, ra: a.ra, score: a.score, nivel: a.nivel, motivos: a.motivos })
  }
  return out.sort((a, b) => b.score - a.score)
}

router.get('/prof/turmas/:id/desempenho', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { sec } = await turmaAcesso(req, String(req.params.id), { soDocente: true })
  const r = await riscoTurma(tenantId, sec.id, sec.discipline.nome)
  const nomes = await prisma.student.findMany({ where: { tenantId, id: { in: r.alunos.map((a) => a.studentId) } }, select: { id: true, nomeCompleto: true } })
  const alunos = r.alunos.map((a) => ({ ...a, aluno: nomes.find((n) => n.id === a.studentId)?.nomeCompleto ?? a.aluno })).sort((a, b) => b.score - a.score)
  const faixas = [['0–4', 0, 4], ['4–6', 4, 6], ['6–7', 6, 7], ['7–8,5', 7, 8.5], ['8,5–10', 8.5, 10.01]] as const
  res.json({
    turma: { id: sec.id, nome: sec.nome, disciplina: sec.discipline.nome },
    resumo: { alunos: alunos.length, mediaTurma: r.media, aulasComChamada: r.aulasChamada, emRiscoAlto: alunos.filter((a) => a.nivel === 'ALTO').length, emRiscoMedio: alunos.filter((a) => a.nivel === 'MEDIO').length, frequenciaMedia: (() => { const f = alunos.map((a) => a.frequenciaPct).filter((x): x is number => typeof x === 'number'); return f.length ? Math.round(f.reduce((s, x) => s + x, 0) / f.length) : null })() },
    distribuicao: faixas.map(([rot, a, b]) => ({ faixa: rot, alunos: alunos.filter((x) => typeof x.mediaParcial === 'number' && x.mediaParcial >= a && x.mediaParcial < b).length })),
    alunos,
  })
}))

router.get('/prof/alertas-evasao', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const secs = await minhasTurmas(req)
  const itens = await alertasEvasao(tenantId, secs.map((s) => ({ id: s.id, disciplina: s.discipline.nome })))
  res.json({ itens, resumo: { alto: itens.filter((i) => i.nivel === 'ALTO').length, medio: itens.filter((i) => i.nivel === 'MEDIO').length } })
}))

// ---------------------------------------------------------------------------------------------
// Banco de questões / provas (usa Assessment e Question do módulo provas-ia)
// ---------------------------------------------------------------------------------------------
router.get('/prof/provas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const secs = await minhasTurmas(req, { todas: true })
  const discIds = [...new Set(secs.map((s) => s.disciplineId))]
  const provas = discIds.length ? await prisma.assessment.findMany({ where: { disciplineId: { in: discIds }, discipline: { tenantId } }, include: { _count: { select: { questoes: true, tentativas: true } }, discipline: { select: { nome: true } } }, orderBy: { dataAbertura: 'desc' }, take: 200 }) : []
  res.json({ itens: provas.map((p) => ({ id: p.id, titulo: p.titulo, tipo: p.tipo, disciplina: p.discipline.nome, disciplineId: p.disciplineId, classSectionId: p.classSectionId, dataAbertura: p.dataAbertura, dataFechamento: p.dataFechamento, correcaoPorIA: p.correcaoPorIA, questoes: p._count.questoes, tentativas: p._count.tentativas })), disciplinas: secs.map((s) => ({ disciplineId: s.disciplineId, classSectionId: s.id, nome: `${s.discipline.nome} — ${s.nome}` })) })
}))

router.get('/prof/banco-questoes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const secs = await minhasTurmas(req, { todas: true })
  const discIds = [...new Set(secs.map((s) => s.disciplineId))]
  const disciplineId = qs(req.query.disciplineId)
  if (disciplineId && !discIds.includes(disciplineId) && !isMgmt(req)) throw httpErr(403, 'Disciplina fora das suas turmas.')
  const q = qs(req.query.q), tipo = qs(req.query.tipo)
  const where: any = { assessment: { discipline: { tenantId }, disciplineId: disciplineId ? disciplineId : { in: discIds } } }
  if (q) where.enunciado = { contains: q, mode: 'insensitive' }
  if (tipo) where.tipo = tipo
  const qs_ = await prisma.question.findMany({ where, include: { assessment: { select: { id: true, titulo: true, disciplineId: true, discipline: { select: { nome: true } } } } }, orderBy: { id: 'desc' }, take: 200 })
  const vistos = new Set<string>()
  const itens = qs_.filter((x) => { const k = x.enunciado.trim().toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true })
  res.json({ itens: itens.map((x) => ({ id: x.id, enunciado: x.enunciado, tipo: x.tipo, peso: x.peso, alternativas: x.alternativas, respostaCorreta: x.respostaCorreta, prova: x.assessment.titulo, provaId: x.assessmentId, disciplina: x.assessment.discipline.nome })), total: itens.length })
}))

// Monta uma prova a partir do banco: cria a avaliação e copia as questões escolhidas.
router.post('/prof/provas/montar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const d = bodyOf(z.object({ titulo: z.string().trim().min(3).max(200), tipo: z.enum(['PROVA', 'ATIVIDADE', 'AUTOAVALIACAO']).default('PROVA'), classSectionId: z.string(), questionIds: z.array(z.string()).min(1).max(100), dataAbertura: z.coerce.date().optional(), dataFechamento: z.coerce.date().optional() }), req)
  const { sec } = await turmaAcesso(req, d.classSectionId, { soDocente: true })
  const origem = await prisma.question.findMany({ where: { id: { in: d.questionIds }, assessment: { discipline: { tenantId }, disciplineId: sec.disciplineId } } })
  if (origem.length !== new Set(d.questionIds).size) throw httpErr(400, 'Há questões fora do banco desta disciplina.')
  if (d.dataAbertura && d.dataFechamento && d.dataFechamento <= d.dataAbertura) throw httpErr(400, 'O fechamento deve ser depois da abertura.')
  const prova = await prisma.$transaction(async (tx) => {
    const a = await tx.assessment.create({ data: { disciplineId: sec.disciplineId, classSectionId: sec.id, titulo: d.titulo, tipo: d.tipo as any, dataAbertura: d.dataAbertura, dataFechamento: d.dataFechamento } })
    await tx.question.createMany({ data: origem.map((o) => ({ assessmentId: a.id, enunciado: o.enunciado, tipo: o.tipo, alternativas: (o.alternativas ?? undefined) as any, respostaCorreta: o.respostaCorreta, peso: o.peso })) })
    return a
  })
  await audit({ tenantId, userId: getUserId(req), modulo: 'portal2', acao: 'PROVA_MONTADA', refType: 'Assessment', refId: prova.id, detalhes: { questoes: origem.length } })
  res.status(201).json({ ...prova, questoes: origem.length })
}))

// ---------------------------------------------------------------------------------------------
// Avaliações docentes (anônimas: comentários só com 3+ respostas)
// ---------------------------------------------------------------------------------------------
router.get('/prof/avaliacoes-docentes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), prof = alvoProf(req)
  const rows = await prisma.porAvaliacaoDocente.findMany({ where: { tenantId, professorUserId: prof }, orderBy: { createdAt: 'desc' } })
  const secs = await prisma.classSection.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.classSectionId))] } }, include: { discipline: { select: { nome: true } }, term: { select: { codigo: true } }, _count: { select: { matriculados: true } } } })
  const itens = secs.map((s) => {
    const rs = rows.filter((r) => r.classSectionId === s.id)
    const anon = rs.length >= 3
    return {
      classSectionId: s.id, disciplina: s.discipline.nome, turma: s.nome, periodo: s.term.codigo, respostas: rs.length, matriculados: s._count.matriculados, participacao: pct(rs.length, s._count.matriculados),
      media: Math.round((rs.reduce((a, r) => a + r.media, 0) / rs.length) * 100) / 100,
      criterios: CRITERIOS_DOCENTE.map((c) => ({ chave: c.chave, titulo: c.titulo, media: Math.round((rs.reduce((a, r) => a + Number((r.notas as any)[c.chave] ?? 0), 0) / rs.length) * 100) / 100 })),
      comentarios: anon ? rs.filter((r) => r.comentario).map((r) => r.comentario) : [],
      anonimatoPreservado: !anon ? 'Comentários ocultos até 3 respostas, para preservar o anonimato.' : null,
    }
  })
  res.json({ itens, geral: rows.length ? { respostas: rows.length, media: Math.round((rows.reduce((a, r) => a + r.media, 0) / rows.length) * 100) / 100 } : null })
}))

// ---------------------------------------------------------------------------------------------
// Disponibilidade e carga horária
// ---------------------------------------------------------------------------------------------
router.get('/prof/disponibilidade', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), prof = alvoProf(req)
  const [perfil, janelas, secs, slots] = await Promise.all([
    prisma.porProfessorPerfil.findUnique({ where: { tenantId_userId: { tenantId, userId: prof } } }),
    prisma.porDisponibilidade.findMany({ where: { tenantId, userId: prof }, orderBy: [{ diaSemana: 'asc' }, { inicioMin: 'asc' }] }),
    minhasTurmas(req),
    ((prisma as any).calSlot?.findMany({ where: { tenantId, ativo: true, professorUserId: prof } }).catch(() => []) ?? []),
  ])
  const horasAula = (slots as any[]).reduce((s, x) => s + (x.fimMin - x.inicioMin) / 60, 0)
  const horasDisp = janelas.filter((j) => j.tipo === 'DISPONIVEL').reduce((s, j) => s + (j.fimMin - j.inicioMin) / 60, 0)
  const contratual = perfil?.cargaContratualHoras ?? 0
  res.json({
    perfil: perfil ?? { regime: null, cargaContratualHoras: 0, titulacao: null, observacao: null }, janelas,
    cargaHoraria: { contratualSemanal: contratual, aulaSemanal: Math.round(horasAula * 10) / 10, disponivelSemanal: Math.round(horasDisp * 10) / 10, turmas: secs.length, chDisciplinas: secs.reduce((s, x) => s + x.discipline.cargaHoraria, 0), saldo: contratual ? Math.round((contratual - horasAula) * 10) / 10 : null, excedeContrato: contratual > 0 && horasAula > contratual },
  })
}))

router.put('/prof/disponibilidade', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  if (role(req) !== 'TEACHER' && !isMgmt(req)) throw httpErr(403, 'Sem permissão.')
  const prof = alvoProf(req)
  const d = bodyOf(z.object({
    perfil: z.object({ regime: z.enum(['HORISTA', 'PARCIAL', 'INTEGRAL']).optional().nullable(), cargaContratualHoras: z.number().int().min(0).max(60).optional(), titulacao: z.string().trim().max(120).optional().nullable(), observacao: z.string().trim().max(500).optional().nullable() }).optional(),
    janelas: z.array(z.object({ diaSemana: z.number().int().min(0).max(6), inicioMin: z.number().int().min(0).max(1439), fimMin: z.number().int().min(1).max(1440), tipo: z.enum(['DISPONIVEL', 'INDISPONIVEL']).default('DISPONIVEL'), observacao: z.string().trim().max(200).optional().nullable() })).max(60).optional(),
  }), req)
  for (const j of d.janelas ?? []) if (j.fimMin <= j.inicioMin) throw httpErr(400, 'Em cada janela o fim deve ser depois do início.')
  const ops: any[] = []
  if (d.perfil) ops.push(prisma.porProfessorPerfil.upsert({ where: { tenantId_userId: { tenantId, userId: prof } }, update: d.perfil, create: { tenantId, userId: prof, ...d.perfil } }))
  if (d.janelas) ops.push(prisma.porDisponibilidade.deleteMany({ where: { tenantId, userId: prof } }), prisma.porDisponibilidade.createMany({ data: d.janelas.map((j) => ({ ...j, tenantId, userId: prof })) }))
  await prisma.$transaction(ops)
  res.json({ ok: true })
}))

router.get('/prof/professores', requireRole('COORDINATOR', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const secs = await prisma.classSection.findMany({ where: { tenantId, ...whereTurma(req) }, select: { professorUserId: true } })
  const ids = [...new Set(secs.map((s) => s.professorUserId))]
  const nomes = await nomesUsuarios(ids)
  res.json({ itens: ids.map((id) => ({ id, nome: nomes.get(id) ?? id, turmas: secs.filter((s) => s.professorUserId === id).length })) })
}))

export default router
