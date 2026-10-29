import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { ATENDE, CANAIS_DISPARO, GESTAO, LEITURA, OFFLINE_TIPOS, ORIGENS, REDES, db, dt, dtReq, fail, getConfig, historico, money, optStr, tid, uid } from './common'

const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
const ehSuper = (req: AuthenticatedRequest) => SUPER.includes(String(req.user?.role || '').toUpperCase())

export async function recalcRealizado(tenantId: string, campanhaId: string) {
  const [c, m] = await Promise.all([db.mktCusto.aggregate({ where: { tenantId, campanhaId }, _sum: { valor: true } }), db.mktMidiaOffline.aggregate({ where: { tenantId, campanhaId }, _sum: { custoTotal: true } })])
  const total = Math.round(((c._sum.valor ?? 0) + (m._sum.custoTotal ?? 0)) * 100) / 100
  await db.mktCampanha.update({ where: { id: campanhaId }, data: { orcamentoRealizado: total } })
  return total
}

const campSchema = z.object({
  nome: z.string().min(3).max(150), objetivo: optStr(500), briefing: optStr(5000),
  canais: z.array(z.string().max(30)).max(30).default([]), cursoId: optStr(80), cursoNome: optStr(150), publico: optStr(80), vestibularId: optStr(80),
  responsavelId: optStr(80), responsavelNome: optStr(120), inicio: dtReq(), fim: dtReq(),
  orcamentoPrevisto: money().default(0), baseLegal: z.string().max(40).default('CONSENTIMENTO'), finalidade: z.enum(['MARKETING', 'TRANSACIONAL']).default('MARKETING'),
  metaLeads: z.number().int().min(0).default(0), metaMatriculas: z.number().int().min(0).default(0), cor: optStr(9), utmCampaign: optStr(150),
})
const BASES_LEGAIS = ['CONSENTIMENTO', 'LEGITIMO_INTERESSE', 'EXECUCAO_CONTRATO', 'PROCEDIMENTOS_PRELIMINARES', 'OBRIGACAO_LEGAL']

export function registerCampanhas(r: Router) {
  r.get('/config', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => res.json(await getConfig(tid(req)))))
  r.put('/config', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({
      janelaInicio: z.string().regex(/^\d{2}:\d{2}$/).optional(), janelaFim: z.string().regex(/^\d{2}:\d{2}$/).optional(), diasPermitidos: z.array(z.number().int().min(0).max(6)).optional(),
      limiteDia: z.number().int().min(0).max(50).optional(), limiteSemana: z.number().int().min(0).max(200).optional(), remetenteNome: optStr(150), remetenteEndereco: optStr(300), contatoDpo: optStr(150),
      slaPrimeiroContatoMin: z.number().int().min(1).max(10080).optional(), ticketMedio: money().optional(), metaCustoLead: money().nullish(), limiteAprovacaoOrcamento: money().optional(),
    }), req.body)
    if (b.janelaInicio && b.janelaFim && b.janelaInicio >= b.janelaFim) fail(400, 'A janela de horário deve terminar depois de iniciar.')
    await getConfig(tid(req))
    const up = await db.mktConfig.update({ where: { tenantId: tid(req) }, data: b })
    await audit({ tenantId: tid(req), userId: uid(req), modulo: 'marketing', acao: 'CONFIG_ALTERADA', refType: 'MktConfig', refId: up.id })
    res.json(up)
  }))

  // ---------------------------------------------------------------- campanhas
  r.get('/campanhas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const k of ['status', 'cursoId', 'vestibularId', 'publico']) { const v = qs((req.query as any)[k]); if (v) where[k] = v }
    const canal = qs(req.query.canal); if (canal) where.canais = { has: canal }
    const q = qs(req.query.q); if (q) where.OR = [{ nome: { contains: q, mode: 'insensitive' } }, { cursoNome: { contains: q, mode: 'insensitive' } }]
    const [items, total] = await Promise.all([db.mktCampanha.findMany({ where, orderBy: { inicio: 'desc' }, skip, take }), db.mktCampanha.count({ where })])
    res.json({ items, total, page, pageSize })
  }))
  r.get('/campanhas/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const c = await db.mktCampanha.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) fail(404, 'Campanha não encontrada.')
    const [hist, custos, leads, mat, pubs, disparos] = await Promise.all([
      db.mktHistorico.findMany({ where: { tenantId, refType: 'MktCampanha', refId: c.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      db.mktCusto.findMany({ where: { tenantId, campanhaId: c.id }, orderBy: { data: 'desc' }, take: 100 }),
      db.mktLead.count({ where: { tenantId, campanhaId: c.id } }), db.mktLead.count({ where: { tenantId, campanhaId: c.id, etapa: 'MATRICULADO' } }),
      db.mktPublicacao.count({ where: { tenantId, campanhaId: c.id } }), db.mktDisparo.count({ where: { tenantId, campanhaId: c.id } }),
    ])
    res.json({ ...c, historico: hist, custos, leads, matriculados: mat, publicacoes: pubs, disparos })
  }))
  r.post('/campanhas', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const b = parseBody(campSchema, req.body)
    if (b.fim < b.inicio) fail(400, 'O fim da campanha é anterior ao início.')
    if (!BASES_LEGAIS.includes(b.baseLegal)) fail(400, 'Base legal inválida.')
    if (b.finalidade === 'MARKETING' && b.baseLegal !== 'CONSENTIMENTO' && b.baseLegal !== 'LEGITIMO_INTERESSE') fail(400, 'Marketing exige base legal de consentimento ou legítimo interesse.')
    for (const c of b.canais) if (![...ORIGENS, ...CANAIS_DISPARO, ...REDES, ...OFFLINE_TIPOS].includes(c as any)) fail(400, `Canal desconhecido: ${c}`)
    if (b.vestibularId && !(await prisma.admProcessoSeletivo.findFirst({ where: { id: b.vestibularId, tenantId }, select: { id: true } }))) fail(400, 'Vestibular/processo seletivo não encontrado nesta instituição.')
    const n = (await db.mktCampanha.count({ where: { tenantId } })) + 1
    const c = await db.mktCampanha.create({ data: { ...b, tenantId, codigo: `MKT-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`, criadoPorId: uid(req), utmCampaign: b.utmCampaign ?? undefined } as any })
    await historico(tenantId, 'MktCampanha', c.id, 'CRIADA', uid(req))
    await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: 'CRIAR', refType: 'MktCampanha', refId: c.id })
    res.status(201).json(c)
  }))
  r.patch('/campanhas/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const cur = await db.mktCampanha.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) fail(404, 'Campanha não encontrada.')
    if (['CONCLUIDA', 'CANCELADA'].includes(cur.status)) fail(409, 'Campanha encerrada não pode ser editada.')
    const b = parseBody(campSchema.partial(), req.body)
    if ((b.fim ?? cur.fim) < (b.inicio ?? cur.inicio)) fail(400, 'O fim da campanha é anterior ao início.')
    const mudouOrc = b.orcamentoPrevisto != null && b.orcamentoPrevisto !== cur.orcamentoPrevisto
    // alterar orçamento de campanha já aprovada volta para aprovação (segregação de função)
    const extra: any = mudouOrc && ['APROVADA', 'ATIVA', 'PAUSADA'].includes(cur.status) ? { status: 'EM_APROVACAO', aprovadoPorId: null, aprovadoEm: null } : {}
    const up = await db.mktCampanha.update({ where: { id: cur.id }, data: { ...b, ...extra } as any })
    await historico(tenantId, 'MktCampanha', cur.id, 'EDITADA', uid(req), mudouOrc ? 'Orçamento alterado' + (extra.status ? ' — reenviada para aprovação' : '') : undefined)
    res.json(up)
  }))
  const transicao = (rota: string, de: string[], para: string | ((c: any, cfg: any) => string), perm: any, extra?: (c: any, req: AuthenticatedRequest) => any) =>
    r.post(`/campanhas/:id/${rota}`, perm, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = tid(req); const c = await db.mktCampanha.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!c) fail(404, 'Campanha não encontrada.')
      if (!de.includes(c.status)) fail(409, `Ação indisponível para campanha em ${c.status}.`)
      const cfg = await getConfig(tenantId)
      const novo = typeof para === 'function' ? para(c, cfg) : para
      const nota = qs(req.body?.nota) ?? qs(req.body?.motivo)
      const up = await db.mktCampanha.update({ where: { id: c.id }, data: { status: novo, ...(extra ? extra(c, req) : {}), ...(rota === 'rejeitar' ? { motivoRejeicao: nota ?? 'Sem motivo informado' } : {}) } })
      await historico(tenantId, 'MktCampanha', c.id, rota.toUpperCase(), uid(req), nota)
      await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: `CAMPANHA_${rota.toUpperCase()}`, refType: 'MktCampanha', refId: c.id })
      res.json(up)
    }))
  transicao('enviar-aprovacao', ['RASCUNHO', 'REJEITADA'], 'EM_APROVACAO', requireRole(...GESTAO))
  const aprovador = requireRole('COORDINATOR')
  r.post('/campanhas/:id/aprovar', aprovador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const c = await db.mktCampanha.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) fail(404, 'Campanha não encontrada.')
    if (c.status !== 'EM_APROVACAO') fail(409, `Campanha em ${c.status} não está aguardando aprovação.`)
    if (c.criadoPorId === uid(req) && !ehSuper(req)) fail(403, 'Segregação de função: quem criou a campanha não pode aprová-la.')
    const up = await db.mktCampanha.update({ where: { id: c.id }, data: { status: 'APROVADA', aprovadoPorId: uid(req), aprovadoEm: new Date(), motivoRejeicao: null } })
    await historico(tenantId, 'MktCampanha', c.id, 'APROVADA', uid(req), qs(req.body?.nota))
    await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: 'CAMPANHA_APROVADA', refType: 'MktCampanha', refId: c.id })
    res.json(up)
  }))
  transicao('rejeitar', ['EM_APROVACAO'], 'REJEITADA', aprovador)
  r.post('/campanhas/:id/ativar', requireRole(...GESTAO, 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const c = await db.mktCampanha.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) fail(404, 'Campanha não encontrada.')
    const cfg = await getConfig(tenantId)
    const precisa = c.orcamentoPrevisto > cfg.limiteAprovacaoOrcamento
    if (c.status === 'RASCUNHO' && precisa) fail(409, `Orçamento acima de R$ ${cfg.limiteAprovacaoOrcamento.toFixed(2)}: envie para aprovação antes de ativar.`)
    if (!['APROVADA', 'PAUSADA'].concat(precisa ? [] : ['RASCUNHO']).includes(c.status)) fail(409, `Campanha em ${c.status} não pode ser ativada.`)
    const up = await db.mktCampanha.update({ where: { id: c.id }, data: { status: 'ATIVA' } })
    await historico(tenantId, 'MktCampanha', c.id, 'ATIVADA', uid(req)); res.json(up)
  }))
  transicao('pausar', ['ATIVA'], 'PAUSADA', requireRole(...GESTAO))
  transicao('concluir', ['ATIVA', 'PAUSADA'], 'CONCLUIDA', requireRole(...GESTAO))
  transicao('cancelar', ['RASCUNHO', 'EM_APROVACAO', 'APROVADA', 'ATIVA', 'PAUSADA', 'REJEITADA'], 'CANCELADA', requireRole(...GESTAO))
  r.post('/campanhas/:id/vincular-admissoes', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const c = await db.mktCampanha.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) fail(404, 'Campanha não encontrada.')
    if (c.admCampanhaId) return res.json({ admCampanhaId: c.admCampanhaId, jaVinculada: true })
    const utm = c.utmCampaign ?? `mkt-${c.id.slice(0, 8)}`
    const a = await prisma.admCampanha.create({ data: { tenantId, nome: c.nome, canal: c.canais[0] ?? 'ORGANICO', utmCampaign: utm, utmSource: 'marketing', processoId: c.vestibularId, orcamento: c.orcamentoPrevisto, metaInscritos: c.metaLeads, metaMatriculas: c.metaMatriculas, inicio: c.inicio, fim: c.fim } })
    await db.mktCampanha.update({ where: { id: c.id }, data: { admCampanhaId: a.id, utmCampaign: utm } })
    await historico(tenantId, 'MktCampanha', c.id, 'VINCULADA_ADMISSOES', uid(req)); res.status(201).json({ admCampanhaId: a.id, utmCampaign: utm })
  }))

  // ---------------------------------------------------------------- custos (orçamento realizado)
  r.get('/custos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const where: any = { tenantId: tid(req) }; const c = qs(req.query.campanhaId); if (c) where.campanhaId = c
    const items = await db.mktCusto.findMany({ where, orderBy: { data: 'desc' }, take: 300 }); res.json({ items, total: items.length })
  }))
  r.post('/custos', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ campanhaId: optStr(80), origem: z.enum(ORIGENS).optional(), tipo: z.enum(['MIDIA', 'PRODUCAO', 'EQUIPE', 'EVENTO', 'OUTROS']).default('MIDIA'), valor: z.number().positive().max(1e9), data: dt(), descricao: optStr(300) }), req.body)
    if (b.campanhaId && !(await db.mktCampanha.findFirst({ where: { id: b.campanhaId, tenantId }, select: { id: true } }))) fail(404, 'Campanha não encontrada.')
    const c = await db.mktCusto.create({ data: { ...b, tenantId, criadoPorId: uid(req) } as any })
    if (b.campanhaId) await recalcRealizado(tenantId, b.campanhaId)
    await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: 'CUSTO_LANCADO', refType: 'MktCusto', refId: c.id, detalhes: { valor: b.valor } })
    res.status(201).json(c)
  }))
  r.delete('/custos/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const c = await db.mktCusto.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) fail(404, 'Custo não encontrado.')
    await db.mktCusto.delete({ where: { id: c.id } }); if (c.campanhaId) await recalcRealizado(tenantId, c.campanhaId)
    await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: 'CUSTO_REMOVIDO', refType: 'MktCusto', refId: c.id }); res.json({ ok: true })
  }))

  // ---------------------------------------------------------------- calendário (mês/semana)
  r.get('/calendario', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const visao = qs(req.query.visao) === 'semana' ? 'semana' : 'mes'
    const ref = qs(req.query.data) ? new Date(String(qs(req.query.data))) : new Date()
    if (isNaN(ref.getTime())) fail(400, 'Data inválida.')
    let ini: Date, fim: Date
    if (visao === 'mes') { ini = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1)); fim = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1)) }
    else { const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate())); ini = new Date(d.getTime() - d.getUTCDay() * 86_400_000); fim = new Date(ini.getTime() + 7 * 86_400_000) }
    const canal = qs(req.query.canal); const curso = qs(req.query.curso); const publico = qs(req.query.publico); const vest = qs(req.query.vestibularId)
    const cw: any = { tenantId, inicio: { lt: fim }, fim: { gte: ini }, status: { not: 'CANCELADA' } }
    if (canal) cw.canais = { has: canal }; if (curso) cw.cursoNome = { contains: curso, mode: 'insensitive' }; if (publico) cw.publico = publico; if (vest) cw.vestibularId = vest
    const camps = await db.mktCampanha.findMany({ where: cw, take: 500 })
    const ids = camps.map((c: any) => c.id)
    const filtrou = !!(canal || curso || publico || vest)
    const rel = filtrou ? { campanhaId: { in: ids } } : {}
    const [pubs, eventos, midias, discs] = await Promise.all([
      db.mktPublicacao.findMany({ where: { tenantId, status: { not: 'CANCELADA' }, ...(canal ? { rede: canal } : {}), ...(filtrou && !canal ? rel : {}), OR: [{ agendadoPara: { gte: ini, lt: fim } }, { publicadoEm: { gte: ini, lt: fim } }] }, take: 500 }),
      filtrou && !canal && !curso ? Promise.resolve([]) : db.mktEvento.findMany({ where: { tenantId, status: { not: 'CANCELADO' }, inicio: { gte: ini, lt: fim } }, take: 300 }),
      db.mktMidiaOffline.findMany({ where: { tenantId, status: { not: 'CANCELADA' }, inicio: { lt: fim }, OR: [{ fim: null }, { fim: { gte: ini } }], ...(canal ? { tipo: canal } : {}), ...(filtrou && !canal ? rel : {}) }, take: 300 }),
      db.mktDisparo.findMany({ where: { tenantId, status: { in: ['AGENDADO', 'CONCLUIDO', 'ENVIANDO'] }, ...(canal ? { canal } : {}), ...(filtrou && !canal ? rel : {}), OR: [{ agendadoPara: { gte: ini, lt: fim } }, { executadoEm: { gte: ini, lt: fim } }] }, take: 300 }),
    ])
    const cn = new Map(camps.map((c: any) => [c.id, c.nome]))
    const itens = [
      ...camps.map((c: any) => ({ tipo: 'CAMPANHA', id: c.id, titulo: c.nome, inicio: c.inicio, fim: c.fim, canal: c.canais.join(', '), status: c.status, cor: c.cor, responsavel: c.responsavelNome, orcamentoPrevisto: c.orcamentoPrevisto, orcamentoRealizado: c.orcamentoRealizado })),
      ...pubs.map((p: any) => ({ tipo: 'PUBLICACAO', id: p.id, titulo: p.texto.slice(0, 60), inicio: p.agendadoPara ?? p.publicadoEm, fim: p.agendadoPara ?? p.publicadoEm, canal: p.rede, status: p.status, campanha: cn.get(p.campanhaId) })),
      ...eventos.map((e: any) => ({ tipo: 'EVENTO', id: e.id, titulo: e.titulo, inicio: e.inicio, fim: e.fim ?? e.inicio, canal: 'EVENTO', status: e.status })),
      ...midias.map((m: any) => ({ tipo: 'MIDIA_OFFLINE', id: m.id, titulo: `${m.tipo} · ${m.veiculo}`, inicio: m.inicio, fim: m.fim ?? m.inicio, canal: m.tipo, status: m.status })),
      ...discs.map((d: any) => ({ tipo: 'DISPARO', id: d.id, titulo: d.nome, inicio: d.agendadoPara ?? d.executadoEm, fim: d.agendadoPara ?? d.executadoEm, canal: d.canal, status: d.status })),
    ].sort((a: any, b: any) => +new Date(a.inicio) - +new Date(b.inicio))
    res.json({ visao, inicio: ini, fim, itens })
  }))

  // ---------------------------------------------------------------- consultores, scoring (regras)
  mountCrud(r, { model: 'mktConsultor', path: '/consultores', read: LEITURA, write: GESTAO, modulo: 'marketing', search: ['nome', 'email'], filters: ['ativo'], orderBy: { nome: 'asc' },
    create: z.object({ userId: optStr(80), nome: z.string().min(2).max(120), email: optStr(150), telefone: optStr(30), ativo: z.boolean().default(true), peso: z.number().int().min(1).max(10).default(1), cursos: z.array(z.string().max(150)).max(50).default([]), origens: z.array(z.string().max(40)).max(30).default([]) }) })
  r.get('/scoring/regras', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { regrasDoTenant } = await import('./leads'); res.json(await regrasDoTenant(tid(req)))
  }))
  r.put('/scoring/regras', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ evento: z.string().min(2).max(60), pontos: z.number().int().min(-100).max(100), ativo: z.boolean().default(true) }), req.body)
    const tenantId = tid(req)
    const x = await db.mktScoreRegra.upsert({ where: { tenantId_evento: { tenantId, evento: b.evento } }, create: { ...b, tenantId }, update: b })
    await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: 'SCORING_REGRA', refType: 'MktScoreRegra', refId: x.id }); res.json(x)
  }))
  void ATENDE
}
