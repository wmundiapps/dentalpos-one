import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { avaliarRematricula, calcularDescontoAntecipacao, calcularRetencao, datasLembretesRematricula, somarMeses } from './logic'
import { httpErr } from './services'

const router = Router()
const GESTAO = ['SECRETARY', 'COORDINATOR', 'ADMISSIONS'] as const
const LEITURA = [...GESTAO, 'FINANCE', 'MARKETING'] as const

const campanhaSchema = z.object({
  nome: z.string().min(3),
  termOrigemId: z.string().optional().nullable(),
  termDestinoId: z.string(),
  janelaInicio: dateISO(),
  janelaFim: dateISO(),
  descontoAntecipacaoPct: z.number().min(0).max(100).optional(),
  dataLimiteDesconto: dateISO().optional().nullable(),
  valorTaxa: z.number().min(0).optional(),
  bloqueiaInadimplente: z.boolean().optional(),
})

function validar(d: any, cur?: any) {
  const ini = d.janelaInicio ?? cur?.janelaInicio
  const fim = d.janelaFim ?? cur?.janelaFim
  if (fim < ini) throw httpErr(400, 'Fim da janela anterior ao início.')
  const lim = d.dataLimiteDesconto ?? cur?.dataLimiteDesconto
  if (lim && lim > fim) throw httpErr(400, 'A data limite do desconto não pode exceder o fim da janela.')
  if ((d.descontoAntecipacaoPct ?? cur?.descontoAntecipacaoPct ?? 0) > 0 && !lim) throw httpErr(400, 'Informe a data limite do desconto de antecipação.')
}

mountCrud(router, {
  model: 'admRematriculaCampanha', path: '/rematricula/campanhas', read: [...LEITURA], write: [...GESTAO],
  create: campanhaSchema, update: campanhaSchema.partial(), search: ['nome'], filters: ['status'], orderBy: { janelaInicio: 'desc' },
  include: { _count: { select: { itens: true } } }, modulo: 'admissoes',
  beforeCreate: async (d, req) => {
    validar(d)
    const tenantId = getTenantId(req)
    if (!(await prisma.academicTerm.findFirst({ where: { id: d.termDestinoId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Período letivo de destino não encontrado.')
    if (d.termOrigemId && !(await prisma.academicTerm.findFirst({ where: { id: d.termOrigemId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Período letivo de origem não encontrado.')
    return d
  },
  beforeUpdate: (d, _req, cur) => {
    if (cur.status === 'ENCERRADA') throw httpErr(409, 'Campanha encerrada não pode ser alterada.')
    validar(d, cur)
    return d
  },
})

// ---------- Avaliação do aluno ----------

export async function avaliarAluno(tenantId: string, studentId: string, bloqueiaInadimplente: boolean, agora = new Date()) {
  const [student, matriculas, vencidas, freq] = await Promise.all([
    prisma.student.findFirst({ where: { id: studentId, tenantId } }),
    prisma.enrollment.findMany({ where: { studentId, status: 'ATIVA' } }),
    prisma.accountReceivable.findMany({ where: { tenantId, studentId, status: { in: ['PENDENTE', 'ATRASADO'] }, dataVencimento: { lt: agora } }, select: { valor: true } }),
    prisma.attendance.groupBy({ by: ['presente'], where: { studentId }, _count: true }),
  ])
  if (!student) throw httpErr(404, 'Aluno não encontrado.')
  const total = freq.reduce((s, f) => s + f._count, 0)
  const faltas = freq.find((f) => !f.presente)?._count ?? 0
  const av = avaliarRematricula({
    statusAluno: student.status, temMatriculaAtiva: matriculas.length > 0, parcelasVencidas: vencidas.length,
    valorVencido: vencidas.reduce((s, v) => s + v.valor, 0), faltasExcessivas: total >= 10 && faltas / total > 0.25, bloqueiaInadimplente,
  })
  return { ...av, student, matriculas }
}

async function valorBaseAluno(tenantId: string, studentId: string) {
  const ult = await prisma.accountReceivable.findFirst({ where: { tenantId, studentId, numeroParcela: { not: null }, status: { not: 'CANCELADO' }, descricao: { startsWith: 'Mensalidade' } }, orderBy: { dataVencimento: 'desc' }, select: { valor: true } })
  return ult?.valor ?? 0
}

// ---------- Geração da lista de elegíveis ----------

export async function gerarListaElegiveis(tenantId: string, campanhaId: string) {
  const camp = await prisma.admRematriculaCampanha.findFirst({ where: { id: campanhaId, tenantId } })
  if (!camp) throw httpErr(404, 'Campanha não encontrada.')
  if (camp.status === 'ENCERRADA') throw httpErr(409, 'Campanha encerrada.')
  const enrolls = await prisma.enrollment.findMany({
    where: { status: 'ATIVA', student: { tenantId, status: { in: ['ATIVO', 'TRANCADO'] } }, ...(camp.termOrigemId ? { termId: camp.termOrigemId } : { termId: { not: camp.termDestinoId } }) },
    select: { studentId: true, programId: true }, take: 10000,
  })
  const jaNoDestino = new Set((await prisma.enrollment.findMany({ where: { termId: camp.termDestinoId, student: { tenantId } }, select: { studentId: true } })).map((e) => e.studentId))
  const vistos = new Set<string>()
  const out = { criados: 0, atualizados: 0, ja_confirmados: 0 }
  for (const e of enrolls) {
    if (vistos.has(e.studentId)) continue
    vistos.add(e.studentId)
    const existente = await prisma.admRematricula.findUnique({ where: { campanhaId_studentId: { campanhaId, studentId: e.studentId } } })
    if (existente && ['CONFIRMADA', 'NAO_RENOVOU'].includes(existente.status)) { out.ja_confirmados++; continue }
    if (jaNoDestino.has(e.studentId)) {
      await prisma.admRematricula.upsert({ where: { campanhaId_studentId: { campanhaId, studentId: e.studentId } }, create: { tenantId, campanhaId, studentId: e.studentId, programId: e.programId, status: 'CONFIRMADA', confirmadaEm: new Date() }, update: { status: 'CONFIRMADA', confirmadaEm: new Date() } })
      out.ja_confirmados++
      continue
    }
    const av = await avaliarAluno(tenantId, e.studentId, camp.bloqueiaInadimplente)
    const base = await valorBaseAluno(tenantId, e.studentId)
    const dsc = calcularDescontoAntecipacao(base, camp.descontoAntecipacaoPct, camp.dataLimiteDesconto)
    const data = { status: av.status, pendencias: av.pendencias as any, valorBase: base, desconto: dsc.desconto, valorFinal: dsc.valorFinal, programId: e.programId }
    await prisma.admRematricula.upsert({ where: { campanhaId_studentId: { campanhaId, studentId: e.studentId } }, create: { tenantId, campanhaId, studentId: e.studentId, ...data }, update: data })
    existente ? out.atualizados++ : out.criados++
  }
  return out
}

router.post('/rematricula/campanhas/:id/gerar-lista', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await gerarListaElegiveis(tenantId, String(req.params.id))
  await audit({ tenantId, userId: getUserId(req), modulo: 'admissoes', acao: 'GERAR_LISTA_REMATRICULA', refType: 'AdmRematriculaCampanha', refId: String(req.params.id), detalhes: r })
  res.json(r)
}))

// ---------- Abertura / lembretes escalonados / encerramento ----------

export async function agendarLembretesRematricula(tenantId: string, campanhaId: string) {
  const camp = await prisma.admRematriculaCampanha.findFirst({ where: { id: campanhaId, tenantId } })
  if (!camp) return 0
  const datas = datasLembretesRematricula(camp.janelaFim)
  if (!datas.length) return 0
  const itens = await prisma.admRematricula.findMany({ where: { tenantId, campanhaId, status: { in: ['ELEGIVEL', 'PENDENTE_FINANCEIRO', 'PENDENTE_ACADEMICO'] } }, select: { id: true, studentId: true } })
  let n = 0
  for (const d of datas) {
    const sev = d.offset <= 1 ? 'CRITICO' : d.offset <= 7 ? 'ATENCAO' : 'INFO'
    for (const it of itens) {
      await scheduleReminder({ tenantId, modulo: 'admissoes', titulo: `Rematrícula: faltam ${d.offset} dia(s) — ${camp.nome}`, descricao: 'Confirme sua rematrícula no portal para garantir sua vaga.', dueAt: camp.janelaFim, remindAt: d.remindAt, refType: 'AdmRematricula', refId: it.id, assigneeStudentId: it.studentId, severity: sev, dedupeKey: `adm-rem-${it.id}-D${d.offset}` })
      n++
    }
    await scheduleReminder({ tenantId, modulo: 'admissoes', titulo: `Rematrícula D-${d.offset}: acompanhe alunos pendentes — ${camp.nome}`, dueAt: camp.janelaFim, remindAt: d.remindAt, refType: 'AdmRematriculaCampanha', refId: camp.id, assigneeRole: 'COORDINATOR', severity: sev, dedupeKey: `adm-rem-coord-${camp.id}-D${d.offset}` })
  }
  return n
}

router.post('/rematricula/campanhas/:id/abrir', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const camp = await prisma.admRematriculaCampanha.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!camp) return res.status(404).json({ error: 'Campanha não encontrada.' })
  if (camp.status !== 'RASCUNHO') return res.status(409).json({ error: `Campanha já está ${camp.status}.` })
  if (camp.janelaFim < new Date()) return res.status(409).json({ error: 'A janela já terminou; ajuste as datas.' })
  const lista = await gerarListaElegiveis(tenantId, camp.id)
  await prisma.admRematriculaCampanha.update({ where: { id: camp.id }, data: { status: 'ABERTA' } })
  const lembretes = await agendarLembretesRematricula(tenantId, camp.id)
  const alvo = await prisma.admRematricula.findMany({ where: { tenantId, campanhaId: camp.id, status: { in: ['ELEGIVEL', 'PENDENTE_FINANCEIRO', 'PENDENTE_ACADEMICO'] } }, select: { studentId: true, status: true, valorFinal: true, desconto: true } })
  for (const a of alvo) {
    await notify({ tenantId, canal: 'IN_APP', studentId: a.studentId, assunto: 'Rematrícula aberta', mensagem: `Sua rematrícula (${camp.nome}) está aberta até ${camp.janelaFim.toLocaleDateString('pt-BR')}.${a.desconto > 0 ? ` Confirme até ${camp.dataLimiteDesconto?.toLocaleDateString('pt-BR')} e ganhe desconto de antecipação.` : ''}${a.status === 'PENDENTE_FINANCEIRO' ? ' Atenção: há pendências financeiras a regularizar.' : ''}`, templateKey: 'adm.rematricula.aberta', refType: 'AdmRematriculaCampanha', refId: camp.id })
  }
  await audit({ tenantId, userId: getUserId(req), modulo: 'admissoes', acao: 'ABRIR_REMATRICULA', refType: 'AdmRematriculaCampanha', refId: camp.id })
  res.json({ lista, lembretesAgendados: lembretes, notificados: alvo.length })
}))

async function encerrarCampanha(tenantId: string, campanhaId: string) {
  const r = await prisma.admRematricula.updateMany({ where: { tenantId, campanhaId, status: { in: ['ELEGIVEL', 'PENDENTE_FINANCEIRO', 'PENDENTE_ACADEMICO'] } }, data: { status: 'NAO_RENOVOU' } })
  await prisma.admRematriculaCampanha.update({ where: { id: campanhaId }, data: { status: 'ENCERRADA' } })
  const itens = await prisma.admRematricula.findMany({ where: { tenantId, campanhaId }, select: { id: true } })
  for (const i of itens) await completeReminders({ tenantId, refType: 'AdmRematricula', refId: i.id })
  await completeReminders({ tenantId, refType: 'AdmRematriculaCampanha', refId: campanhaId })
  return r.count
}
export { encerrarCampanha }

router.post('/rematricula/campanhas/:id/encerrar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const camp = await prisma.admRematriculaCampanha.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!camp) return res.status(404).json({ error: 'Campanha não encontrada.' })
  if (camp.status !== 'ABERTA') return res.status(409).json({ error: 'Só campanhas abertas podem ser encerradas.' })
  const n = await encerrarCampanha(tenantId, camp.id)
  res.json({ ok: true, marcadosNaoRenovou: n })
}))

// ---------- Itens ----------

router.get('/rematricula/campanhas/:id/itens', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId, campanhaId: String(req.params.id) }
  const st = qs(req.query.status); if (st) where.status = st
  const [items, total] = await Promise.all([prisma.admRematricula.findMany({ where, orderBy: { createdAt: 'asc' }, skip, take }), prisma.admRematricula.count({ where })])
  const alunos = await prisma.student.findMany({ where: { tenantId, id: { in: items.map((i) => i.studentId) } }, select: { id: true, nomeCompleto: true, ra: true } })
  res.json({ items: items.map((i) => ({ ...i, aluno: alunos.find((a) => a.id === i.studentId) ?? null })), total, page, pageSize })
}))

router.post('/rematricula/itens/:id/recalcular', requireRole(...GESTAO, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const it = await prisma.admRematricula.findFirst({ where: { id: String(req.params.id), tenantId }, include: { campanha: true } })
  if (!it) return res.status(404).json({ error: 'Item não encontrado.' })
  if (['CONFIRMADA', 'NAO_RENOVOU'].includes(it.status)) return res.status(409).json({ error: `Item já ${it.status}.` })
  const av = await avaliarAluno(tenantId, it.studentId, it.campanha.bloqueiaInadimplente)
  res.json(await prisma.admRematricula.update({ where: { id: it.id }, data: { status: av.status, pendencias: av.pendencias as any } }))
}))

export async function confirmarRematricula(params: { tenantId: string; itemId: string; userId?: string; ignorarJanela?: boolean; studentIdEsperado?: string }) {
  const { tenantId } = params
  const it = await prisma.admRematricula.findFirst({ where: { id: params.itemId, tenantId }, include: { campanha: true } })
  if (!it || (params.studentIdEsperado && it.studentId !== params.studentIdEsperado)) throw httpErr(404, 'Rematrícula não encontrada.')
  const camp = it.campanha
  if (it.status === 'CONFIRMADA') throw httpErr(409, 'Rematrícula já confirmada.')
  if (camp.status !== 'ABERTA') throw httpErr(409, 'A campanha de rematrícula não está aberta.')
  const agora = new Date()
  if (!params.ignorarJanela && (agora < camp.janelaInicio || agora > camp.janelaFim)) throw httpErr(409, 'Fora da janela de rematrícula.')
  const av = await avaliarAluno(tenantId, it.studentId, camp.bloqueiaInadimplente)
  if (av.status !== 'ELEGIVEL') {
    await prisma.admRematricula.update({ where: { id: it.id }, data: { status: av.status, pendencias: av.pendencias as any } })
    throw Object.assign(new Error(`Rematrícula bloqueada: ${av.pendencias.join('; ')}`), { status: 422, pendencias: av.pendencias })
  }
  const programId = it.programId ?? av.matriculas[0]?.programId
  if (!programId) throw httpErr(409, 'Aluno sem curso vinculado.')
  const term = await prisma.academicTerm.findFirst({ where: { id: camp.termDestinoId, tenantId } })
  if (!term) throw httpErr(404, 'Período de destino não encontrado.')
  let enr = await prisma.enrollment.findFirst({ where: { studentId: it.studentId, termId: term.id, programId } })
  if (!enr) enr = await prisma.enrollment.create({ data: { studentId: it.studentId, programId, termId: term.id } })
  const base = it.valorBase || (await valorBaseAluno(tenantId, it.studentId))
  const dsc = calcularDescontoAntecipacao(base, camp.descontoAntecipacaoPct, camp.dataLimiteDesconto, agora)
  let receivableId: string | undefined
  if (dsc.valorFinal > 0) {
    const r = await prisma.accountReceivable.create({ data: { tenantId, studentId: it.studentId, enrollmentId: enr.id, descricao: `Mensalidade 1 — Rematrícula ${term.codigo}${dsc.aplicado ? ` (desc. antecipação ${camp.descontoAntecipacaoPct}%)` : ''}`, numeroParcela: 1, valor: dsc.valorFinal, dataVencimento: somarMeses(term.dataInicio > agora ? term.dataInicio : agora, 0, Math.min(28, Math.max(agora.getDate(), 5))) } })
    receivableId = r.id
  }
  if (camp.valorTaxa > 0) {
    await prisma.accountReceivable.create({ data: { tenantId, studentId: it.studentId, enrollmentId: enr.id, descricao: `Taxa de rematrícula ${term.codigo}`, valor: camp.valorTaxa, dataVencimento: new Date(agora.getTime() + 5 * 86_400_000) } })
  }
  const upd = await prisma.admRematricula.update({ where: { id: it.id }, data: { status: 'CONFIRMADA', confirmadaEm: agora, desconto: dsc.desconto, valorFinal: dsc.valorFinal, valorBase: base, receivableId, pendencias: [] as any } })
  await completeReminders({ tenantId, refType: 'AdmRematricula', refId: it.id, userId: params.userId })
  await audit({ tenantId, userId: params.userId, modulo: 'admissoes', acao: 'CONFIRMAR_REMATRICULA', refType: 'AdmRematricula', refId: it.id, detalhes: { valorFinal: dsc.valorFinal, desconto: dsc.desconto } })
  await notify({ tenantId, canal: 'IN_APP', studentId: it.studentId, assunto: 'Rematrícula confirmada', mensagem: `Rematrícula confirmada para ${term.codigo}. Mensalidade: R$ ${dsc.valorFinal.toFixed(2)}.`, templateKey: 'adm.rematricula.confirmada', refType: 'AdmRematricula', refId: it.id })
  return upd
}

router.post('/rematricula/itens/:id/confirmar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ ignorarJanela: z.boolean().optional() }), req.body ?? {})
  res.json(await confirmarRematricula({ tenantId: getTenantId(req), itemId: String(req.params.id), userId: getUserId(req), ignorarJanela: b.ignorarJanela }))
}))

router.post('/rematricula/itens/:id/nao-renovou', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const it = await prisma.admRematricula.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!it) return res.status(404).json({ error: 'Item não encontrado.' })
  if (it.status === 'CONFIRMADA') return res.status(409).json({ error: 'Já confirmada.' })
  await completeReminders({ tenantId, refType: 'AdmRematricula', refId: it.id, userId: getUserId(req) })
  res.json(await prisma.admRematricula.update({ where: { id: it.id }, data: { status: 'NAO_RENOVOU' } }))
}))

// ---------- Portal do aluno ----------

router.get('/rematricula/minhas', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  if (!req.user!.studentId) return res.status(400).json({ error: 'Usuário não vinculado a um aluno.' })
  res.json(await prisma.admRematricula.findMany({ where: { tenantId, studentId: req.user!.studentId, campanha: { status: { in: ['ABERTA', 'ENCERRADA'] } } }, include: { campanha: { select: { nome: true, janelaInicio: true, janelaFim: true, dataLimiteDesconto: true, descontoAntecipacaoPct: true, status: true } } }, orderBy: { createdAt: 'desc' } }))
}))

router.post('/rematricula/minhas/:id/confirmar', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user!.studentId) return res.status(400).json({ error: 'Usuário não vinculado a um aluno.' })
  res.json(await confirmarRematricula({ tenantId: getTenantId(req), itemId: String(req.params.id), userId: getUserId(req), studentIdEsperado: req.user!.studentId }))
}))

// ---------- Relatório de retenção ----------

router.get('/rematricula/campanhas/:id/relatorio', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const camp = await prisma.admRematriculaCampanha.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!camp) return res.status(404).json({ error: 'Campanha não encontrada.' })
  const itens = await prisma.admRematricula.findMany({ where: { tenantId, campanhaId: camp.id } })
  const porCurso = new Map<string, typeof itens>()
  for (const i of itens) porCurso.set(i.programId ?? 'SEM_CURSO', [...(porCurso.get(i.programId ?? 'SEM_CURSO') ?? []), i])
  const progs = await prisma.academicProgram.findMany({ where: { tenantId, id: { in: [...porCurso.keys()] } }, select: { id: true, nome: true } })
  const contagem: Record<string, number> = {}
  for (const i of itens) contagem[i.status] = (contagem[i.status] ?? 0) + 1
  res.json({
    campanha: camp, geral: calcularRetencao(itens), porStatus: contagem,
    porCurso: [...porCurso.entries()].map(([pid, l]) => ({ programId: pid, curso: progs.find((p) => p.id === pid)?.nome ?? null, ...calcularRetencao(l) })),
    receitaRematriculada: Math.round(itens.filter((i) => i.status === 'CONFIRMADA').reduce((s, i) => s + i.valorFinal, 0) * 100) / 100,
    receitaEmRisco: Math.round(itens.filter((i) => !['CONFIRMADA', 'TRANCADA'].includes(i.status)).reduce((s, i) => s + i.valorBase, 0) * 100) / 100,
    descontosConcedidos: Math.round(itens.filter((i) => i.status === 'CONFIRMADA').reduce((s, i) => s + i.desconto, 0) * 100) / 100,
  })
}))

export default router
