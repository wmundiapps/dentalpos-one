import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { APOIO, APOIO_COORD, MODULO, REF, ALUNO, carregarAluno, exigirAluno, hasRole, httpError, isSuper, nomesAlunos, nomesUsuarios, tid } from './common'
import { addDays } from './logic'

// Quem pode ler o relato de um atendimento:
//  - o profissional que atendeu: sempre;
//  - NORMAL: equipe de apoio (SUPPORT) e coordenação; RESTRITO: apenas SUPPORT; SIGILOSO: SOMENTE o profissional.
export function podeVerRelato(a: { sigilo: string; profissionalId: string }, req: AuthenticatedRequest): boolean {
  if (a.profissionalId === req.user?.id) return true
  if (a.sigilo === 'SIGILOSO') return false
  if (a.sigilo === 'RESTRITO') return hasRole(req, 'SUPPORT')
  return hasRole(req, 'SUPPORT', 'COORDINATOR')
}

export function sanitizarAtendimento(a: any, req: AuthenticatedRequest) {
  if (podeVerRelato(a, req)) return { ...a, relatoVisivel: true }
  const { relato, encaminhamentos, motivo, ...resto } = a
  return { ...resto, motivo: a.sigilo === 'NORMAL' ? motivo : null, relatoVisivel: false }
}

const criarSchema = z.object({
  studentId: z.string().min(1),
  tipo: z.enum(['PSICOPEDAGOGICO', 'PSICOLOGICO', 'SOCIAL', 'SAUDE', 'ACESSIBILIDADE', 'ORIENTACAO_ACADEMICA', 'OUTRO']),
  sigilo: z.enum(['NORMAL', 'RESTRITO', 'SIGILOSO']).optional(),
  dataHora: dateISO(),
  duracaoMin: z.number().int().min(10).max(240).default(50),
  profissionalId: z.string().optional(),
  origem: z.enum(['PROCURA_ESPONTANEA', 'ENCAMINHAMENTO_PROFESSOR', 'BUSCA_ATIVA', 'RISCO_EVASAO']).default('PROCURA_ESPONTANEA'),
  motivo: z.string().max(2000).optional(),
  planoAcaoId: z.string().optional(),
})

// Sigilo padrão por tipo: clínicos/psicológicos são sigilosos.
const SIGILO_PADRAO: Record<string, 'NORMAL' | 'RESTRITO' | 'SIGILOSO'> = { PSICOLOGICO: 'SIGILOSO', PSICOPEDAGOGICO: 'RESTRITO', SAUDE: 'SIGILOSO', SOCIAL: 'RESTRITO', ACESSIBILIDADE: 'NORMAL', ORIENTACAO_ACADEMICA: 'NORMAL', OUTRO: 'RESTRITO' }

export function mountAtendimentos(router: Router) {
  router.get('/atendimentos', requireRole(...APOIO_COORD), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['studentId', 'tipo', 'status', 'profissionalId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const de = qs(req.query.de), ate = qs(req.query.ate)
    if (de || ate) where.dataHora = { ...(de ? { gte: new Date(de) } : {}), ...(ate ? { lte: new Date(ate) } : {}) }
    // Coordenação só enxerga atendimentos não-sigilosos de forma listada.
    if (!hasRole(req, 'SUPPORT')) where.sigilo = 'NORMAL'
    const [items, total] = await Promise.all([prisma.apoAtendimento.findMany({ where, orderBy: { dataHora: 'desc' }, skip, take }), prisma.apoAtendimento.count({ where })])
    const [alunos, profs] = await Promise.all([nomesAlunos(tenantId, items.map((i) => i.studentId)), nomesUsuarios(tenantId, items.map((i) => i.profissionalId))])
    res.json({ items: items.map((a) => ({ ...sanitizarAtendimento(a, req), aluno: alunos[a.studentId], profissional: profs[a.profissionalId] })), total, page, pageSize })
  }))

  router.get('/atendimentos/agenda', requireRole(...APOIO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const de = qs(req.query.de) ? new Date(String(qs(req.query.de))) : new Date()
    const ate = qs(req.query.ate) ? new Date(String(qs(req.query.ate))) : addDays(de, 7)
    const prof = qs(req.query.profissionalId) ?? (isSuper(req) ? undefined : getUserId(req))
    const items = await prisma.apoAtendimento.findMany({ where: { tenantId, status: 'AGENDADO', dataHora: { gte: de, lte: ate }, ...(prof ? { profissionalId: prof } : {}) }, orderBy: { dataHora: 'asc' }, select: { id: true, studentId: true, tipo: true, dataHora: true, duracaoMin: true, profissionalId: true, sigilo: true } })
    const alunos = await nomesAlunos(tenantId, items.map((i) => i.studentId))
    res.json(items.map((i) => ({ ...i, aluno: alunos[i.studentId] })))
  }))

  router.get('/atendimentos/meus', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const studentId = exigirAluno(req)
    const items = await prisma.apoAtendimento.findMany({ where: { tenantId, studentId }, orderBy: { dataHora: 'desc' }, take: 100, select: { id: true, tipo: true, status: true, dataHora: true, duracaoMin: true, retornoEm: true, profissionalId: true } })
    const profs = await nomesUsuarios(tenantId, items.map((i) => i.profissionalId))
    res.json(items.map((i) => ({ ...i, profissional: profs[i.profissionalId] })))
  }))

  // Aluno solicita atendimento (cria AGENDADO sem horário definido = agora + 3 dias úteis aprox.; equipe reagenda).
  router.post('/atendimentos/solicitar', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const studentId = exigirAluno(req)
    const b = parseBody(z.object({ tipo: z.enum(['PSICOPEDAGOGICO', 'PSICOLOGICO', 'SOCIAL', 'SAUDE', 'ACESSIBILIDADE', 'ORIENTACAO_ACADEMICA', 'OUTRO']), motivo: z.string().max(1000).optional(), dataHora: dateISO().optional() }), req.body)
    const abertos = await prisma.apoAtendimento.count({ where: { tenantId, studentId, status: 'AGENDADO' } })
    if (abertos >= 3) throw httpError(409, 'Você já possui 3 atendimentos agendados/solicitados.')
    const prof = await prisma.user.findFirst({ where: { tenantId, role: 'SUPPORT', isActive: true }, select: { id: true }, orderBy: { createdAt: 'asc' } })
    const dataHora = b.dataHora ?? addDays(new Date(), 3)
    const a = await prisma.apoAtendimento.create({ data: { tenantId, studentId, tipo: b.tipo, sigilo: SIGILO_PADRAO[b.tipo], dataHora, profissionalId: prof?.id ?? 'PENDENTE', origem: 'PROCURA_ESPONTANEA', motivo: b.motivo } })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Solicitação de atendimento de apoio ao estudante', descricao: 'Confirmar horário com o aluno.', dueAt: addDays(new Date(), 2), assigneeRole: 'SUPPORT', refType: REF.atendimento, refId: a.id, severity: 'ATENCAO', dedupeKey: `apo-atend-solic-${a.id}` })
    res.status(201).json({ id: a.id, status: a.status, dataHora: a.dataHora })
  }))

  router.post('/atendimentos', requireRole(...APOIO_COORD), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(criarSchema, req.body)
    const aluno = await carregarAluno(tenantId, b.studentId)
    const profissionalId = b.profissionalId ?? getUserId(req)
    const choque = await prisma.apoAtendimento.findFirst({ where: { tenantId, profissionalId, status: 'AGENDADO', dataHora: { gt: new Date(b.dataHora.getTime() - b.duracaoMin * 60000), lt: new Date(b.dataHora.getTime() + b.duracaoMin * 60000) } } })
    if (choque) throw httpError(409, 'O profissional já possui atendimento nesse horário.')
    const a = await prisma.apoAtendimento.create({ data: { tenantId, studentId: b.studentId, tipo: b.tipo, sigilo: b.sigilo ?? SIGILO_PADRAO[b.tipo], dataHora: b.dataHora, duracaoMin: b.duracaoMin, profissionalId, origem: b.origem, motivo: b.motivo, planoAcaoId: b.planoAcaoId } })
    await notify({ tenantId, studentId: aluno.id, assunto: 'Atendimento agendado', mensagem: `Seu atendimento de apoio ao estudante foi agendado para ${b.dataHora.toLocaleString('pt-BR')}.`, refType: REF.atendimento, refId: a.id, templateKey: 'apoio.atendimento.agendado' })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Atendimento com ${aluno.nomeCompleto}`, dueAt: b.dataHora, antecedenciaDias: 1, assigneeUserId: profissionalId, assigneeStudentId: aluno.id, refType: REF.atendimento, refId: a.id, dedupeKey: `apo-atend-${a.id}` })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'ATENDIMENTO_AGENDADO', refType: REF.atendimento, refId: a.id })
    res.status(201).json(sanitizarAtendimento(a, req))
  }))

  router.get('/atendimentos/:id', requireRole(...APOIO_COORD), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.apoAtendimento.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) throw httpError(404, 'Atendimento não encontrado.')
    if (a.sigilo === 'SIGILOSO' && a.profissionalId !== req.user?.id) throw httpError(403, 'Atendimento sigiloso: acesso restrito ao profissional responsável.')
    if (a.sigilo !== 'NORMAL' && podeVerRelato(a, req)) await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'LEITURA_RELATO_SIGILOSO', refType: REF.atendimento, refId: a.id })
    res.json(sanitizarAtendimento(a, req))
  }))

  // Registrar a realização / ausência / cancelamento / reagendamento.
  router.patch('/atendimentos/:id', requireRole(...APOIO_COORD), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.apoAtendimento.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) throw httpError(404, 'Atendimento não encontrado.')
    const b = parseBody(z.object({
      status: z.enum(['REALIZADO', 'FALTOU', 'CANCELADO', 'AGENDADO']).optional(),
      relato: z.string().max(20000).optional(), encaminhamentos: z.string().max(4000).optional(), motivo: z.string().max(2000).optional(),
      dataHora: dateISO().optional(), retornoEm: dateISO().nullable().optional(), sigilo: z.enum(['NORMAL', 'RESTRITO', 'SIGILOSO']).optional(), profissionalId: z.string().optional(),
    }), req.body)
    const mexeRelato = b.relato !== undefined || b.encaminhamentos !== undefined || b.sigilo !== undefined
    if (mexeRelato && a.profissionalId !== req.user?.id && !(a.sigilo !== 'SIGILOSO' && podeVerRelato(a, req))) throw httpError(403, 'Sem permissão para registrar/alterar o relato deste atendimento.')
    if (a.status !== 'AGENDADO' && b.status && b.status !== a.status && !(a.status === 'FALTOU' && b.status === 'AGENDADO')) throw httpError(409, `Atendimento já está ${a.status}.`)
    if (b.status === 'REALIZADO' && !(b.relato ?? a.relato)) throw httpError(400, 'Informe o relato para marcar como REALIZADO.')
    const data: any = { ...b }
    const novo = await prisma.apoAtendimento.update({ where: { id: a.id }, data })
    if (b.status === 'REALIZADO' || b.status === 'CANCELADO' || b.status === 'FALTOU') await completeReminders({ tenantId, refType: REF.atendimento, refId: a.id })
    if (b.status === 'FALTOU') {
      await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Aluno faltou ao atendimento: reagendar', dueAt: addDays(new Date(), 3), assigneeUserId: a.profissionalId, refType: REF.atendimento, refId: a.id, severity: 'ATENCAO', dedupeKey: `apo-atend-falta-${a.id}` })
      await notify({ tenantId, studentId: a.studentId, assunto: 'Atendimento não realizado', mensagem: 'Notamos sua ausência no atendimento de apoio. Podemos reagendar? Responda ou procure o NAE.', refType: REF.atendimento, refId: a.id })
    }
    if (b.status === 'REALIZADO' && novo.retornoEm) await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Retorno de atendimento', dueAt: novo.retornoEm, antecedenciaDias: 1, assigneeUserId: a.profissionalId, assigneeStudentId: a.studentId, refType: REF.atendimento, refId: a.id, dedupeKey: `apo-atend-retorno-${a.id}` })
    if (b.dataHora && b.status === undefined) await notify({ tenantId, studentId: a.studentId, assunto: 'Atendimento reagendado', mensagem: `Seu atendimento foi reagendado para ${b.dataHora.toLocaleString('pt-BR')}.`, refType: REF.atendimento, refId: a.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: `ATENDIMENTO_${b.status ?? 'ATUALIZADO'}`, refType: REF.atendimento, refId: a.id })
    res.json(sanitizarAtendimento(novo, req))
  }))
}
