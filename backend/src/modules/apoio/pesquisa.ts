import { Router, Response } from 'express'
import { z } from 'zod'
import { createHmac } from 'crypto'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, AcademicRole, asyncHandler, getUserId, requireRole } from '../academico/middleware'
import { dateISO, mountCrud, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { completeReminders } from '../core/reminders'
import { ALUNO, MODULO, REF, hasRole, httpError, isSuper, nomesUsuarios, tid, scheduleReminder } from './common'
import { PerguntaInst, addDays, agregarRespostas, calcularNps, validarRespostas } from './logic'

// Instrumentos (avaliação docente, satisfação, NPS, egressos) + aplicações anônimas com agregação mínima.
const EQ: AcademicRole[] = ['SUPPORT', 'COORDINATOR']

const perguntaSchema = z.object({ id: z.string().min(1).max(40), texto: z.string().min(3).max(500), tipo: z.enum(['ESCALA', 'NPS', 'SIM_NAO', 'TEXTO', 'MULTIPLA']), opcoes: z.array(z.string().max(200)).max(20).optional(), obrigatoria: z.boolean().optional() })
const instrumentoSchema = z.object({
  nome: z.string().min(3).max(150), finalidade: z.enum(['AVALIACAO_DOCENTE', 'SATISFACAO_DISCIPLINA', 'SATISFACAO_SERVICO', 'NPS', 'ATENDIMENTO', 'EGRESSOS', 'CLIMA']).default('AVALIACAO_DOCENTE'), descricao: z.string().max(2000).optional(),
  perguntas: z.array(perguntaSchema).min(1).max(60).refine((a) => new Set(a.map((p) => p.id)).size === a.length, 'IDs de pergunta duplicados.').refine((a) => a.every((p) => p.tipo !== 'MULTIPLA' || (p.opcoes?.length ?? 0) >= 2), 'Pergunta MULTIPLA exige ao menos 2 opções.'),
  anonimo: z.boolean().default(true), minRespostas: z.number().int().min(1).max(500).default(5), escalaMax: z.number().int().min(3).max(10).default(5), ativo: z.boolean().default(true),
})

function segredo() { return process.env.EDU_CERT_SECRET || process.env.JWT_SECRET || 'edumaster-apoio' }
export const conviteEgressoCodigo = (tenantId: string, aplicacaoId: string, egressoId: string) => createHmac('sha256', segredo()).update(`${tenantId}:${aplicacaoId}:${egressoId}`).digest('hex').slice(0, 16)

// Resposta anônima: horário truncado ao dia para não correlacionar com a participação.
async function registrarResposta(p: { tenantId: string; aplicacao: any; respondenteId: string; respostas: Record<string, unknown>; nps?: number | null; comentario?: string | null }) {
  const inst = p.aplicacao.instrumento
  const erro = validarRespostas(inst.perguntas as PerguntaInst[], p.respostas, inst.escalaMax)
  if (erro) throw httpError(422, erro)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  await prisma.$transaction(async (tx) => {
    try { await tx.apoParticipacao.create({ data: { tenantId: p.tenantId, aplicacaoId: p.aplicacao.id, respondenteId: p.respondenteId } }) }
    catch (e: any) { if (e?.code === 'P2002') throw httpError(409, 'Você já respondeu esta pesquisa.'); throw e }
    await tx.apoResposta.create({ data: { tenantId: p.tenantId, aplicacaoId: p.aplicacao.id, respostas: p.respostas as any, nps: p.nps ?? null, comentario: p.comentario?.slice(0, 3000) || null, respondenteId: inst.anonimo ? null : p.respondenteId, createdAt: hoje } })
  })
}

async function alunosDoAlvo(tenantId: string, a: { alvoTipo: string; classSectionId?: string | null; alvoRef?: string | null }): Promise<string[]> {
  if (a.classSectionId) {
    const m = await prisma.classSectionEnrollment.findMany({ where: { classSectionId: a.classSectionId, enrollment: { status: 'ATIVA' } }, select: { enrollment: { select: { studentId: true } } } })
    return Array.from(new Set(m.map((x) => x.enrollment.studentId)))
  }
  if (a.alvoTipo === 'CURSO' && a.alvoRef) {
    const m = await prisma.enrollment.findMany({ where: { programId: a.alvoRef, status: 'ATIVA' }, select: { studentId: true } })
    return Array.from(new Set(m.map((x) => x.studentId)))
  }
  const s = await prisma.student.findMany({ where: { tenantId, status: 'ATIVO' }, select: { id: true }, take: 20000 })
  return s.map((x) => x.id)
}

export function mountPesquisa(router: Router) {
  mountCrud(router, { model: 'apoInstrumento', path: '/pesquisas/instrumentos', read: ['SUPPORT', 'COORDINATOR', 'TEACHER'], write: EQ, create: instrumentoSchema, filters: ['finalidade', 'ativo'], search: ['nome'], modulo: MODULO,
    beforeUpdate: async (_d: any, req: AuthenticatedRequest, cur: any) => {
      if (_d.perguntas) { const usado = await prisma.apoAplicacao.count({ where: { tenantId: tid(req), instrumentoId: cur.id, status: { not: 'RASCUNHO' } } }); if (usado > 0) throw httpError(409, 'Instrumento já aplicado: duplique-o para alterar as perguntas.') }
      return _d
    } })

  const aplicSchema = z.object({
    instrumentoId: z.string(), titulo: z.string().min(3).max(200), alvoTipo: z.enum(['DISCIPLINA', 'DOCENTE', 'SERVICO', 'ATENDIMENTO', 'CURSO', 'EGRESSOS', 'INSTITUICAO']).default('DISCIPLINA'),
    alvoRef: z.string().max(100).optional(), alvoRotulo: z.string().max(200).optional(), termId: z.string().optional(), classSectionId: z.string().optional(), professorUserId: z.string().optional(), disciplineId: z.string().optional(),
    abertura: dateISO(), fechamento: dateISO(), minRespostas: z.number().int().min(1).max(500).optional(),
  })

  router.post('/pesquisas/aplicacoes', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(aplicSchema, req.body)
    const inst = await prisma.apoInstrumento.findFirst({ where: { id: b.instrumentoId, tenantId, ativo: true } })
    if (!inst) throw httpError(404, 'Instrumento não encontrado.')
    if (b.fechamento <= b.abertura) throw httpError(400, 'Fechamento deve ser posterior à abertura.')
    let professorUserId = b.professorUserId, disciplineId = b.disciplineId, termId = b.termId
    if (b.classSectionId) {
      const t = await prisma.classSection.findFirst({ where: { id: b.classSectionId, tenantId } })
      if (!t) throw httpError(404, 'Turma não encontrada.')
      professorUserId = professorUserId ?? t.professorUserId; disciplineId = disciplineId ?? t.disciplineId; termId = termId ?? t.termId
    }
    if (inst.finalidade === 'AVALIACAO_DOCENTE' && !professorUserId) throw httpError(422, 'Avaliação docente exige turma ou professor.')
    const a = await prisma.apoAplicacao.create({ data: { ...b, professorUserId, disciplineId, termId, tenantId, minRespostas: b.minRespostas ?? inst.minRespostas } })
    res.status(201).json(a)
  }))

  router.get('/pesquisas/aplicacoes', requireRole(...EQ, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const where: any = { tenantId }
    for (const f of ['status', 'alvoTipo', 'professorUserId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (req.user?.role === 'TEACHER') { where.professorUserId = getUserId(req); where.status = 'PUBLICADA' }
    const items = await prisma.apoAplicacao.findMany({ where, include: { instrumento: { select: { nome: true, finalidade: true } }, _count: { select: { respostas: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })
    res.json(items.map((a) => ({ ...a, publicoAlvo: undefined, respostasRecebidas: req.user?.role === 'TEACHER' ? undefined : a._count.respostas, _count: undefined })))
  }))

  // Abre: congela o público convidado, notifica e agenda lembretes.
  router.post('/pesquisas/aplicacoes/:id/abrir', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.apoAplicacao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { instrumento: true } })
    if (!a) throw httpError(404, 'Aplicação não encontrada.')
    if (a.status !== 'RASCUNHO') throw httpError(409, `Aplicação ${a.status}.`)
    let publico: any = {}
    let convidados = 0
    if (a.alvoTipo === 'EGRESSOS') {
      const eg = await prisma.apoEgresso.findMany({ where: { tenantId, consenteContato: true, ...(a.alvoRef ? { programId: a.alvoRef } : {}) }, select: { id: true, email: true, telefone: true, nome: true }, take: 20000 })
      publico = { egressoIds: eg.map((e) => e.id) }; convidados = eg.length
      for (const e of eg) if (e.email || e.telefone) await notify({ tenantId, canal: e.email ? 'EMAIL' : 'WHATSAPP', destino: e.email ?? e.telefone ?? undefined, assunto: `Pesquisa: ${a.titulo}`, mensagem: `Olá, ${e.nome}! Sua opinião é muito importante. Responda em: /api/public/edu/apoio/pesquisa-egresso/${tenantId}/${a.id}?egressoId=${e.id}&codigo=${conviteEgressoCodigo(tenantId, a.id, e.id)}`, templateKey: 'apoio.pesquisa.egresso', refType: REF.aplicacao, refId: a.id, agendadoPara: a.abertura })
    } else {
      const ids = await alunosDoAlvo(tenantId, a)
      publico = { studentIds: ids }; convidados = ids.length
      if (a.abertura <= new Date()) for (const sid of ids) await notify({ tenantId, studentId: sid, assunto: `Pesquisa: ${a.titulo}`, mensagem: `Participe da pesquisa "${a.titulo}" até ${a.fechamento.toLocaleDateString('pt-BR')}. ${a.instrumento.anonimo ? 'Suas respostas são anônimas.' : ''}`, templateKey: 'apoio.pesquisa.convite', refType: REF.aplicacao, refId: a.id })
    }
    if (!convidados) throw httpError(422, 'Nenhum participante elegível para esta aplicação.')
    const upd = await prisma.apoAplicacao.update({ where: { id: a.id }, data: { status: 'ABERTA', publicoAlvo: publico, convidados } })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Pesquisa "${a.titulo}" encerra: acompanhar resultados`, dueAt: a.fechamento, antecedenciaDias: 0, assigneeRole: 'SUPPORT', refType: REF.aplicacao, refId: a.id, dedupeKey: `apo-pesq-fecha-${a.id}` })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'PESQUISA_ABERTA', refType: REF.aplicacao, refId: a.id })
    res.json({ ...upd, publicoAlvo: undefined })
  }))

  router.post('/pesquisas/aplicacoes/:id/encerrar', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.apoAplicacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a || a.status !== 'ABERTA') throw httpError(409, 'Somente aplicações abertas podem ser encerradas.')
    await completeReminders({ tenantId, refType: REF.aplicacao, refId: a.id })
    res.json({ ...(await prisma.apoAplicacao.update({ where: { id: a.id }, data: { status: 'ENCERRADA' } })), publicoAlvo: undefined })
  }))

  // Pendências do aluno
  router.get('/pesquisas/pendentes', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const sid = req.user?.studentId
    if (!sid) return res.json([])
    const agora = new Date()
    const abertas = await prisma.apoAplicacao.findMany({ where: { tenantId, status: 'ABERTA', abertura: { lte: agora }, fechamento: { gte: agora } }, include: { instrumento: { select: { nome: true, anonimo: true, perguntas: true, escalaMax: true } } } })
    const part = new Set((await prisma.apoParticipacao.findMany({ where: { tenantId, respondenteId: sid, aplicacaoId: { in: abertas.map((a) => a.id) } }, select: { aplicacaoId: true } })).map((p) => p.aplicacaoId))
    res.json(abertas.filter((a) => !part.has(a.id) && ((a.publicoAlvo as any)?.studentIds ?? []).includes(sid)).map((a) => ({ id: a.id, titulo: a.titulo, alvoTipo: a.alvoTipo, alvoRotulo: a.alvoRotulo, fechamento: a.fechamento, anonimo: a.instrumento.anonimo, perguntas: a.instrumento.perguntas, escalaMax: a.instrumento.escalaMax })))
  }))

  router.post('/pesquisas/aplicacoes/:id/responder', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const sid = req.user?.studentId
    if (!sid) throw httpError(403, 'Usuário não vinculado a um aluno.')
    const a = await prisma.apoAplicacao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { instrumento: true } })
    if (!a) throw httpError(404, 'Pesquisa não encontrada.')
    const agora = new Date()
    if (a.status !== 'ABERTA' || a.abertura > agora || a.fechamento < agora) throw httpError(422, 'Pesquisa fora do período de resposta.')
    if (!((a.publicoAlvo as any)?.studentIds ?? []).includes(sid)) throw httpError(403, 'Você não foi convidado a esta pesquisa.')
    const b = parseBody(z.object({ respostas: z.record(z.string(), z.any()), nps: z.number().int().min(0).max(10).optional(), comentario: z.string().max(3000).optional() }), req.body)
    const npsPergunta = (a.instrumento.perguntas as any as PerguntaInst[]).find((p) => p.tipo === 'NPS')
    const nps = b.nps ?? (npsPergunta && typeof b.respostas[npsPergunta.id] === 'number' ? (b.respostas[npsPergunta.id] as number) : null)
    await registrarResposta({ tenantId, aplicacao: a, respondenteId: sid, respostas: b.respostas, nps, comentario: b.comentario })
    res.status(201).json({ ok: true, mensagem: 'Resposta registrada. Obrigado!' })
  }))

  // Resultados agregados — respeita o mínimo de respostas; professor só vê o próprio após publicação.
  router.get('/pesquisas/aplicacoes/:id/resultados', requireRole(...EQ, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.apoAplicacao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { instrumento: true } })
    if (!a) throw httpError(404, 'Aplicação não encontrada.')
    if (req.user?.role === 'TEACHER' && (a.professorUserId !== getUserId(req) || a.status !== 'PUBLICADA')) throw httpError(403, 'Resultados disponíveis ao professor somente após publicação.')
    const rs = await prisma.apoResposta.findMany({ where: { tenantId, aplicacaoId: a.id }, select: { respostas: true, nps: true, comentario: true } })
    const agg = agregarRespostas(a.instrumento.perguntas as any, rs.map((r) => ({ respostas: r.respostas as any, nps: r.nps, comentario: r.comentario })), a.minRespostas ?? a.instrumento.minRespostas, a.convidados)
    res.json({ aplicacao: { id: a.id, titulo: a.titulo, status: a.status, alvoTipo: a.alvoTipo, alvoRotulo: a.alvoRotulo }, ...agg })
  }))

  // Publica resultados ao professor (exige mínimo de respostas); abre prazo para a devolutiva da coordenação.
  router.post('/pesquisas/aplicacoes/:id/publicar', requireRole('COORDINATOR', 'SUPPORT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.apoAplicacao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { instrumento: true } })
    if (!a) throw httpError(404, 'Aplicação não encontrada.')
    if (a.status !== 'ENCERRADA') throw httpError(409, 'Encerre a aplicação antes de publicar.')
    const n = await prisma.apoResposta.count({ where: { tenantId, aplicacaoId: a.id } })
    const min = a.minRespostas ?? a.instrumento.minRespostas
    if (n < min) throw httpError(422, `Apenas ${n} resposta(s); o mínimo para divulgar é ${min} (preserva o anonimato).`)
    await prisma.apoAplicacao.update({ where: { id: a.id }, data: { status: 'PUBLICADA', publicadaEm: new Date() } })
    if (a.professorUserId) {
      await notify({ tenantId, userId: a.professorUserId, assunto: 'Resultado da avaliação docente disponível', mensagem: `Os resultados de "${a.titulo}" foram publicados. A coordenação enviará a devolutiva.`, refType: REF.aplicacao, refId: a.id })
      await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Enviar devolutiva da avaliação docente: ${a.titulo}`, dueAt: addDays(new Date(), 15), assigneeRole: 'COORDINATOR', refType: REF.aplicacao, refId: a.id, severity: 'ATENCAO', dedupeKey: `apo-devolutiva-${a.id}` })
    }
    res.json({ ok: true, respostas: n })
  }))

  router.post('/pesquisas/aplicacoes/:id/devolutiva', requireRole('COORDINATOR', 'SUPPORT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.apoAplicacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a || a.status !== 'PUBLICADA' || !a.professorUserId) throw httpError(409, 'Devolutiva requer aplicação publicada com professor.')
    const b = parseBody(z.object({ mensagem: z.string().min(20).max(5000), planoMelhoria: z.string().max(5000).optional() }), req.body)
    const d = await prisma.apoDevolutiva.create({ data: { tenantId, aplicacaoId: a.id, professorUserId: a.professorUserId, mensagem: b.mensagem, planoMelhoria: b.planoMelhoria, autorId: getUserId(req) } })
    await completeReminders({ tenantId, refType: REF.aplicacao, refId: a.id, userId: getUserId(req) })
    await notify({ tenantId, userId: a.professorUserId, assunto: 'Devolutiva da avaliação docente', mensagem: b.mensagem.slice(0, 300), refType: REF.aplicacao, refId: a.id })
    res.status(201).json(d)
  }))

  router.get('/pesquisas/minhas-devolutivas', requireRole('TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const items = await prisma.apoDevolutiva.findMany({ where: { tenantId, professorUserId: getUserId(req) }, include: { aplicacao: { select: { titulo: true, alvoRotulo: true } } }, orderBy: { createdAt: 'desc' }, take: 50 })
    await prisma.apoDevolutiva.updateMany({ where: { tenantId, professorUserId: getUserId(req), visualizadaEm: null }, data: { visualizadaEm: new Date() } })
    res.json(items)
  }))

  // Ranking/painel de avaliação docente por período (apenas aplicações com mínimo atingido).
  router.get('/pesquisas/painel-docente', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const apps = await prisma.apoAplicacao.findMany({ where: { tenantId, alvoTipo: { in: ['DOCENTE', 'DISCIPLINA'] }, professorUserId: { not: null }, status: { in: ['ENCERRADA', 'PUBLICADA'] }, ...(qs(req.query.termId) ? { termId: qs(req.query.termId) } : {}) }, include: { instrumento: true }, take: 500 })
    const nomes = await nomesUsuarios(tenantId, apps.map((a) => a.professorUserId))
    const out: any[] = []
    for (const a of apps) {
      const rs = await prisma.apoResposta.findMany({ where: { tenantId, aplicacaoId: a.id }, select: { respostas: true, nps: true, comentario: true } })
      const agg: any = agregarRespostas(a.instrumento.perguntas as any, rs.map((r) => ({ respostas: r.respostas as any, nps: r.nps, comentario: r.comentario })), a.minRespostas ?? a.instrumento.minRespostas, a.convidados)
      out.push({ aplicacaoId: a.id, titulo: a.titulo, professorUserId: a.professorUserId, professor: nomes[a.professorUserId!], n: agg.n, taxaResposta: agg.taxaResposta, mediaGeral: agg.suprimido ? null : agg.mediaGeral, nps: agg.suprimido ? null : agg.nps?.nps ?? null, suprimido: agg.suprimido })
    }
    res.json(out.sort((x, y) => (y.mediaGeral ?? -1) - (x.mediaGeral ?? -1)))
  }))

  // NPS consolidado por finalidade (agrega apenas aplicações com mínimo de respostas).
  router.get('/pesquisas/nps', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const fin = qs(req.query.finalidade)
    const desde = qs(req.query.desde) ? new Date(String(qs(req.query.desde))) : addDays(new Date(), -365)
    const apps = await prisma.apoAplicacao.findMany({ where: { tenantId, status: { in: ['ENCERRADA', 'PUBLICADA', 'ABERTA'] }, abertura: { gte: desde }, ...(fin ? { instrumento: { finalidade: fin as any } } : {}) }, include: { instrumento: { select: { finalidade: true, minRespostas: true } } } })
    const linhas: any[] = []
    const todos: number[] = []
    for (const a of apps) {
      const r = await prisma.apoResposta.findMany({ where: { tenantId, aplicacaoId: a.id, nps: { not: null } }, select: { nps: true } })
      const scores = r.map((x) => x.nps as number)
      const min = a.minRespostas ?? a.instrumento.minRespostas
      if (scores.length < min) { linhas.push({ aplicacaoId: a.id, titulo: a.titulo, alvoTipo: a.alvoTipo, n: scores.length, suprimido: true }); continue }
      todos.push(...scores)
      linhas.push({ aplicacaoId: a.id, titulo: a.titulo, alvoTipo: a.alvoTipo, ...calcularNps(scores), suprimido: false })
    }
    res.json({ geral: calcularNps(todos), aplicacoes: linhas })
  }))

  // Controle de quem ainda não respondeu (somente contagem; sem identificar respostas).
  router.get('/pesquisas/aplicacoes/:id/adesao', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.apoAplicacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) throw httpError(404, 'Aplicação não encontrada.')
    const responderam = await prisma.apoParticipacao.count({ where: { tenantId, aplicacaoId: a.id } })
    res.json({ convidados: a.convidados, responderam, taxa: a.convidados ? Math.round((responderam / a.convidados) * 1000) / 10 : null })
  }))
}

// Job: encerra aplicações vencidas; lembra não-respondentes 2 dias antes do fim (1x).
export async function jobPesquisas() {
  const agora = new Date()
  const vencidas = await prisma.apoAplicacao.findMany({ where: { status: 'ABERTA', fechamento: { lt: agora } }, take: 500 })
  for (const a of vencidas) { await prisma.apoAplicacao.update({ where: { id: a.id }, data: { status: 'ENCERRADA' } }); await completeReminders({ tenantId: a.tenantId, refType: REF.aplicacao, refId: a.id }) }
  const proximas = await prisma.apoAplicacao.findMany({ where: { status: 'ABERTA', fechamento: { gt: agora, lt: addDays(agora, 2) } }, take: 200 })
  let lembrados = 0
  for (const a of proximas) {
    const ja = await prisma.apoAndamento.findFirst({ where: { tenantId: a.tenantId, refType: REF.aplicacao, refId: a.id, tipo: 'LEMBRETE_ENVIADO' } })
    if (ja) continue
    const ids: string[] = (a.publicoAlvo as any)?.studentIds ?? []
    if (ids.length) {
      const resp = new Set((await prisma.apoParticipacao.findMany({ where: { aplicacaoId: a.id }, select: { respondenteId: true } })).map((p) => p.respondenteId))
      for (const sid of ids) if (!resp.has(sid)) { await notify({ tenantId: a.tenantId, studentId: sid, assunto: `Última chance: pesquisa "${a.titulo}"`, mensagem: `A pesquisa encerra em ${a.fechamento.toLocaleDateString('pt-BR')}. Participe!`, refType: REF.aplicacao, refId: a.id }); lembrados++ }
    }
    await prisma.apoAndamento.create({ data: { tenantId: a.tenantId, refType: REF.aplicacao, refId: a.id, tipo: 'LEMBRETE_ENVIADO', texto: 'Lembrete aos não respondentes enviado.' } })
  }
  return { encerradas: vencidas.length, lembrados }
}

// Resposta pública de egressos (convite com código HMAC) — usada pelo publicRouter.
export async function responderPesquisaEgresso(tenantId: string, aplicacaoId: string, egressoId: string, codigo: string, corpo: any) {
  if (codigo !== conviteEgressoCodigo(tenantId, aplicacaoId, egressoId)) throw httpError(403, 'Convite inválido.')
  const a = await prisma.apoAplicacao.findFirst({ where: { id: aplicacaoId, tenantId, alvoTipo: 'EGRESSOS' }, include: { instrumento: true } })
  if (!a) throw httpError(404, 'Pesquisa não encontrada.')
  const agora = new Date()
  if (a.status !== 'ABERTA' || a.fechamento < agora) throw httpError(422, 'Pesquisa encerrada.')
  if (!((a.publicoAlvo as any)?.egressoIds ?? []).includes(egressoId)) throw httpError(403, 'Convite inválido.')
  const b = parseBody(z.object({ respostas: z.record(z.string(), z.any()), nps: z.number().int().min(0).max(10).optional(), comentario: z.string().max(3000).optional() }), corpo)
  const np = (a.instrumento.perguntas as any as PerguntaInst[]).find((p) => p.tipo === 'NPS')
  await registrarResposta({ tenantId, aplicacao: a, respondenteId: egressoId, respostas: b.respostas, nps: b.nps ?? (np && typeof b.respostas[np.id] === 'number' ? (b.respostas[np.id] as number) : null), comentario: b.comentario })
  await prisma.apoEgresso.updateMany({ where: { id: egressoId, tenantId }, data: { ultimaAtualizacaoEm: new Date() } })
}
export async function dadosPesquisaEgresso(tenantId: string, aplicacaoId: string, egressoId: string, codigo: string) {
  if (codigo !== conviteEgressoCodigo(tenantId, aplicacaoId, egressoId)) throw httpError(403, 'Convite inválido.')
  const a = await prisma.apoAplicacao.findFirst({ where: { id: aplicacaoId, tenantId, alvoTipo: 'EGRESSOS', status: 'ABERTA' }, include: { instrumento: { select: { nome: true, perguntas: true, escalaMax: true } } } })
  if (!a) throw httpError(404, 'Pesquisa não encontrada ou encerrada.')
  return { titulo: a.titulo, fechamento: a.fechamento, perguntas: a.instrumento.perguntas, escalaMax: a.instrumento.escalaMax }
}
