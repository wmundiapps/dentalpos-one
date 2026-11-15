import type { Request, Router } from 'express'
import {
  CONTADORES, INTERNO, brl, compAtual, dataBr, dia, esc, exigir, gerarCsv, getCfg, hojeMeioDia, httpError, idsVisiveis, iso10, paginaHtml, papelDe, prisma, qs, r2, restrito, somaDias, somaMeses, tid, uid, whereCliente,
} from './common'
import { asyncHandler, nomesDeUsuarios } from './host'
import { STATUS_ABERTOS_TAREFA, mrrDaCompetencia } from './calculos'
import { calcularSaude } from './carteira'
import { rentabilidade } from './honorarios'
import { ETAPAS } from './funil'

type Tipo = 'texto' | 'numero' | 'moeda' | 'pct' | 'data'
interface Col { key: string; label: string; tipo?: Tipo }
interface Relatorio { titulo: string; subtitulo?: string; colunas: Col[]; linhas: Array<Record<string, any>>; totais?: Record<string, any> }

const LEITURA_HON = [...CONTADORES, 'FINANCE']
const fmt = (v: any, t?: Tipo) => (v === null || v === undefined || v === '' ? '' : t === 'moeda' ? brl(Number(v)) : t === 'pct' ? `${Number(v).toLocaleString('pt-BR')}%` : t === 'data' ? dataBr(v instanceof Date ? v : dia(String(v))) : t === 'numero' ? Number(v).toLocaleString('pt-BR') : String(v))

const DEFS: Record<string, { nome: string; descricao: string; papeis: string[]; gerar: (req: Request) => Promise<Relatorio> }> = {
  'carteira-regime': { nome: 'Carteira por regime tributário', descricao: 'Clientes ativos e receita recorrente por regime.', papeis: INTERNO, gerar: (r) => agrupar(r, 'regime', 'Regime') },
  'carteira-segmento': { nome: 'Carteira por segmento', descricao: 'Clientes ativos e receita recorrente por segmento.', papeis: INTERNO, gerar: (r) => agrupar(r, 'segmento', 'Segmento') },
  'carteira-responsavel': { nome: 'Carteira por responsável', descricao: 'Clientes e receita sob a responsabilidade de cada contador.', papeis: CONTADORES, gerar: (r) => agrupar(r, 'responsavelId', 'Responsável') },
  'receita-recorrente': {
    nome: 'Receita recorrente (MRR)', descricao: 'MRR, honorários emitidos e recebidos nos últimos 12 meses.', papeis: LEITURA_HON,
    gerar: async (req) => {
      const tenantId = tid(req), ids = await idsVisiveis(req), linhas: any[] = []
      for (let i = 11; i >= 0; i--) {
        const c = somaMeses(compAtual(), -i)
        const [m, h] = await Promise.all([mrrDaCompetencia(tenantId, c, ids), prisma.ctbHonorario.findMany({ where: { tenantId, competencia: c, status: { not: 'CANCELADO' }, ...(ids ? { clienteId: { in: ids } } : {}) }, select: { valor: true, valorPago: true, status: true } })])
        linhas.push({ competencia: c, mrr: m.mrr, contratos: m.contratos, emitido: r2(h.reduce((s, x) => s + x.valor, 0)), recebido: r2(h.filter((x) => x.status === 'PAGO').reduce((s, x) => s + (x.valorPago ?? x.valor), 0)) })
      }
      return { titulo: 'Receita recorrente (MRR)', subtitulo: 'Últimos 12 meses. MRR = contratos vigentes de clientes ativos, com reajuste anual simulado.', colunas: [{ key: 'competencia', label: 'Competência' }, { key: 'mrr', label: 'MRR', tipo: 'moeda' }, { key: 'contratos', label: 'Contratos', tipo: 'numero' }, { key: 'emitido', label: 'Emitido', tipo: 'moeda' }, { key: 'recebido', label: 'Recebido', tipo: 'moeda' }], linhas }
    },
  },
  inadimplencia: {
    nome: 'Inadimplência de honorários', descricao: 'Clientes com honorários vencidos e não pagos.', papeis: LEITURA_HON,
    gerar: async (req) => {
      const tenantId = tid(req), ids = await idsVisiveis(req), hoje = hojeMeioDia()
      const rows = await prisma.ctbHonorario.findMany({ where: { tenantId, status: 'ABERTO', vencimento: { lt: hoje }, ...(ids ? { clienteId: { in: ids } } : {}) }, orderBy: { vencimento: 'asc' } })
      const clis = await prisma.ctbCliente.findMany({ where: { tenantId, id: { in: rows.map((r) => r.clienteId) } }, select: { id: true, nome: true, status: true } })
      const linhas = rows.map((h) => ({ cliente: clis.find((c) => c.id === h.clienteId)?.nome ?? '—', situacaoCliente: clis.find((c) => c.id === h.clienteId)?.status ?? '', competencia: h.competencia, vencimento: h.vencimento, diasAtraso: Math.floor((hoje.getTime() - h.vencimento.getTime()) / 86_400_000), valor: h.valor }))
      return { titulo: 'Inadimplência de honorários', subtitulo: `Posição em ${dataBr(hoje)}`, colunas: [{ key: 'cliente', label: 'Cliente' }, { key: 'situacaoCliente', label: 'Situação' }, { key: 'competencia', label: 'Competência' }, { key: 'vencimento', label: 'Vencimento', tipo: 'data' }, { key: 'diasAtraso', label: 'Dias de atraso', tipo: 'numero' }, { key: 'valor', label: 'Valor', tipo: 'moeda' }], linhas, totais: { valor: r2(linhas.reduce((s, l) => s + l.valor, 0)) } }
    },
  },
  funil: {
    nome: 'Funil comercial', descricao: 'Leads por etapa, valor estimado e conversão.', papeis: CONTADORES,
    gerar: async (req) => {
      const leads = await prisma.ctbLead.findMany({ where: { tenantId: tid(req), ...(restrito(req) ? { responsavelId: uid(req) } : {}) } })
      const total = leads.length
      const linhas = ETAPAS.map((e) => { const ls = leads.filter((l) => l.etapa === e); return { etapa: e, quantidade: ls.length, valorEstimado: r2(ls.reduce((s, l) => s + (l.valorEstimado ?? 0), 0)), pct: total ? r2((ls.length / total) * 100) : 0 } })
      return { titulo: 'Funil comercial', subtitulo: `${total} lead(s) no total`, colunas: [{ key: 'etapa', label: 'Etapa' }, { key: 'quantidade', label: 'Quantidade', tipo: 'numero' }, { key: 'valorEstimado', label: 'Valor mensal estimado', tipo: 'moeda' }, { key: 'pct', label: '% do total', tipo: 'pct' }], linhas }
    },
  },
  produtividade: {
    nome: 'Produtividade da equipe', descricao: 'Tarefas concluídas, cumprimento do prazo (SLA) e horas apontadas — últimos 30 dias.', papeis: INTERNO,
    gerar: async (req) => {
      const tenantId = tid(req), hoje = hojeMeioDia(), desde = somaDias(hoje, -30)
      const only = restrito(req) ? uid(req) : null
      const [conc, abertas, horas] = await Promise.all([
        prisma.ctbTarefa.findMany({ where: { tenantId, status: 'CONCLUIDA', concluidaEm: { gte: desde }, ...(only ? { responsavelId: only } : {}) }, select: { responsavelId: true, prazo: true, concluidaEm: true } }),
        prisma.ctbTarefa.findMany({ where: { tenantId, status: { in: STATUS_ABERTOS_TAREFA }, ...(only ? { responsavelId: only } : {}) }, select: { responsavelId: true, prazo: true } }),
        prisma.ctbApontamento.groupBy({ by: ['userId'], where: { tenantId, data: { gte: desde }, ...(only ? { userId: only } : {}) }, _sum: { minutos: true } }),
      ])
      const uidsx = [...new Set([...conc.map((c) => c.responsavelId), ...abertas.map((c) => c.responsavelId), ...horas.map((h) => h.userId)].filter(Boolean) as string[])]
      const nomes = await nomesDeUsuarios(tenantId, uidsx)
      const linhas = uidsx.map((u) => {
        const c = conc.filter((x) => x.responsavelId === u), noPrazo = c.filter((x) => x.concluidaEm! <= somaDias(x.prazo, 1)).length
        const ab = abertas.filter((x) => x.responsavelId === u)
        return { responsavel: nomes.get(u) ?? '—', concluidas: c.length, noPrazoPct: c.length ? r2((noPrazo / c.length) * 100) : null, abertas: ab.length, atrasadas: ab.filter((x) => x.prazo < hoje).length, horas: r2((horas.find((h) => h.userId === u)?._sum.minutos ?? 0) / 60) }
      }).sort((a, b) => b.concluidas - a.concluidas)
      return { titulo: 'Produtividade da equipe', subtitulo: `Últimos 30 dias (desde ${dataBr(desde)}). SLA = concluída até o dia do prazo.`, colunas: [{ key: 'responsavel', label: 'Responsável' }, { key: 'concluidas', label: 'Concluídas', tipo: 'numero' }, { key: 'noPrazoPct', label: 'No prazo (SLA)', tipo: 'pct' }, { key: 'abertas', label: 'Abertas', tipo: 'numero' }, { key: 'atrasadas', label: 'Atrasadas', tipo: 'numero' }, { key: 'horas', label: 'Horas apontadas', tipo: 'numero' }], linhas }
    },
  },
  'clientes-risco': {
    nome: 'Clientes em risco', descricao: 'Clientes com saúde baixa (pendências, guias, documentos, inadimplência).', papeis: INTERNO,
    gerar: async (req) => {
      const clientes = await prisma.ctbCliente.findMany({ where: whereCliente(req, { status: 'ATIVO' }), select: { id: true, nome: true, empresaId: true, responsavelId: true, createdAt: true }, take: 1000 })
      const m = await calcularSaude(req, clientes)
      const nomes = await nomesDeUsuarios(tid(req), clientes.map((c) => c.responsavelId))
      const linhas = clientes.map((c) => ({ cliente: c.nome, responsavel: c.responsavelId ? nomes.get(c.responsavelId) ?? '' : '', score: m.get(c.id)!.score, nivel: m.get(c.id)!.nivel, riscoInadimplencia: m.get(c.id)!.riscoInadimplencia, motivos: m.get(c.id)!.motivos.join('; ') })).filter((l) => l.nivel !== 'SAUDAVEL').sort((a, b) => a.score - b.score)
      return { titulo: 'Clientes em risco', subtitulo: 'Pontuação de saúde 0–100 (RISCO < 55, ATENÇÃO 55–79).', colunas: [{ key: 'cliente', label: 'Cliente' }, { key: 'responsavel', label: 'Responsável' }, { key: 'score', label: 'Saúde', tipo: 'numero' }, { key: 'nivel', label: 'Nível' }, { key: 'riscoInadimplencia', label: 'Risco inadimplência' }, { key: 'motivos', label: 'Motivos' }], linhas }
    },
  },
  rentabilidade: {
    nome: 'Rentabilidade por cliente', descricao: 'Ranking de margem (honorário − custo das horas apontadas).', papeis: LEITURA_HON,
    gerar: async (req) => {
      const r = await rentabilidade(req, 3)
      return { titulo: 'Rentabilidade por cliente', subtitulo: r.aviso, colunas: [{ key: 'cliente', label: 'Cliente' }, { key: 'regime', label: 'Regime' }, { key: 'receitaMensal', label: 'Honorário/mês', tipo: 'moeda' }, { key: 'horasMes', label: 'Horas/mês', tipo: 'numero' }, { key: 'custoMensal', label: 'Custo/mês', tipo: 'moeda' }, { key: 'margem', label: 'Margem', tipo: 'moeda' }, { key: 'margemPct', label: 'Margem %', tipo: 'pct' }], linhas: r.items }
    },
  },
}

async function agrupar(req: Request, campo: 'regime' | 'segmento' | 'responsavelId', rotulo: string): Promise<Relatorio> {
  const tenantId = tid(req)
  const clientes = await prisma.ctbCliente.findMany({ where: whereCliente(req, { status: 'ATIVO' }), select: { id: true, regime: true, segmento: true, responsavelId: true } })
  const mrr = await mrrDaCompetencia(tenantId, compAtual(), restrito(req) ? clientes.map((c) => c.id) : null)
  const nomes = campo === 'responsavelId' ? await nomesDeUsuarios(tenantId, clientes.map((c) => c.responsavelId)) : new Map<string, string>()
  const grupos = new Map<string, { chave: string; clientes: number; mrr: number }>()
  for (const c of clientes) {
    const k = campo === 'responsavelId' ? (c.responsavelId ? nomes.get(c.responsavelId) ?? 'Responsável removido' : 'Sem responsável') : (c[campo] ?? 'Não informado')
    const g = grupos.get(k) ?? { chave: k, clientes: 0, mrr: 0 }
    g.clientes++; g.mrr += mrr.porCliente[c.id] ?? 0; grupos.set(k, g)
  }
  const total = clientes.length
  const linhas = [...grupos.values()].sort((a, b) => b.clientes - a.clientes).map((g) => ({ ...g, mrr: r2(g.mrr), pct: total ? r2((g.clientes / total) * 100) : 0, ticket: g.clientes ? r2(g.mrr / g.clientes) : 0 }))
  return { titulo: `Carteira por ${rotulo.toLowerCase()}`, subtitulo: `${total} cliente(s) ativo(s)`, colunas: [{ key: 'chave', label: rotulo }, { key: 'clientes', label: 'Clientes', tipo: 'numero' }, { key: 'pct', label: '% da carteira', tipo: 'pct' }, { key: 'mrr', label: 'MRR', tipo: 'moeda' }, { key: 'ticket', label: 'Ticket médio', tipo: 'moeda' }], linhas, totais: { clientes: total, mrr: r2(linhas.reduce((s, l) => s + l.mrr, 0)) } }
}

export function registrarRelatorios(router: Router) {
  router.get('/relatorios', exigir(INTERNO), (req, res) => {
    const p = papelDe(req)
    res.json({ items: Object.entries(DEFS).filter(([, d]) => d.papeis.includes(p)).map(([chave, d]) => ({ chave, nome: d.nome, descricao: d.descricao })) })
  })

  router.get('/relatorios/:chave', exigir(INTERNO), asyncHandler(async (req, res) => {
    const def = DEFS[String(req.params.chave)]
    if (!def) throw httpError(404, 'Relatório não encontrado.')
    if (!def.papeis.includes(papelDe(req))) throw httpError(403, 'Seu cargo não tem acesso a este relatório.')
    const rel = await def.gerar(req)
    const formato = (qs(req.query.format) || 'json').toLowerCase()
    if (formato === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${String(req.params.chave)}.csv"`)
      return void res.send(gerarCsv(rel.colunas.map((c) => c.label), rel.linhas.map((l) => rel.colunas.map((c) => (c.tipo === 'data' && l[c.key] ? iso10(l[c.key] instanceof Date ? l[c.key] : dia(String(l[c.key]))) : l[c.key])))))
    }
    if (formato === 'html') {
      const cab = rel.colunas.map((c) => `<th${c.tipo && c.tipo !== 'texto' ? ' class="dir"' : ''}>${esc(c.label)}</th>`).join('')
      const corpo = rel.linhas.map((l) => `<tr>${rel.colunas.map((c) => `<td${c.tipo && c.tipo !== 'texto' ? ' class="dir"' : ''}>${esc(fmt(l[c.key], c.tipo))}</td>`).join('')}</tr>`).join('')
      const tot = rel.totais ? `<p><b>Totais:</b> ${Object.entries(rel.totais).map(([k, v]) => `${esc(rel.colunas.find((c) => c.key === k)?.label ?? k)}: ${esc(fmt(v, rel.colunas.find((c) => c.key === k)?.tipo))}`).join(' · ')}</p>` : ''
      return void res.type('html').send(paginaHtml(rel.titulo, `<h1>${esc(rel.titulo)}</h1><small>${esc(rel.subtitulo || '')}</small><table style="margin-top:12px"><tr>${cab}</tr>${corpo || `<tr><td colspan="${rel.colunas.length}">Sem dados.</td></tr>`}</table>${tot}`))
    }
    res.json(rel)
  }))
}
