import type { Request, Router } from 'express'
import {
  CONTADORES, GESTAO, INTERNO, asArray, clienteOuErro, compAtual, exigir, getCfg, hojeMeioDia, httpError, idsVisiveis, parseBody, prisma, qs, r2, somaDias, somaMeses, tid, txt, uid, whereCliente, z,
} from './common'
import { asyncHandler, auditar, equipeDoTenant, nomesDeUsuarios } from './host'
import { STATUS_ABERTOS_TAREFA, mrrDaCompetencia } from './calculos'
import { guiasDaCarteira, pendenciasFiscais, fiscalAtual } from './provedores'
import { alertasDaCarteira } from './tarefas'
import { resumoHonorarios } from './honorarios'
import { resumoNps } from './comunicacao'

export interface Saude {
  clienteId: string; score: number; nivel: 'SAUDAVEL' | 'ATENCAO' | 'RISCO'
  riscoInadimplencia: 'BAIXO' | 'MEDIO' | 'ALTO'; riscoFiscal: 'BAIXO' | 'MEDIO' | 'ALTO' | 'INDISPONIVEL'
  sinais: { tarefasAtrasadas: number; guiasVencidas: number; guiasAVencer7d: number; documentosFaltando: string[]; honorariosAtrasados: number; valorAtrasado: number; diasMaiorAtraso: number; diasSemContato: number | null; ultimaNps: number | null; pendenciasFiscais: number }
  motivos: string[]
}

export async function calcularSaude(req: Request, clientes: Array<{ id: string; empresaId?: string | null; createdAt?: Date }>): Promise<Map<string, Saude>> {
  const out = new Map<string, Saude>()
  if (!clientes.length) return out
  const tenantId = tid(req)
  const ids = clientes.map((c) => c.id)
  const hoje = hojeMeioDia()
  const cfg = await getCfg(tenantId)
  const esperados = asArray<string>(cfg.documentosEsperados)
  const prev = somaMeses(compAtual(), -1)
  const [tar, guias, docs, hon, inter, nps, fisc] = await Promise.all([
    prisma.ctbTarefa.groupBy({ by: ['clienteId'], where: { tenantId, clienteId: { in: ids }, status: { in: STATUS_ABERTOS_TAREFA }, prazo: { lt: hoje } }, _count: true }),
    guiasDaCarteira(tenantId, clientes.map((c) => ({ id: c.id, empresaId: c.empresaId })), { status: 'ABERTA', ateVencimento: somaDias(hoje, 7) }),
    prisma.ctbCaixaDoc.findMany({ where: { tenantId, clienteId: { in: ids }, competencia: prev, status: { not: 'REJEITADO' } }, select: { clienteId: true, tipo: true } }),
    prisma.ctbHonorario.groupBy({ by: ['clienteId'], where: { tenantId, clienteId: { in: ids }, status: 'ABERTO', vencimento: { lt: hoje } }, _count: true, _sum: { valor: true }, _min: { vencimento: true } }),
    prisma.ctbInteracao.groupBy({ by: ['clienteId'], where: { tenantId, clienteId: { in: ids } }, _max: { em: true } }),
    prisma.ctbNps.findMany({ where: { tenantId, clienteId: { in: ids } }, orderBy: { createdAt: 'desc' }, select: { clienteId: true, nota: true }, take: 5000 }),
    pendenciasFiscais(tenantId, clientes.map((c) => ({ id: c.id, empresaId: c.empresaId }))),
  ])
  const npsPor = new Map<string, number>()
  for (const n of nps) if (!npsPor.has(n.clienteId)) npsPor.set(n.clienteId, n.nota)
  for (const c of clientes) {
    const tA = tar.find((t) => t.clienteId === c.id)?._count ?? 0
    const gs = guias.guias.filter((g) => g.clienteId === c.id)
    const gV = gs.filter((g) => g.vencimento < hoje).length, gA = gs.length - gV
    const recebidos = new Set(docs.filter((d) => d.clienteId === c.id).map((d) => d.tipo))
    const falta = esperados.filter((t) => !recebidos.has(t))
    const h = hon.find((x) => x.clienteId === c.id)
    const dias = h?._min.vencimento ? Math.floor((hoje.getTime() - h._min.vencimento.getTime()) / 86_400_000) : 0
    const ult = inter.find((i) => i.clienteId === c.id)?._max.em ?? null
    const semContato = ult ? Math.floor((hoje.getTime() - ult.getTime()) / 86_400_000) : null
    const nota = npsPor.get(c.id) ?? null
    const pf = fisc.porCliente[c.id]?.total ?? 0
    let s = 100
    const motivos: string[] = []
    const desc = (n: number, cap: number, texto: string) => { if (n > 0) { s -= Math.min(cap, n); motivos.push(texto) } }
    desc(tA * 8, 32, `${tA} tarefa(s) atrasada(s)`)
    desc(gV * 15, 30, `${gV} guia(s) vencida(s)`)
    desc(gA * 3, 9, `${gA} guia(s) a vencer em 7 dias`)
    desc(falta.length * 5, 15, `documentos do mês anterior faltando: ${falta.join(', ')}`)
    if (h?._count) { s -= 10 + (dias > 30 ? 10 : 0); motivos.push(`${h._count} honorário(s) em atraso (${dias} dias)`) }
    if (semContato !== null && semContato > 90) { s -= 5; motivos.push(`sem contato há ${semContato} dias`) } else if (semContato === null && c.createdAt && hoje.getTime() - c.createdAt.getTime() > 90 * 86_400_000) { s -= 5; motivos.push('nenhum contato registrado') }
    if (nota !== null && nota <= 6) { s -= 10; motivos.push(`NPS baixo (${nota})`) }
    desc(pf * 5, 15, `${pf} pendência(s) fiscal(is)`)
    s = Math.max(0, Math.min(100, s))
    out.set(c.id, {
      clienteId: c.id, score: s, nivel: s >= 80 ? 'SAUDAVEL' : s >= 55 ? 'ATENCAO' : 'RISCO',
      riscoInadimplencia: h?._count ? (dias > cfg.diasRiscoInadimplencia ? 'ALTO' : 'MEDIO') : 'BAIXO',
      riscoFiscal: !fisc.disponivel && guias.simulado ? (gV ? 'ALTO' : gA ? 'MEDIO' : 'BAIXO') : gV || pf >= 2 ? 'ALTO' : gA || pf ? 'MEDIO' : 'BAIXO',
      sinais: { tarefasAtrasadas: tA, guiasVencidas: gV, guiasAVencer7d: gA, documentosFaltando: falta, honorariosAtrasados: h?._count ?? 0, valorAtrasado: r2(h?._sum.valor ?? 0), diasMaiorAtraso: dias, diasSemContato: semContato, ultimaNps: nota, pendenciasFiscais: pf },
      motivos,
    })
  }
  return out
}

export function registrarCarteira(router: Router) {
  router.get('/clientes/:id/saude', exigir(INTERNO), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const m = await calcularSaude(req, [c])
    res.json({ ...m.get(c.id), fiscal: { provedor: fiscalAtual().nome, simulado: fiscalAtual().simulado, pendenciasDisponiveis: !!fiscalAtual().pendenciasFiscais } })
  }))

  router.get('/carteira/saude', exigir(INTERNO), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const clientes = await prisma.ctbCliente.findMany({ where: whereCliente(req, { status: 'ATIVO' }), select: { id: true, nome: true, empresaId: true, responsavelId: true, regime: true, createdAt: true }, take: 1000 })
    const m = await calcularSaude(req, clientes)
    const nomes = await nomesDeUsuarios(tenantId, clientes.map((c) => c.responsavelId))
    let items = clientes.map((c) => ({ ...m.get(c.id)!, cliente: c.nome, regime: c.regime, responsavelNome: c.responsavelId ? nomes.get(c.responsavelId) ?? null : null })).sort((a, b) => a.score - b.score)
    if (qs(req.query.nivel)) items = items.filter((i) => i.nivel === qs(req.query.nivel))
    const resumo = { total: clientes.length, saudaveis: [...m.values()].filter((x) => x.nivel === 'SAUDAVEL').length, atencao: [...m.values()].filter((x) => x.nivel === 'ATENCAO').length, risco: [...m.values()].filter((x) => x.nivel === 'RISCO').length }
    res.json({ resumo, items: items.slice(0, 300), fiscal: { provedor: fiscalAtual().nome, simulado: fiscalAtual().simulado } })
  }))

  // ---------- distribuição e capacidade ----------
  router.get('/carteira/distribuicao', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const [cfg, equipe, grupos, mrr] = await Promise.all([getCfg(tenantId), equipeDoTenant(tenantId), prisma.ctbCliente.groupBy({ by: ['responsavelId', 'status'], where: { tenantId }, _count: true }), mrrDaCompetencia(tenantId, compAtual())])
    const caps = (cfg.capacidades ?? {}) as Record<string, number>
    const tarefas = await prisma.ctbTarefa.groupBy({ by: ['responsavelId'], where: { tenantId, status: { in: STATUS_ABERTOS_TAREFA } }, _count: true })
    const ativosPor = await prisma.ctbCliente.findMany({ where: { tenantId, status: 'ATIVO' }, select: { id: true, responsavelId: true } })
    const linhas = equipe.filter((u) => ['CONTADOR', 'ACCOUNTANT', 'ANALISTA_CONTABIL', 'GESTOR_CONTABIL', 'ADMIN', 'OWNER'].includes(u.role)).map((u) => {
      const cont = (st: string) => grupos.filter((g) => g.responsavelId === u.id && g.status === st).reduce((s, g) => s + g._count, 0)
      const ativos = cont('ATIVO')
      const capacidade = caps[u.id] ?? cfg.capacidadePadrao
      const receita = r2(ativosPor.filter((c) => c.responsavelId === u.id).reduce((s, c) => s + (mrr.porCliente[c.id] ?? 0), 0))
      return { userId: u.id, nome: [u.firstName, u.lastName].filter(Boolean).join(' '), cargo: u.role, ativos, prospectos: cont('PROSPECTO'), suspensos: cont('SUSPENSO'), capacidade, ocupacaoPct: capacidade ? Math.round((ativos / capacidade) * 100) : null, sobrecarga: ativos > capacidade, tarefasAbertas: tarefas.find((t) => t.responsavelId === u.id)?._count ?? 0, mrr: receita }
    }).sort((a, b) => b.ativos - a.ativos)
    const semResp = grupos.filter((g) => g.responsavelId === null).reduce((s, g) => s + g._count, 0)
    res.json({ capacidadePadrao: cfg.capacidadePadrao, responsaveis: linhas, semResponsavel: semResp, total: grupos.reduce((s, g) => s + g._count, 0) })
  }))

  router.put('/carteira/capacidade', exigir(GESTAO), asyncHandler(async (req, res) => {
    const d = parseBody(z.object({ userId: z.string().max(80).optional(), capacidade: z.number().int().min(1).max(1000) }), req.body)
    const tenantId = tid(req)
    const cfg = await getCfg(tenantId)
    if (d.userId) {
      if (!(await equipeDoTenant(tenantId)).some((u) => u.id === d.userId)) throw httpError(400, 'Usuário não pertence à equipe do escritório.')
      await prisma.ctbCarConfig.update({ where: { tenantId }, data: { capacidades: { ...((cfg.capacidades ?? {}) as object), [d.userId]: d.capacidade } } })
    } else await prisma.ctbCarConfig.update({ where: { tenantId }, data: { capacidadePadrao: d.capacidade } })
    await auditar(req, 'CAPACIDADE_AJUSTADA', 'CtbCarConfig', tenantId, d)
    res.json({ ok: true })
  }))

  router.post('/carteira/reatribuir', exigir(GESTAO), asyncHandler(async (req, res) => {
    const d = parseBody(z.object({
      clienteIds: z.array(z.string().max(80)).min(1).max(500), responsavelId: z.string().max(80).optional().nullable(), analistaId: z.string().max(80).optional().nullable(), motivo: txt(300).pipe(z.string().min(3, 'informe o motivo')),
    }), req.body)
    if (d.responsavelId === undefined && d.analistaId === undefined) throw httpError(400, 'Informe o novo responsável e/ou analista.')
    const tenantId = tid(req)
    const equipe = new Map((await equipeDoTenant(tenantId)).map((u) => [u.id, u]))
    for (const id of [d.responsavelId, d.analistaId]) if (id && !equipe.has(id)) throw httpError(400, 'Destino deve ser alguém da equipe do escritório neste tenant.')
    const alvo = await prisma.ctbCliente.findMany({ where: { tenantId, id: { in: d.clienteIds }, anonimizadoEm: null }, select: { id: true, responsavelId: true, analistaId: true } })
    if (!alvo.length) throw httpError(404, 'Nenhum cliente encontrado.')
    const data: any = {}
    if (d.responsavelId !== undefined) data.responsavelId = d.responsavelId
    if (d.analistaId !== undefined) data.analistaId = d.analistaId
    await prisma.ctbCliente.updateMany({ where: { tenantId, id: { in: alvo.map((a) => a.id) } }, data })
    // tarefas em aberto acompanham o novo responsável pela execução (analista, se houver; senão o responsável)
    const novoExec = d.analistaId ?? d.responsavelId
    if (novoExec) await prisma.ctbTarefa.updateMany({ where: { tenantId, clienteId: { in: alvo.map((a) => a.id) }, status: { in: STATUS_ABERTOS_TAREFA } }, data: { responsavelId: novoExec } })
    const cfg = await getCfg(tenantId)
    const caps = (cfg.capacidades ?? {}) as Record<string, number>
    const avisos: string[] = []
    for (const id of [d.responsavelId].filter(Boolean) as string[]) {
      const n = await prisma.ctbCliente.count({ where: { tenantId, responsavelId: id, status: 'ATIVO' } })
      const cap = caps[id] ?? cfg.capacidadePadrao
      if (n > cap) avisos.push(`${[equipe.get(id)?.firstName, equipe.get(id)?.lastName].join(' ')} passou da capacidade (${n}/${cap} clientes ativos).`)
    }
    await auditar(req, 'CARTEIRA_REATRIBUIDA', 'CtbCliente', 'lote', { total: alvo.length, de: [...new Set(alvo.map((a) => a.responsavelId))], para: { responsavelId: d.responsavelId, analistaId: d.analistaId }, motivo: d.motivo })
    res.json({ reatribuidos: alvo.length, ignorados: d.clienteIds.length - alvo.length, avisos })
  }))

  // ---------- configuração ----------
  router.get('/config', exigir(INTERNO), asyncHandler(async (req, res) => res.json(await getCfg(tid(req)))))
  router.put('/config', exigir(GESTAO), asyncHandler(async (req, res) => {
    const d = parseBody(z.object({
      nomeEscritorio: txt(120).pipe(z.string().min(2)).optional(), retencaoAnos: z.number().int().min(1).max(30).optional(), capacidadePadrao: z.number().int().min(1).max(1000).optional(), custoHora: z.number().min(0).max(5000).optional(),
      diasRiscoInadimplencia: z.number().int().min(1).max(365).optional(), documentosEsperados: z.array(z.enum(['EXTRATO', 'NOTAS_EMITIDAS', 'NOTAS_RECEBIDAS', 'FOLHA', 'CONTRATO', 'OUTRO'])).max(6).optional(),
    }), req.body)
    const tenantId = tid(req)
    await getCfg(tenantId)
    const r = await prisma.ctbCarConfig.update({ where: { tenantId }, data: d as any })
    await auditar(req, 'CONFIG_ATUALIZADA', 'CtbCarConfig', tenantId, d)
    res.json(r)
  }))

  // ---------- alertas e painel do escritório ----------
  router.get('/alertas', exigir(INTERNO), asyncHandler(async (req, res) => res.json(await alertasDaCarteira(req))))

  router.get('/dashboard', exigir(INTERNO), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const ids = await idsVisiveis(req)
    const comp = compAtual()
    const hoje = hojeMeioDia()
    const clienteWhere: any = { tenantId, ...(ids ? { id: { in: ids } } : {}) }
    const cw = (extra: any = {}) => ({ ...clienteWhere, ...extra })
    const [ativos, prospectos, suspensos, mrr, mrrPrev, hon, alertas, leads, propostas, ativosList, nps, horas, encerrados12, ativosInicio, porRegime] = await Promise.all([
      prisma.ctbCliente.count({ where: cw({ status: 'ATIVO' }) }), prisma.ctbCliente.count({ where: cw({ status: 'PROSPECTO' }) }), prisma.ctbCliente.count({ where: cw({ status: 'SUSPENSO' }) }),
      mrrDaCompetencia(tenantId, comp, ids), mrrDaCompetencia(tenantId, somaMeses(comp, -1), ids), resumoHonorarios(tenantId, ids, comp), alertasDaCarteira(req),
      prisma.ctbLead.count({ where: { tenantId, etapa: { in: ['LEAD', 'PROPOSTA', 'CONTRATO'] }, ...(ids ? { responsavelId: uid(req) } : {}) } }),
      prisma.ctbProposta.count({ where: { tenantId, status: { in: ['RASCUNHO', 'ENVIADA'] } } }),
      prisma.ctbCliente.findMany({ where: cw({ status: 'ATIVO' }), select: { id: true, empresaId: true, createdAt: true }, take: 1000 }),
      resumoNps(tenantId, ids),
      prisma.ctbApontamento.aggregate({ where: { tenantId, data: { gte: new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)) }, ...(ids ? { clienteId: { in: ids } } : {}) }, _sum: { minutos: true } }),
      prisma.ctbCliente.count({ where: cw({ status: 'ENCERRADO', encerradoEm: { gte: new Date(Date.UTC(hoje.getUTCFullYear() - 1, hoje.getUTCMonth(), hoje.getUTCDate())) } }) }),
      prisma.ctbCliente.count({ where: cw({ inicioRelacionamento: { lt: new Date(Date.UTC(hoje.getUTCFullYear() - 1, hoje.getUTCMonth(), hoje.getUTCDate())) }, OR: [{ encerradoEm: null }, { encerradoEm: { gte: new Date(Date.UTC(hoje.getUTCFullYear() - 1, hoje.getUTCMonth(), hoje.getUTCDate())) } }] }) }),
      prisma.ctbCliente.groupBy({ by: ['regime'], where: cw({ status: 'ATIVO' }), _count: true }),
    ])
    const saude = await calcularSaude(req, ativosList)
    const emRisco = [...saude.values()].filter((s) => s.nivel === 'RISCO').length
    const serie: Array<{ competencia: string; mrr: number; emitido: number; recebido: number }> = []
    for (let i = 5; i >= 0; i--) {
      const c = somaMeses(comp, -i)
      const [m, h] = await Promise.all([mrrDaCompetencia(tenantId, c, ids), resumoHonorarios(tenantId, ids, c)])
      serie.push({ competencia: c, mrr: m.mrr, emitido: h.emitido, recebido: h.recebido })
    }
    const tarefasAbertas = await prisma.ctbTarefa.count({ where: { tenantId, status: { in: STATUS_ABERTOS_TAREFA }, ...(ids ? { OR: [{ clienteId: { in: ids } }, { responsavelId: uid(req) }] } : {}) } })
    res.json({
      competencia: comp,
      kpis: {
        clientesAtivos: ativos, prospectos, suspensos, mrr: mrr.mrr, mrrAnterior: mrrPrev.mrr, mrrVariacaoPct: mrrPrev.mrr ? r2(((mrr.mrr - mrrPrev.mrr) / mrrPrev.mrr) * 100) : null,
        ticketMedio: mrr.contratos ? r2(mrr.mrr / mrr.contratos) : 0, inadimplenciaValor: hon.atrasado, inadimplenciaPct: hon.inadimplenciaPct, recebidoNoMes: hon.recebido, emitidoNoMes: hon.emitido,
        tarefasAtrasadas: alertas.tarefasAtrasadas.length, tarefasAbertas, guiasAVencerSemana: alertas.guias.aVencer7d, guiasVencidas: alertas.guias.vencidas, leadsEmAndamento: leads, propostasAbertas: propostas,
        clientesEmRisco: emRisco, churn12mPct: ativosInicio ? r2((encerrados12 / ativosInicio) * 100) : null, nps: nps.nps, horasNoMes: r2((horas._sum.minutos ?? 0) / 60),
      },
      serie, porRegime: porRegime.map((r) => ({ regime: r.regime ?? 'NÃO INFORMADO', total: r._count })),
      alertas: { tarefasAtrasadas: alertas.tarefasAtrasadas.slice(0, 8), guias: alertas.guias.itens.slice(0, 8), lembretes: alertas.lembretes.slice(0, 8), aniversarios: alertas.aniversarios.slice(0, 8) },
      fiscal: alertas.guias.fiscal,
    })
  }))
}
