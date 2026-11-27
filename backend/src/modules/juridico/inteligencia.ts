import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { mountCrud } from '../core/crud'
import { audit } from '../core/notify'
import { AuthenticatedRequest, READ, Response, WRITE, agendarVencimento, asyncHandler, cancelarLembretes, fail, optDate, optStr, parseBody, qs, requireRole, restricaoProcesso, tid, uid } from './common'
import { CATALOGO_CAUSAS, DAY, agrupar, infoCausa, normalizarCausa, pontuacaoCausa, r2, recorrencia } from './logic'

const DIMENSOES: Record<string, (p: any) => string> = {
  causaRaiz: (p) => p.causaRaiz || 'NAO_INFORMADO', setorOrigem: (p) => p.setorOrigem || 'NAO_INFORMADO', area: (p) => p.area, assunto: (p) => p.assunto,
  tipoOrigem: (p) => p.tipoOrigem || 'NAO_INFORMADO', posicao: (p) => p.posicao, risco: (p) => p.risco, resultado: (p) => p.resultado || 'EM_ABERTO', uf: (p) => p.uf || 'NAO_INFORMADO',
  ano: (p) => String(new Date(p.dataDistribuicao ?? p.createdAt).getUTCFullYear()), status: (p) => p.status,
}

async function carregar(req: AuthenticatedRequest) {
  const where: any = { tenantId: tid(req), ...restricaoProcesso(req) }
  if (qs(req.query.sofridos) !== 'false') where.sofrido = true
  const area = qs(req.query.area); if (area) where.area = area
  const setor = qs(req.query.setor); if (setor) where.setorOrigem = setor
  const desde = qs(req.query.desde), ate = qs(req.query.ate)
  const dd = desde ? new Date(desde) : null, aa = ate ? new Date(ate) : null
  if ((dd && isNaN(dd.getTime())) || (aa && isNaN(aa.getTime()))) fail(400, 'Datas desde/ate inválidas.')
  if (dd || aa) where.dataDistribuicao = { ...(dd ? { gte: dd } : {}), ...(aa ? { lte: aa } : {}) }
  return prisma.jurProcesso.findMany({ where, select: { id: true, area: true, assunto: true, causaRaiz: true, setorOrigem: true, tipoOrigem: true, valorCausa: true, valorCondenacao: true, provisaoValor: true, resultado: true, status: true, risco: true, posicao: true, uf: true, dataDistribuicao: true, dataEncerramento: true, createdAt: true }, take: 20000 })
}

export const lembretePlano = (p: any, reabrir = false) => agendarVencimento({
  tenantId: p.tenantId, refType: 'JurPlanoPrevencao', refId: p.id, tag: 'plano', titulo: `Plano de prevenção "${p.titulo}" (causa ${p.causaRaiz})`,
  descricao: 'Conclua as ações do plano ou renegocie o prazo.', due: p.prazo, limites: [30, 7], ativo: ['PLANEJADO', 'EM_ANDAMENTO'].includes(p.status), reabrir,
  assigneeUserId: p.responsavelUserId ?? undefined,
})

export function registerInteligencia(router: Router) {
  router.get('/inteligencia/catalogo', requireRole(...READ), (_req, res) => res.json({ causas: CATALOGO_CAUSAS, dimensoes: Object.keys(DIMENSOES) }))

  router.get('/inteligencia/resumo', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const procs = await carregar(req)
    const rec = recorrencia(procs)
    const planos = await prisma.jurPlanoPrevencao.findMany({ where: { tenantId: tid(req), status: { in: ['PLANEJADO', 'EM_ANDAMENTO'] } }, select: { causaRaiz: true } })
    const comPlano = new Set(planos.map((p) => p.causaRaiz))
    const porCausa = agrupar(procs, (p) => p.causaRaiz)
    const ranking = rec.map((r) => ({ ...r, pontuacao: pontuacaoCausa(r), rotulo: infoCausa(r.causaRaiz)?.rotulo ?? r.causaRaiz, comPlanoAtivo: comPlano.has(r.causaRaiz) })).sort((a, b) => b.pontuacao - a.pontuacao).slice(0, 10)
    res.json({
      total: procs.length,
      valorCausaTotal: r2(procs.reduce((s, p) => s + (p.valorCausa ?? 0), 0)),
      provisaoTotal: r2(procs.reduce((s, p) => s + (p.provisaoValor ?? 0), 0)),
      porCausa, porAssunto: agrupar(procs, (p) => p.assunto).slice(0, 15), porSetor: agrupar(procs, (p) => p.setorOrigem), porTipo: agrupar(procs, (p) => p.area), porTipoOrigem: agrupar(procs, (p) => p.tipoOrigem),
      recorrencia: rec, ranking,
      semClassificacao: procs.filter((p) => !p.causaRaiz).length,
      recorrentesSemPlano: rec.filter((r) => r.recorrente && !comPlano.has(r.causaRaiz) && r.causaRaiz !== 'NAO_INFORMADO').map((r) => r.causaRaiz),
    })
  }))

  // Cruzamento de duas dimensões (ex.: causa raiz x setor).
  router.get('/inteligencia/cruzamento', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const linhas = qs(req.query.linhas) || 'causaRaiz', colunas = qs(req.query.colunas) || 'setorOrigem'
    if (!DIMENSOES[linhas] || !DIMENSOES[colunas]) fail(400, `Dimensão inválida. Use: ${Object.keys(DIMENSOES).join(', ')}.`)
    const procs = await carregar(req)
    const mat = new Map<string, Map<string, { qtd: number; valor: number }>>()
    const cols = new Set<string>()
    for (const p of procs) {
      const l = DIMENSOES[linhas](p), c = DIMENSOES[colunas](p); cols.add(c)
      const row = mat.get(l) ?? mat.set(l, new Map()).get(l)!
      const cell = row.get(c) ?? { qtd: 0, valor: 0 }; cell.qtd++; cell.valor += p.valorCausa ?? 0; row.set(c, cell)
    }
    const colunasL = [...cols].sort()
    const rows = [...mat.entries()].map(([l, m]) => ({ linha: l, total: [...m.values()].reduce((s, x) => s + x.qtd, 0), celulas: Object.fromEntries(colunasL.map((c) => [c, { qtd: m.get(c)?.qtd ?? 0, valor: r2(m.get(c)?.valor ?? 0) }])) })).sort((a, b) => b.total - a.total)
    res.json({ linhas, colunas, colunasValores: colunasL, rows, total: procs.length })
  }))

  // Causas prováveis + recomendações de prevenção para as causas recorrentes / mais custosas.
  router.get('/inteligencia/recomendacoes', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const procs = await carregar(req)
    const rec = recorrencia(procs).filter((r) => r.causaRaiz !== 'NAO_INFORMADO')
    const planos = await prisma.jurPlanoPrevencao.findMany({ where: { tenantId: tid(req), status: { in: ['PLANEJADO', 'EM_ANDAMENTO'] } }, select: { id: true, causaRaiz: true, titulo: true, status: true } })
    const items = rec.filter((r) => r.recorrente || r.tendencia === 'ALTA' || r.tendencia === 'NOVA').map((r) => {
      const info = infoCausa(r.causaRaiz)
      const porSetor = agrupar(procs.filter((p) => p.causaRaiz === r.causaRaiz), (p) => p.setorOrigem)
      return {
        causaRaiz: r.causaRaiz, rotulo: info?.rotulo ?? r.causaRaiz, ocorrencias12m: r.qtd12m, tendencia: r.tendencia, recorrente: r.recorrente, setorMaisAfetado: r.setorMaisAfetado ?? info?.setorSugerido ?? null,
        causaProvavel: info?.causaProvavel ?? 'Causa personalizada: analise os processos do grupo para identificar o fator comum (setor, procedimento, contrato).',
        recomendacoes: info?.recomendacoes ?? ['Reunir os processos desta causa, mapear o fator comum e definir plano de prevenção com responsável e prazo.'],
        setores: porSetor.slice(0, 3), planosAtivos: planos.filter((p) => p.causaRaiz === r.causaRaiz), precisaPlano: !planos.some((p) => p.causaRaiz === r.causaRaiz),
      }
    })
    res.json({ items, total: items.length, aviso: 'Causas e recomendações são sugestões de apoio baseadas em regras; valide com o jurídico antes de agir.' })
  }))

  router.get('/inteligencia/indicadores', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const procs = await carregar(req)
    const enc = procs.filter((p) => p.status === 'ENCERRADO')
    const ganhos = enc.filter((p) => p.resultado === 'GANHO').length
    const dur = enc.filter((p) => p.dataDistribuicao && p.dataEncerramento).map((p) => (new Date(p.dataEncerramento!).getTime() - new Date(p.dataDistribuicao!).getTime()) / DAY)
    const mes: Record<string, number> = {}
    const hoje = new Date()
    for (let i = 11; i >= 0; i--) { const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1)); mes[d.toISOString().slice(0, 7)] = 0 }
    for (const p of procs) { const k = new Date(p.dataDistribuicao ?? p.createdAt).toISOString().slice(0, 7); if (k in mes) mes[k]++ }
    res.json({
      total: procs.length, ativos: procs.filter((p) => p.status === 'EM_ANDAMENTO').length, encerrados: enc.length,
      taxaExito: enc.length ? r2((ganhos / enc.length) * 100) : null, taxaPerda: enc.length ? r2((enc.filter((p) => p.resultado === 'PERDIDO').length / enc.length) * 100) : null,
      duracaoMediaDias: dur.length ? Math.round(dur.reduce((s, x) => s + x, 0) / dur.length) : null,
      valorMedioCausa: procs.length ? r2(procs.reduce((s, p) => s + (p.valorCausa ?? 0), 0) / procs.length) : 0,
      totalPago: r2(enc.filter((p) => ['PERDIDO', 'ACORDO', 'PARCIAL'].includes(p.resultado || '')).reduce((s, p) => s + (p.valorCondenacao ?? 0), 0)),
      evolucaoMensal: Object.entries(mes).map(([mesRef, qtd]) => ({ mes: mesRef, qtd })),
    })
  }))

  // ---- planos de prevenção
  const plano = z.object({
    titulo: z.string().min(3).max(200), causaRaiz: z.string().min(2).max(80).transform(normalizarCausa), setor: optStr(120), descricao: optStr(), prioridade: z.enum(['BAIXA', 'MEDIA', 'ALTA']).optional(),
    responsavelUserId: optStr(80), responsavelNome: optStr(120), prazo: optDate(), meta: optStr(500),
  })
  mountCrud(router, {
    model: 'jurPlanoPrevencao', path: '/planos-prevencao', read: READ, write: WRITE, modulo: 'juridico.prevencao', create: plano, search: ['titulo', 'causaRaiz', 'setor'], filters: ['status', 'causaRaiz', 'prioridade'],
    orderBy: [{ createdAt: 'desc' }], include: { acoes: { orderBy: { createdAt: 'asc' } } },
    beforeCreate: async (d, req) => {
      if (!d.responsavelNome && !d.responsavelUserId) fail(422, 'Informe o responsável pelo plano de prevenção.')
      const desde = new Date(Date.now() - 365 * DAY)
      const n = await prisma.jurProcesso.count({ where: { tenantId: tid(req), causaRaiz: d.causaRaiz, sofrido: true, OR: [{ dataDistribuicao: { gte: desde } }, { dataDistribuicao: null, createdAt: { gte: desde } }] } })
      return { ...d, ocorrenciasBase: n, status: 'PLANEJADO' }
    },
    afterCreate: (row) => lembretePlano(row),
    beforeUpdate: (d, _req, cur) => {
      if (['CONCLUIDO', 'CANCELADO'].includes(cur.status)) fail(409, 'Plano concluído/cancelado não pode ser editado.')
      delete d.causaRaiz
    },
    afterUpdate: (row) => lembretePlano(row, true),
  })
  const mudar = (acao: string, de: string[], para: string, extra?: (p: any) => Promise<void>) =>
    router.post(`/planos-prevencao/:id/${acao}`, requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = tid(req)
      const p = await prisma.jurPlanoPrevencao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { acoes: true } })
      if (!p) return res.status(404).json({ error: 'Plano não encontrado.' })
      if (!de.includes(p.status)) fail(409, `Ação indisponível para o status ${p.status}.`)
      if (extra) await extra(p)
      const row = await prisma.jurPlanoPrevencao.update({ where: { id: p.id }, data: { status: para, ...(para === 'CONCLUIDO' ? { concluidoEm: new Date() } : {}) } })
      if (para === 'CONCLUIDO' || para === 'CANCELADO') await cancelarLembretes(tenantId, 'plano', p.id)
      await audit({ tenantId, userId: uid(req), modulo: 'juridico.prevencao', acao: acao.toUpperCase(), refType: 'JurPlanoPrevencao', refId: p.id })
      res.json(row)
    }))
  mudar('iniciar', ['PLANEJADO'], 'EM_ANDAMENTO')
  mudar('concluir', ['EM_ANDAMENTO'], 'CONCLUIDO', async (p) => {
    const pend = p.acoes.filter((a: any) => !['CONCLUIDA', 'CANCELADA'].includes(a.status))
    if (!p.acoes.length) fail(422, 'Cadastre ao menos uma ação antes de concluir o plano.')
    if (pend.length) fail(422, `Há ${pend.length} ação(ões) pendente(s): conclua ou cancele antes de concluir o plano.`)
  })
  mudar('cancelar', ['PLANEJADO', 'EM_ANDAMENTO'], 'CANCELADO')

  router.post('/planos-prevencao/:id/acoes', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ descricao: z.string().min(3).max(1000), responsavelNome: optStr(120), prazo: optDate() }), req.body)
    const p = await prisma.jurPlanoPrevencao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) return res.status(404).json({ error: 'Plano não encontrado.' })
    if (['CONCLUIDO', 'CANCELADO'].includes(p.status)) fail(409, 'Plano concluído/cancelado não recebe novas ações.')
    res.status(201).json(await prisma.jurPlanoAcao.create({ data: { tenantId, planoId: p.id, descricao: b.descricao, responsavelNome: b.responsavelNome ?? undefined, prazo: b.prazo ?? undefined } }))
  }))
  router.post('/planos-acoes/:id/status', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ status: z.enum(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA']) }), req.body)
    const a = await prisma.jurPlanoAcao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) return res.status(404).json({ error: 'Ação não encontrada.' })
    res.json(await prisma.jurPlanoAcao.update({ where: { id: a.id }, data: { status: b.status, concluidoEm: b.status === 'CONCLUIDA' ? new Date() : null } }))
  }))

  // Efetividade: ocorrências da causa depois do plano (concluído ou criado) x período equivalente anterior.
  router.get('/planos-prevencao/:id/efetividade', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.jurPlanoPrevencao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) return res.status(404).json({ error: 'Plano não encontrado.' })
    const marco = p.concluidoEm ?? p.createdAt
    const dias = Math.max(30, Math.round((Date.now() - marco.getTime()) / DAY))
    const antes = new Date(marco.getTime() - dias * DAY)
    const procs = await prisma.jurProcesso.findMany({ where: { tenantId, causaRaiz: p.causaRaiz, sofrido: true, ...restricaoProcesso(req) }, select: { dataDistribuicao: true, createdAt: true } })
    const t = (x: any) => new Date(x.dataDistribuicao ?? x.createdAt).getTime()
    const depois = procs.filter((x) => t(x) >= marco.getTime()).length, anterior = procs.filter((x) => t(x) >= antes.getTime() && t(x) < marco.getTime()).length
    const reducao = anterior ? r2(((anterior - depois) / anterior) * 100) : null
    res.json({ planoId: p.id, causaRaiz: p.causaRaiz, marco, janelaDias: dias, ocorrenciasAntes: anterior, ocorrenciasDepois: depois, reducaoPct: reducao, ocorrenciasBase12m: p.ocorrenciasBase,
      avaliacao: reducao === null ? 'SEM_BASE' : reducao > 0 ? 'EFETIVO' : reducao === 0 ? 'NEUTRO' : 'PIOROU', observacao: p.concluidoEm ? 'Medido a partir da conclusão do plano.' : 'Plano ainda não concluído: medido a partir da criação.' })
  }))
}
