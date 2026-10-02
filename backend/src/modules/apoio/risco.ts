import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders, completeReminders, scheduleReminder } from '../core/reminders'
import { MODULO, REF, andamento, carregarAluno, httpError, nomesAlunos, nomesUsuarios, tid } from './common'
import { NivelRisco, RiscoResultado, addDays, calcularRisco, nivelDoScore, prazoContatoDias } from './logic'
import { coletarMetricasAluno } from './metricas'

const EQ: any[] = ['SUPPORT', 'COORDINATOR']
const ORDEM: Record<string, number> = { CRITICO: 3, ALTO: 2, MEDIO: 1, BAIXO: 0 }

// Calcula e persiste o snapshot; cria plano de ação automaticamente para risco ALTO/CRITICO sem plano aberto.
export async function avaliarAluno(tenantId: string, studentId: string, opts: { criarPlano?: boolean; userId?: string } = {}) {
  const m = await coletarMetricasAluno(tenantId, studentId)
  const { fontes, ...entrada } = m
  const r = calcularRisco(entrada)
  const snap = await prisma.apoRiscoSnapshot.create({ data: { tenantId, studentId, score: r.score, nivel: r.nivel, fatores: r.fatores as any, metricas: { ...entrada, fontes, confianca: r.confianca } as any } })
  let plano = await prisma.apoPlanoAcao.findFirst({ where: { tenantId, studentId, status: { in: ['ABERTO', 'EM_ACOMPANHAMENTO'] } } })
  let criado = false
  if (!plano && opts.criarPlano && (r.nivel === 'ALTO' || r.nivel === 'CRITICO') && r.confianca >= 0.3) {
    plano = await prisma.apoPlanoAcao.create({ data: { tenantId, studentId, snapshotId: snap.id, nivelInicial: r.nivel, scoreInicial: r.score, acoesSugeridas: r.acoesSugeridas as any, proximoContatoEm: addDays(new Date(), prazoContatoDias(r.nivel)) } })
    criado = true
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Contatar aluno em risco de evasão (${r.nivel})`, descricao: r.acoesSugeridas[0], dueAt: plano.proximoContatoEm!, antecedenciaDias: 1, assigneeRole: 'SUPPORT', refType: REF.planoAcao, refId: plano.id, severity: r.nivel === 'CRITICO' ? 'CRITICO' : 'ATENCAO', dedupeKey: `apo-risco-contato-${plano.id}` })
    await andamento({ tenantId, refType: REF.planoAcao, refId: plano.id, tipo: 'STATUS', texto: `Plano criado automaticamente (risco ${r.nivel}, score ${r.score}).`, userId: opts.userId })
  } else if (plano) {
    // acompanhamento: registra evolução do score no plano
    await prisma.apoPlanoAcao.update({ where: { id: plano.id }, data: { scoreFinal: r.score } })
  }
  return { snapshot: snap, resultado: r, plano, planoCriado: criado }
}

export function mountRisco(router: Router) {
  // Avaliação sob demanda de um aluno (sem persistir) — útil para a tela do aluno.
  router.get('/risco/alunos/:studentId', requireRole(...EQ, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const aluno = await carregarAluno(tenantId, String(req.params.studentId))
    const m = await coletarMetricasAluno(tenantId, aluno.id)
    const { fontes, ...entrada } = m
    const historico = await prisma.apoRiscoSnapshot.findMany({ where: { tenantId, studentId: aluno.id }, orderBy: { calculadoEm: 'desc' }, take: 12, select: { score: true, nivel: true, calculadoEm: true } })
    res.json({ aluno, ...calcularRisco(entrada), fontes, metricas: entrada, historico })
  }))

  router.post('/risco/alunos/:studentId/avaliar', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const aluno = await carregarAluno(tenantId, String(req.params.studentId))
    res.json(await avaliarAluno(tenantId, aluno.id, { criarPlano: req.body?.criarPlano !== false, userId: getUserId(req) }))
  }))

  // Lista priorizada: último snapshot por aluno, ordenado por nível e score.
  router.get('/risco/lista', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const nivelMin = qs(req.query.nivelMinimo) ?? 'MEDIO'
    const recentes = await prisma.apoRiscoSnapshot.findMany({ where: { tenantId, calculadoEm: { gte: addDays(new Date(), -Number(qs(req.query.dias) ?? 45)) } }, orderBy: { calculadoEm: 'desc' }, take: 5000 })
    const ultimo = new Map<string, (typeof recentes)[number]>()
    for (const s of recentes) if (!ultimo.has(s.studentId)) ultimo.set(s.studentId, s)
    const arr = Array.from(ultimo.values()).filter((s) => ORDEM[s.nivel] >= (ORDEM[nivelMin] ?? 1)).sort((a, b) => ORDEM[b.nivel] - ORDEM[a.nivel] || b.score - a.score)
    const { page, pageSize, skip, take } = pageParams(req.query)
    const pagina = arr.slice(skip, skip + take)
    const [al, planos] = await Promise.all([nomesAlunos(tenantId, pagina.map((s) => s.studentId)), prisma.apoPlanoAcao.findMany({ where: { tenantId, studentId: { in: pagina.map((s) => s.studentId) }, status: { in: ['ABERTO', 'EM_ACOMPANHAMENTO'] } }, select: { id: true, studentId: true, status: true, proximoContatoEm: true, responsavelUserId: true } })])
    const pl = new Map(planos.map((p) => [p.studentId, p]))
    res.json({ total: arr.length, page, pageSize, resumo: { CRITICO: arr.filter((s) => s.nivel === 'CRITICO').length, ALTO: arr.filter((s) => s.nivel === 'ALTO').length, MEDIO: arr.filter((s) => s.nivel === 'MEDIO').length }, items: pagina.map((s) => ({ studentId: s.studentId, aluno: al[s.studentId], score: s.score, nivel: s.nivel, fatores: (s.fatores as any[]).filter((f) => f.disponivel && f.pontos > 0).sort((a, b) => b.pontos - a.pontos).slice(0, 3), calculadoEm: s.calculadoEm, plano: pl.get(s.studentId) ?? null })) })
  }))

  // Reavalia todos os alunos ativos (em lotes) — também usado pelo job.
  router.post('/risco/recalcular', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await recalcularRiscoTenant(tid(req), { limite: Math.min(2000, Number(req.body?.limite) || 500), criarPlanos: req.body?.criarPlanos !== false }))
  }))

  // ---------- planos de ação ----------
  router.get('/risco/planos', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'studentId', 'responsavelUserId', 'nivelInicial']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (qs(req.query.atrasados) === 'true') { where.proximoContatoEm = { lt: new Date() }; where.status = { in: ['ABERTO', 'EM_ACOMPANHAMENTO'] } }
    const [items, total] = await Promise.all([prisma.apoPlanoAcao.findMany({ where, include: { contatos: { orderBy: { dataHora: 'desc' }, take: 3 } }, orderBy: [{ proximoContatoEm: 'asc' }], skip, take }), prisma.apoPlanoAcao.count({ where })])
    const [al, us] = await Promise.all([nomesAlunos(tenantId, items.map((i) => i.studentId)), nomesUsuarios(tenantId, items.map((i) => i.responsavelUserId))])
    res.json({ items: items.map((i) => ({ ...i, aluno: al[i.studentId], responsavel: i.responsavelUserId ? us[i.responsavelUserId] : null })), total, page, pageSize })
  }))

  router.post('/risco/planos', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ studentId: z.string(), responsavelUserId: z.string().optional(), proximoContatoEm: dateISO().optional(), acoesSugeridas: z.array(z.string().max(500)).optional() }), req.body)
    await carregarAluno(tenantId, b.studentId)
    if (await prisma.apoPlanoAcao.findFirst({ where: { tenantId, studentId: b.studentId, status: { in: ['ABERTO', 'EM_ACOMPANHAMENTO'] } } })) throw httpError(409, 'Já existe plano de ação aberto para este aluno.')
    const ult = await prisma.apoRiscoSnapshot.findFirst({ where: { tenantId, studentId: b.studentId }, orderBy: { calculadoEm: 'desc' } })
    const nivel = (ult?.nivel ?? 'MEDIO') as NivelRisco
    const prox = b.proximoContatoEm ?? addDays(new Date(), prazoContatoDias(nivel))
    const p = await prisma.apoPlanoAcao.create({ data: { tenantId, studentId: b.studentId, snapshotId: ult?.id, nivelInicial: nivel, scoreInicial: ult?.score ?? 0, responsavelUserId: b.responsavelUserId ?? getUserId(req), acoesSugeridas: b.acoesSugeridas as any, proximoContatoEm: prox } })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Contatar aluno (plano de permanência)', dueAt: prox, antecedenciaDias: 1, assigneeUserId: p.responsavelUserId ?? undefined, assigneeRole: p.responsavelUserId ? undefined : 'SUPPORT', refType: REF.planoAcao, refId: p.id, dedupeKey: `apo-risco-contato-${p.id}` })
    res.status(201).json(p)
  }))

  router.patch('/risco/planos/:id', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.apoPlanoAcao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) throw httpError(404, 'Plano não encontrado.')
    const b = parseBody(z.object({ responsavelUserId: z.string().optional(), proximoContatoEm: dateISO().optional(), acoesSugeridas: z.array(z.string().max(500)).optional() }), req.body)
    const upd = await prisma.apoPlanoAcao.update({ where: { id: p.id }, data: b as any })
    if (b.proximoContatoEm) await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Contatar aluno (plano de permanência)', dueAt: b.proximoContatoEm, antecedenciaDias: 1, assigneeUserId: upd.responsavelUserId ?? undefined, assigneeRole: upd.responsavelUserId ? undefined : 'SUPPORT', refType: REF.planoAcao, refId: p.id, dedupeKey: `apo-risco-contato-${p.id}` })
    res.json(upd)
  }))

  // Registro de contato: atualiza status, próximo contato e lembretes.
  router.post('/risco/planos/:id/contatos', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.apoPlanoAcao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) throw httpError(404, 'Plano não encontrado.')
    if (!['ABERTO', 'EM_ACOMPANHAMENTO'].includes(p.status)) throw httpError(409, `Plano ${p.status}.`)
    const b = parseBody(z.object({ canal: z.enum(['TELEFONE', 'WHATSAPP', 'EMAIL', 'PRESENCIAL', 'VISITA']).default('TELEFONE'), dataHora: dateISO().optional(), resumo: z.string().min(5).max(4000), resultado: z.enum(['CONTATO_REALIZADO', 'SEM_RESPOSTA', 'COMPROMISSO', 'RECUSOU']).default('CONTATO_REALIZADO'), proximoPasso: z.string().max(1000).optional(), proximoContatoEm: dateISO().optional() }), req.body)
    const contato = await prisma.apoContatoEvasao.create({ data: { tenantId, planoId: p.id, canal: b.canal, dataHora: b.dataHora ?? new Date(), resumo: b.resumo, resultado: b.resultado, proximoPasso: b.proximoPasso, userId: getUserId(req) } })
    const tentativasSemResposta = b.resultado === 'SEM_RESPOSTA' ? await prisma.apoContatoEvasao.count({ where: { tenantId, planoId: p.id, resultado: 'SEM_RESPOSTA' } }) : 0
    const ult = await prisma.apoRiscoSnapshot.findFirst({ where: { tenantId, studentId: p.studentId }, orderBy: { calculadoEm: 'desc' } })
    const prox = b.proximoContatoEm ?? addDays(new Date(), b.resultado === 'SEM_RESPOSTA' ? 2 : b.resultado === 'COMPROMISSO' ? 7 : prazoContatoDias((ult?.nivel ?? 'MEDIO') as NivelRisco))
    const novoStatus = tentativasSemResposta >= 4 ? 'SEM_CONTATO' : 'EM_ACOMPANHAMENTO'
    await prisma.apoPlanoAcao.update({ where: { id: p.id }, data: { status: novoStatus, proximoContatoEm: novoStatus === 'SEM_CONTATO' ? null : prox, ...(novoStatus === 'SEM_CONTATO' ? { encerradoEm: new Date(), resultado: 'Sem contato após 4 tentativas.' } : {}) } })
    await completeReminders({ tenantId, refType: REF.planoAcao, refId: p.id, userId: getUserId(req) })
    if (novoStatus !== 'SEM_CONTATO') await scheduleReminder({ tenantId, modulo: MODULO, titulo: b.resultado === 'SEM_RESPOSTA' ? 'Nova tentativa de contato com aluno em risco' : 'Acompanhar compromisso do aluno em risco', dueAt: prox, antecedenciaDias: 0, assigneeUserId: p.responsavelUserId ?? undefined, assigneeRole: p.responsavelUserId ? undefined : 'SUPPORT', refType: REF.planoAcao, refId: p.id, severity: 'ATENCAO', dedupeKey: `apo-risco-contato-${p.id}-${contato.id}` })
    else await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Aluno em risco sem retorno: considerar visita/contato por familiar ou coordenação', dueAt: addDays(new Date(), 3), assigneeRole: 'COORDINATOR', refType: REF.planoAcao, refId: p.id, severity: 'CRITICO', dedupeKey: `apo-risco-semcontato-${p.id}` })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'RISCO_CONTATO', refType: REF.planoAcao, refId: p.id })
    res.status(201).json({ contato, status: novoStatus, proximoContatoEm: novoStatus === 'SEM_CONTATO' ? null : prox })
  }))

  // Encerra com resultado e reavalia o risco para medir a efetividade.
  router.post('/risco/planos/:id/encerrar', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.apoPlanoAcao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) throw httpError(404, 'Plano não encontrado.')
    if (!['ABERTO', 'EM_ACOMPANHAMENTO', 'SEM_CONTATO'].includes(p.status)) throw httpError(409, `Plano ${p.status}.`)
    const b = parseBody(z.object({ status: z.enum(['RESOLVIDO', 'EVADIU', 'CANCELADO']), resultado: z.string().min(5).max(2000) }), req.body)
    let scoreFinal: number | null = null
    if (b.status === 'RESOLVIDO') { const { fontes, ...e } = await coletarMetricasAluno(tenantId, p.studentId); scoreFinal = calcularRisco(e).score }
    const upd = await prisma.apoPlanoAcao.update({ where: { id: p.id }, data: { status: b.status, resultado: b.resultado, scoreFinal, encerradoEm: new Date() } })
    await cancelReminders({ tenantId, refType: REF.planoAcao, refId: p.id })
    await andamento({ tenantId, refType: REF.planoAcao, refId: p.id, tipo: 'STATUS', texto: `Plano encerrado: ${b.status}. ${b.resultado}`, userId: getUserId(req) })
    res.json(upd)
  }))

  // Efetividade da busca ativa
  router.get('/risco/efetividade', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const por = await prisma.apoPlanoAcao.groupBy({ by: ['status'], where: { tenantId }, _count: true })
    const enc = await prisma.apoPlanoAcao.findMany({ where: { tenantId, status: 'RESOLVIDO', scoreFinal: { not: null } }, select: { scoreInicial: true, scoreFinal: true } })
    const cont = Object.fromEntries(por.map((s) => [s.status, s._count]))
    const fechados = (cont.RESOLVIDO ?? 0) + (cont.EVADIU ?? 0)
    res.json({ planosPorStatus: cont, taxaRetencao: fechados ? Math.round(((cont.RESOLVIDO ?? 0) / fechados) * 1000) / 10 : null, reducaoMediaScore: enc.length ? Math.round((enc.reduce((s, x) => s + (x.scoreInicial - (x.scoreFinal ?? 0)), 0) / enc.length) * 10) / 10 : null })
  }))
}

export async function recalcularRiscoTenant(tenantId: string, opts: { limite?: number; criarPlanos?: boolean } = {}) {
  const alunos = await prisma.student.findMany({ where: { tenantId, status: 'ATIVO' }, select: { id: true }, take: opts.limite ?? 500, orderBy: { createdAt: 'asc' } })
  const cont: Record<string, number> = { BAIXO: 0, MEDIO: 0, ALTO: 0, CRITICO: 0 }
  let planos = 0, erros = 0
  for (const a of alunos) {
    try {
      const r = await avaliarAluno(tenantId, a.id, { criarPlano: opts.criarPlanos })
      cont[r.resultado.nivel]++
      if (r.planoCriado) planos++
    } catch (e) { erros++ }
  }
  return { avaliados: alunos.length, porNivel: cont, planosCriados: planos, erros }
}

// Job: reavalia semanalmente (o cron roda com frequência maior; evita refazer se já houve snapshot recente).
export async function jobRisco() {
  const tenants = await prisma.student.findMany({ where: { status: 'ATIVO' }, distinct: ['tenantId'], select: { tenantId: true }, take: 200 })
  const out: Record<string, unknown> = {}
  for (const t of tenants) {
    const recente = await prisma.apoRiscoSnapshot.findFirst({ where: { tenantId: t.tenantId, calculadoEm: { gte: addDays(new Date(), -6) } }, select: { id: true } })
    if (recente) { out[t.tenantId] = 'recente'; continue }
    out[t.tenantId] = await recalcularRiscoTenant(t.tenantId, { limite: 1000, criarPlanos: true })
  }
  // planos com contato atrasado: reforça lembrete
  const atrasados = await prisma.apoPlanoAcao.findMany({ where: { status: { in: ['ABERTO', 'EM_ACOMPANHAMENTO'] }, proximoContatoEm: { lt: addDays(new Date(), -3) } }, take: 500 })
  for (const p of atrasados) await scheduleReminder({ tenantId: p.tenantId, modulo: MODULO, titulo: 'Contato com aluno em risco ATRASADO', dueAt: new Date(), assigneeUserId: p.responsavelUserId ?? undefined, assigneeRole: p.responsavelUserId ? undefined : 'COORDINATOR', refType: REF.planoAcao, refId: p.id, severity: 'CRITICO', dedupeKey: `apo-risco-atraso-${p.id}` })
  return { tenants: out, contatosAtrasados: atrasados.length }
}
