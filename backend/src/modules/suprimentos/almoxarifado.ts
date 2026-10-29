// Controle de almoxarifado: painel, ponto de reposição por almoxarifado, folha de contagem cega, divergências de inventário,
// requisições por departamento e relatórios (JSON/CSV/HTML). Complementa estoque.ts (saldos, movimentações, inventário).
import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { brandHeaderHtml, escapeHtml as esc, getBranding } from '../core/branding'
import { LEITURA, GESTAO } from './catalogo'
import { round2, round3, DAY } from './logic'
import { proximoNumero } from './stock'
import { httpErr } from './cpp'

const mod = 'suprimentos'
const dt = (s?: string) => { if (!s) return undefined; const d = new Date(s); return isNaN(d.getTime()) ? undefined : d }

function csvDe(rows: Array<Record<string, any>>, cols?: string[]): string {
  const c = cols ?? (rows[0] ? Object.keys(rows[0]) : [])
  const cel = (v: any) => { const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return '﻿' + [c.join(';'), ...rows.map((r) => c.map((k) => cel(r[k])).join(';'))].join('\n')
}
function enviar(req: AuthenticatedRequest, res: Response, nome: string, rows: Array<Record<string, any>>, payload: any) {
  if (qs(req.query.format) === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${nome}.csv"`)
    return res.send(csvDe(rows))
  }
  return res.json(payload)
}

export type SituacaoReposicao = 'RUPTURA' | 'ABAIXO_MINIMO' | 'REPOR' | 'OK' | 'EXCESSO'
/** Função pura: situação do item conforme saldo e parâmetros de reposição. */
export function situacaoReposicao(saldo: number, p: { minimo: number; pontoPedido: number; maximo?: number | null }): SituacaoReposicao {
  if (saldo <= 0 && (p.minimo > 0 || p.pontoPedido > 0)) return 'RUPTURA'
  if (p.minimo > 0 && saldo <= p.minimo) return 'ABAIXO_MINIMO'
  if (p.pontoPedido > 0 && saldo <= p.pontoPedido) return 'REPOR'
  if (p.maximo != null && p.maximo > 0 && saldo > p.maximo) return 'EXCESSO'
  return 'OK'
}
/** Quantidade sugerida para voltar ao máximo (ou 2x o ponto de pedido quando não há máximo). */
export function quantidadeRepor(saldo: number, p: { minimo: number; pontoPedido: number; maximo?: number | null }): number {
  const alvo = p.maximo != null && p.maximo > 0 ? p.maximo : Math.max(p.pontoPedido * 2, p.minimo * 2)
  return Math.max(0, round3(alvo - saldo))
}

async function linhasReposicao(tenantId: string, almoxarifadoId?: string) {
  const [itens, saldos, pontos, almox] = await Promise.all([
    prisma.supItem.findMany({ where: { tenantId, ativo: true } }),
    prisma.supSaldo.findMany({ where: { tenantId, ...(almoxarifadoId ? { almoxarifadoId } : {}) } }),
    prisma.cppPontoReposicao.findMany({ where: { tenantId, ...(almoxarifadoId ? { almoxarifadoId } : {}) } }),
    prisma.supAlmoxarifado.findMany({ where: { tenantId, ativo: true, ...(almoxarifadoId ? { id: almoxarifadoId } : {}) } }),
  ])
  const linhas: any[] = []
  for (const a of almox) {
    for (const it of itens) {
      const pr = pontos.find((p) => p.almoxarifadoId === a.id && p.itemId === it.id)
      const s = saldos.find((x) => x.almoxarifadoId === a.id && x.itemId === it.id)
      const saldo = s?.quantidade ?? 0
      if (!pr && !s && !(it.estoqueMinimo > 0 || (it.pontoPedido ?? 0) > 0)) continue
      const par = pr ? { minimo: pr.minimo, pontoPedido: pr.pontoPedido, maximo: pr.maximo } : { minimo: it.estoqueMinimo, pontoPedido: it.pontoPedido ?? 0, maximo: it.estoqueMaximo }
      const situacao = situacaoReposicao(saldo, par)
      linhas.push({ almoxarifadoId: a.id, almoxarifado: a.nome, itemId: it.id, codigo: it.codigo, item: it.nome, unidade: it.unidade, saldo: round3(saldo), ...par, personalizado: !!pr, situacao, quantidadeSugerida: ['RUPTURA', 'ABAIXO_MINIMO', 'REPOR'].includes(situacao) ? quantidadeRepor(saldo, par) : 0, custoMedio: s?.custoMedio ?? it.custoMedio })
    }
  }
  return linhas
}

export function registerAlmoxarifado(router: Router) {
  // ---------- Painel ----------
  router.get('/almoxarifado/painel', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const almox = qs(req.query.almoxarifadoId)
    const [linhas, saldos, lotes, invAbertos, movs30, devolucoes, reqsAbertas] = await Promise.all([
      linhasReposicao(tenantId, almox),
      prisma.supSaldo.findMany({ where: { tenantId, ...(almox ? { almoxarifadoId: almox } : {}) } }),
      prisma.supLote.findMany({ where: { tenantId, quantidade: { gt: 0 }, validade: { not: null, lte: new Date(Date.now() + 30 * DAY) }, ...(almox ? { almoxarifadoId: almox } : {}) } }),
      prisma.supInventario.count({ where: { tenantId, status: { in: ['ABERTO', 'CONTAGEM_FINALIZADA'] }, ...(almox ? { almoxarifadoId: almox } : {}) } }),
      prisma.supMovimentacao.count({ where: { tenantId, createdAt: { gte: new Date(Date.now() - 30 * DAY) }, ...(almox ? { almoxarifadoId: almox } : {}) } }),
      prisma.cppDevolucaoFornecedor.count({ where: { tenantId, status: { in: ['SOLICITADA', 'ENVIADA'] } } }),
      prisma.supRequisicao.count({ where: { tenantId, tipo: 'INSUMO', status: 'APROVADA' } }),
    ])
    const valor = round2(saldos.reduce((s, x) => s + x.quantidade * x.custoMedio, 0))
    const cont = (s: string) => linhas.filter((l) => l.situacao === s).length
    res.json({
      valorEmEstoque: valor, itensComSaldo: saldos.filter((s) => s.quantidade > 0).length, rupturas: cont('RUPTURA'), abaixoMinimo: cont('ABAIXO_MINIMO'), aRepor: cont('REPOR'), excesso: cont('EXCESSO'),
      lotesVencendo30d: lotes.length, inventariosEmAndamento: invAbertos, movimentacoes30d: movs30, devolucoesPendentes: devolucoes, requisicoesInsumoParaAtender: reqsAbertas,
      criticos: linhas.filter((l) => ['RUPTURA', 'ABAIXO_MINIMO'].includes(l.situacao)).sort((a, b) => a.saldo - b.saldo).slice(0, 10),
    })
  }))

  // ---------- Ponto de reposição por almoxarifado ----------
  router.get('/almoxarifado/pontos-reposicao', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    let linhas = await linhasReposicao(tenantId, qs(req.query.almoxarifadoId))
    const sit = qs(req.query.situacao)
    if (sit) linhas = linhas.filter((l) => l.situacao === sit)
    if (qs(req.query.abaixo) === 'true') linhas = linhas.filter((l) => ['RUPTURA', 'ABAIXO_MINIMO', 'REPOR'].includes(l.situacao))
    enviar(req, res, 'pontos-reposicao', linhas, { items: linhas, total: linhas.length })
  }))

  router.put('/almoxarifado/pontos-reposicao', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ almoxarifadoId: z.string(), itemId: z.string(), minimo: z.coerce.number().min(0), pontoPedido: z.coerce.number().min(0), maximo: z.coerce.number().min(0).optional().nullable() }).superRefine((v, ctx) => {
      if (v.pontoPedido < v.minimo) ctx.addIssue({ code: 'custom', message: 'O ponto de pedido deve ser maior ou igual ao estoque mínimo.', path: ['pontoPedido'] })
      if (v.maximo != null && v.maximo > 0 && v.maximo < v.pontoPedido) ctx.addIssue({ code: 'custom', message: 'O máximo deve ser maior ou igual ao ponto de pedido.', path: ['maximo'] })
    }), req.body)
    const [a, i] = await Promise.all([prisma.supAlmoxarifado.findFirst({ where: { id: d.almoxarifadoId, tenantId } }), prisma.supItem.findFirst({ where: { id: d.itemId, tenantId } })])
    if (!a) throw httpErr(404, 'Almoxarifado não encontrado.')
    if (!i) throw httpErr(404, 'Item não encontrado.')
    const row = await prisma.cppPontoReposicao.upsert({
      where: { almoxarifadoId_itemId: { almoxarifadoId: a.id, itemId: i.id } },
      create: { tenantId, almoxarifadoId: a.id, itemId: i.id, minimo: d.minimo, pontoPedido: d.pontoPedido, maximo: d.maximo ?? null, updatedById: getUserId(req) },
      update: { minimo: d.minimo, pontoPedido: d.pontoPedido, maximo: d.maximo ?? null, updatedById: getUserId(req) },
    })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'PONTO_REPOSICAO', refType: 'CppPontoReposicao', refId: row.id, detalhes: d })
    res.json(row)
  }))

  router.post('/almoxarifado/pontos-reposicao/gerar-requisicao', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ almoxarifadoId: z.string(), departamentoId: z.string().optional(), centroCustoId: z.string().optional(), itemIds: z.array(z.string()).optional() }), req.body)
    let cc = d.centroCustoId
    if (d.departamentoId) {
      const dep = await prisma.cppDepartamento.findFirst({ where: { id: d.departamentoId, tenantId } })
      if (!dep) throw httpErr(404, 'Departamento não encontrado.')
      cc = cc ?? dep.centroCustoId ?? undefined
    }
    if (!cc) throw httpErr(400, 'Informe centroCustoId (ou um departamento com centro de custo) para apropriar a compra.')
    if (!(await prisma.eduCostCenter.findFirst({ where: { id: cc, tenantId } }))) throw httpErr(404, 'Centro de custo não encontrado.')
    let linhas = (await linhasReposicao(tenantId, d.almoxarifadoId)).filter((l) => l.quantidadeSugerida > 0)
    if (d.itemIds?.length) linhas = linhas.filter((l) => d.itemIds!.includes(l.itemId))
    if (!linhas.length) throw httpErr(409, 'Nenhum item no ponto de reposição.')
    const itens = await prisma.supItem.findMany({ where: { tenantId, id: { in: linhas.map((l) => l.itemId) } } })
    const r = await prisma.$transaction(async (tx) => {
      const numero = await proximoNumero(tx, tenantId, 'REQ')
      const lin = linhas.map((l) => { const it = itens.find((i) => i.id === l.itemId)!; return { tenantId, itemId: it.id, descricao: it.nome, unidade: it.unidade, quantidade: l.quantidadeSugerida, precoEstimado: it.precoReferencia ?? (it.custoMedio > 0 ? it.custoMedio : null) } })
      return tx.supRequisicao.create({ data: { tenantId, numero, tipo: 'COMPRA', solicitanteUserId: getUserId(req), almoxarifadoId: d.almoxarifadoId, centroCustoId: cc, departamentoId: d.departamentoId, justificativa: 'Reposição pelo ponto de reposição do almoxarifado', urgencia: linhas.some((l) => l.situacao === 'RUPTURA') ? 'ALTA' : 'NORMAL', valorEstimado: round2(lin.reduce((s, i) => s + i.quantidade * (i.precoEstimado ?? 0), 0)), itens: { create: lin } }, include: { itens: true } })
    })
    res.status(201).json(r)
  }))

  // ---------- Inventário: folha de contagem cega, divergências e recontagem ----------
  async function invCompleto(tenantId: string, id: string) {
    const inv = await prisma.supInventario.findFirst({ where: { id, tenantId }, include: { itens: true } })
    if (!inv) throw httpErr(404, 'Inventário não encontrado.')
    const [itens, alm] = await Promise.all([
      prisma.supItem.findMany({ where: { tenantId, id: { in: inv.itens.map((i) => i.itemId) } } }),
      prisma.supAlmoxarifado.findFirst({ where: { id: inv.almoxarifadoId, tenantId } }),
    ])
    return { inv, itens, alm }
  }

  router.get('/almoxarifado/inventarios/:id/folha-contagem', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { inv, itens, alm } = await invCompleto(tenantId, String(req.params.id))
    const linhas = inv.itens.map((i) => { const it = itens.find((x) => x.id === i.itemId); return { itemId: i.itemId, codigo: it?.codigo, item: it?.nome, unidade: it?.unidade, controlaLote: it?.controlaLote ?? false } }).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)))
    if (qs(req.query.format) !== 'html') return res.json({ inventarioId: inv.id, almoxarifado: alm?.nome, tipo: inv.tipo, cega: true, itens: linhas })
    const b = await getBranding(tenantId)
    res.type('html').send(`<!doctype html><meta charset="utf-8"><body style="max-width:900px;margin:auto;font:13px sans-serif">${brandHeaderHtml(b, { titulo: 'Folha de contagem (cega)', subtitulo: `${alm?.nome ?? ''} · inventário ${inv.tipo.toLowerCase()} · ${new Date(inv.createdAt).toLocaleDateString('pt-BR')}` })}
<div style="padding:16px 28px"><table border="1" cellpadding="6" style="width:100%;border-collapse:collapse"><tr style="background:#f1f5f9"><th>Código</th><th align="left">Item</th><th>Un.</th><th>Lote</th><th>Qtd. contada</th><th>Obs.</th></tr>
${linhas.map((l) => `<tr><td>${esc(String(l.codigo ?? ''))}</td><td>${esc(String(l.item ?? ''))}</td><td align="center">${esc(String(l.unidade ?? ''))}</td><td>${l.controlaLote ? '' : '—'}</td><td style="width:110px"></td><td style="width:180px"></td></tr>`).join('')}</table>
<div style="display:flex;gap:40px;margin-top:60px"><div style="flex:1;border-top:1px solid #000;text-align:center">Contador 1</div><div style="flex:1;border-top:1px solid #000;text-align:center">Contador 2 / conferente</div></div></div></body>`)
  }))

  router.get('/almoxarifado/inventarios/:id/divergencias', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { inv, itens, alm } = await invCompleto(tenantId, String(req.params.id))
    const saldos = await prisma.supSaldo.findMany({ where: { tenantId, almoxarifadoId: inv.almoxarifadoId, itemId: { in: inv.itens.map((i) => i.itemId) } } })
    const linhas = inv.itens.map((i) => {
      const it = itens.find((x) => x.id === i.itemId)
      const custo = saldos.find((s) => s.itemId === i.itemId)?.custoMedio ?? it?.custoMedio ?? 0
      const dif = i.diferenca ?? (i.quantidadeContada != null ? round3(i.quantidadeContada - i.quantidadeSistema) : null)
      return { itemId: i.itemId, codigo: it?.codigo, item: it?.nome, unidade: it?.unidade, sistema: i.quantidadeSistema, contada: i.quantidadeContada, diferenca: dif, diferencaPct: dif != null && i.quantidadeSistema > 0 ? round2((dif / i.quantidadeSistema) * 100) : null, valorDiferenca: dif != null ? round2(dif * custo) : null, tipo: dif == null ? 'NAO_CONTADO' : dif > 1e-9 ? 'SOBRA' : dif < -1e-9 ? 'FALTA' : 'OK', ajustado: i.ajustado, observacao: i.observacao }
    })
    const div = linhas.filter((l) => !['OK'].includes(l.tipo))
    const contados = linhas.filter((l) => l.contada != null).length
    const payload = {
      inventarioId: inv.id, almoxarifado: alm?.nome, status: inv.status, totalItens: linhas.length, contados, divergentes: div.filter((l) => l.tipo !== 'NAO_CONTADO').length,
      acuracidadePct: contados ? round2(((contados - div.filter((l) => l.tipo !== 'NAO_CONTADO').length) / contados) * 100) : null,
      valorSobras: round2(linhas.filter((l) => l.tipo === 'SOBRA').reduce((s, l) => s + (l.valorDiferenca ?? 0), 0)), valorFaltas: round2(linhas.filter((l) => l.tipo === 'FALTA').reduce((s, l) => s + (l.valorDiferenca ?? 0), 0)),
      itens: div,
    }
    enviar(req, res, `divergencias-inventario`, div, payload)
  }))

  // Reabre a contagem apenas dos itens divergentes (recontagem) antes de ajustar o estoque.
  router.post('/almoxarifado/inventarios/:id/recontagem', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const inv = await prisma.supInventario.findFirst({ where: { id: String(req.params.id), tenantId }, include: { itens: true } })
    if (!inv) throw httpErr(404, 'Inventário não encontrado.')
    if (!['ABERTO', 'CONTAGEM_FINALIZADA'].includes(inv.status)) throw httpErr(409, 'Inventário já ajustado ou cancelado.')
    const div = inv.itens.filter((i) => i.quantidadeContada != null && Math.abs(i.diferenca ?? 0) > 1e-9 && !i.ajustado)
    if (!div.length) throw httpErr(409, 'Não há divergências para recontar.')
    await prisma.$transaction(async (tx) => {
      for (const i of div) await tx.supInventarioItem.update({ where: { id: i.id }, data: { quantidadeContada: null, diferenca: null, observacao: `Recontagem — contagem anterior: ${i.quantidadeContada}${i.observacao ? ' — ' + i.observacao : ''}` } })
      if (inv.status !== 'ABERTO') await tx.supInventario.update({ where: { id: inv.id }, data: { status: 'ABERTO', finalizadoEm: null } })
    })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'INVENTARIO_RECONTAGEM', refType: 'SupInventario', refId: inv.id, detalhes: { itens: div.length } })
    res.json({ recontar: div.length })
  }))

  // ---------- Requisições por departamento ----------
  router.get('/almoxarifado/requisicoes-departamento', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const de = dt(qs(req.query.de)), ate = dt(qs(req.query.ate))
    const where: any = { tenantId, departamentoId: qs(req.query.departamentoId) ?? { not: null }, ...(qs(req.query.tipo) ? { tipo: qs(req.query.tipo) } : {}), ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}), ...(de || ate ? { createdAt: { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) } } : {}) }
    const rows = await prisma.supRequisicao.findMany({ where, include: { itens: true }, orderBy: { createdAt: 'desc' }, take: 1000 })
    const deps = await prisma.cppDepartamento.findMany({ where: { tenantId } })
    const por: Record<string, { departamentoId: string; departamento: string; requisicoes: number; valorEstimado: number; atendidas: number; abertas: number }> = {}
    for (const r of rows) {
      const k = r.departamentoId!
      const x = (por[k] ??= { departamentoId: k, departamento: deps.find((d) => d.id === k)?.nome ?? k, requisicoes: 0, valorEstimado: 0, atendidas: 0, abertas: 0 })
      x.requisicoes++; x.valorEstimado = round2(x.valorEstimado + r.valorEstimado)
      if (r.status === 'ATENDIDA') x.atendidas++
      else if (!['CANCELADA', 'REPROVADA'].includes(r.status)) x.abertas++
    }
    const resumo = Object.values(por).sort((a, b) => b.valorEstimado - a.valorEstimado)
    enviar(req, res, 'requisicoes-departamento', resumo, { resumo, requisicoes: rows.map((r) => ({ id: r.id, numero: r.numero, tipo: r.tipo, status: r.status, departamentoId: r.departamentoId, departamento: deps.find((d) => d.id === r.departamentoId)?.nome ?? null, valorEstimado: r.valorEstimado, itens: r.itens.length, createdAt: r.createdAt })) })
  }))

  // ---------- Relatórios ----------
  router.get('/almoxarifado/relatorios/posicao', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const almox = qs(req.query.almoxarifadoId)
    const [saldos, itens, almoxs, cats] = await Promise.all([
      prisma.supSaldo.findMany({ where: { tenantId, quantidade: { gt: 0 }, ...(almox ? { almoxarifadoId: almox } : {}) } }),
      prisma.supItem.findMany({ where: { tenantId } }), prisma.supAlmoxarifado.findMany({ where: { tenantId } }), prisma.supCategoria.findMany({ where: { tenantId } }),
    ])
    const rows = saldos.map((s) => { const it = itens.find((i) => i.id === s.itemId); return { almoxarifado: almoxs.find((a) => a.id === s.almoxarifadoId)?.nome, categoria: cats.find((c) => c.id === it?.categoriaId)?.nome ?? 'Sem categoria', codigo: it?.codigo, item: it?.nome, unidade: it?.unidade, quantidade: s.quantidade, custoMedio: round2(s.custoMedio), valorTotal: round2(s.quantidade * s.custoMedio) } }).sort((a, b) => b.valorTotal - a.valorTotal)
    const porCategoria: Record<string, number> = {}
    for (const r of rows) porCategoria[r.categoria] = round2((porCategoria[r.categoria] ?? 0) + r.valorTotal)
    enviar(req, res, 'posicao-estoque', rows, { valorTotal: round2(rows.reduce((s, r) => s + r.valorTotal, 0)), porCategoria: Object.entries(porCategoria).map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor), itens: rows })
  }))

  router.get('/almoxarifado/relatorios/consumo-departamento', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const de = dt(qs(req.query.de)), ate = dt(qs(req.query.ate))
    const movs = await prisma.supMovimentacao.findMany({ where: { tenantId, tipo: { in: ['SAIDA', 'PERDA'] }, origemTipo: 'REQUISICAO', ...(de || ate ? { createdAt: { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) } } : {}) }, take: 20000 })
    const reqs = await prisma.supRequisicao.findMany({ where: { tenantId, id: { in: [...new Set(movs.map((m) => m.origemId!).filter(Boolean))] } }, select: { id: true, departamentoId: true } })
    const deps = await prisma.cppDepartamento.findMany({ where: { tenantId } })
    const por: Record<string, { departamentoId: string | null; departamento: string; quantidade: number; valorTotal: number; movimentacoes: number }> = {}
    for (const m of movs) {
      const depId = reqs.find((r) => r.id === m.origemId)?.departamentoId ?? null
      const k = depId ?? '_'
      const x = (por[k] ??= { departamentoId: depId, departamento: depId ? deps.find((d) => d.id === depId)?.nome ?? depId : 'Sem departamento', quantidade: 0, valorTotal: 0, movimentacoes: 0 })
      x.quantidade = round3(x.quantidade + m.quantidade); x.valorTotal = round2(x.valorTotal + m.valorTotal); x.movimentacoes++
    }
    const rows = Object.values(por).sort((a, b) => b.valorTotal - a.valorTotal)
    enviar(req, res, 'consumo-departamento', rows, { periodo: { de, ate }, totalValor: round2(rows.reduce((s, r) => s + r.valorTotal, 0)), departamentos: rows })
  }))

  router.get('/almoxarifado/relatorios/movimentacao', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const de = dt(qs(req.query.de)) ?? new Date(Date.now() - 30 * DAY), ate = dt(qs(req.query.ate))
    const movs = await prisma.supMovimentacao.findMany({ where: { tenantId, createdAt: { gte: de, ...(ate ? { lte: ate } : {}) }, ...(qs(req.query.almoxarifadoId) ? { almoxarifadoId: qs(req.query.almoxarifadoId) } : {}), ...(qs(req.query.tipo) ? { tipo: qs(req.query.tipo) as any } : {}) }, orderBy: { createdAt: 'desc' }, take: 5000 })
    const itens = await prisma.supItem.findMany({ where: { tenantId, id: { in: [...new Set(movs.map((m) => m.itemId))] } }, select: { id: true, codigo: true, nome: true } })
    const rows = movs.map((m) => ({ data: m.createdAt, tipo: m.tipo, codigo: itens.find((i) => i.id === m.itemId)?.codigo, item: itens.find((i) => i.id === m.itemId)?.nome, quantidade: m.quantidade * m.sentido, valor: round2(m.valorTotal), origem: m.origemTipo, motivo: m.motivo }))
    const totais: Record<string, number> = {}
    for (const m of movs) totais[m.tipo] = round2((totais[m.tipo] ?? 0) + m.valorTotal)
    enviar(req, res, 'movimentacao-estoque', rows, { de, ate: ate ?? null, totaisPorTipo: totais, movimentacoes: rows })
  }))

  router.get('/almoxarifado/relatorios/itens-parados', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const dias = Math.max(1, parseInt(qs(req.query.dias) || '90', 10) || 90)
    const limite = new Date(Date.now() - dias * DAY)
    const saldos = await prisma.supSaldo.findMany({ where: { tenantId, quantidade: { gt: 0 } } })
    const parados = saldos.filter((s) => !s.ultimaMovimentacao || s.ultimaMovimentacao < limite)
    const [itens, almoxs] = await Promise.all([prisma.supItem.findMany({ where: { tenantId, id: { in: parados.map((s) => s.itemId) } } }), prisma.supAlmoxarifado.findMany({ where: { tenantId } })])
    const rows = parados.map((s) => ({ almoxarifado: almoxs.find((a) => a.id === s.almoxarifadoId)?.nome, codigo: itens.find((i) => i.id === s.itemId)?.codigo, item: itens.find((i) => i.id === s.itemId)?.nome, quantidade: s.quantidade, valorParado: round2(s.quantidade * s.custoMedio), ultimaMovimentacao: s.ultimaMovimentacao, diasParado: s.ultimaMovimentacao ? Math.floor((Date.now() - s.ultimaMovimentacao.getTime()) / DAY) : null })).sort((a, b) => b.valorParado - a.valorParado)
    enviar(req, res, 'itens-parados', rows, { dias, valorParadoTotal: round2(rows.reduce((s, r) => s + r.valorParado, 0)), itens: rows })
  }))

  router.get('/almoxarifado/relatorios/divergencias-recebimento', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const de = dt(qs(req.query.de)), ate = dt(qs(req.query.ate))
    const confs = await prisma.cppConferencia.findMany({ where: { tenantId, temDivergencia: true, status: 'CONCLUIDA', ...(de || ate ? { finalizadaEm: { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) } } : {}) }, include: { itens: true }, orderBy: { finalizadaEm: 'desc' }, take: 1000 })
    const peds = await prisma.supPedido.findMany({ where: { tenantId, id: { in: [...new Set(confs.map((c) => c.pedidoId))] } }, select: { id: true, numero: true, fornecedor: { select: { razaoSocial: true } } } })
    const rows: Array<Record<string, any>> = []
    const porTipo: Record<string, number> = {}
    for (const c of confs) {
      const p = peds.find((x) => x.id === c.pedidoId)
      for (const i of c.itens.filter((x) => x.divergencias.length)) {
        for (const t of i.divergencias) porTipo[t] = (porTipo[t] ?? 0) + 1
        rows.push({ conferencia: c.numero, pedido: p?.numero, fornecedor: p?.fornecedor?.razaoSocial, notaFiscal: c.notaFiscal, divergencias: i.divergencias.join(', '), decisao: i.decisao, aceita: i.quantidadeAceita, rejeitada: i.quantidadeRejeitada, data: c.finalizadaEm })
      }
    }
    const porFornecedor: Record<string, number> = {}
    for (const r of rows) porFornecedor[r.fornecedor ?? '—'] = (porFornecedor[r.fornecedor ?? '—'] ?? 0) + 1
    enviar(req, res, 'divergencias-recebimento', rows, { totalDivergencias: rows.length, porTipo, porFornecedor: Object.entries(porFornecedor).map(([fornecedor, divergencias]) => ({ fornecedor, divergencias })).sort((a, b) => b.divergencias - a.divergencias), itens: rows })
  }))
}
