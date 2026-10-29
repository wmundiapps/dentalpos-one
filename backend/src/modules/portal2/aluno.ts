import crypto from 'crypto'
import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId } from '../academico/middleware'
import { audit } from '../core/notify'
import { getBranding } from '../core/branding'
import { getBoletimAluno, getHistoricoAluno } from '../notas/service'
import { alvoAluno, alunoDoTenant, bodyOf, DAY, FINALIDADES, httpErr, isMgmt, minhaStudentId, nomesUsuarios, pct, qs, role, urlSegura } from './common'
import { whereTurma } from './ambientes'

// Portal do aluno (complemento ao /notas/portal/meu-painel, /notas/meu/boletim e /notas/meu/historico).
// Gestão pode consultar um aluno com ?studentId= (somente leitura).
const router = Router()
const soAluno = (req: AuthenticatedRequest) => { if (role(req) !== 'STUDENT') throw httpErr(403, 'Esta ação é exclusiva do aluno.'); return minhaStudentId(req) }

// ---------------------------------------------------------------------------------------------
// Turmas / disciplinas do aluno (respeita o ambiente de ensino atual)
// ---------------------------------------------------------------------------------------------
router.get('/aluno/turmas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = alvoAluno(req)
  const todas = qs(req.query.todas) === '1'
  const now = new Date()
  const vinc = await prisma.classSectionEnrollment.findMany({
    where: { enrollment: { studentId, student: { tenantId } }, classSection: { tenantId, ...whereTurma(req), ...(todas ? {} : { term: { dataInicio: { lte: now }, dataFim: { gte: now } } }) } },
    include: { classSection: { include: { discipline: { select: { nome: true, cargaHoraria: true } }, term: { select: { codigo: true } } } }, enrollment: { select: { programId: true } } },
  })
  const nomes = await nomesUsuarios(vinc.map((v) => v.classSection.professorUserId))
  const ids = vinc.map((v) => v.classSectionId)
  const [mats, prog, ents] = ids.length ? await Promise.all([
    prisma.porMaterial.groupBy({ by: ['classSectionId'], where: { tenantId, classSectionId: { in: ids }, status: 'PUBLICADO' }, _count: true }),
    prisma.porProgresso.groupBy({ by: ['classSectionId'], where: { tenantId, studentId, classSectionId: { in: ids }, concluido: true }, _count: true }),
    prisma.porEntrega.groupBy({ by: ['classSectionId'], where: { tenantId, studentId, classSectionId: { in: ids } }, _count: true }),
  ]) : [[], [], []] as any[]
  res.json({ itens: vinc.map((v) => {
    const total = (mats as any[]).find((m) => m.classSectionId === v.classSectionId)?._count ?? 0
    const feitos = ((prog as any[]).find((m) => m.classSectionId === v.classSectionId)?._count ?? 0)
    return { classSectionId: v.classSectionId, turma: v.classSection.nome, disciplina: v.classSection.discipline.nome, cargaHoraria: v.classSection.discipline.cargaHoraria, periodo: v.classSection.term.codigo, professor: nomes.get(v.classSection.professorUserId) ?? null, programId: v.enrollment.programId, materiais: total, concluidos: Math.min(total, feitos), percentual: pct(Math.min(total, feitos), total) ?? 0, entregas: (ents as any[]).find((m) => m.classSectionId === v.classSectionId)?._count ?? 0 }
  }) })
}))

// ---------------------------------------------------------------------------------------------
// Frequência / lista de chamadas por disciplina + justificativa de faltas
// ---------------------------------------------------------------------------------------------
router.get('/aluno/frequencia', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = alvoAluno(req)
  const classSectionId = qs(req.query.classSectionId)
  const vinc = await prisma.classSectionEnrollment.findMany({
    where: { enrollment: { studentId, student: { tenantId } }, classSection: { tenantId, ...whereTurma(req) }, ...(classSectionId ? { classSectionId } : {}) },
    include: { classSection: { include: { discipline: { select: { nome: true } }, term: { select: { codigo: true, dataInicio: true, dataFim: true } } } } },
  })
  const now = new Date()
  const alvo = classSectionId ? vinc : vinc.filter((v) => v.classSection.term.dataInicio <= now && v.classSection.term.dataFim >= now)
  const secIds = alvo.map((v) => v.classSectionId)
  const sessoes = secIds.length ? await prisma.classSession.findMany({ where: { classSectionId: { in: secIds }, status: { in: ['REALIZADA', 'CANCELADA'] } }, orderBy: { dataHoraInicio: 'asc' } }) : []
  const att = sessoes.length ? await prisma.attendance.findMany({ where: { studentId, classSessionId: { in: sessoes.map((s) => s.id) } } }) : []
  const just = await prisma.porJustificativa.findMany({ where: { tenantId, studentId }, orderBy: { createdAt: 'desc' } })
  const regras = await Promise.all(secIds.map(async (id) => ({ id, r: await prisma.ntRegraAvaliacao.findFirst({ where: { tenantId, OR: [{ classSectionId: id }, { escopo: 'TENANT', padrao: true }] }, orderBy: { escopo: 'desc' } }) })))
  const disciplinas = alvo.map((v) => {
    const ss = sessoes.filter((s) => s.classSectionId === v.classSectionId && s.status === 'REALIZADA')
    const linhas = ss.map((s) => {
      const a = att.find((x) => x.classSessionId === s.id)
      return { sessionId: s.id, data: s.dataHoraInicio, titulo: s.titulo, tipo: s.tipo, situacao: !a ? 'SEM_REGISTRO' : a.presente ? 'PRESENTE' : a.justificativa ? 'FALTA_JUSTIFICADA' : 'FALTA', justificativa: a?.justificativa ?? null }
    })
    const comChamada = linhas.filter((l) => l.situacao !== 'SEM_REGISTRO')
    const presencas = comChamada.filter((l) => l.situacao === 'PRESENTE').length
    const faltas = comChamada.filter((l) => l.situacao === 'FALTA').length
    const justificadas = comChamada.filter((l) => l.situacao === 'FALTA_JUSTIFICADA').length
    const minima = regras.find((r) => r.id === v.classSectionId)?.r?.frequenciaMinima ?? 75
    const pctPres = pct(presencas + justificadas, comChamada.length)
    const limiteFaltas = ss.length ? Math.floor(comChamada.length * (1 - minima / 100)) : null
    return { classSectionId: v.classSectionId, disciplina: v.classSection.discipline.nome, turma: v.classSection.nome, periodo: v.classSection.term.codigo, aulas: comChamada.length, presencas, faltas, justificadas, frequenciaPct: pctPres, frequenciaMinima: minima, emRisco: pctPres != null && pctPres < minima, margemFaltas: limiteFaltas != null ? Math.max(0, limiteFaltas - faltas) : null, linhas }
  })
  res.json({ disciplinas, justificativas: just })
}))

router.get('/aluno/justificativas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json({ itens: await prisma.porJustificativa.findMany({ where: { tenantId: getTenantId(req), studentId: alvoAluno(req) }, orderBy: { createdAt: 'desc' }, take: 100 }) })
}))

router.post('/aluno/justificativas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = soAluno(req)
  const d = bodyOf(z.object({ classSectionId: z.string().optional().nullable(), dataInicio: z.coerce.date(), dataFim: z.coerce.date(), motivo: z.string().trim().min(10, 'Descreva o motivo (mín. 10 caracteres).').max(2000), anexoUrl: z.string().trim().max(2000).optional().nullable(), anexoNome: z.string().trim().max(200).optional().nullable() }), req)
  const now = new Date()
  if (d.dataFim < d.dataInicio) throw httpErr(400, 'A data final é anterior à inicial.')
  if (d.dataInicio > now) throw httpErr(400, 'Não é possível justificar faltas futuras.')
  if ((d.dataFim.getTime() - d.dataInicio.getTime()) / DAY > 30) throw httpErr(400, 'O período máximo de uma justificativa é de 30 dias.')
  if ((now.getTime() - d.dataFim.getTime()) / DAY > 30) throw httpErr(400, 'O prazo para justificar é de 30 dias após a falta.')
  if (d.anexoUrl) urlSegura(d.anexoUrl)
  const faltas = await faltasNoPeriodo(tenantId, studentId, d.dataInicio, d.dataFim, d.classSectionId ?? undefined)
  if (!faltas.length) throw httpErr(400, 'Não há faltas registradas neste período para justificar.')
  const dup = await prisma.porJustificativa.findFirst({ where: { tenantId, studentId, status: 'PENDENTE', classSectionId: d.classSectionId ?? null, dataInicio: { lte: d.dataFim }, dataFim: { gte: d.dataInicio } } })
  if (dup) throw httpErr(409, 'Já existe uma justificativa pendente para este período.')
  const j = await prisma.porJustificativa.create({ data: { tenantId, studentId, classSectionId: d.classSectionId ?? null, dataInicio: d.dataInicio, dataFim: d.dataFim, motivo: d.motivo, anexoUrl: d.anexoUrl, anexoNome: d.anexoNome, prazoEm: new Date(now.getTime() + 5 * DAY) } })
  res.status(201).json({ ...j, faltasNoPeriodo: faltas.length })
}))

router.post('/aluno/justificativas/:id/cancelar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = soAluno(req)
  const j = await prisma.porJustificativa.findFirst({ where: { id: String(req.params.id), tenantId, studentId } })
  if (!j) throw httpErr(404, 'Justificativa não encontrada.')
  if (j.status !== 'PENDENTE') throw httpErr(409, 'Só é possível cancelar justificativas pendentes.')
  res.json(await prisma.porJustificativa.update({ where: { id: j.id }, data: { status: 'CANCELADA' } }))
}))

async function faltasNoPeriodo(tenantId: string, studentId: string, ini: Date, fim: Date, classSectionId?: string) {
  const fimDia = new Date(fim.getTime() + DAY - 1)
  return prisma.attendance.findMany({
    where: { studentId, presente: false, OR: [{ justificativa: null }, { justificativa: '' }], classSession: { dataHoraInicio: { gte: ini, lte: fimDia }, classSection: { tenantId, ...(classSectionId ? { id: classSectionId } : {}) } } },
    select: { id: true },
  })
}

// Fila de justificativas para professor/coordenação decidirem.
router.get('/justificativas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = role(req)
  if (!isMgmt(req) && r !== 'TEACHER') throw httpErr(403, 'Sem permissão.')
  const where: any = { tenantId }
  if (qs(req.query.status)) where.status = qs(req.query.status)
  if (r === 'TEACHER') {
    const secs = await prisma.classSection.findMany({ where: { tenantId, professorUserId: getUserId(req) }, select: { id: true } })
    where.classSectionId = { in: secs.map((s) => s.id) }
  }
  const itens = await prisma.porJustificativa.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 })
  const alunos = await prisma.student.findMany({ where: { tenantId, id: { in: itens.map((i) => i.studentId) } }, select: { id: true, ra: true, nomeCompleto: true } })
  res.json({ itens: itens.map((i) => ({ ...i, aluno: alunos.find((a) => a.id === i.studentId) ?? null })) })
}))

router.post('/justificativas/:id/decisao', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const j = await prisma.porJustificativa.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!j) throw httpErr(404, 'Justificativa não encontrada.')
  if (!isMgmt(req)) {
    if (role(req) !== 'TEACHER' || !j.classSectionId) throw httpErr(403, 'Sem permissão.')
    const sec = await prisma.classSection.findFirst({ where: { id: j.classSectionId, tenantId, professorUserId: getUserId(req) } })
    if (!sec) throw httpErr(403, 'Esta turma não é sua.')
  }
  if (j.status !== 'PENDENTE') throw httpErr(409, 'Esta justificativa já foi decidida.')
  const d = bodyOf(z.object({ status: z.enum(['DEFERIDA', 'INDEFERIDA']), parecer: z.string().trim().min(3, 'Informe o parecer.').max(2000) }), req)
  let abonadas = 0
  if (d.status === 'DEFERIDA') {
    const fimDia = new Date(j.dataFim.getTime() + DAY - 1)
    const r = await prisma.attendance.updateMany({
      where: { studentId: j.studentId, presente: false, OR: [{ justificativa: null }, { justificativa: '' }], classSession: { dataHoraInicio: { gte: j.dataInicio, lte: fimDia }, classSection: { tenantId, ...(j.classSectionId ? { id: j.classSectionId } : {}) } } },
      data: { justificativa: `Justificada: ${j.motivo}`.slice(0, 480) },
    })
    abonadas = r.count
  }
  const upd = await prisma.porJustificativa.update({ where: { id: j.id }, data: { status: d.status, parecer: d.parecer, decididoPor: getUserId(req), decididoEm: new Date(), faltasAbonadas: abonadas } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'portal2', acao: 'JUSTIFICATIVA_' + d.status, refType: 'PorJustificativa', refId: j.id, detalhes: { abonadas } })
  res.json(upd)
}))

// Presença por QR Code (o professor abre o QR na aula; o aluno lê pelo celular).
router.post('/aluno/chamada-qr', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = soAluno(req)
  const { token } = bodyOf(z.object({ token: z.string().trim().min(8).max(200) }), req)
  const q = await prisma.porChamadaQr.findFirst({ where: { token, tenantId } })
  if (!q) throw httpErr(404, 'QR Code inválido.')
  if (q.expiraEm < new Date()) throw httpErr(410, 'Este QR Code expirou. Peça ao professor para gerar outro.')
  const n = await prisma.classSectionEnrollment.count({ where: { classSectionId: q.classSectionId, enrollment: { studentId } } })
  if (!n) throw httpErr(403, 'Você não está matriculado nesta turma.')
  const ex = await prisma.attendance.findUnique({ where: { classSessionId_studentId: { classSessionId: q.classSessionId, studentId } } })
  if (ex?.presente) return res.json({ ok: true, jaRegistrada: true })
  await prisma.attendance.upsert({ where: { classSessionId_studentId: { classSessionId: q.classSessionId, studentId } }, update: { presente: true, justificativa: null, registradoEm: new Date() }, create: { classSessionId: q.classSessionId, studentId, presente: true } })
  await prisma.porAcesso.create({ data: { tenantId, studentId, classSectionId: q.classSectionId, tipo: 'CHAMADA_QR' } })
  res.json({ ok: true, jaRegistrada: false })
}))

// ---------------------------------------------------------------------------------------------
// Calendário / horário
// ---------------------------------------------------------------------------------------------
router.get('/aluno/horario', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = alvoAluno(req)
  const now = new Date()
  const vinc = await prisma.classSectionEnrollment.findMany({
    where: { enrollment: { studentId, student: { tenantId } }, classSection: { tenantId, ...whereTurma(req), term: { dataInicio: { lte: now }, dataFim: { gte: now } } } },
    include: { classSection: { include: { discipline: { select: { nome: true } } } } },
  })
  const ids = vinc.map((v) => v.classSectionId)
  const nome = new Map(vinc.map((v) => [v.classSectionId, v.classSection.discipline.nome]))
  const [slots, aulas, provas] = ids.length ? await Promise.all([
    (prisma as any).calSlot?.findMany({ where: { tenantId, ativo: true, classSectionId: { in: ids } }, orderBy: [{ diaSemana: 'asc' }, { inicioMin: 'asc' }] }).catch(() => []) ?? [],
    prisma.classSession.findMany({ where: { classSectionId: { in: ids }, status: 'AGENDADA', dataHoraInicio: { gte: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + 45 * DAY) } }, orderBy: { dataHoraInicio: 'asc' }, take: 120 }),
    prisma.ntComponente.findMany({ where: { tenantId, classSectionId: { in: ids }, dataPrevista: { gte: now, lte: new Date(now.getTime() + 60 * DAY) } }, orderBy: { dataPrevista: 'asc' } }),
  ]) : [[], [], []] as any[]
  const virtuais = ids.length ? await prisma.porMaterial.findMany({ where: { tenantId, classSectionId: { in: ids }, status: 'PUBLICADO', OR: [{ tipo: 'AULA_AO_VIVO', inicioEm: { gte: now } }, { tipo: 'ATIVIDADE', prazoEntrega: { gte: now } }] }, orderBy: { inicioEm: 'asc' }, take: 60 }) : []
  res.json({
    gradeSemanal: (slots as any[]).map((s) => ({ classSectionId: s.classSectionId, disciplina: nome.get(s.classSectionId), diaSemana: s.diaSemana, inicioMin: s.inicioMin, fimMin: s.fimMin, tipoAula: s.tipoAula, spaceId: s.spaceId })),
    aulas: (aulas as any[]).map((a) => ({ id: a.id, classSectionId: a.classSectionId, disciplina: nome.get(a.classSectionId), titulo: a.titulo, tipo: a.tipo, inicio: a.dataHoraInicio, fim: a.dataHoraFim, local: a.local })),
    avaliacoes: (provas as any[]).map((p) => ({ classSectionId: p.classSectionId, disciplina: nome.get(p.classSectionId), titulo: `${p.codigo} — ${p.nome}`, data: p.dataPrevista })),
    virtuais: virtuais.map((m) => ({ id: m.id, classSectionId: m.classSectionId, disciplina: nome.get(m.classSectionId), titulo: m.titulo, tipo: m.tipo, data: m.tipo === 'AULA_AO_VIVO' ? m.inicioEm : m.prazoEntrega, url: m.tipo === 'AULA_AO_VIVO' ? m.url : null })),
  })
}))

// ---------------------------------------------------------------------------------------------
// Fluxograma curricular
// ---------------------------------------------------------------------------------------------
router.get('/aluno/fluxograma', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = alvoAluno(req)
  const matriculas = await prisma.enrollment.findMany({ where: { studentId, student: { tenantId } }, include: { program: true }, orderBy: { dataMatricula: 'desc' } })
  const programas = new Map<string, any>()
  for (const m of matriculas) if (!programas.has(m.programId)) programas.set(m.programId, m.program)
  const lista = [...programas.values()]
  const progId = qs(req.query.programId) || lista[0]?.id
  if (!progId) return res.json({ programas: [], fluxograma: null })
  if (!programas.has(progId)) throw httpErr(404, 'Curso não encontrado para este aluno.')
  res.json({ programas: lista.map((p) => ({ id: p.id, nome: p.nome })), fluxograma: await montarFluxograma(tenantId, studentId, progId) })
}))

export async function montarFluxograma(tenantId: string, studentId: string, programId: string) {
  const prog = await prisma.academicProgram.findFirst({ where: { id: programId, tenantId } })
  if (!prog) throw httpErr(404, 'Curso não encontrado.')
  const [cfg, grade, reqs, hist, cursando] = await Promise.all([
    prisma.porCursoConfig.findUnique({ where: { tenantId_programId: { tenantId, programId } } }),
    prisma.curriculumDiscipline.findMany({ where: { programId }, include: { discipline: { select: { id: true, nome: true, cargaHoraria: true } } }, orderBy: [{ periodo: 'asc' }] }),
    prisma.porPreRequisito.findMany({ where: { tenantId, programId } }),
    getHistoricoAluno(tenantId, studentId),
    prisma.classSectionEnrollment.findMany({ where: { enrollment: { studentId, programId }, classSection: { tenantId, term: { dataInicio: { lte: new Date() }, dataFim: { gte: new Date() } } } }, select: { classSection: { select: { disciplineId: true } } } }),
  ])
  const linhas: any[] = (hist?.periodos || []).flatMap((p: any) => p.disciplinas)
  const aprovadas = new Set(linhas.filter((l) => l.situacao === 'APROVADO').map((l) => l.disciplineId))
  const reprov = new Set(linhas.filter((l) => String(l.situacao).startsWith('REPROVADO')).map((l) => l.disciplineId))
  const atuais = new Set(cursando.map((c) => c.classSection.disciplineId))
  const tipo = cfg?.tipoPeriodo ?? 'SEMESTRE'
  const porAno = cfg?.periodosPorAno ?? 2
  const nomePorId = new Map(grade.map((g) => [g.disciplineId, g.discipline.nome]))
  const disciplinas = grade.map((g) => {
    const pre = reqs.filter((r) => r.disciplineId === g.disciplineId).map((r) => r.requisitoDisciplineId)
    const pendentesPre = pre.filter((p) => !aprovadas.has(p))
    const ultima = [...linhas].reverse().find((l) => l.disciplineId === g.disciplineId)
    let status = 'PENDENTE'
    if (aprovadas.has(g.disciplineId)) status = 'APROVADA'
    else if (atuais.has(g.disciplineId)) status = 'CURSANDO'
    else if (reprov.has(g.disciplineId)) status = 'REPROVADA'
    else if (pendentesPre.length) status = 'BLOQUEADA'
    return { disciplineId: g.disciplineId, nome: g.discipline.nome, cargaHoraria: g.discipline.cargaHoraria, periodo: g.periodo, obrigatoria: g.obrigatoria, status, mediaFinal: ultima?.mediaFinal ?? null, preRequisitos: pre.map((id) => ({ disciplineId: id, nome: nomePorId.get(id) ?? '?', cumprido: aprovadas.has(id) })), bloqueadaPor: pendentesPre.map((id) => nomePorId.get(id) ?? '?') }
  })
  const periodos = [...new Set(disciplinas.map((d) => d.periodo))].sort((a, b) => a - b).map((n) => ({ periodo: n, ano: Math.ceil(n / porAno), rotulo: `${n}º ${rotulo(tipo)}`, disciplinas: disciplinas.filter((d) => d.periodo === n) }))
  const anos = [...new Set(periodos.map((p) => p.ano))].map((a) => ({ ano: a, rotulo: `${a}º ano`, periodos: periodos.filter((p) => p.ano === a).map((p) => p.periodo) }))
  const chTotal = disciplinas.reduce((s, d) => s + d.cargaHoraria, 0)
  const chCumprida = disciplinas.filter((d) => d.status === 'APROVADA').reduce((s, d) => s + d.cargaHoraria, 0)
  const cont = (s: string) => disciplinas.filter((d) => d.status === s).length
  return {
    programa: { id: prog.id, nome: prog.nome, modalidade: prog.modalidade, cargaHorariaTotal: prog.cargaHorariaTotal },
    config: { tipoPeriodo: tipo, periodosPorAno: porAno, rotuloPeriodo: rotulo(tipo) },
    periodos, anos,
    resumo: { disciplinas: disciplinas.length, aprovadas: cont('APROVADA'), cursando: cont('CURSANDO'), pendentes: cont('PENDENTE') + cont('BLOQUEADA'), reprovadas: cont('REPROVADA'), chTotal, chCumprida, percentual: pct(chCumprida, chTotal) ?? 0 },
  }
}
const rotulo = (t: string) => ({ SEMESTRE: 'semestre', BIMESTRE: 'bimestre', TRIMESTRE: 'trimestre', MODULO: 'módulo', ANO: 'ano' } as any)[t] || 'período'

// ---------------------------------------------------------------------------------------------
// Requerimentos e revisões (visão consolidada com prazo e resposta)
// ---------------------------------------------------------------------------------------------
router.get('/aluno/requerimentos', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = alvoAluno(req)
  const now = new Date()
  const [protos, revs, procs, just] = await Promise.all([
    prisma.secProtocolo.findMany({ where: { tenantId, studentId }, orderBy: { createdAt: 'desc' }, take: 100, include: { tipo: { select: { nome: true } } } }),
    prisma.ntRevisao.findMany({ where: { tenantId, studentId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.porProcesso.findMany({ where: { tenantId, studentId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.porJustificativa.findMany({ where: { tenantId, studentId }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ])
  const secs = await prisma.classSection.findMany({ where: { tenantId, id: { in: revs.map((r) => r.classSectionId) } }, select: { id: true, discipline: { select: { nome: true } } } })
  const comps = await prisma.ntComponente.findMany({ where: { tenantId, id: { in: revs.map((r) => r.componenteId) } }, select: { id: true, codigo: true, nome: true } })
  const FINAIS_P = ['CONCLUIDO', 'CANCELADO', 'INDEFERIDO', 'DEFERIDO']
  const itens: any[] = [
    ...protos.map((p) => ({ kind: 'REQUERIMENTO', id: p.id, numero: p.numero, titulo: p.assunto, tipo: p.tipo?.nome, status: p.status, aberto: !FINAIS_P.includes(String(p.status)), prazoEm: p.prazoEm, atrasado: !FINAIS_P.includes(String(p.status)) && p.prazoEm < now, resposta: p.decisao ? `${p.decisao}${p.decisaoMotivo ? ` — ${p.decisaoMotivo}` : ''}` : null, criadoEm: p.createdAt, respondidoEm: p.decididoEm ?? p.concluidoEm })),
    ...revs.map((r) => ({ kind: 'REVISAO', id: r.id, numero: null, titulo: `Revisão de nota — ${secs.find((s) => s.id === r.classSectionId)?.discipline.nome ?? ''} (${comps.find((c) => c.id === r.componenteId)?.nome ?? ''})`, tipo: 'Revisão de nota', status: r.status, aberto: ['SOLICITADA', 'PARECER_EMITIDO'].includes(r.status), prazoEm: r.prazoParecer, atrasado: ['SOLICITADA', 'PARECER_EMITIDO'].includes(r.status) && !!r.prazoParecer && r.prazoParecer < now, resposta: r.decisao ? `${r.decisao}${r.notaNova != null ? ` — nota ${r.notaNova}` : ''}` : r.parecer, criadoEm: r.createdAt, respondidoEm: r.decididoEm ?? r.parecerEm })),
    ...procs.map((p) => ({ kind: 'PROCESSO', id: p.id, numero: p.numero, titulo: rotuloProc(p.tipo), tipo: 'Processo interno', status: p.status, aberto: !['DEFERIDO', 'INDEFERIDO', 'CONCLUIDO', 'CANCELADO'].includes(p.status), prazoEm: p.prazoEm, atrasado: !['DEFERIDO', 'INDEFERIDO', 'CONCLUIDO', 'CANCELADO'].includes(p.status) && !!p.prazoEm && p.prazoEm < now, resposta: p.decisao, criadoEm: p.createdAt, respondidoEm: p.decididoEm })),
    ...just.map((j) => ({ kind: 'JUSTIFICATIVA', id: j.id, numero: null, titulo: 'Justificativa de faltas', tipo: 'Frequência', status: j.status, aberto: j.status === 'PENDENTE', prazoEm: j.prazoEm, atrasado: j.status === 'PENDENTE' && !!j.prazoEm && j.prazoEm < now, resposta: j.parecer, criadoEm: j.createdAt, respondidoEm: j.decididoEm })),
  ].sort((a, b) => +new Date(b.criadoEm) - +new Date(a.criadoEm))
  res.json({ itens, resumo: { total: itens.length, abertos: itens.filter((i) => i.aberto).length, atrasados: itens.filter((i) => i.atrasado).length } })
}))
export const rotuloProc = (t: string) => ({ TRANCAMENTO: 'Trancamento de matrícula', DESTRANCAMENTO: 'Destrancamento de matrícula', TRANSFERENCIA: 'Transferência', APROVEITAMENTO: 'Aproveitamento de estudos', CANCELAMENTO: 'Cancelamento de matrícula' } as any)[t] || t

// ---------------------------------------------------------------------------------------------
// Financeiro: parcelas, 2ª via (boleto/Pix simulados), acordos
// ---------------------------------------------------------------------------------------------
const CHAVE_PIX = (tenantId: string) => `pix-${tenantId}@pagamentos.simulado`
function encargos(valor: number, venc: Date, now = new Date()) {
  const dias = Math.floor((now.getTime() - venc.getTime()) / DAY)
  if (dias <= 0) return { dias: 0, multa: 0, juros: 0, total: Math.round(valor * 100) / 100 }
  const multa = Math.round(valor * 0.02 * 100) / 100
  const juros = Math.round(valor * (0.01 / 30) * dias * 100) / 100
  return { dias, multa, juros, total: Math.round((valor + multa + juros) * 100) / 100 }
}
const dv10 = (s: string) => { let soma = 0, peso = 2; for (let i = s.length - 1; i >= 0; i--) { let p = Number(s[i]) * peso; if (p > 9) p -= 9; soma += p; peso = peso === 2 ? 1 : 2 } return String((10 - (soma % 10)) % 10) }

router.get('/aluno/financeiro', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = alvoAluno(req)
  const now = new Date()
  const rows = await prisma.accountReceivable.findMany({ where: { tenantId, studentId }, orderBy: { dataVencimento: 'asc' }, take: 300 })
  const itens = rows.map((r) => {
    const aberto = ['PENDENTE', 'ATRASADO'].includes(r.status)
    const vencida = aberto && r.dataVencimento < now
    return { id: r.id, descricao: r.descricao, parcela: r.numeroParcela, valor: r.valor, vencimento: r.dataVencimento, pagoEm: r.dataPagamento, status: r.status === 'PENDENTE' && vencida ? 'ATRASADO' : r.status, vencida, encargos: vencida ? encargos(r.valor, r.dataVencimento, now) : null }
  })
  const abertas = itens.filter((i) => ['PENDENTE', 'ATRASADO'].includes(i.status))
  const acordos = await prisma.porAcordo.findMany({ where: { tenantId, studentId }, orderBy: { createdAt: 'desc' }, take: 20 })
  res.json({
    itens, acordos,
    resumo: { emAberto: abertas.reduce((s, i) => s + i.valor, 0), vencido: abertas.filter((i) => i.vencida).reduce((s, i) => s + (i.encargos?.total ?? i.valor), 0), qtdVencidas: abertas.filter((i) => i.vencida).length, pagas: itens.filter((i) => i.status === 'PAGO').length, proximo: abertas.find((i) => !i.vencida) ?? null, emDia: !abertas.some((i) => i.vencida) },
  })
}))

router.post('/aluno/financeiro/:id/segunda-via', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = soAluno(req)
  const r = await prisma.accountReceivable.findFirst({ where: { id: String(req.params.id), tenantId, studentId } })
  if (!r) throw httpErr(404, 'Parcela não encontrada.')
  if (!['PENDENTE', 'ATRASADO'].includes(r.status)) throw httpErr(409, 'Esta parcela não está em aberto.')
  const { forma } = bodyOf(z.object({ forma: z.enum(['BOLETO', 'PIX']).default('BOLETO') }), req)
  const now = new Date()
  const e = encargos(r.valor, r.dataVencimento, now)
  // vencimento do boleto atualizado: se vencida, 3 dias úteis (aprox. 3 dias corridos) a partir de hoje
  const venc = e.dias > 0 ? new Date(now.getTime() + 3 * DAY) : r.dataVencimento
  const h = crypto.createHash('sha256').update(`${r.id}:${e.total}:${venc.toISOString().slice(0, 10)}`).digest('hex')
  const base = '34191' + ('0' + (parseInt(h.slice(0, 8), 16) % 1e9)).slice(-9)
  const fator = String(Math.max(0, Math.floor((venc.getTime() - Date.UTC(1997, 9, 7)) / DAY) % 10000)).padStart(4, '0')
  const valorStr = String(Math.round(e.total * 100)).padStart(10, '0')
  const campo = (s: string) => s + dv10(s)
  const linha = `${campo(base)} ${campo(h.slice(8, 18).replace(/[a-f]/g, (c) => String(c.charCodeAt(0) % 10)))} ${campo(h.slice(18, 28).replace(/[a-f]/g, (c) => String(c.charCodeAt(0) % 10)))} ${(parseInt(h.slice(28, 29), 16) % 9) + 1} ${fator}${valorStr}`
  const txid = h.slice(0, 25).toUpperCase()
  const emv = `00020126580014BR.GOV.BCB.PIX0136${CHAVE_PIX(tenantId).padEnd(36).slice(0, 36)}5204000053039865406${e.total.toFixed(2).padStart(6, '0')}5802BR5909INSTITUTO6009SAO PAULO62${String(4 + txid.length).padStart(2, '0')}05${String(txid.length).padStart(2, '0')}${txid}6304`
  await audit({ tenantId, userId: getUserId(req), modulo: 'portal2', acao: 'SEGUNDA_VIA_' + forma, refType: 'AccountReceivable', refId: r.id })
  res.json({
    simulado: true, aviso: 'Cobrança gerada pelo provedor SIMULADO (sem integração bancária configurada).', forma, parcela: { id: r.id, descricao: r.descricao, valorOriginal: r.valor, vencimentoOriginal: r.dataVencimento }, encargos: e, vencimento: venc, valorTotal: e.total,
    ...(forma === 'BOLETO' ? { linhaDigitavel: linha, beneficiario: 'Instituição de Ensino (simulado)' } : { pixCopiaECola: emv, txid, validadeMin: 60 }),
  })
}))

function calcAcordo(rows: { valor: number; dataVencimento: Date }[], parcelas: number, entrada: number) {
  const orig = rows.reduce((s, r) => s + r.valor, 0)
  const enc = rows.reduce((s, r) => s + (encargos(r.valor, r.dataVencimento).total - r.valor), 0)
  const perc = parcelas <= 3 ? 1 : parcelas <= 6 ? 0.5 : 0       // desconto sobre multa+juros conforme prazo
  const desconto = Math.round(enc * perc * 100) / 100
  const total = Math.round((orig + enc - desconto) * 100) / 100
  const restante = Math.max(0, total - entrada)
  const n = Math.max(1, parcelas)
  return { valorOriginal: Math.round(orig * 100) / 100, encargos: Math.round(enc * 100) / 100, desconto, total, entrada, parcelas: n, valorParcela: Math.round((restante / n) * 100) / 100, percentualDesconto: perc }
}
const acordoSchema = z.object({ receivableIds: z.array(z.string()).min(1).max(36), parcelas: z.number().int().min(1).max(12), entrada: z.number().min(0).max(1e7).default(0), primeiroVencimento: z.coerce.date().optional(), observacao: z.string().trim().max(1000).optional() })

async function parcelasDoAcordo(tenantId: string, studentId: string, ids: string[]) {
  const rows = await prisma.accountReceivable.findMany({ where: { tenantId, studentId, id: { in: ids }, status: { in: ['PENDENTE', 'ATRASADO'] } } })
  if (rows.length !== new Set(ids).size) throw httpErr(400, 'Algumas parcelas não estão em aberto ou não pertencem a você.')
  if (!rows.some((r) => r.dataVencimento < new Date())) throw httpErr(400, 'Acordos são para parcelas vencidas: inclua ao menos uma parcela em atraso.')
  return rows
}

router.post('/aluno/acordos/simular', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = soAluno(req)
  const d = bodyOf(acordoSchema, req)
  const rows = await parcelasDoAcordo(tenantId, studentId, d.receivableIds)
  const c = calcAcordo(rows, d.parcelas, d.entrada)
  if (d.entrada > c.total) throw httpErr(400, 'A entrada não pode ser maior que o total do acordo.')
  if (c.parcelas > 1 && c.valorParcela < 50) throw httpErr(400, 'A parcela mínima é de R$ 50,00. Reduza o número de parcelas.')
  res.json(c)
}))

router.post('/aluno/acordos', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = soAluno(req)
  const d = bodyOf(acordoSchema, req)
  const rows = await parcelasDoAcordo(tenantId, studentId, d.receivableIds)
  const c = calcAcordo(rows, d.parcelas, d.entrada)
  if (d.entrada > c.total) throw httpErr(400, 'A entrada não pode ser maior que o total do acordo.')
  if (c.parcelas > 1 && c.valorParcela < 50) throw httpErr(400, 'A parcela mínima é de R$ 50,00.')
  const aberto = await prisma.porAcordo.findFirst({ where: { tenantId, studentId, status: 'SOLICITADO' } })
  if (aberto) throw httpErr(409, 'Você já tem um acordo aguardando análise.')
  const pv = d.primeiroVencimento ?? new Date(Date.now() + 7 * DAY)
  if (pv.getTime() < Date.now() - DAY) throw httpErr(400, 'O primeiro vencimento deve ser futuro.')
  const a = await prisma.porAcordo.create({ data: { tenantId, studentId, receivableIds: d.receivableIds, valorOriginal: c.valorOriginal, desconto: c.desconto, entrada: c.entrada, parcelas: c.parcelas, valorParcela: c.valorParcela, primeiroVencimento: pv, observacao: d.observacao } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'portal2', acao: 'ACORDO_SOLICITADO', refType: 'PorAcordo', refId: a.id })
  res.status(201).json({ ...a, calculo: c })
}))

router.post('/aluno/acordos/:id/cancelar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = soAluno(req)
  const a = await prisma.porAcordo.findFirst({ where: { id: String(req.params.id), tenantId, studentId } })
  if (!a) throw httpErr(404, 'Acordo não encontrado.')
  if (a.status !== 'SOLICITADO') throw httpErr(409, 'Só é possível cancelar acordos aguardando análise.')
  res.json(await prisma.porAcordo.update({ where: { id: a.id }, data: { status: 'CANCELADO' } }))
}))

router.get('/acordos', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  if (!isMgmt(req) && role(req) !== 'FINANCE') throw httpErr(403, 'Sem permissão.')
  const itens = await prisma.porAcordo.findMany({ where: { tenantId, ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 })
  const al = await prisma.student.findMany({ where: { tenantId, id: { in: itens.map((i) => i.studentId) } }, select: { id: true, ra: true, nomeCompleto: true } })
  res.json({ itens: itens.map((i) => ({ ...i, aluno: al.find((a) => a.id === i.studentId) ?? null })) })
}))

router.post('/acordos/:id/decisao', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  if (!isMgmt(req) && role(req) !== 'FINANCE') throw httpErr(403, 'Sem permissão.')
  const a = await prisma.porAcordo.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!a) throw httpErr(404, 'Acordo não encontrado.')
  if (a.status !== 'SOLICITADO') throw httpErr(409, 'Este acordo já foi decidido.')
  const d = bodyOf(z.object({ status: z.enum(['APROVADO', 'RECUSADO']), parecer: z.string().trim().max(1000).optional() }), req)
  if (d.status === 'RECUSADO') {
    return res.json(await prisma.porAcordo.update({ where: { id: a.id }, data: { status: 'RECUSADO', parecer: d.parecer, decididoPor: getUserId(req), decididoEm: new Date() } }))
  }
  const ids = a.receivableIds as string[]
  const out = await prisma.$transaction(async (tx) => {
    // "claim" atômico: as parcelas originais só podem ser trocadas uma vez
    const claim = await tx.accountReceivable.updateMany({ where: { tenantId, studentId: a.studentId, id: { in: ids }, status: { in: ['PENDENTE', 'ATRASADO'] } }, data: { status: 'CANCELADO' } })
    if (claim.count !== ids.length) throw httpErr(409, 'As parcelas do acordo mudaram de situação (pagas ou canceladas). Recuse e peça uma nova simulação.')
    const novas: string[] = []
    const total = a.valorParcela * a.parcelas
    const mk = async (descricao: string, valor: number, n: number, venc: Date) => {
      const r = await tx.accountReceivable.create({ data: { tenantId, studentId: a.studentId, descricao, numeroParcela: n, valor: Math.round(valor * 100) / 100, dataVencimento: venc, status: 'PENDENTE' } })
      novas.push(r.id)
    }
    let seq = 0
    if (a.entrada > 0) await mk(`Acordo ${a.id.slice(0, 8)} — entrada`, a.entrada, seq++, new Date(Date.now() + DAY))
    for (let i = 0; i < a.parcelas; i++) {
      const v = new Date(a.primeiroVencimento); v.setMonth(v.getMonth() + i)
      await mk(`Acordo ${a.id.slice(0, 8)} — parcela ${i + 1}/${a.parcelas}`, i === a.parcelas - 1 ? total - a.valorParcela * (a.parcelas - 1) : a.valorParcela, ++seq, v)
    }
    const upd = await tx.porAcordo.update({ where: { id: a.id }, data: { status: 'APROVADO', parecer: d.parecer, decididoPor: getUserId(req), decididoEm: new Date() } })
    return { ...upd, parcelasGeradas: novas.length }
  })
  await audit({ tenantId, userId: getUserId(req), modulo: 'portal2', acao: 'ACORDO_APROVADO', refType: 'PorAcordo', refId: a.id })
  res.json(out)
}))

// ---------------------------------------------------------------------------------------------
// Mensagens e avisos (notificações + recados dos professores)
// ---------------------------------------------------------------------------------------------
router.get('/aluno/mensagens', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = alvoAluno(req)
  const vinc = await prisma.classSectionEnrollment.findMany({ where: { enrollment: { studentId, student: { tenantId } }, classSection: { tenantId } }, select: { classSectionId: true, classSection: { select: { discipline: { select: { nome: true } } } } } })
  const [notifs, recados] = await Promise.all([
    prisma.eduNotification.findMany({ where: { tenantId, studentId, canal: 'IN_APP', status: { not: 'CANCELADA' } }, orderBy: { createdAt: 'desc' }, take: 60 }),
    prisma.porRecado.findMany({ where: { tenantId, classSectionId: { in: vinc.map((v) => v.classSectionId) } }, orderBy: { createdAt: 'desc' }, take: 40 }),
  ])
  const disc = new Map(vinc.map((v) => [v.classSectionId, v.classSection.discipline.nome]))
  const itens = [
    ...notifs.map((n) => ({ id: n.id, origem: 'AVISO', assunto: n.assunto, mensagem: n.mensagem, lida: !!n.lidaEm, em: n.createdAt })),
    ...recados.map((r) => ({ id: r.id, origem: 'PROFESSOR', assunto: `${disc.get(r.classSectionId) ?? 'Turma'}: ${r.titulo}`, mensagem: r.mensagem, de: r.autorNome, lida: true, em: r.createdAt })),
  ].sort((a, b) => +new Date(b.em) - +new Date(a.em))
  res.json({ itens, naoLidas: itens.filter((i) => !i.lida).length })
}))

router.post('/aluno/mensagens/:id/lida', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = soAluno(req)
  const r = await prisma.eduNotification.updateMany({ where: { id: String(req.params.id), tenantId, studentId, lidaEm: null }, data: { lidaEm: new Date() } })
  res.json({ ok: true, atualizadas: r.count })
}))
router.post('/aluno/mensagens/lidas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = soAluno(req)
  const r = await prisma.eduNotification.updateMany({ where: { tenantId, studentId, lidaEm: null, canal: 'IN_APP' }, data: { lidaEm: new Date() } })
  res.json({ ok: true, atualizadas: r.count })
}))

// ---------------------------------------------------------------------------------------------
// Carteirinha digital com QR (validação pública minimizada)
// ---------------------------------------------------------------------------------------------
async function carteirinhaAtiva(tenantId: string, studentId: string, forcarNova = false) {
  let c = forcarNova ? null : await prisma.porCarteirinha.findFirst({ where: { tenantId, studentId, status: 'ATIVA', validade: { gte: new Date() } }, orderBy: { emitidaEm: 'desc' } })
  if (!c) {
    await prisma.porCarteirinha.updateMany({ where: { tenantId, studentId, status: 'ATIVA' }, data: { status: 'REVOGADA' } })
    const fim = await prisma.academicTerm.findFirst({ where: { tenantId, dataFim: { gte: new Date() } }, orderBy: { dataFim: 'asc' } })
    const validade = fim?.dataFim ?? new Date(Date.now() + 180 * DAY)
    c = await prisma.porCarteirinha.create({ data: { tenantId, studentId, codigo: crypto.randomBytes(12).toString('hex'), validade } })
  }
  return c
}

router.get('/aluno/carteirinha', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = alvoAluno(req)
  const aluno = await alunoDoTenant(tenantId, studentId)
  if (!['ATIVO', 'CONCLUIDO', 'FORMADO'].includes(aluno.status)) throw httpErr(409, `Carteirinha indisponível: matrícula ${aluno.status.toLowerCase()}.`)
  const c = await carteirinhaAtiva(tenantId, studentId)
  const [brand, en] = await Promise.all([getBranding(tenantId), prisma.enrollment.findFirst({ where: { studentId }, include: { program: { select: { nome: true, modalidade: true } } }, orderBy: { dataMatricula: 'desc' } })])
  res.json({
    codigo: c.codigo, validade: c.validade, status: c.status, emitidaEm: c.emitidaEm,
    aluno: { nome: aluno.nomeCompleto, ra: aluno.ra, curso: en?.program.nome ?? null, modalidade: en?.program.modalidade ?? null },
    instituicao: { nome: brand.nome, sigla: brand.sigla, cores: brand.cores, logo: brand.logoPrincipal },
    qrTexto: `edumaster:carteirinha:${c.codigo}`, urlValidacao: `/api/public/edu/portal2/carteirinha/${c.codigo}`,
  })
}))

router.post('/aluno/carteirinha/renovar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = soAluno(req)
  const c = await carteirinhaAtiva(tenantId, studentId, true)
  await audit({ tenantId, userId: getUserId(req), modulo: 'portal2', acao: 'CARTEIRINHA_REEMITIDA', refType: 'PorCarteirinha', refId: c.id })
  res.status(201).json({ codigo: c.codigo, validade: c.validade })
}))

export async function validarCarteirinha(codigo: string) {
  const c = await prisma.porCarteirinha.findUnique({ where: { codigo } })
  if (!c) return { valida: false, motivo: 'Carteirinha não encontrada.' }
  const aluno = await prisma.student.findFirst({ where: { id: c.studentId, tenantId: c.tenantId }, select: { nomeCompleto: true, ra: true, status: true } })
  const vencida = c.validade < new Date()
  const valida = c.status === 'ATIVA' && !vencida && aluno?.status === 'ATIVO'
  // minimização (LGPD): só nome abreviado e RA parcial
  const partes = (aluno?.nomeCompleto || '').split(' ')
  return { valida, motivo: valida ? null : c.status !== 'ATIVA' ? 'Carteirinha revogada.' : vencida ? 'Carteirinha vencida.' : 'Matrícula não está ativa.', titular: aluno ? `${partes[0]} ${partes.length > 1 ? partes[partes.length - 1][0] + '.' : ''}` : null, ra: aluno ? aluno.ra.slice(0, 2) + '***' + aluno.ra.slice(-2) : null, validade: c.validade }
}

// ---------------------------------------------------------------------------------------------
// Privacidade (LGPD): consentimentos e exportação dos meus dados
// ---------------------------------------------------------------------------------------------
router.get('/aluno/privacidade', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), userId = getUserId(req)
  const cs = await prisma.porConsentimento.findMany({ where: { tenantId, userId } })
  res.json({
    finalidades: FINALIDADES.map((f) => { const c = cs.find((x) => x.finalidade === f.chave); return { ...f, concedido: c?.concedido ?? false, atualizadoEm: c?.updatedAt ?? null, historico: (c?.historico as any[]) ?? [] } }),
    tratamentosEssenciais: [
      { titulo: 'Execução do contrato educacional', baseLegal: 'Execução de contrato (art. 7º, V)', descricao: 'Matrícula, notas, frequência, financeiro e documentos acadêmicos.' },
      { titulo: 'Obrigações legais e regulatórias', baseLegal: 'Obrigação legal (art. 7º, II)', descricao: 'Censo da Educação Superior, histórico escolar e emissão de diplomas.' },
    ],
    direitos: 'Você pode confirmar a existência de tratamento, acessar, corrigir, portar e pedir a eliminação de dados tratados com base em consentimento. Use "Exportar meus dados" ou abra um requerimento na Secretaria.',
  })
}))

router.put('/aluno/privacidade/:finalidade', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), userId = getUserId(req)
  const f = FINALIDADES.find((x) => x.chave === String(req.params.finalidade))
  if (!f) throw httpErr(404, 'Finalidade desconhecida.')
  const { concedido } = bodyOf(z.object({ concedido: z.boolean() }), req)
  const ex = await prisma.porConsentimento.findUnique({ where: { tenantId_userId_finalidade: { tenantId, userId, finalidade: f.chave } } })
  const hist = [...(((ex?.historico as any[]) ?? []).slice(-19)), { em: new Date().toISOString(), concedido, origem: 'PORTAL_ALUNO' }]
  const c = await prisma.porConsentimento.upsert({ where: { tenantId_userId_finalidade: { tenantId, userId, finalidade: f.chave } }, update: { concedido, historico: hist as any }, create: { tenantId, userId, studentId: req.user?.studentId, finalidade: f.chave, concedido, baseLegal: f.baseLegal, historico: hist as any } })
  await audit({ tenantId, userId, modulo: 'portal2', acao: concedido ? 'CONSENTIMENTO_CONCEDIDO' : 'CONSENTIMENTO_REVOGADO', refType: 'PorConsentimento', refId: c.id, detalhes: { finalidade: f.chave } })
  res.json({ finalidade: f.chave, concedido: c.concedido, atualizadoEm: c.updatedAt })
}))

router.get('/aluno/privacidade/exportar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), userId = getUserId(req), studentId = soAluno(req)
  const [aluno, matriculas, boletim, historico, freq, fin, protos, cons, acessos, user] = await Promise.all([
    prisma.student.findFirst({ where: { id: studentId, tenantId } }),
    prisma.enrollment.findMany({ where: { studentId }, include: { program: { select: { nome: true, modalidade: true } }, term: { select: { codigo: true } } } }),
    getBoletimAluno(tenantId, studentId),
    getHistoricoAluno(tenantId, studentId),
    prisma.attendance.findMany({ where: { studentId }, select: { classSessionId: true, presente: true, justificativa: true, registradoEm: true } }),
    prisma.accountReceivable.findMany({ where: { tenantId, studentId }, select: { descricao: true, numeroParcela: true, valor: true, dataVencimento: true, dataPagamento: true, status: true } }),
    prisma.secProtocolo.findMany({ where: { tenantId, studentId }, select: { numero: true, assunto: true, status: true, createdAt: true, decisao: true } }),
    prisma.porConsentimento.findMany({ where: { tenantId, userId } }),
    prisma.porAcesso.findMany({ where: { tenantId, studentId }, orderBy: { createdAt: 'desc' }, take: 500, select: { tipo: true, createdAt: true, classSectionId: true } }),
    prisma.user.findFirst({ where: { id: userId, tenantId }, select: { email: true, firstName: true, lastName: true } }),
  ])
  await audit({ tenantId, userId, modulo: 'portal2', acao: 'EXPORTACAO_DADOS_TITULAR', refType: 'Student', refId: studentId })
  res.setHeader('Content-Disposition', 'attachment; filename="meus-dados.json"')
  res.json({ geradoEm: new Date().toISOString(), formato: 'EduMaster/portabilidade-v1', titular: { ...aluno, cpf: aluno?.cpf ?? null, contaDeAcesso: user }, matriculas, boletim, historico, frequencias: freq, financeiro: fin, requerimentos: protos, consentimentos: cons.map((c) => ({ finalidade: c.finalidade, concedido: c.concedido, atualizadoEm: c.updatedAt, historico: c.historico })), acessosSalaVirtual: acessos })
}))

// ---------------------------------------------------------------------------------------------
// Avaliação docente (aluno responde; resultado anônimo para o professor)
// ---------------------------------------------------------------------------------------------
export const CRITERIOS_DOCENTE = [
  { chave: 'dominio', titulo: 'Domínio do conteúdo' }, { chave: 'didatica', titulo: 'Didática e clareza' },
  { chave: 'pontualidade', titulo: 'Pontualidade e assiduidade' }, { chave: 'feedback', titulo: 'Feedback e correção das avaliações' },
  { chave: 'respeito', titulo: 'Respeito e atendimento aos alunos' },
] as const

router.get('/aluno/avaliacao-docente', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = soAluno(req)
  const vinc = await prisma.classSectionEnrollment.findMany({ where: { enrollment: { studentId, student: { tenantId } }, classSection: { tenantId } }, include: { classSection: { include: { discipline: { select: { nome: true } }, term: { select: { codigo: true, dataInicio: true, dataFim: true } } } } } })
  const feitas = await prisma.porAvaliacaoDocente.findMany({ where: { tenantId, studentId }, select: { classSectionId: true } })
  const nomes = await nomesUsuarios(vinc.map((v) => v.classSection.professorUserId))
  const now = new Date()
  res.json({ criterios: CRITERIOS_DOCENTE, itens: vinc.filter((v) => v.classSection.term.dataInicio <= now).map((v) => ({ classSectionId: v.classSectionId, disciplina: v.classSection.discipline.nome, professor: nomes.get(v.classSection.professorUserId) ?? null, periodo: v.classSection.term.codigo, respondida: feitas.some((f) => f.classSectionId === v.classSectionId) })) })
}))

router.post('/aluno/avaliacao-docente', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = soAluno(req)
  const d = bodyOf(z.object({ classSectionId: z.string(), notas: z.record(z.string(), z.number().int().min(1).max(5)), comentario: z.string().trim().max(2000).optional() }), req)
  const n = await prisma.classSectionEnrollment.findFirst({ where: { classSectionId: d.classSectionId, enrollment: { studentId } }, include: { classSection: true } })
  if (!n || n.classSection.tenantId !== tenantId) throw httpErr(403, 'Você não está matriculado nesta turma.')
  const faltam = CRITERIOS_DOCENTE.filter((c) => d.notas[c.chave] == null)
  if (faltam.length) throw httpErr(400, `Avalie todos os critérios (faltam: ${faltam.map((f) => f.titulo).join(', ')}).`)
  const notas = Object.fromEntries(CRITERIOS_DOCENTE.map((c) => [c.chave, d.notas[c.chave]]))
  const media = Object.values(notas).reduce((s: number, v: any) => s + v, 0) / CRITERIOS_DOCENTE.length
  const ex = await prisma.porAvaliacaoDocente.findUnique({ where: { classSectionId_studentId: { classSectionId: d.classSectionId, studentId } } })
  if (ex) throw httpErr(409, 'Você já avaliou esta turma.')
  await prisma.porAvaliacaoDocente.create({ data: { tenantId, classSectionId: d.classSectionId, professorUserId: n.classSection.professorUserId, studentId, notas, media: Math.round(media * 100) / 100, comentario: d.comentario } })
  res.status(201).json({ ok: true })
}))

export default router
