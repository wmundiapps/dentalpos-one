import { Router, Response } from 'express'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { qs } from '../core/crud'
import { audit } from '../core/notify'
import { LEITURA, GESTAO, csv, db, fail, getConfig, tid, uid } from './common'
import { dividir, razao, roi } from './logic'
import { sincronizarAdmissoes } from './leads'

const periodo = (req: AuthenticatedRequest) => {
  const de = qs(req.query.de) ? new Date(String(qs(req.query.de))) : new Date(Date.now() - 90 * 86_400_000)
  const ate = qs(req.query.ate) ? new Date(String(qs(req.query.ate))) : new Date()
  if (isNaN(+de) || isNaN(+ate)) fail(400, 'Período inválido.')
  if (ate < de) fail(400, 'O fim do período é anterior ao início.')
  return { de, ate: new Date(ate.getTime() + 86_399_999 * (qs(req.query.ate) && String(qs(req.query.ate)).length <= 10 ? 1 : 0)) }
}

export async function funil(tenantId: string, de: Date, ate: Date, campanhaId?: string) {
  const where: any = { tenantId, createdAt: { gte: de, lte: ate }, ...(campanhaId ? { campanhaId } : {}) }
  const g = await db.mktLead.groupBy({ by: ['etapa'], where, _count: { _all: true } })
  const c = Object.fromEntries(g.map((x: any) => [x.etapa, x._count._all])) as Record<string, number>
  const total = Object.values(c).reduce((a, b) => a + b, 0)
  const insc = (c.INSCRITO ?? 0) + (c.MATRICULADO ?? 0)
  const mat = c.MATRICULADO ?? 0
  const qualificados = (c.QUALIFICADO ?? 0) + insc
  const contatados = (c.CONTATO ?? 0) + qualificados
  return {
    etapas: [
      { etapa: 'LEAD', rotulo: 'Leads captados', total },
      { etapa: 'CONTATO', rotulo: 'Contatados', total: contatados }, { etapa: 'QUALIFICADO', rotulo: 'Qualificados', total: qualificados },
      { etapa: 'INSCRITO', rotulo: 'Inscritos', total: insc }, { etapa: 'MATRICULADO', rotulo: 'Matriculados', total: mat },
    ], perdidos: c.PERDIDO ?? 0, porEtapaAtual: c, conversaoLeadInscrito: razao(insc, total), conversaoInscritoMatricula: razao(mat, insc), conversaoLeadMatricula: razao(mat, total),
  }
}

export async function canais(tenantId: string, de: Date, ate: Date) {
  const cfg = await getConfig(tenantId)
  const leads = await db.mktLead.findMany({ where: { tenantId, createdAt: { gte: de, lte: ate } }, select: { origem: true, etapa: true, valorEstimado: true, score: true } })
  const por: Record<string, any> = {}
  const get = (o: string) => (por[o] ??= { origem: o, leads: 0, inscritos: 0, matriculados: 0, receita: 0, custo: 0, scoreMedio: 0, _s: 0 })
  for (const l of leads) { const x = get(l.origem); x.leads++; x._s += l.score; if (['INSCRITO', 'MATRICULADO'].includes(l.etapa)) x.inscritos++; if (l.etapa === 'MATRICULADO') { x.matriculados++; x.receita += l.valorEstimado ?? cfg.ticketMedio } }
  const camps = new Map((await db.mktCampanha.findMany({ where: { tenantId }, select: { id: true, canais: true } })).map((c: any) => [c.id, c]))
  const custos = await db.mktCusto.findMany({ where: { tenantId, data: { gte: de, lte: ate } } })
  for (const c of custos) { const o = c.origem ?? (camps.get(c.campanhaId) as any)?.canais?.[0] ?? 'OUTRO'; get(o).custo += c.valor }
  const midias = await db.mktMidiaOffline.findMany({ where: { tenantId, inicio: { gte: de, lte: ate } } })
  for (const m of midias) get(['RADIO', 'TV', 'OUTDOOR', 'PANFLETAGEM'].includes(m.tipo) ? m.tipo : 'OUTRO').custo += m.custoTotal
  const evs = await db.mktEvento.findMany({ where: { tenantId, inicio: { gte: de, lte: ate } }, select: { custo: true } })
  for (const e of evs) if (e.custo > 0) get('EVENTO').custo += e.custo
  const rows = Object.values(por).map((x: any) => ({ origem: x.origem, leads: x.leads, inscritos: x.inscritos, matriculados: x.matriculados, scoreMedio: x.leads ? Math.round(x._s / x.leads) : 0, custo: Math.round(x.custo * 100) / 100, receita: Math.round(x.receita * 100) / 100, cpl: dividir(x.custo, x.leads), custoPorInscrito: dividir(x.custo, x.inscritos), cac: dividir(x.custo, x.matriculados), roi: roi(x.receita, x.custo), conversao: razao(x.matriculados, x.leads) }))
  rows.sort((a, b) => b.leads - a.leads)
  const tot = rows.reduce((a, x) => ({ leads: a.leads + x.leads, mat: a.mat + x.matriculados, custo: a.custo + x.custo, receita: a.receita + x.receita, insc: a.insc + x.inscritos }), { leads: 0, mat: 0, custo: 0, receita: 0, insc: 0 })
  return { canais: rows, total: { leads: tot.leads, inscritos: tot.insc, matriculados: tot.mat, custo: Math.round(tot.custo * 100) / 100, receita: Math.round(tot.receita * 100) / 100, cpl: dividir(tot.custo, tot.leads), cac: dividir(tot.custo, tot.mat), roi: roi(tot.receita, tot.custo) } }
}

export async function campanhasResumo(tenantId: string) {
  const cfg = await getConfig(tenantId)
  const cs = await db.mktCampanha.findMany({ where: { tenantId }, orderBy: { inicio: 'desc' }, take: 200 })
  const ls = await db.mktLead.groupBy({ by: ['campanhaId', 'etapa'], where: { tenantId, campanhaId: { not: null } }, _count: { _all: true } })
  return cs.map((c: any) => {
    const mine = ls.filter((l: any) => l.campanhaId === c.id); const leads = mine.reduce((a: number, l: any) => a + l._count._all, 0); const mat = mine.filter((l: any) => l.etapa === 'MATRICULADO').reduce((a: number, l: any) => a + l._count._all, 0)
    const receita = mat * cfg.ticketMedio
    return { id: c.id, codigo: c.codigo, nome: c.nome, status: c.status, inicio: c.inicio, fim: c.fim, canais: c.canais, orcamentoPrevisto: c.orcamentoPrevisto, orcamentoRealizado: c.orcamentoRealizado, desvioPct: c.orcamentoPrevisto ? Math.round(((c.orcamentoRealizado - c.orcamentoPrevisto) / c.orcamentoPrevisto) * 1000) / 10 : null, metaLeads: c.metaLeads, leads, metaMatriculas: c.metaMatriculas, matriculados: mat, cpl: dividir(c.orcamentoRealizado, leads), cac: dividir(c.orcamentoRealizado, mat), roi: roi(receita, c.orcamentoRealizado) }
  })
}

export async function consultoresResumo(tenantId: string, de: Date, ate: Date) {
  const cfg = await getConfig(tenantId)
  const ls = await db.mktLead.findMany({ where: { tenantId, createdAt: { gte: de, lte: ate } }, select: { consultorId: true, consultorNome: true, etapa: true, atribuidoEm: true, primeiroContatoEm: true, score: true } })
  const por: Record<string, any> = {}
  for (const l of ls) {
    const k = l.consultorId ?? 'SEM'; const x = (por[k] ??= { consultorId: l.consultorId, consultor: l.consultorNome ?? 'Sem consultor', leads: 0, contatados: 0, inscritos: 0, matriculados: 0, _t: 0, _n: 0, foraSla: 0 })
    x.leads++; if (l.etapa !== 'NOVO') x.contatados++; if (['INSCRITO', 'MATRICULADO'].includes(l.etapa)) x.inscritos++; if (l.etapa === 'MATRICULADO') x.matriculados++
    if (l.atribuidoEm && l.primeiroContatoEm) { const min = (+l.primeiroContatoEm - +l.atribuidoEm) / 60000; x._t += min; x._n++; if (min > cfg.slaPrimeiroContatoMin) x.foraSla++ }
  }
  return Object.values(por).map((x: any) => ({ ...x, tempoMedioPrimeiroContatoMin: x._n ? Math.round(x._t / x._n) : null, _t: undefined, _n: undefined, conversao: razao(x.matriculados, x.leads) })).sort((a: any, b: any) => b.matriculados - a.matriculados || b.leads - a.leads)
}

export function registerPainel(r: Router) {
  r.get('/painel', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { de, ate } = periodo(req)
    const [f, c, camps, ats, ev, pubs, sup, cfg, novosHoje, quentes] = await Promise.all([
      funil(tenantId, de, ate), canais(tenantId, de, ate), campanhasResumo(tenantId),
      db.mktAtendimento.groupBy({ by: ['status'], where: { tenantId, createdAt: { gte: de, lte: ate } }, _count: { _all: true } }),
      db.mktEvento.findMany({ where: { tenantId, status: 'PUBLICADO', inicio: { gte: new Date() } }, orderBy: { inicio: 'asc' }, take: 5, select: { id: true, titulo: true, inicio: true } }),
      db.mktPublicacao.findMany({ where: { tenantId, status: { in: ['AGENDADA', 'APROVADA'] }, agendadoPara: { gte: new Date() } }, orderBy: { agendadoPara: 'asc' }, take: 5, select: { id: true, rede: true, texto: true, agendadoPara: true } }),
      db.mktSupressao.count({ where: { tenantId, ativo: true } }), getConfig(tenantId),
      db.mktLead.count({ where: { tenantId, createdAt: { gte: new Date(Date.now() - 86_400_000) } } }), db.mktLead.count({ where: { tenantId, temperatura: 'QUENTE', etapa: { in: ['NOVO', 'CONTATO', 'QUALIFICADO'] } } }),
    ])
    const ativas = camps.filter((x: any) => x.status === 'ATIVA')
    res.json({ periodo: { de, ate }, funil: f, totais: c.total, topCanais: c.canais.slice(0, 5), campanhasAtivas: ativas.length, orcamento: { previsto: camps.reduce((a: number, x: any) => a + x.orcamentoPrevisto, 0), realizado: camps.reduce((a: number, x: any) => a + x.orcamentoRealizado, 0) }, metaCustoLead: cfg.metaCustoLead,
      atendimentos: Object.fromEntries(ats.map((a: any) => [a.status, a._count._all])), proximosEventos: ev, proximasPublicacoes: pubs, supressoesAtivas: sup, leadsUltimas24h: novosHoje, leadsQuentesAbertos: quentes })
  }))
  r.get('/painel/funil', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => { const { de, ate } = periodo(req); res.json(await funil(tid(req), de, ate, qs(req.query.campanhaId))) }))
  r.get('/painel/canais', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => { const { de, ate } = periodo(req); res.json(await canais(tid(req), de, ate)) }))
  r.get('/painel/campanhas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => res.json(await campanhasResumo(tid(req)))))
  r.get('/painel/conversao', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { de, ate } = periodo(req)
    const [cons, cursos, temp] = await Promise.all([consultoresResumo(tenantId, de, ate), db.mktLead.groupBy({ by: ['cursoInteresse', 'etapa'], where: { tenantId, createdAt: { gte: de, lte: ate } }, _count: { _all: true } }), db.mktLead.groupBy({ by: ['temperatura'], where: { tenantId, createdAt: { gte: de, lte: ate } }, _count: { _all: true } })])
    const pc: Record<string, any> = {}; for (const x of cursos) { const k = x.cursoInteresse ?? 'Não informado'; const o = (pc[k] ??= { curso: k, leads: 0, matriculados: 0 }); o.leads += x._count._all; if (x.etapa === 'MATRICULADO') o.matriculados += x._count._all }
    res.json({ consultores: cons, cursos: Object.values(pc).map((x: any) => ({ ...x, conversao: razao(x.matriculados, x.leads) })).sort((a: any, b: any) => b.leads - a.leads), temperatura: Object.fromEntries(temp.map((t: any) => [t.temperatura, t._count._all])) })
  }))
  r.get('/painel/editorial', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const g = await db.mktPublicacao.groupBy({ by: ['rede', 'status'], where: { tenantId }, _count: { _all: true } })
    const rows: Record<string, any> = {}; for (const x of g) { const o = (rows[x.rede] ??= { rede: x.rede, total: 0 }); o[x.status] = x._count._all; o.total += x._count._all }
    const prox = await db.mktPublicacao.findMany({ where: { tenantId, agendadoPara: { gte: new Date(), lte: new Date(Date.now() + 14 * 86_400_000) }, status: { not: 'CANCELADA' } }, orderBy: { agendadoPara: 'asc' }, take: 50 })
    const pubs = await db.mktPublicacao.findMany({ where: { tenantId, status: 'PUBLICADA' }, select: { metricas: true }, take: 500 })
    const m = pubs.reduce((a: any, p: any) => ({ alcance: a.alcance + (p.metricas?.alcance ?? 0), curtidas: a.curtidas + (p.metricas?.curtidas ?? 0), cliques: a.cliques + (p.metricas?.cliques ?? 0) }), { alcance: 0, curtidas: 0, cliques: 0 })
    res.json({ porRede: Object.values(rows), proximas14Dias: prox, metricas: m })
  }))
  r.get('/painel/disparos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { de, ate } = periodo(req)
    const g = await db.mktEnvio.groupBy({ by: ['canal', 'status'], where: { tenantId, createdAt: { gte: de, lte: ate } }, _count: { _all: true } })
    const rows: Record<string, any> = {}; for (const x of g) { const o = (rows[x.canal] ??= { canal: x.canal, total: 0, ENVIADO: 0, BLOQUEADO: 0, FALHA: 0, AGENDADO: 0 }); o[x.status] = x._count._all; o.total += x._count._all }
    res.json({ porCanal: Object.values(rows) })
  }))
  r.post('/painel/sincronizar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => res.json(await sincronizarAdmissoes(tid(req)))))

  r.get('/relatorios/:tipo', requireRole(...GESTAO, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { de, ate } = periodo(req); const tipo = String(req.params.tipo)
    let rows: any[]; let cols: string[] | undefined
    if (tipo === 'canais') rows = (await canais(tenantId, de, ate)).canais
    else if (tipo === 'campanhas') rows = await campanhasResumo(tenantId)
    else if (tipo === 'consultores') rows = await consultoresResumo(tenantId, de, ate)
    else if (tipo === 'funil') rows = (await funil(tenantId, de, ate)).etapas
    else if (tipo === 'publicacoes') rows = (await db.mktPublicacao.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 2000 })).map((p: any) => ({ rede: p.rede, status: p.status, agendadoPara: p.agendadoPara, publicadoEm: p.publicadoEm, alcance: p.metricas?.alcance, curtidas: p.metricas?.curtidas, cliques: p.metricas?.cliques, simulado: p.simulado }))
    else if (tipo === 'disparos') rows = await db.mktDisparo.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 1000, select: { nome: true, canal: true, status: true, finalidade: true, baseLegal: true, totalAlvo: true, totalEnviado: true, totalBloqueado: true, totalFalha: true, createdAt: true } })
    else fail(404, 'Relatório desconhecido. Use: canais, campanhas, consultores, funil, publicacoes, disparos.')
    cols = rows[0] ? Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object' || rows[0][k] instanceof Date) : undefined
    await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: 'RELATORIO', detalhes: { tipo, formato: qs(req.query.formato) ?? 'json' } })
    if (qs(req.query.formato) === 'csv') return void res.type('text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="marketing-${tipo}.csv"`).send(csv(rows, cols))
    res.json({ tipo, periodo: { de, ate }, linhas: rows })
  }))
}
