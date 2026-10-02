import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import {
  AcademicRole, AuthenticatedRequest, academicErrorHandler, asyncHandler, getTenantId, getUserId, requireAuth, requireRole,
} from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { registerEduJob } from '../core/jobs'
import { briefing, limitarTaxa, perguntar } from './assistente'
import { CATALOGO, calcularIndicadores, calcularTodos, limparCachePainel, salvarSnapshots } from './indicators'
import { PERFIS, Perfil, perfilDoPapel, podeVerPerfil, progressoKR } from './logic'
import { coletarMesa, limparResumoSino, panoramaPendencias, resumoSino } from './mesa'
import { okrManutencao, registerOkr } from './okr'
import { montarPainel } from './painel'
import { montarRelatorio, relatorioCsv, relatorioHtml, renderRelatorioHtml } from './relatorio'

// Módulo "reitoria" — visão executiva consolidada (/api/edu/reitoria).
// Super-papéis (ADMIN/OWNER/RECTOR/BOARD) veem tudo; os demais papéis veem o
// painel do seu perfil. Leitura dos demais módulos é sempre tolerante.
const router = Router()

const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }) }
// Papéis com painel próprio (STAFF/SUPPORT/STUDENT não têm painel executivo)
const PAINEL_ROLES: AcademicRole[] = ['COORDINATOR', 'SECRETARY', 'FINANCE', 'TEACHER', 'LIBRARIAN', 'FACILITIES', 'SUPPLIES', 'MARKETING', 'ADMISSIONS']
const GESTAO: AcademicRole[] = ['COORDINATOR']

const role = (req: AuthenticatedRequest) => String(req.user?.role || '').toUpperCase()

async function resolverEscopo(req: AuthenticatedRequest, perfilReq?: string) {
  const tenantId = getTenantId(req)
  const r = role(req)
  const perfil = (perfilReq as Perfil | undefined) ?? perfilDoPapel(r)
  if (!PERFIS.includes(perfil)) fail(400, `Perfil inválido. Use: ${PERFIS.join(', ')}.`)
  if (!podeVerPerfil(r, perfil)) fail(403, 'Sem permissão para este painel.')
  const programId = qs(req.query.programId)
  if (programId) {
    if (!(await prisma.academicProgram.findFirst({ where: { id: programId, tenantId }, select: { id: true } }))) fail(404, 'Curso não encontrado.')
  }
  return { tenantId, perfil, programId, userId: perfil === 'professor' ? getUserId(req) : undefined }
}

// ---------------- painel ----------------

router.get('/painel', requireRole(...PAINEL_ROLES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const e = await resolverEscopo(req, qs(req.query.perfil))
  res.json(await montarPainel(e))
}))

router.get('/painel/perfis', requireRole(...PAINEL_ROLES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const r = role(req)
  res.json({ padrao: perfilDoPapel(r), disponiveis: PERFIS.filter((p) => podeVerPerfil(r, p)) })
}))

router.get('/painel/:perfil', requireRole(...PAINEL_ROLES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const e = await resolverEscopo(req, String(req.params.perfil))
  res.json(await montarPainel(e))
}))

router.post('/painel/atualizar', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  limparCachePainel(tenantId)
  res.json({ ok: true })
}))

router.post('/painel/snapshot', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  limparCachePainel(tenantId)
  const n = await salvarSnapshots(tenantId, await calcularTodos(tenantId))
  res.json({ snapshots: n })
}))

router.get('/indicadores/catalogo', requireRole(...PAINEL_ROLES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const r = role(req)
  res.json(CATALOGO.filter((c) => podeVerPerfil(r, 'reitoria') || c.perfis.includes(perfilDoPapel(r))))
}))

// Histórico diário de um indicador (sparkline): GET /indicadores/:chave/historico?dias=90 (institucional)
router.get('/indicadores/:chave/historico', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const chave = String(req.params.chave)
  if (!CATALOGO.some((c) => c.chave === chave)) fail(404, 'Indicador não encontrado.')
  const dias = Math.min(730, Math.max(7, parseInt(qs(req.query.dias) ?? '90', 10) || 90))
  const de = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10)
  res.json(await prisma.reiSnapshot.findMany({ where: { tenantId, chave, dia: { gte: de } }, orderBy: { dia: 'asc' }, select: { dia: true, valor: true, semaforo: true } }))
}))

// ---------------- Minha mesa / central de pendências ----------------

router.get('/mesa', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const horizonteDias = Math.min(180, Math.max(1, parseInt(qs(req.query.horizonteDias) ?? '30', 10) || 30))
  const { itens, falhas } = await coletarMesa({ id: getUserId(req), role: role(req), tenantId }, { horizonteDias })
  const tipo = qs(req.query.tipo), modulo = qs(req.query.modulo), sev = qs(req.query.severidade)
  const somenteAtrasados = qs(req.query.atrasados) === 'true'
  const filtrados = itens.filter((i) => (!tipo || i.tipo === tipo) && (!modulo || i.modulo === modulo) && (!sev || i.severidade === sev) && (!somenteAtrasados || i.atrasadoDias > 0))
  const { skip, take, page, pageSize } = pageParams(req.query)
  res.json({ items: filtrados.slice(skip, skip + take), total: filtrados.length, page, pageSize, fontesComErro: falhas })
}))

router.get('/mesa/resumo', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await resumoSino({ id: getUserId(req), role: role(req), tenantId: getTenantId(req) }))
}))

router.get('/mesa/panorama', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await panoramaPendencias(getTenantId(req)))
}))

const donoDoLembrete = (req: AuthenticatedRequest, r: { assigneeUserId: string | null; assigneeRole: string | null }) =>
  ['ADMIN', 'OWNER', 'RECTOR', 'BOARD'].includes(role(req)) || r.assigneeUserId === req.user?.id || (!!r.assigneeRole && r.assigneeRole === role(req))

router.post('/mesa/lembretes/:id/concluir', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await prisma.eduReminder.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!r) return res.status(404).json({ error: 'Lembrete não encontrado.' })
  if (!donoDoLembrete(req, r)) fail(403, 'Este lembrete não está atribuído a você.')
  if (r.status === 'CONCLUIDO' || r.status === 'CANCELADO') fail(409, 'Lembrete já encerrado.')
  const row = await prisma.eduReminder.update({ where: { id: r.id }, data: { status: 'CONCLUIDO', concluidoEm: new Date(), concluidoPorId: getUserId(req) } })
  limparResumoSino(tenantId, getUserId(req))
  await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'CONCLUIR_LEMBRETE', refType: 'EduReminder', refId: r.id })
  res.json(row)
}))

router.post('/mesa/lembretes/:id/adiar', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { dias, motivo } = parseBody(z.object({ dias: z.number().int().min(1).max(30), motivo: z.string().max(300).optional() }), req.body)
  const r = await prisma.eduReminder.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!r) return res.status(404).json({ error: 'Lembrete não encontrado.' })
  if (!donoDoLembrete(req, r)) fail(403, 'Este lembrete não está atribuído a você.')
  if (r.status === 'CONCLUIDO' || r.status === 'CANCELADO') fail(409, 'Lembrete já encerrado.')
  // adiar o AVISO (não o prazo): volta a PENDENTE para o cron voltar a notificar
  const row = await prisma.eduReminder.update({ where: { id: r.id }, data: { status: 'PENDENTE', remindAt: new Date(Date.now() + dias * 86_400_000) } })
  limparResumoSino(tenantId, getUserId(req))
  await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'ADIAR_LEMBRETE', refType: 'EduReminder', refId: r.id, detalhes: { dias, motivo } })
  res.json(row)
}))

router.post('/mesa/notificacoes/:id/lida', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await prisma.eduNotification.updateMany({ where: { id: String(req.params.id), tenantId, userId: getUserId(req) }, data: { status: 'LIDA', lidaEm: new Date() } })
  if (!r.count) return res.status(404).json({ error: 'Notificação não encontrada.' })
  limparResumoSino(tenantId, getUserId(req))
  res.json({ ok: true })
}))

router.post('/mesa/notificacoes/lidas', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await prisma.eduNotification.updateMany({ where: { tenantId, userId: getUserId(req), canal: 'IN_APP', status: { in: ['PENDENTE', 'ENVIADA', 'ENTREGUE'] } }, data: { status: 'LIDA', lidaEm: new Date() } })
  limparResumoSino(tenantId, getUserId(req))
  res.json({ marcadas: r.count })
}))

// ---------------- relatório executivo ----------------

router.get('/relatorio/executivo', requireRole(...PAINEL_ROLES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const e = await resolverEscopo(req, qs(req.query.perfil))
  const d = await montarRelatorio({ ...e, clinicId: req.user?.clinicId, usarIA: qs(req.query.ia) === 'true' })
  const formato = (qs(req.query.formato) ?? 'html').toLowerCase()
  if (formato === 'json') return res.json(d)
  if (formato === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-executivo-${d.perfil}.csv"`)
    return res.send(relatorioCsv(d))
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(await relatorioHtml(d, e.tenantId))
}))

router.post('/relatorios', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ perfil: z.enum(PERFIS as [Perfil, ...Perfil[]]).default('reitoria'), programId: z.string().optional(), ia: z.boolean().default(false), titulo: z.string().max(200).optional() }), req.body)
  if (b.programId && !(await prisma.academicProgram.findFirst({ where: { id: b.programId, tenantId }, select: { id: true } }))) fail(404, 'Curso não encontrado.')
  const d = await montarRelatorio({ tenantId, perfil: b.perfil, programId: b.programId, userId: getUserId(req), clinicId: req.user?.clinicId, usarIA: b.ia })
  const html = await relatorioHtml(d, tenantId)
  const row = await prisma.reiRelatorio.create({ data: { tenantId, titulo: b.titulo ?? `${d.titulo} — ${d.periodo}`, periodo: d.periodo, perfil: b.perfil, geradoPorId: getUserId(req), dados: d as any, html }, select: { id: true, titulo: true, periodo: true, perfil: true, createdAt: true } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'SALVAR_RELATORIO', refType: 'ReiRelatorio', refId: row.id })
  res.status(201).json(row)
}))

router.get('/relatorios', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const [items, total] = await Promise.all([
    prisma.reiRelatorio.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, skip, take, select: { id: true, titulo: true, periodo: true, perfil: true, geradoPorId: true, createdAt: true } }),
    prisma.reiRelatorio.count({ where: { tenantId } }),
  ])
  res.json({ items, total, page, pageSize })
}))

router.get('/relatorios/:id', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const r = await prisma.reiRelatorio.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, select: { id: true, titulo: true, periodo: true, perfil: true, dados: true, createdAt: true } })
  if (!r) return res.status(404).json({ error: 'Relatório não encontrado.' })
  res.json(r)
}))

router.get('/relatorios/:id/html', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const r = await prisma.reiRelatorio.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, select: { html: true } })
  if (!r) return res.status(404).json({ error: 'Relatório não encontrado.' })
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(r.html)
}))

// ---------------- assistente executivo ----------------

const perguntaSchema = z.object({ pergunta: z.string().trim().min(3).max(1000), perfil: z.enum(PERFIS as [Perfil, ...Perfil[]]).optional(), programId: z.string().optional() })

router.post('/assistente/perguntar', requireRole(...PAINEL_ROLES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(perguntaSchema, req.body)
  const uid = getUserId(req)
  if (!limitarTaxa(`${getTenantId(req)}|${uid}`)) fail(429, 'Muitas perguntas em sequência. Aguarde um minuto.')
  ;(req.query as any).programId = b.programId
  const e = await resolverEscopo(req, b.perfil)
  res.json(await perguntar({ ...e, userId: uid, clinicId: req.user?.clinicId, pergunta: b.pergunta }))
}))

router.get('/assistente/briefing', requireRole(...PAINEL_ROLES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const uid = getUserId(req)
  if (!limitarTaxa(`${getTenantId(req)}|${uid}`)) fail(429, 'Muitas consultas em sequência. Aguarde um minuto.')
  const e = await resolverEscopo(req, qs(req.query.perfil))
  res.json(await briefing({ ...e, userId: uid, clinicId: req.user?.clinicId }))
}))

router.get('/assistente/historico', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where = { tenantId, ...(qs(req.query.meu) === 'true' ? { userId: getUserId(req) } : {}) }
  const [items, total] = await Promise.all([prisma.reiConsultaIA.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.reiConsultaIA.count({ where })])
  res.json({ items, total, page, pageSize })
}))

// ---------------- OKRs ----------------
registerOkr(router)

// ---------------- bootstrap ----------------

interface ModeloKR { titulo: string; chave: string; sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR'; inicialPadrao: number; meta: number; unidade: string }
interface ModeloOKR { slug: string; titulo: string; descricao: string; area: string; krs: ModeloKR[] }
export const MODELOS_OKR: ModeloOKR[] = [
  { slug: 'RETENCAO', titulo: 'Reduzir a evasão e aumentar a permanência dos alunos', descricao: 'Foco em retenção: risco de evasão, trancamentos e engajamento.', area: 'academico', krs: [
    { titulo: 'Reduzir a taxa de evasão', chave: 'evasao', sentido: 'MENOR_MELHOR', inicialPadrao: 15, meta: 8, unidade: '%' },
    { titulo: 'Reduzir alunos em risco alto/crítico', chave: 'risco_evasao', sentido: 'MENOR_MELHOR', inicialPadrao: 100, meta: 50, unidade: 'alunos' },
  ] },
  { slug: 'SAUDE-FINANCEIRA', titulo: 'Garantir a saúde financeira da instituição', descricao: 'Inadimplência sob controle e fluxo de caixa positivo.', area: 'financeiro', krs: [
    { titulo: 'Reduzir a inadimplência', chave: 'inadimplencia', sentido: 'MENOR_MELHOR', inicialPadrao: 12, meta: 5, unidade: '%' },
    { titulo: 'Zerar contas a pagar vencidas', chave: 'contas_pagar_vencidas', sentido: 'MENOR_MELHOR', inicialPadrao: 10, meta: 0, unidade: 'contas' },
  ] },
  { slug: 'QUALIDADE-REGULATORIA', titulo: 'Elevar a prontidão regulatória e a execução do PDI', descricao: 'Preparação para avaliações MEC/INEP e cumprimento do PDI.', area: 'regulatorio', krs: [
    { titulo: 'Elevar a prontidão regulatória', chave: 'prontidao_regulatoria', sentido: 'MAIOR_MELHOR', inicialPadrao: 50, meta: 80, unidade: '%' },
    { titulo: 'Executar o PDI conforme o cronograma', chave: 'pdi_execucao', sentido: 'MAIOR_MELHOR', inicialPadrao: 20, meta: 70, unidade: '%' },
  ] },
  { slug: 'EXPERIENCIA', titulo: 'Elevar a satisfação de alunos e a qualidade do atendimento', descricao: 'NPS, secretaria e ouvidoria.', area: 'experiencia', krs: [
    { titulo: 'Elevar o NPS institucional', chave: 'nps', sentido: 'MAIOR_MELHOR', inicialPadrao: 20, meta: 50, unidade: 'pts' },
    { titulo: 'Cumprir o SLA dos requerimentos', chave: 'requerimentos_sla_cumprido', sentido: 'MAIOR_MELHOR', inicialPadrao: 70, meta: 92, unidade: '%' },
  ] },
  { slug: 'EFICIENCIA', titulo: 'Aumentar a eficiência operacional e a pontualidade acadêmica', descricao: 'Diários fechados no prazo, manutenção em dia e calendário sem conflitos.', area: 'operacoes', krs: [
    { titulo: 'Eliminar diários com prazo vencido', chave: 'diarios_atrasados', sentido: 'MENOR_MELHOR', inicialPadrao: 20, meta: 0, unidade: 'diários' },
    { titulo: 'Reduzir ordens de serviço em atraso', chave: 'manutencao_os_atrasadas', sentido: 'MENOR_MELHOR', inicialPadrao: 10, meta: 0, unidade: 'OS' },
  ] },
]

router.post('/bootstrap', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ano = new Date().getFullYear()
  const inds = new Map((await calcularTodos(tenantId)).filter((i) => i.valor != null).map((i) => [i.chave, i.valor as number]))
  const criados: string[] = [], existentes: string[] = []
  for (const m of MODELOS_OKR) {
    const codigo = `OKR-${ano}-${m.slug}`
    if (await prisma.reiObjetivo.findFirst({ where: { tenantId, codigo }, select: { id: true } })) { existentes.push(codigo); continue }
    const obj = await prisma.reiObjetivo.create({ data: { tenantId, codigo, titulo: m.titulo, descricao: m.descricao, ciclo: String(ano), nivel: 'INSTITUCIONAL', area: m.area, inicio: new Date(ano, 0, 1), fim: new Date(ano, 11, 31), status: 'RASCUNHO' } })
    for (const k of m.krs) {
      const atual = inds.get(k.chave)
      // se o valor atual já cumpre a meta, usa o valor-padrão como ponto de partida (o gestor ajusta antes de ativar)
      const jaCumpre = atual != null && (k.sentido === 'MENOR_MELHOR' ? atual <= k.meta : atual >= k.meta)
      const inicial = atual != null && !jaCumpre ? atual : k.inicialPadrao
      await prisma.reiResultadoChave.create({ data: { tenantId, objetivoId: obj.id, titulo: k.titulo, unidade: k.unidade, sentido: k.sentido, valorInicial: inicial, valorMeta: k.meta, valorAtual: inicial, fonte: 'INDICADOR', indicadorChave: k.chave, progresso: progressoKR({ valorInicial: inicial, valorMeta: k.meta, valorAtual: inicial, sentido: k.sentido }), checkinFrequenciaDias: 30 } })
    }
    criados.push(codigo)
  }
  await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'BOOTSTRAP', detalhes: { criados } })
  res.json({ criados, existentes, observacao: 'Objetivos-modelo criados em RASCUNHO, com KRs ligados a indicadores do painel. Revise metas e ative.' })
}))

// ---------------- jobs ----------------

async function tenantsAtivos(): Promise<string[]> {
  const set = new Set<string>()
  for (const f of [
    () => prisma.eduInstitution.findMany({ select: { tenantId: true } }),
    () => prisma.academicProgram.findMany({ distinct: ['tenantId'], select: { tenantId: true } }),
    () => prisma.reiObjetivo.findMany({ distinct: ['tenantId'], select: { tenantId: true } }),
  ]) { try { for (const r of await f()) set.add(r.tenantId) } catch { /* tolerante */ } }
  return [...set]
}

// Snapshot diário dos indicadores institucionais (base da variação vs. período anterior).
registerEduJob('reitoria:snapshot-indicadores', async () => {
  let tenants = 0, snapshots = 0
  for (const t of await tenantsAtivos()) {
    try {
      limparCachePainel(t)
      snapshots += await salvarSnapshots(t, await calcularTodos(t))
      tenants++
    } catch (e: any) { console.error('[reitoria:snapshot]', t, e?.message || e) }
  }
  return { tenants, snapshots }
})

// Sincroniza KRs ligados a indicadores, recalcula confiança e escala check-ins atrasados.
registerEduJob('reitoria:okr-manutencao', () => okrManutencao())

router.use(academicErrorHandler)

export default router

// Sem rotas públicas: a reitoria só opera autenticada.
export const publicRouter = Router()

// Funções reutilizáveis por outros módulos
export { calcularIndicadores, calcularTodos, coletarMesa, resumoSino, montarPainel, montarRelatorio, renderRelatorioHtml, okrManutencao }
