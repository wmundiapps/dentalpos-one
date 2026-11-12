// Planejamento de infraestrutura — /api/edu/infraestrutura/planejamento
// Planos de obras, reformas, expansão, reposição, pintura, plotagem e aquisição de materiais/equipamentos por curso,
// com cotações (mínimo configurável), cronograma/marcos, alçadas de aprovação e conversão em requisição de compra / OS / projeto.
import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../../academico/middleware'
import { parseBody, pageParams, qs, dateISO } from '../../core/crud'
import { audit, notify } from '../../core/notify'
import { scheduleReminder, completeReminders, cancelReminders } from '../../core/reminders'
import { registerEduJob } from '../../core/jobs'
import { brandHeaderHtml, escapeHtml as esc, getBranding } from '../../core/branding'
import { proximoNumero } from '../../suprimentos/stock'
import { calcularAdequacao } from '../adequacao'
import { criarOrdemServico } from '../manutencao'
import { GESTAO, LEITURA, ensureSpace, fail } from '../util'
import {
  ALCADAS_PADRAO, ATIVOS, COBREM_LACUNA, DESTINO_PADRAO, ORIGENS, PRIORIDADES, STATUS, TIPOS, TIPO_ROTULO,
  agregarOrcamento, alcadasExigidas, alertasDoPlano, barraGantt, brl, exigenciaCotacao, podeTransitar, round2, totalItens, validarAlcadas, type Alcada,
} from './calc'
import { redigirJustificativas, sugerirPorChecklist, sugerirPorManutencao } from './sugestoes'

const MODULO = 'infraestrutura-planejamento'
const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
const roleOf = (req: AuthenticatedRequest) => String(req.user?.role || '').toUpperCase()
const ESCREVE = [...GESTAO, 'COORDINATOR', 'SUPPLIES'] as any[]
const DECIDEM = ['COORDINATOR', 'FINANCE', 'SUPPLIES', 'FACILITIES', 'BOARD', 'RECTOR'] as any[]
const DAY = 86_400_000

// ---------------------------------------------------------------- política
async function getPolitica(tenantId: string) {
  const p = await prisma.iplPolitica.findUnique({ where: { tenantId } })
  const alcadas = (Array.isArray(p?.alcadas) ? (p!.alcadas as unknown as Alcada[]) : ALCADAS_PADRAO).slice().sort((a, b) => a.nivel - b.nivel)
  return {
    limiteCotacao: p?.limiteCotacao ?? 8000, minCotacoes: p?.minCotacoes ?? 3, alcadas,
    alertaPrazoDias: p?.alertaPrazoDias ?? 15, alertaOrcamentoPct: p?.alertaOrcamentoPct ?? 90,
    orcamentoAnual: (Array.isArray(p?.orcamentoAnual) ? p!.orcamentoAnual : []) as Array<{ ano: number; valor: number }>,
    configurada: !!p,
  }
}
type Politica = Awaited<ReturnType<typeof getPolitica>>

const politicaSchema = z.object({
  limiteCotacao: z.number().min(0).optional(), minCotacoes: z.number().int().min(1).max(10).optional(),
  alcadas: z.array(z.object({ nivel: z.number().int().min(1), papel: z.string().min(2), rotulo: z.string().optional(), valorMinimo: z.number().min(0) })).optional(),
  alertaPrazoDias: z.number().int().min(1).max(365).optional(), alertaOrcamentoPct: z.number().min(1).max(100).optional(),
  orcamentoAnual: z.array(z.object({ ano: z.number().int().min(2000).max(2100), valor: z.number().min(0) })).optional(),
})

// ---------------------------------------------------------------- schemas
const itemSchema = z.object({ descricao: z.string().min(2), quantidade: z.number().positive().default(1), unidade: z.string().optional(), precoEstimado: z.number().min(0).optional().nullable() })
const planoBase = z.object({
  titulo: z.string().min(3), tipo: z.enum(TIPOS), prioridade: z.enum(PRIORIDADES).default('MEDIA'),
  anoReferencia: z.number().int().min(2000).max(2100).optional(),
  programId: z.string().optional().nullable(), spaceId: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(), justificativa: z.string().min(10, 'Descreva a justificativa (mín. 10 caracteres)'),
  indicadorMec: z.string().optional().nullable(), pdiMetaId: z.string().optional().nullable(), requisitoId: z.string().optional().nullable(),
  origem: z.enum(ORIGENS).default('MANUAL'),
  orcamentoEstimado: z.number().min(0).default(0), itens: z.array(itemSchema).optional().nullable(),
  inicioPrevisto: dateISO().optional().nullable(), fimPrevisto: dateISO().optional().nullable(),
  responsavelUserId: z.string().optional().nullable(),
})
const planoCreate = planoBase
const planoPatch = planoBase.partial()

async function validarRefs(tenantId: string, d: { programId?: string | null; spaceId?: string | null; responsavelUserId?: string | null; requisitoId?: string | null; pdiMetaId?: string | null; inicioPrevisto?: Date | null; fimPrevisto?: Date | null }) {
  if (d.programId && !(await prisma.academicProgram.findFirst({ where: { id: d.programId, tenantId }, select: { id: true } }))) fail(400, 'Curso (programId) não encontrado.')
  await ensureSpace(tenantId, d.spaceId)
  if (d.responsavelUserId && !(await prisma.user.findFirst({ where: { id: d.responsavelUserId, tenantId }, select: { id: true } }))) fail(400, 'Responsável não encontrado.')
  if (d.requisitoId && !(await prisma.infRequisitoCurso.findFirst({ where: { id: d.requisitoId, tenantId }, select: { id: true } }))) fail(400, 'Requisito do checklist não encontrado.')
  if (d.pdiMetaId && !(await prisma.govPdiMeta.findFirst({ where: { id: d.pdiMetaId, tenantId }, select: { id: true } }))) fail(400, 'Meta do PDI não encontrada.')
  if (d.inicioPrevisto && d.fimPrevisto && d.fimPrevisto < d.inicioPrevisto) fail(400, 'fimPrevisto anterior ao inicioPrevisto.')
}

async function proximoNumeroPlano(tenantId: string, ano: number) {
  const chave = `PLN-${ano}`
  const r = await prisma.iplContador.upsert({ where: { tenantId_chave: { tenantId, chave } }, create: { tenantId, chave, valor: 1 }, update: { valor: { increment: 1 } } })
  return `PLN-${ano}-${String(r.valor).padStart(4, '0')}`
}

async function carregar(tenantId: string, id: string) {
  const p = await prisma.iplPlano.findFirst({ where: { id, tenantId } })
  if (!p) fail(404, 'Plano não encontrado.')
  return p
}

// ---------------------------------------------------------------- execução e visão
/** Execução apurada nos registros vinculados (pedidos emitidos/recebidos, custo da OS, gasto do projeto). */
async function execucaoVinculada(tenantId: string, planos: Array<{ id: string; requisicaoId: string | null; ordemServicoId: string | null; projetoId: string | null }>) {
  const reqIds = planos.map((p) => p.requisicaoId).filter(Boolean) as string[]
  const osIds = planos.map((p) => p.ordemServicoId).filter(Boolean) as string[]
  const prIds = planos.map((p) => p.projetoId).filter(Boolean) as string[]
  const [peds, oss, prjs] = await Promise.all([
    reqIds.length ? prisma.supPedido.findMany({ where: { tenantId, requisicaoId: { in: reqIds }, status: { in: ['EMITIDO', 'PARCIALMENTE_RECEBIDO', 'RECEBIDO'] } }, select: { requisicaoId: true, valorTotal: true, status: true } }) : [],
    osIds.length ? prisma.infOrdemServico.findMany({ where: { tenantId, id: { in: osIds } }, select: { id: true, custoMaoObra: true, custoPecas: true, status: true } }) : [],
    prIds.length ? prisma.infProjeto.findMany({ where: { tenantId, id: { in: prIds } }, select: { id: true, gastoReal: true, status: true } }) : [],
  ])
  const m = new Map<string, { vinculado: number; concluidoNoOrigem: boolean }>()
  for (const p of planos) {
    let v = 0, conc = false
    if (p.requisicaoId) { const ps = peds.filter((x) => x.requisicaoId === p.requisicaoId); v += ps.reduce((s, x) => s + x.valorTotal, 0); conc = ps.length > 0 && ps.every((x) => x.status === 'RECEBIDO') }
    if (p.ordemServicoId) { const o = oss.find((x) => x.id === p.ordemServicoId); if (o) { v += o.custoMaoObra + o.custoPecas; conc = o.status === 'CONCLUIDA' } }
    if (p.projetoId) { const pr = prjs.find((x) => x.id === p.projetoId); if (pr) { v += pr.gastoReal; conc = pr.status === 'CONCLUIDO' } }
    m.set(p.id, { vinculado: round2(v), concluidoNoOrigem: conc })
  }
  return m
}

type PlanoRow = Awaited<ReturnType<typeof carregar>>

async function enriquecer(tenantId: string, planos: PlanoRow[], pol: Politica, detalhe = false) {
  if (!planos.length) return []
  const ids = planos.map((p) => p.id)
  const [cots, marcos, aprovs, exec, programs, spaces] = await Promise.all([
    prisma.iplCotacao.findMany({ where: { tenantId, planoId: { in: ids } }, orderBy: { valor: 'asc' } }),
    prisma.iplMarco.findMany({ where: { tenantId, planoId: { in: ids } }, orderBy: [{ ordem: 'asc' }, { data: 'asc' }] }),
    prisma.iplAprovacao.findMany({ where: { planoId: { in: ids } }, orderBy: { nivel: 'asc' } }),
    execucaoVinculada(tenantId, planos),
    prisma.academicProgram.findMany({ where: { tenantId, id: { in: planos.map((p) => p.programId).filter(Boolean) as string[] } }, select: { id: true, nome: true } }),
    prisma.eduSpace.findMany({ where: { tenantId, id: { in: planos.map((p) => p.spaceId).filter(Boolean) as string[] } }, select: { id: true, codigo: true, nome: true } }),
  ])
  const agora = new Date()
  return planos.map((p) => {
    const c = cots.filter((x) => x.planoId === p.id)
    const mc = marcos.filter((x) => x.planoId === p.id)
    const ap = aprovs.filter((x) => x.planoId === p.id)
    const ex = exec.get(p.id) ?? { vinculado: 0, concluidoNoOrigem: false }
    const executado = round2(Math.max(p.valorExecutado, ex.vinculado))
    const exig = exigenciaCotacao(p.orcamentoEstimado, c, pol.limiteCotacao, pol.minCotacoes)
    const alertas = alertasDoPlano({ status: p.status, fimPrevisto: p.fimPrevisto, inicioPrevisto: p.inicioPrevisto, orcamentoEstimado: p.orcamentoEstimado, executado, marcos: mc }, agora, pol.alertaPrazoDias, pol.alertaOrcamentoPct)
    const pend = ap.find((a) => a.status === 'PENDENTE')
    const base: any = {
      ...p, tipoRotulo: TIPO_ROTULO[p.tipo] ?? p.tipo,
      cursoNome: programs.find((x) => x.id === p.programId)?.nome ?? null,
      espacoNome: (() => { const s = spaces.find((x) => x.id === p.spaceId); return s ? `${s.codigo} — ${s.nome}` : null })(),
      executado, executadoVinculado: ex.vinculado, saldo: round2(p.orcamentoEstimado - executado), consumoPct: p.orcamentoEstimado > 0 ? round2((executado / p.orcamentoEstimado) * 100) : null,
      qtdCotacoes: c.length, exigenciaCotacao: exig, qtdMarcos: mc.length, marcosConcluidos: mc.filter((m) => m.concluidoEm).length,
      alertas, atrasado: alertas.some((a) => a.severidade === 'CRITICO' && /PRAZO|MARCO/.test(a.tipo)),
      etapaAprovacao: pend ? { nivel: pend.nivel, papel: pend.papel, rotulo: pend.rotulo } : null,
      sugereConclusao: p.status === 'CONVERTIDO' && ex.concluidoNoOrigem,
    }
    if (detalhe) { base.cotacoes = c; base.marcos = mc; base.aprovacoes = ap }
    return base
  })
}

// ---------------------------------------------------------------- jobs
export async function jobPlanejamento() {
  const tenants = await prisma.iplPlano.findMany({ where: { status: { notIn: ['CONCLUIDO', 'CANCELADO', 'REPROVADO'] } }, select: { tenantId: true }, distinct: ['tenantId'] })
  let n = 0
  for (const { tenantId } of tenants) {
    const pol = await getPolitica(tenantId)
    const planos = await prisma.iplPlano.findMany({ where: { tenantId, status: { notIn: ['CONCLUIDO', 'CANCELADO', 'REPROVADO'] } } })
    const marcos = await prisma.iplMarco.findMany({ where: { tenantId, planoId: { in: planos.map((p) => p.id) }, concluidoEm: null } })
    for (const p of planos) {
      if (p.fimPrevisto) { await agendarPrazo(tenantId, p, pol); n++ }
      for (const m of marcos.filter((x) => x.planoId === p.id)) { await agendarMarco(tenantId, p, m, pol); n++ }
    }
  }
  return { lembretes: n }
}
async function agendarPrazo(tenantId: string, p: PlanoRow, pol: Politica) {
  if (!p.fimPrevisto) return
  await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Prazo do plano ${p.numero}: ${p.titulo}`, dueAt: p.fimPrevisto, antecedenciaDias: pol.alertaPrazoDias, refType: 'IplPlano', refId: p.id, assigneeUserId: p.responsavelUserId ?? undefined, assigneeRole: p.responsavelUserId ? undefined : 'FACILITIES', severity: 'ATENCAO', dedupeKey: `ipl-prazo-${p.id}` })
}
async function agendarMarco(tenantId: string, p: PlanoRow, m: { id: string; titulo: string; data: Date }, pol: Politica) {
  await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Marco "${m.titulo}" — ${p.numero}`, dueAt: m.data, antecedenciaDias: Math.min(pol.alertaPrazoDias, 7), refType: 'IplMarco', refId: m.id, assigneeUserId: p.responsavelUserId ?? undefined, assigneeRole: p.responsavelUserId ? undefined : 'FACILITIES', severity: 'INFO', dedupeKey: `ipl-marco-${m.id}` })
}

// ---------------------------------------------------------------- montagem
export function mountPlanejamento(router: Router) {
  const P = '/planejamento'
  registerEduJob('infra.planejamento-prazos', () => jobPlanejamento())

  router.get(`${P}/catalogo`, requireRole(...LEITURA), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    res.json({ tipos: TIPOS.map((t) => ({ valor: t, rotulo: TIPO_ROTULO[t], destinoPadrao: DESTINO_PADRAO[t] })), status: STATUS, prioridades: PRIORIDADES, origens: ORIGENS, destinos: ['REQUISICAO', 'OS', 'PROJETO'] })
  }))

  // ---- política
  router.get(`${P}/politica`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => { res.json(await getPolitica(getTenantId(req))) }))
  router.put(`${P}/politica`, requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(politicaSchema, req.body)
    if (d.alcadas) { const e = validarAlcadas(d.alcadas); if (e) fail(400, e) }
    const data: any = { ...d }
    const up = await prisma.iplPolitica.upsert({ where: { tenantId }, create: { tenantId, alcadas: (d.alcadas ?? ALCADAS_PADRAO) as any, ...data, ...(d.alcadas ? {} : { alcadas: ALCADAS_PADRAO as any }) }, update: data })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'POLITICA_ATUALIZADA', refType: 'IplPolitica', refId: up.id, detalhes: d })
    res.json(await getPolitica(tenantId))
  }))

  // ---- planos
  router.post(`${P}/planos`, requireRole(...ESCREVE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(planoCreate, req.body)
    await validarRefs(tenantId, d)
    const ano = d.anoReferencia ?? (d.inicioPrevisto ?? new Date()).getFullYear()
    const itensTotal = totalItens(d.itens)
    const numero = await proximoNumeroPlano(tenantId, ano)
    const p = await prisma.iplPlano.create({ data: { ...d, itens: (d.itens ?? undefined) as any, orcamentoEstimado: d.orcamentoEstimado || itensTotal || 0, tenantId, numero, anoReferencia: ano, solicitanteUserId: getUserId(req), responsavelUserId: d.responsavelUserId ?? getUserId(req) } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'PLANO_CRIADO', refType: 'IplPlano', refId: p.id, detalhes: { numero, tipo: p.tipo, origem: p.origem } })
    const [v] = await enriquecer(tenantId, [p], await getPolitica(tenantId), true)
    res.status(201).json(v)
  }))

  router.get(`${P}/planos`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'tipo', 'prioridade', 'programId', 'spaceId', 'responsavelUserId', 'origem']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const ano = qs(req.query.ano); if (ano) { const n = parseInt(ano, 10); if (!Number.isFinite(n)) fail(400, 'ano inválido.'); where.anoReferencia = n }
    const q = qs(req.query.q); if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { numero: { contains: q, mode: 'insensitive' } }, { justificativa: { contains: q, mode: 'insensitive' } }]
    const pol = await getPolitica(tenantId)
    const alerta = qs(req.query.comAlerta) === 'true'
    const rows = await prisma.iplPlano.findMany({ where, orderBy: [{ createdAt: 'desc' }], ...(alerta ? {} : { skip, take }) })
    const total = alerta ? rows.length : await prisma.iplPlano.count({ where })
    let items = await enriquecer(tenantId, rows, pol)
    if (alerta) { items = items.filter((i) => i.alertas.length > 0); return res.json({ items: items.slice(skip, skip + take), total: items.length, page, pageSize }) }
    res.json({ items, total, page, pageSize })
  }))

  router.get(`${P}/kanban`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId }
    for (const f of ['tipo', 'programId', 'prioridade']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const ano = qs(req.query.ano); if (ano) where.anoReferencia = parseInt(ano, 10) || 0
    const rows = await prisma.iplPlano.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 })
    const items = await enriquecer(tenantId, rows, await getPolitica(tenantId))
    const colunas = STATUS.map((s) => { const it = items.filter((i) => i.status === s); return { status: s, qtd: it.length, total: round2(it.reduce((a, i) => a + i.orcamentoEstimado, 0)), items: it } })
    res.json({ colunas })
  }))

  router.get(`${P}/planos/:id`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await carregar(tenantId, String(req.params.id))
    const [v] = await enriquecer(tenantId, [p], await getPolitica(tenantId), true)
    res.json(v)
  }))

  router.patch(`${P}/planos/:id`, requireRole(...ESCREVE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await carregar(tenantId, String(req.params.id))
    const d = parseBody(planoPatch, req.body)
    if (!['RASCUNHO', 'REPROVADO'].includes(cur.status)) {
      // após o envio só o cronograma/responsável podem mudar; valores e escopo exigem reabrir/reenviar
      const permitidos = ['inicioPrevisto', 'fimPrevisto', 'responsavelUserId', 'prioridade', 'descricao']
      const proibidos = Object.keys(d).filter((k) => !permitidos.includes(k) && (d as any)[k] !== undefined)
      if (proibidos.length) fail(409, `Plano em ${cur.status}: não é possível alterar ${proibidos.join(', ')}. ${cur.status === 'AGUARDANDO_APROVACAO' ? 'Devolva a rascunho antes.' : 'Escopo e orçamento ficam congelados após a aprovação.'}`)
      if (['CONCLUIDO', 'CANCELADO'].includes(cur.status)) fail(409, 'Plano encerrado não pode ser alterado.')
    }
    await validarRefs(tenantId, { ...d, inicioPrevisto: d.inicioPrevisto ?? cur.inicioPrevisto, fimPrevisto: d.fimPrevisto ?? cur.fimPrevisto })
    const data: any = { ...d }
    if (d.itens !== undefined) { data.itens = d.itens ?? undefined; if (d.orcamentoEstimado === undefined) { const t = totalItens(d.itens); if (t) data.orcamentoEstimado = t } }
    const up = await prisma.iplPlano.update({ where: { id: cur.id }, data })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'PLANO_ATUALIZADO', refType: 'IplPlano', refId: cur.id, detalhes: Object.keys(d) })
    const [v] = await enriquecer(tenantId, [up], await getPolitica(tenantId), true)
    res.json(v)
  }))

  // ---- cotações
  const cotSchema = z.object({ fornecedorId: z.string().optional().nullable(), fornecedorNome: z.string().min(2).optional(), valor: z.number().positive(), prazoDias: z.number().int().min(0).optional().nullable(), validadeAte: dateISO().optional().nullable(), observacao: z.string().optional().nullable() })
  router.post(`${P}/planos/:id/cotacoes`, requireRole(...ESCREVE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await carregar(tenantId, String(req.params.id))
    if (['CONCLUIDO', 'CANCELADO', 'CONVERTIDO', 'EM_EXECUCAO'].includes(p.status)) fail(409, 'Plano já convertido ou encerrado: não aceita novas cotações.')
    const d = parseBody(cotSchema, req.body)
    let nome = d.fornecedorNome
    if (d.fornecedorId) {
      const f = await prisma.supFornecedor.findFirst({ where: { id: d.fornecedorId, tenantId }, select: { razaoSocial: true } })
      if (!f) fail(400, 'Fornecedor não encontrado.')
      nome = nome ?? f!.razaoSocial
    }
    if (!nome) fail(400, 'Informe fornecedorNome ou fornecedorId.')
    const dup = await prisma.iplCotacao.findFirst({ where: { tenantId, planoId: p.id, OR: [...(d.fornecedorId ? [{ fornecedorId: d.fornecedorId }] : []), { fornecedorNome: { equals: nome!, mode: 'insensitive' } }] } })
    if (dup) fail(409, 'Este fornecedor já cotou este plano (cotações devem ser de fornecedores distintos).')
    const c = await prisma.iplCotacao.create({ data: { ...d, fornecedorNome: nome!, tenantId, planoId: p.id } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'COTACAO_ADICIONADA', refType: 'IplPlano', refId: p.id, detalhes: { fornecedor: nome, valor: d.valor } })
    res.status(201).json(c)
  }))
  router.delete(`${P}/planos/:id/cotacoes/:cid`, requireRole(...ESCREVE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await carregar(tenantId, String(req.params.id))
    if (['CONCLUIDO', 'CANCELADO', 'CONVERTIDO', 'EM_EXECUCAO'].includes(p.status)) fail(409, 'Plano já convertido ou encerrado.')
    const r = await prisma.iplCotacao.deleteMany({ where: { id: String(req.params.cid), tenantId, planoId: p.id } })
    if (!r.count) fail(404, 'Cotação não encontrada.')
    res.json({ ok: true })
  }))
  router.post(`${P}/planos/:id/cotacoes/:cid/escolher`, requireRole(...ESCREVE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await carregar(tenantId, String(req.params.id))
    if (['CONCLUIDO', 'CANCELADO', 'CONVERTIDO', 'EM_EXECUCAO'].includes(p.status)) fail(409, 'Plano já convertido ou encerrado.')
    const c = await prisma.iplCotacao.findFirst({ where: { id: String(req.params.cid), tenantId, planoId: p.id } })
    if (!c) fail(404, 'Cotação não encontrada.')
    const { justificativa } = parseBody(z.object({ justificativa: z.string().optional() }), req.body ?? {})
    const menor = await prisma.iplCotacao.findFirst({ where: { tenantId, planoId: p.id }, orderBy: { valor: 'asc' } })
    if (menor && c!.valor > menor.valor && !(justificativa && justificativa.trim().length >= 10)) fail(400, `A cotação escolhida não é a de menor preço (${brl(menor.valor)}). Informe a justificativa (mín. 10 caracteres).`)
    await prisma.$transaction([prisma.iplCotacao.updateMany({ where: { tenantId, planoId: p.id }, data: { escolhida: false } }), prisma.iplCotacao.update({ where: { id: c!.id }, data: { escolhida: true, observacao: justificativa ? `${c!.observacao ? c!.observacao + ' · ' : ''}Escolha justificada: ${justificativa}` : c!.observacao } })])
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'COTACAO_ESCOLHIDA', refType: 'IplPlano', refId: p.id, detalhes: { cotacaoId: c!.id, valor: c!.valor, justificativa } })
    res.json({ ok: true })
  }))

  // ---- marcos
  const marcoSchema = z.object({ titulo: z.string().min(2), data: dateISO(), ordem: z.number().int().min(1).optional() })
  router.post(`${P}/planos/:id/marcos`, requireRole(...ESCREVE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await carregar(tenantId, String(req.params.id))
    if (['CONCLUIDO', 'CANCELADO'].includes(p.status)) fail(409, 'Plano encerrado.')
    const d = parseBody(marcoSchema, req.body)
    const ordem = d.ordem ?? ((await prisma.iplMarco.count({ where: { tenantId, planoId: p.id } })) + 1)
    const m = await prisma.iplMarco.create({ data: { ...d, ordem, tenantId, planoId: p.id } })
    if (!['RASCUNHO', 'REPROVADO'].includes(p.status)) await agendarMarco(tenantId, p, m, await getPolitica(tenantId))
    res.status(201).json(m)
  }))
  router.patch(`${P}/marcos/:mid`, requireRole(...ESCREVE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const m = await prisma.iplMarco.findFirst({ where: { id: String(req.params.mid), tenantId } })
    if (!m) fail(404, 'Marco não encontrado.')
    const d = parseBody(marcoSchema.partial(), req.body)
    res.json(await prisma.iplMarco.update({ where: { id: m!.id }, data: d }))
  }))
  router.delete(`${P}/marcos/:mid`, requireRole(...ESCREVE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.iplMarco.deleteMany({ where: { id: String(req.params.mid), tenantId } })
    if (!r.count) fail(404, 'Marco não encontrado.')
    await cancelReminders({ tenantId, refType: 'IplMarco', refId: String(req.params.mid) })
    res.json({ ok: true })
  }))
  router.post(`${P}/marcos/:mid/concluir`, requireRole(...ESCREVE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const m = await prisma.iplMarco.findFirst({ where: { id: String(req.params.mid), tenantId } })
    if (!m) fail(404, 'Marco não encontrado.')
    const up = await prisma.iplMarco.update({ where: { id: m!.id }, data: { concluidoEm: m!.concluidoEm ?? new Date() } })
    await completeReminders({ tenantId, refType: 'IplMarco', refId: m!.id, userId: getUserId(req) })
    res.json(up)
  }))

  // ---- aprovação (coordenação → diretoria → reitoria, conforme alçada configurável)
  router.post(`${P}/planos/:id/enviar`, requireRole(...ESCREVE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await carregar(tenantId, String(req.params.id))
    if (!podeTransitar(p.status, 'AGUARDANDO_APROVACAO')) fail(409, `Plano em ${p.status} não pode ser enviado para aprovação.`)
    if (p.orcamentoEstimado <= 0) fail(400, 'Informe o orçamento estimado (ou itens com preço) antes de enviar.')
    const pol = await getPolitica(tenantId)
    const exigidas = alcadasExigidas(p.orcamentoEstimado, pol.alcadas)
    await prisma.$transaction(async (tx) => {
      await tx.iplAprovacao.deleteMany({ where: { planoId: p.id } })
      await tx.iplAprovacao.createMany({ data: exigidas.map((a) => ({ tenantId, planoId: p.id, nivel: a.nivel, papel: a.papel, rotulo: a.rotulo ?? null })) })
      await tx.iplPlano.update({ where: { id: p.id }, data: { status: 'AGUARDANDO_APROVACAO', motivoReprovacao: null } })
    })
    const prox = exigidas[0]
    await scheduleReminder({ tenantId, modulo: MODULO, refType: 'IplPlano', refId: p.id, dedupeKey: `ipl-aprov-${p.id}-${prox.nivel}`, titulo: `Aprovar plano ${p.numero} (${brl(p.orcamentoEstimado)}) — ${prox.rotulo ?? prox.papel}`, dueAt: new Date(Date.now() + 3 * DAY), assigneeRole: prox.papel, severity: p.prioridade === 'CRITICA' ? 'CRITICO' : 'ATENCAO' })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'PLANO_ENVIADO', refType: 'IplPlano', refId: p.id, detalhes: { niveis: exigidas.map((a) => a.papel) } })
    const [v] = await enriquecer(tenantId, [await carregar(tenantId, p.id)], pol, true)
    res.json(v)
  }))

  router.post(`${P}/planos/:id/decidir`, requireRole(...DECIDEM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ decisao: z.enum(['APROVADO', 'REPROVADO']), parecer: z.string().optional() }), req.body)
    const p = await carregar(tenantId, String(req.params.id))
    if (p.status !== 'AGUARDANDO_APROVACAO') fail(409, 'Plano não está aguardando aprovação.')
    if (p.solicitanteUserId === getUserId(req)) fail(403, 'O solicitante não pode aprovar o próprio plano.')
    const aprovs = await prisma.iplAprovacao.findMany({ where: { planoId: p.id }, orderBy: { nivel: 'asc' } })
    const pend = aprovs.find((a) => a.status === 'PENDENTE')
    if (!pend) fail(409, 'Não há aprovação pendente.')
    const role = roleOf(req)
    if (!SUPER.includes(role) && role !== pend!.papel) fail(403, `Esta etapa (nível ${pend!.nivel} — ${pend!.rotulo ?? pend!.papel}) deve ser decidida por ${pend!.papel}.`)
    if (d.decisao === 'REPROVADO' && !d.parecer?.trim()) fail(400, 'Informe o parecer para reprovar.')
    const claim = await prisma.iplAprovacao.updateMany({ where: { planoId: p.id, nivel: pend!.nivel, status: 'PENDENTE' }, data: { status: d.decisao, decididoPorId: getUserId(req), decididoEm: new Date(), parecer: d.parecer } })
    if (claim.count === 0) fail(409, 'Esta etapa já foi decidida.')
    await completeReminders({ tenantId, refType: 'IplPlano', refId: p.id, userId: getUserId(req) })
    let status = 'AGUARDANDO_APROVACAO'
    if (d.decisao === 'REPROVADO') {
      status = 'REPROVADO'
      await prisma.iplAprovacao.updateMany({ where: { planoId: p.id, status: 'PENDENTE' }, data: { status: 'REPROVADO', parecer: 'Encerrada por reprovação em nível anterior' } })
    } else {
      const resto = aprovs.filter((a) => a.status === 'PENDENTE' && a.nivel !== pend!.nivel)
      if (!resto.length) status = 'APROVADO'
      else await scheduleReminder({ tenantId, modulo: MODULO, refType: 'IplPlano', refId: p.id, dedupeKey: `ipl-aprov-${p.id}-${resto[0].nivel}`, titulo: `Aprovar plano ${p.numero} — ${resto[0].rotulo ?? resto[0].papel}`, dueAt: new Date(Date.now() + 3 * DAY), assigneeRole: resto[0].papel, severity: 'ATENCAO' })
    }
    await prisma.iplPlano.update({ where: { id: p.id }, data: { status, motivoReprovacao: d.decisao === 'REPROVADO' ? d.parecer : null } })
    if (status !== 'AGUARDANDO_APROVACAO' && p.solicitanteUserId) {
      await notify({ tenantId, userId: p.solicitanteUserId, assunto: `Plano ${p.numero} ${status === 'APROVADO' ? 'aprovado' : 'reprovado'}`, mensagem: `O plano "${p.titulo}" foi ${status === 'APROVADO' ? 'aprovado' : 'reprovado'}.${d.parecer ? ' Parecer: ' + d.parecer : ''}`, refType: 'IplPlano', refId: p.id })
    }
    if (status === 'APROVADO') {
      const pol = await getPolitica(tenantId)
      const atual = await carregar(tenantId, p.id)
      await agendarPrazo(tenantId, atual, pol)
      for (const m of await prisma.iplMarco.findMany({ where: { tenantId, planoId: p.id, concluidoEm: null } })) await agendarMarco(tenantId, atual, m, pol)
    }
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: `PLANO_${d.decisao}`, refType: 'IplPlano', refId: p.id, detalhes: { nivel: pend!.nivel, parecer: d.parecer } })
    const [v] = await enriquecer(tenantId, [await carregar(tenantId, p.id)], await getPolitica(tenantId), true)
    res.json(v)
  }))

  // volta para rascunho (reprovado ou em aprovação) para ajustar e reenviar
  router.post(`${P}/planos/:id/reabrir`, requireRole(...ESCREVE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await carregar(tenantId, String(req.params.id))
    if (!['REPROVADO', 'AGUARDANDO_APROVACAO'].includes(p.status)) fail(409, 'Somente planos reprovados ou aguardando aprovação podem voltar a rascunho.')
    await prisma.iplAprovacao.deleteMany({ where: { planoId: p.id } })
    await completeReminders({ tenantId, refType: 'IplPlano', refId: p.id })
    const up = await prisma.iplPlano.update({ where: { id: p.id }, data: { status: 'RASCUNHO' } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'PLANO_REABERTO', refType: 'IplPlano', refId: p.id })
    const [v] = await enriquecer(tenantId, [up], await getPolitica(tenantId), true)
    res.json(v)
  }))

  // ---- conversão em requisição de compra / OS / projeto
  const convSchema = z.object({
    destino: z.enum(['REQUISICAO', 'OS', 'PROJETO']).optional(), centroCustoId: z.string().optional().nullable(), almoxarifadoId: z.string().optional().nullable(),
    justificativaExcecao: z.string().optional(), fornecedorId: z.string().optional().nullable(),
  })
  router.post(`${P}/planos/:id/converter`, requireRole(...GESTAO, 'SUPPLIES'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const userId = getUserId(req)
    const d = parseBody(convSchema, req.body ?? {})
    const p = await carregar(tenantId, String(req.params.id))
    if (p.status !== 'APROVADO') fail(409, p.status === 'CONVERTIDO' ? 'Plano já foi convertido.' : `Plano em ${p.status}: só planos APROVADOS podem ser convertidos.`)
    const pol = await getPolitica(tenantId)
    const cots = await prisma.iplCotacao.findMany({ where: { tenantId, planoId: p.id } })
    const exig = exigenciaCotacao(p.orcamentoEstimado, cots, pol.limiteCotacao, pol.minCotacoes)
    let excecao: string | null = null
    if (!exig.atende) {
      if (d.justificativaExcecao && d.justificativaExcecao.trim().length >= 15 && SUPER.includes(roleOf(req))) excecao = d.justificativaExcecao.trim()
      else throw Object.assign(new Error(`Plano acima de ${brl(pol.limiteCotacao)} exige ${pol.minCotacoes} cotações de fornecedores distintos (há ${exig.distintas}). Registre as cotações ou, em exceção, a direção informa a justificativa (mín. 15 caracteres).`), { status: 409, code: 'COTACOES_INSUFICIENTES' })
    }
    const escolhida = exig.escolhida
    if (exig.exige && !escolhida && !excecao) fail(409, 'Escolha a cotação vencedora antes de converter.')
    const valorBase = escolhida?.valor ?? p.orcamentoEstimado
    if (valorBase > p.orcamentoEstimado * 1.1) throw Object.assign(new Error(`A cotação escolhida (${brl(valorBase)}) excede em mais de 10% o orçamento aprovado (${brl(p.orcamentoEstimado)}). Atualize o orçamento e reenvie para aprovação.`), { status: 409, code: 'ACIMA_DO_APROVADO' })
    const destino = d.destino ?? DESTINO_PADRAO[p.tipo]
    const aprovs = await prisma.iplAprovacao.findMany({ where: { planoId: p.id }, orderBy: { nivel: 'asc' } })
    const links: { requisicaoId?: string; ordemServicoId?: string; projetoId?: string } = {}
    let resumo: any = {}

    if (destino === 'REQUISICAO') {
      const cursoId = p.programId, laboratorioId = p.spaceId
      let centroCustoId = d.centroCustoId ?? null
      if (centroCustoId && !(await prisma.eduCostCenter.findFirst({ where: { id: centroCustoId, tenantId }, select: { id: true } }))) fail(400, 'Centro de custo não encontrado.')
      if (!cursoId && !laboratorioId && !centroCustoId) fail(400, 'Informe o centro de custo (o plano não tem curso nem espaço para apropriar o gasto).')
      const itensPlano = (Array.isArray(p.itens) ? (p.itens as any[]) : []).filter((i) => i?.descricao)
      const itens = itensPlano.length ? itensPlano.map((i) => ({ descricao: String(i.descricao), unidade: String(i.unidade || 'UN'), quantidade: Number(i.quantidade) || 1, precoEstimado: i.precoEstimado ?? null })) : [{ descricao: p.titulo, unidade: 'UN', quantidade: 1, precoEstimado: round2(valorBase) }]
      const valorEstimado = round2(itens.reduce((s, i) => s + i.quantidade * (i.precoEstimado ?? 0), 0))
      const req = await prisma.$transaction(async (tx) => {
        const numero = await proximoNumero(tx, tenantId, 'REQ')
        const r = await tx.supRequisicao.create({
          data: {
            tenantId, numero, tipo: 'COMPRA', status: 'APROVADA', solicitanteUserId: p.solicitanteUserId ?? userId, cursoId, laboratorioId, centroCustoId,
            justificativa: `[Planejamento ${p.numero}] ${p.justificativa}${p.indicadorMec ? ` — ${p.indicadorMec}` : ''}`.slice(0, 1500),
            urgencia: p.prioridade === 'CRITICA' ? 'URGENTE' : p.prioridade === 'ALTA' ? 'ALTA' : p.prioridade === 'BAIXA' ? 'BAIXA' : 'NORMAL',
            necessarioEm: p.fimPrevisto ?? p.inicioPrevisto ?? undefined, valorEstimado,
            itens: { create: itens.map((i) => ({ ...i, tenantId })) },
          },
        })
        // aprovação já cumprida no planejamento: espelha a cadeia para a rastreabilidade em Suprimentos
        if (aprovs.length) await tx.supAprovacao.createMany({ data: aprovs.map((a) => ({ tenantId, requisicaoId: r.id, nivel: a.nivel, papel: a.papel, status: 'APROVADO' as const, decididoPorId: a.decididoPorId, decididoEm: a.decididoEm, parecer: `Aprovado no planejamento ${p.numero}${a.parecer ? ': ' + a.parecer : ''}` })) })
        return r
      })
      links.requisicaoId = req.id
      resumo = { requisicaoId: req.id, numero: req.numero, valorEstimado }
    } else if (destino === 'OS') {
      const os = await criarOrdemServico({
        tenantId, userId, tipo: 'MELHORIA', prioridade: p.prioridade === 'CRITICA' ? 'URGENTE' : p.prioridade === 'ALTA' ? 'ALTA' : p.prioridade === 'BAIXA' ? 'BAIXA' : 'MEDIA',
        titulo: `[${p.numero}] ${p.titulo}`.slice(0, 200), descricao: `${p.descricao ? p.descricao + '\n' : ''}Justificativa: ${p.justificativa}\nOrçamento aprovado: ${brl(valorBase)}`,
        spaceId: p.spaceId, responsavelUserId: p.responsavelUserId, fornecedorId: d.fornecedorId ?? cots.find((c) => c.escolhida)?.fornecedorId ?? null, prazo: p.fimPrevisto ?? undefined,
        agendadaPara: p.inicioPrevisto && p.inicioPrevisto > new Date() ? p.inicioPrevisto : null,
      })
      links.ordemServicoId = os.id
      resumo = { ordemServicoId: os.id, numero: os.numero }
    } else {
      const marcos = await prisma.iplMarco.findMany({ where: { tenantId, planoId: p.id }, orderBy: [{ ordem: 'asc' }, { data: 'asc' }] })
      const fim = p.fimPrevisto ?? marcos[marcos.length - 1]?.data
      if (!fim) fail(400, 'Defina o prazo final (fimPrevisto) ou marcos para converter em projeto.')
      const proj = await prisma.infProjeto.create({
        data: {
          tenantId, titulo: `[${p.numero}] ${p.titulo}`.slice(0, 200), status: 'APROVADO', oQue: p.titulo, porQue: p.justificativa, spaceId: p.spaceId, como: p.descricao ?? undefined,
          quantoCusta: round2(valorBase), justificativa: p.justificativa, inicioPrevisto: p.inicioPrevisto, fimPrevisto: fim, responsavelUserId: p.responsavelUserId, pdiMetaId: p.pdiMetaId, recomendacaoMec: p.indicadorMec,
          aprovadoPorId: aprovs[aprovs.length - 1]?.decididoPorId ?? userId, aprovadoEm: new Date(),
          etapas: { create: (marcos.length ? marcos : [{ titulo: 'Execução', data: fim }]).map((m, i) => ({ tenantId, ordem: i + 1, titulo: m.titulo, fim: m.data, inicio: i === 0 ? p.inicioPrevisto : undefined, responsavelUserId: p.responsavelUserId, custoPrevisto: 0 })) },
        },
      })
      links.projetoId = proj.id
      resumo = { projetoId: proj.id }
    }
    const up = await prisma.iplPlano.update({ where: { id: p.id }, data: { status: 'CONVERTIDO', convertidoEm: new Date(), destino, orcamentoEstimado: p.orcamentoEstimado, ...links } })
    await audit({ tenantId, userId, modulo: MODULO, acao: 'PLANO_CONVERTIDO', refType: 'IplPlano', refId: p.id, detalhes: { destino, ...resumo, valorBase, excecao } })
    const [v] = await enriquecer(tenantId, [up], pol, true)
    res.json({ ...v, conversao: { destino, ...resumo, valorBase, excecao } })
  }))

  // ---- execução, status e cancelamento
  router.post(`${P}/planos/:id/execucao`, requireRole(...GESTAO, 'SUPPLIES', 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await carregar(tenantId, String(req.params.id))
    if (!['CONVERTIDO', 'EM_EXECUCAO'].includes(p.status)) fail(409, 'Só é possível lançar execução em planos convertidos ou em execução.')
    const d = parseBody(z.object({ valor: z.number().positive(), descricao: z.string().optional() }), req.body)
    const up = await prisma.iplPlano.update({ where: { id: p.id }, data: { valorExecutado: { increment: d.valor }, status: 'EM_EXECUCAO' } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'EXECUCAO_LANCADA', refType: 'IplPlano', refId: p.id, detalhes: d })
    const [v] = await enriquecer(tenantId, [up], await getPolitica(tenantId), true)
    res.json(v)
  }))

  router.post(`${P}/planos/:id/status`, requireRole(...ESCREVE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { status, motivo } = parseBody(z.object({ status: z.enum(['EM_EXECUCAO', 'CONCLUIDO', 'CANCELADO']), motivo: z.string().optional() }), req.body)
    const p = await carregar(tenantId, String(req.params.id))
    if (!podeTransitar(p.status, status)) fail(409, `Transição ${p.status} → ${status} não permitida.`)
    if (status === 'CANCELADO' && !motivo?.trim()) fail(400, 'Informe o motivo do cancelamento.')
    const up = await prisma.iplPlano.update({ where: { id: p.id }, data: { status, ...(status === 'CONCLUIDO' ? { concluidoEm: new Date() } : {}), ...(status === 'CANCELADO' ? { motivoReprovacao: motivo } : {}) } })
    if (['CONCLUIDO', 'CANCELADO'].includes(status)) {
      await completeReminders({ tenantId, refType: 'IplPlano', refId: p.id })
      await cancelReminders({ tenantId, refType: 'IplPlano', refId: p.id })
    }
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: `PLANO_${status}`, refType: 'IplPlano', refId: p.id, detalhes: { motivo } })
    const [v] = await enriquecer(tenantId, [up], await getPolitica(tenantId), true)
    res.json(v)
  }))

  // ---- visões: cronograma (Gantt simples), orçamento, necessidades por curso, alertas, painel
  router.get(`${P}/cronograma`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId, status: { in: ATIVOS }, OR: [{ inicioPrevisto: { not: null } }, { fimPrevisto: { not: null } }] }
    const ano = qs(req.query.ano); if (ano) where.anoReferencia = parseInt(ano, 10) || 0
    for (const f of ['programId', 'tipo', 'status']) { const v = qs((req.query as any)[f]); if (v) { if (f === 'status') delete where.status; where[f] = v } }
    const rows = await prisma.iplPlano.findMany({ where, orderBy: [{ inicioPrevisto: 'asc' }, { fimPrevisto: 'asc' }], take: 300 })
    const itens = await enriquecer(tenantId, rows, await getPolitica(tenantId), true)
    const datas = itens.flatMap((i) => [i.inicioPrevisto, i.fimPrevisto, ...i.marcos.map((m: any) => m.data)]).filter(Boolean).map((d: Date) => new Date(d).getTime())
    const de = qs(req.query.de) ? new Date(qs(req.query.de)!) : new Date(datas.length ? Math.min(...datas) : Date.now())
    const ate = qs(req.query.ate) ? new Date(qs(req.query.ate)!) : new Date(datas.length ? Math.max(...datas) : Date.now() + 30 * DAY)
    if (isNaN(de.getTime()) || isNaN(ate.getTime())) fail(400, 'Período inválido.')
    const linhas = itens.map((i) => {
      const ini = new Date(i.inicioPrevisto ?? i.fimPrevisto), fim = new Date(i.fimPrevisto ?? i.inicioPrevisto)
      return {
        id: i.id, numero: i.numero, titulo: i.titulo, tipo: i.tipo, status: i.status, prioridade: i.prioridade, cursoNome: i.cursoNome, espacoNome: i.espacoNome, inicio: ini, fim, atrasado: i.atrasado, alertas: i.alertas.length,
        barra: barraGantt(ini, fim, de, ate),
        marcos: i.marcos.map((m: any) => ({ id: m.id, titulo: m.titulo, data: m.data, concluido: !!m.concluidoEm, atrasado: !m.concluidoEm && new Date(m.data) < new Date(), posicaoPct: barraGantt(new Date(m.data), new Date(m.data), de, ate).esquerdaPct })),
      }
    })
    res.json({ de, ate, hojePct: barraGantt(new Date(), new Date(), de, ate).esquerdaPct, linhas })
  }))

  router.get(`${P}/orcamento`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const pol = await getPolitica(tenantId)
    const rows = await prisma.iplPlano.findMany({ where: { tenantId } })
    const exec = await execucaoVinculada(tenantId, rows)
    const linhas = rows.map((p) => ({ ano: p.anoReferencia, programId: p.programId, tipo: p.tipo, status: p.status, orcamentoEstimado: p.orcamentoEstimado, executado: Math.max(p.valorExecutado, exec.get(p.id)?.vinculado ?? 0) }))
    const ano = qs(req.query.ano) ? parseInt(qs(req.query.ano)!, 10) : null
    const doAno = ano ? linhas.filter((l) => l.ano === ano) : linhas
    const programs = await prisma.academicProgram.findMany({ where: { tenantId }, select: { id: true, nome: true } })
    const nomeCurso = (id: string | null) => (id ? programs.find((p) => p.id === id)?.nome ?? 'Curso removido' : 'Institucional (sem curso)')
    const porAno = agregarOrcamento(linhas, (l) => String(l.ano)).map((a) => {
      const teto = pol.orcamentoAnual.find((t) => String(t.ano) === a.chave)?.valor ?? null
      return { ...a, ano: Number(a.chave), tetoAnual: teto, acimaDoTeto: teto != null && a.planejado > teto }
    })
    const porCurso = agregarOrcamento(doAno, (l) => nomeCurso(l.programId))
    const porTipo = agregarOrcamento(doAno, (l) => TIPO_ROTULO[l.tipo] ?? l.tipo)
    const tot = agregarOrcamento(doAno, () => 'total')[0] ?? { planejado: 0, aprovado: 0, executado: 0, saldo: 0, consumoPct: null, qtd: 0, estouro: false }
    res.json({ ano, total: tot, porAno, porCurso, porTipo, alertaOrcamentoPct: pol.alertaOrcamentoPct, estourados: [...porCurso, ...porAno].filter((a) => a.estouro).map((a) => a.chave) })
  }))

  router.get(`${P}/necessidades`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const only = qs(req.query.programId)
    const vagas = qs(req.query.vagas) ? parseInt(qs(req.query.vagas)!, 10) : undefined
    const progs = await prisma.infRequisitoCurso.findMany({ where: { tenantId, ativo: true, ...(only ? { programId: only } : {}) }, select: { programId: true }, distinct: ['programId'] })
    const planos = await prisma.iplPlano.findMany({ where: { tenantId, requisitoId: { not: null }, status: { in: COBREM_LACUNA } }, select: { id: true, numero: true, status: true, requisitoId: true, orcamentoEstimado: true } })
    const cursos: any[] = []
    for (const { programId } of progs) {
      const adq = await calcularAdequacao(tenantId, programId, vagas && vagas > 0 ? vagas : undefined)
      if (!adq) continue
      const linhas = adq.linhas.map((l) => {
        const cobre = planos.filter((p) => p.requisitoId === l.requisitoId)
        return { ...l, planos: cobre.map((p) => ({ id: p.id, numero: p.numero, status: p.status, orcamentoEstimado: p.orcamentoEstimado })), semPlano: l.lacuna > 0 && cobre.length === 0 }
      })
      const faltam = linhas.filter((l) => l.lacuna > 0)
      cursos.push({
        programId, curso: adq.programa.nome, vagas: adq.vagasConsideradas, conceitoSugerido: adq.conceitoSugerido, obrigatoriosAtendidosPct: adq.totais.obrigatoriosAtendidosPct,
        totais: { requisitos: linhas.length, faltam: faltam.length, semPlano: faltam.filter((l) => l.semPlano).length, investimentoEstimadoLacunas: adq.investimentoEstimadoLacunas }, linhas,
      })
    }
    cursos.sort((a, b) => b.totais.semPlano - a.totais.semPlano || a.curso.localeCompare(b.curso, 'pt-BR'))
    res.json({ cursos, resumo: { cursos: cursos.length, itensFaltando: cursos.reduce((s, c) => s + c.totais.faltam, 0), semPlano: cursos.reduce((s, c) => s + c.totais.semPlano, 0) } })
  }))

  router.get(`${P}/alertas`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const rows = await prisma.iplPlano.findMany({ where: { tenantId, status: { notIn: ['CONCLUIDO', 'CANCELADO', 'REPROVADO'] } } })
    const items = (await enriquecer(tenantId, rows, await getPolitica(tenantId))).filter((i) => i.alertas.length)
    const lista = items.flatMap((i) => i.alertas.map((a: any) => ({ ...a, planoId: i.id, numero: i.numero, titulo: i.titulo, status: i.status })))
    const ord = { CRITICO: 0, ATENCAO: 1, INFO: 2 } as Record<string, number>
    lista.sort((a, b) => ord[a.severidade] - ord[b.severidade])
    res.json({ total: lista.length, criticos: lista.filter((a) => a.severidade === 'CRITICO').length, alertas: lista })
  }))

  router.get(`${P}/painel`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const pol = await getPolitica(tenantId)
    const rows = await prisma.iplPlano.findMany({ where: { tenantId } })
    const items = await enriquecer(tenantId, rows, pol)
    const porStatus: Record<string, number> = {}
    for (const p of rows) porStatus[p.status] = (porStatus[p.status] ?? 0) + 1
    const ativos = items.filter((i) => ATIVOS.includes(i.status))
    const alertas = items.filter((i) => !['CONCLUIDO', 'CANCELADO', 'REPROVADO'].includes(i.status)).flatMap((i) => i.alertas)
    const pendSug = await prisma.iplSugestao.count({ where: { tenantId, status: 'PENDENTE' } })
    res.json({
      total: rows.length, porStatus,
      planejado: round2(ativos.reduce((s, i) => s + i.orcamentoEstimado, 0)),
      aprovado: round2(ativos.filter((i) => ['APROVADO', 'CONVERTIDO', 'EM_EXECUCAO', 'CONCLUIDO'].includes(i.status)).reduce((s, i) => s + i.orcamentoEstimado, 0)),
      executado: round2(ativos.reduce((s, i) => s + i.executado, 0)),
      aguardandoAprovacao: porStatus['AGUARDANDO_APROVACAO'] ?? 0,
      semCotacaoSuficiente: items.filter((i) => ['RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO'].includes(i.status) && !i.exigenciaCotacao.atende).length,
      vinculadosMec: rows.filter((r) => r.indicadorMec).length, vinculadosPdi: rows.filter((r) => r.pdiMetaId).length,
      alertas: { total: alertas.length, criticos: alertas.filter((a) => a.severidade === 'CRITICO').length }, sugestoesPendentes: pendSug,
      proximosPrazos: items.filter((i) => i.fimPrevisto && !['CONCLUIDO', 'CANCELADO', 'REPROVADO'].includes(i.status)).sort((a, b) => +new Date(a.fimPrevisto) - +new Date(b.fimPrevisto)).slice(0, 5).map((i) => ({ id: i.id, numero: i.numero, titulo: i.titulo, fimPrevisto: i.fimPrevisto, status: i.status })),
    })
  }))

  // relatório imprimível do plano de investimentos do ano
  router.get(`${P}/relatorio`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const ano = qs(req.query.ano) ? parseInt(qs(req.query.ano)!, 10) : new Date().getFullYear()
    const rows = await prisma.iplPlano.findMany({ where: { tenantId, anoReferencia: ano, status: { in: ATIVOS } }, orderBy: [{ prioridade: 'asc' }, { numero: 'asc' }] })
    const items = await enriquecer(tenantId, rows, await getPolitica(tenantId))
    if (qs(req.query.format) !== 'html') return res.json({ ano, items })
    const b = await getBranding(tenantId)
    const total = items.reduce((s, i) => s + i.orcamentoEstimado, 0)
    res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="max-width:1000px;margin:auto;font:13px sans-serif">${brandHeaderHtml(b, { titulo: `Plano de investimentos em infraestrutura ${ano}`, subtitulo: `${items.length} itens · ${brl(total)} planejados` })}
<div style="padding:16px 28px"><table style="width:100%;border-collapse:collapse"><tr style="background:#f1f5f9"><th align=left>Nº</th><th align=left>Item</th><th align=left>Curso/espaço</th><th>Prior.</th><th>Status</th><th align=right>Orçamento</th><th align=left>Justificativa / indicador</th></tr>
${items.map((i) => `<tr style="border-bottom:1px solid #e2e8f0;vertical-align:top"><td>${esc(i.numero)}</td><td>${esc(i.titulo)}<br><small>${esc(i.tipoRotulo)}</small></td><td>${esc(i.cursoNome ?? i.espacoNome ?? 'Institucional')}</td><td align=center>${esc(i.prioridade)}</td><td align=center>${esc(String(i.status).replace(/_/g, ' '))}</td><td align=right>${brl(i.orcamentoEstimado)}</td><td>${esc(i.justificativa)}${i.indicadorMec ? `<br><small><b>MEC:</b> ${esc(i.indicadorMec)}</small>` : ''}</td></tr>`).join('')}</table></div></body>`)
  }))

  // ---- sugestões (regras + IA opcional), sempre revisáveis
  router.post(`${P}/sugestoes/gerar`, requireRole(...ESCREVE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { programId } = parseBody(z.object({ programId: z.string().optional() }), req.body ?? {})
    if (programId && !(await prisma.academicProgram.findFirst({ where: { id: programId, tenantId }, select: { id: true } }))) fail(400, 'Curso não encontrado.')
    const cobertos = await prisma.iplPlano.findMany({ where: { tenantId, requisitoId: { not: null }, status: { in: COBREM_LACUNA } }, select: { requisitoId: true } })
    const cob = new Set(cobertos.map((c) => c.requisitoId!))
    const bruto = [...(await sugerirPorChecklist(tenantId, cob, programId)), ...(programId ? [] : await sugerirPorManutencao(tenantId))]
    const { motor, sugs } = await redigirJustificativas(tenantId, bruto)
    let criadas = 0, atualizadas = 0, ignoradas = 0
    for (const s of sugs) {
      const ex = await prisma.iplSugestao.findUnique({ where: { tenantId_chave: { tenantId, chave: s.chave } } })
      const data = { programId: s.programId ?? null, spaceId: s.spaceId ?? null, titulo: s.titulo, tipo: s.tipo, justificativa: s.justificativa, indicadorMec: s.indicadorMec ?? null, requisitoId: s.requisitoId ?? null, origem: s.origem, motor, explicacao: s.explicacao as any, quantidade: s.quantidade, valorEstimado: s.valorEstimado, prioridade: s.prioridade }
      if (!ex) { await prisma.iplSugestao.create({ data: { ...data, tenantId, chave: s.chave } }); criadas++ }
      else if (ex.status === 'PENDENTE') { await prisma.iplSugestao.update({ where: { id: ex.id }, data }); atualizadas++ }
      else ignoradas++
    }
    // sugestões pendentes cuja lacuna já foi coberta deixam de fazer sentido
    const obsoletas = await prisma.iplSugestao.updateMany({ where: { tenantId, status: 'PENDENTE', requisitoId: { in: [...cob] } }, data: { status: 'REJEITADA', motivo: 'Lacuna já coberta por um plano.', decididoEm: new Date() } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'SUGESTOES_GERADAS', detalhes: { motor, criadas, atualizadas, ignoradas } })
    res.json({ motor, aviso: motor === 'REGRAS' ? 'Geradas por regras explicáveis (IA não configurada neste ambiente); revise antes de aceitar.' : 'Evidências por regras; justificativas redigidas pela IA. Revise antes de aceitar.', criadas, atualizadas, ignoradas, obsoletas: obsoletas.count })
  }))

  router.get(`${P}/sugestoes`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId }
    for (const f of ['status', 'programId', 'origem']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const items = await prisma.iplSugestao.findMany({ where, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 300 })
    const programs = await prisma.academicProgram.findMany({ where: { tenantId, id: { in: items.map((i) => i.programId).filter(Boolean) as string[] } }, select: { id: true, nome: true } })
    res.json({ items: items.map((i) => ({ ...i, cursoNome: programs.find((p) => p.id === i.programId)?.nome ?? null })), total: items.length })
  }))

  router.post(`${P}/sugestoes/:sid/aceitar`, requireRole(...ESCREVE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const s = await prisma.iplSugestao.findFirst({ where: { id: String(req.params.sid), tenantId } })
    if (!s) fail(404, 'Sugestão não encontrada.')
    if (s!.status !== 'PENDENTE') fail(409, `Sugestão já ${s!.status === 'ACEITA' ? 'aceita' : 'rejeitada'}.`)
    const ov = parseBody(z.object({ titulo: z.string().min(3).optional(), orcamentoEstimado: z.number().min(0).optional(), justificativa: z.string().min(10).optional(), prioridade: z.enum(PRIORIDADES).optional(), anoReferencia: z.number().int().optional(), fimPrevisto: dateISO().optional().nullable() }), req.body ?? {})
    const ano = ov.anoReferencia ?? new Date().getFullYear()
    const numero = await proximoNumeroPlano(tenantId, ano)
    const plano = await prisma.iplPlano.create({
      data: {
        tenantId, numero, titulo: ov.titulo ?? s!.titulo, tipo: s!.tipo, prioridade: ov.prioridade ?? s!.prioridade, anoReferencia: ano, programId: s!.programId, spaceId: s!.spaceId,
        justificativa: ov.justificativa ?? s!.justificativa, indicadorMec: s!.indicadorMec, requisitoId: s!.requisitoId, origem: s!.origem === 'CHECKLIST' ? 'CHECKLIST' : 'MANUTENCAO', sugestaoId: s!.id,
        orcamentoEstimado: ov.orcamentoEstimado ?? s!.valorEstimado, fimPrevisto: ov.fimPrevisto ?? undefined, solicitanteUserId: getUserId(req), responsavelUserId: getUserId(req),
        descricao: `Sugestão automática (${s!.motor}). Evidências: ${(s!.explicacao as any[]).map((e) => `${e.fato}: ${e.detalhe}`).join('; ')}`.slice(0, 1800),
      },
    })
    await prisma.iplSugestao.update({ where: { id: s!.id }, data: { status: 'ACEITA', planoId: plano.id, decididoPorId: getUserId(req), decididoEm: new Date() } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'SUGESTAO_ACEITA', refType: 'IplSugestao', refId: s!.id, detalhes: { planoId: plano.id } })
    const [v] = await enriquecer(tenantId, [plano], await getPolitica(tenantId), true)
    res.status(201).json(v)
  }))
  router.post(`${P}/sugestoes/:sid/rejeitar`, requireRole(...ESCREVE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const s = await prisma.iplSugestao.findFirst({ where: { id: String(req.params.sid), tenantId } })
    if (!s) fail(404, 'Sugestão não encontrada.')
    if (s!.status !== 'PENDENTE') fail(409, `Sugestão já ${s!.status === 'ACEITA' ? 'aceita' : 'rejeitada'}.`)
    const { motivo } = parseBody(z.object({ motivo: z.string().min(3, 'Informe o motivo') }), req.body ?? {})
    res.json(await prisma.iplSugestao.update({ where: { id: s!.id }, data: { status: 'REJEITADA', motivo, decididoPorId: getUserId(req), decididoEm: new Date() } }))
  }))
}
