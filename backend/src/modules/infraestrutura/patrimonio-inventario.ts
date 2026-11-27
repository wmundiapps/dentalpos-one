// Inventário físico por leitura de QR/código de barras: leitura (inclusive em lote/offline), divergências,
// decisões (ajustar local, manter, baixar, investigar) e relatório. Estende patrimonio.ts (inventários).
import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, qs, dateISO } from '../core/crud'
import { audit } from '../core/notify'
import { scheduleReminder } from '../core/reminders'
import { brandHeaderHtml, escapeHtml as esc, getBranding } from '../core/branding'
import { classificarDivergencia, resumoInventario } from './calc'
import { baixarBem, depreciacaoDoBem, registrarMov } from './patrimonio'
import { interpretarLeitura, nomeLocal } from './patrimonio-etiquetas'
import { GESTAO, LEITURA, MODULO, ensureSpace, fail, money } from './util'

const ESTADOS = ['NOVO', 'BOM', 'REGULAR', 'RUIM', 'INSERVIVEL'] as const
const leituraIn = z.object({ payload: z.string().min(1).max(400), spaceId: z.string().optional().nullable(), estado: z.enum(ESTADOS).optional(), observacao: z.string().max(300).optional(), lidoEm: dateISO().optional() })

type Resultado = 'CONTADO' | 'RECONTADO' | 'SOBRA' | 'BAIXADO' | 'NAO_RECONHECIDO'

async function registrarLeitura(tenantId: string, userId: string, inv: { id: string; spaceId: string | null; status: string }, d: z.infer<typeof leituraIn>) {
  if (inv.status !== 'ABERTO') fail(409, 'Inventário não está aberto.')
  if (d.spaceId) await ensureSpace(tenantId, d.spaceId)
  const agora = d.lidoEm ?? new Date()
  const leitura = interpretarLeitura(d.payload)
  const log = (resultado: Resultado, extra: { bemId?: string; tombamento?: string } = {}) => prisma.cppLeituraInventario.create({ data: { tenantId, inventarioId: inv.id, payload: d.payload.slice(0, 400), spaceLidoId: d.spaceId ?? inv.spaceId, resultado, lidoPorId: userId, bemId: extra.bemId, tombamento: extra.tombamento ?? leitura.tombamento } })
  if (!leitura.tombamento) { await log('NAO_RECONHECIDO'); return { resultado: 'NAO_RECONHECIDO' as Resultado, aviso: 'Leitura não reconhecida como etiqueta de patrimônio.' } }
  const bem = await prisma.infBem.findFirst({ where: { tenantId, tombamento: leitura.tombamento } })
  const spaceEnc = d.spaceId ?? inv.spaceId ?? null
  if (!bem) {
    let item = await prisma.infInventarioItem.findFirst({ where: { tenantId, inventarioId: inv.id, tombamentoLido: leitura.tombamento, bemId: null } })
    const data = { contado: true, divergencia: 'SOBRA' as const, spaceEncontradoId: spaceEnc, estadoEncontrado: d.estado, observacao: d.observacao ?? 'Etiqueta sem bem cadastrado', contadoPorId: userId, contadoEm: agora }
    item = item ? await prisma.infInventarioItem.update({ where: { id: item.id }, data }) : await prisma.infInventarioItem.create({ data: { ...data, tenantId, inventarioId: inv.id, tombamentoLido: leitura.tombamento } })
    await log('SOBRA')
    return { resultado: 'SOBRA' as Resultado, divergencia: 'SOBRA', aviso: 'Código sem bem cadastrado no patrimônio.', item }
  }
  let item = await prisma.infInventarioItem.findFirst({ where: { tenantId, inventarioId: inv.id, bemId: bem.id } })
  const duplicada = !!item?.contado
  if (bem.status === 'BAIXADO') {
    const data = { contado: true, divergencia: 'SOBRA' as const, spaceEncontradoId: spaceEnc, estadoEncontrado: d.estado, observacao: d.observacao ?? 'Bem BAIXADO encontrado em campo', contadoPorId: userId, contadoEm: agora }
    item = item ? await prisma.infInventarioItem.update({ where: { id: item.id }, data }) : await prisma.infInventarioItem.create({ data: { ...data, tenantId, inventarioId: inv.id, bemId: bem.id, spaceEsperadoId: bem.spaceId, tombamentoLido: bem.tombamento } })
    await log('BAIXADO', { bemId: bem.id })
    return { resultado: 'BAIXADO' as Resultado, divergencia: 'SOBRA', aviso: 'Este bem consta como BAIXADO no cadastro.', item, bem: { id: bem.id, tombamento: bem.tombamento, descricao: bem.descricao } }
  }
  const esperado = item?.spaceEsperadoId ?? bem.spaceId
  const divergencia = classificarDivergencia({ contado: true, spaceEsperadoId: esperado, spaceEncontradoId: spaceEnc ?? esperado, estadoEsperado: bem.estado, estadoEncontrado: d.estado })
  const data = { contado: true, spaceEncontradoId: spaceEnc ?? esperado, estadoEncontrado: d.estado ?? bem.estado, divergencia, observacao: d.observacao, contadoPorId: userId, contadoEm: agora }
  item = item ? await prisma.infInventarioItem.update({ where: { id: item.id }, data }) : await prisma.infInventarioItem.create({ data: { ...data, tenantId, inventarioId: inv.id, bemId: bem.id, spaceEsperadoId: bem.spaceId, tombamentoLido: bem.tombamento } })
  const resultado: Resultado = duplicada ? 'RECONTADO' : 'CONTADO'
  await log(resultado, { bemId: bem.id })
  return { resultado, divergencia, duplicada, item, bem: { id: bem.id, tombamento: bem.tombamento, descricao: bem.descricao, estado: bem.estado }, aviso: duplicada ? 'Este bem já havia sido lido neste inventário.' : divergencia === 'LOCAL_DIVERGENTE' ? 'Bem encontrado em local diferente do cadastro.' : undefined }
}

export function mountInventarioQr(router: Router) {
  router.post('/inventarios/:id/leitura', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(leituraIn, req.body)
    const inv = await prisma.infInventario.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!inv) return res.status(404).json({ error: 'Inventário não encontrado.' })
    const r = await registrarLeitura(tenantId, getUserId(req), inv, d)
    const [total, contados] = await Promise.all([prisma.infInventarioItem.count({ where: { tenantId, inventarioId: inv.id } }), prisma.infInventarioItem.count({ where: { tenantId, inventarioId: inv.id, contado: true } })])
    res.status(r.resultado === 'NAO_RECONHECIDO' ? 422 : 200).json({ ...r, progresso: { total, contados, pct: total ? money((contados / total) * 100) : 0 } })
  }))

  // Sincronização de leituras feitas offline (até 500 por chamada).
  router.post('/inventarios/:id/leituras-lote', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ leituras: z.array(leituraIn).min(1).max(500) }), req.body)
    const inv = await prisma.infInventario.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!inv) return res.status(404).json({ error: 'Inventário não encontrado.' })
    const resultados: any[] = []
    for (const l of [...d.leituras].sort((a, b) => (a.lidoEm?.getTime() ?? 0) - (b.lidoEm?.getTime() ?? 0))) {
      try { resultados.push(await registrarLeitura(tenantId, getUserId(req), inv, l)) } catch (e: any) { resultados.push({ resultado: 'ERRO', aviso: e?.message }) }
    }
    const cont: Record<string, number> = {}
    for (const r of resultados) cont[r.resultado] = (cont[r.resultado] ?? 0) + 1
    res.json({ processadas: resultados.length, resumo: cont, resultados })
  }))

  router.get('/inventarios/:id/leituras', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const rows = await prisma.cppLeituraInventario.findMany({ where: { tenantId, inventarioId: String(req.params.id) }, orderBy: { createdAt: 'desc' }, take: 500 })
    res.json({ items: rows, total: rows.length })
  }))

  // Divergências com dados do bem e a decisão tomada.
  async function divergencias(tenantId: string, invId: string, apenas: string | undefined) {
    const inv = await prisma.infInventario.findFirst({ where: { id: invId, tenantId } })
    if (!inv) return null
    const itens = await prisma.infInventarioItem.findMany({ where: { tenantId, inventarioId: inv.id, divergencia: apenas ? (apenas as any) : { not: 'NENHUMA' } }, orderBy: { createdAt: 'asc' }, take: 5000 })
    const [bens, decisoes, spaces] = await Promise.all([
      prisma.infBem.findMany({ where: { tenantId, id: { in: itens.map((i) => i.bemId).filter(Boolean) as string[] } }, include: { categoria: true } }),
      prisma.cppInventarioDecisao.findMany({ where: { tenantId, inventarioId: inv.id } }),
      prisma.eduSpace.findMany({ where: { tenantId, id: { in: itens.flatMap((i) => [i.spaceEsperadoId, i.spaceEncontradoId]).filter(Boolean) as string[] } } }),
    ])
    const sp = (id: string | null) => nomeLocal(spaces.find((s) => s.id === id))
    return { inv, itens: itens.map((i) => { const b = bens.find((x) => x.id === i.bemId); return { ...i, bem: b ? { id: b.id, tombamento: b.tombamento, descricao: b.descricao, status: b.status, categoria: b.categoria.nome, valorContabil: depreciacaoDoBem(b, b.categoria).valorContabil } : null, tombamento: b?.tombamento ?? i.tombamentoLido, esperado: sp(i.spaceEsperadoId), encontrado: sp(i.spaceEncontradoId), decisao: decisoes.find((d) => d.itemId === i.id) ?? null } }) }
  }

  router.get('/inventarios/:id/divergencias', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await divergencias(getTenantId(req), String(req.params.id), qs(req.query.tipo))
    if (!r) return res.status(404).json({ error: 'Inventário não encontrado.' })
    res.json({ inventarioId: r.inv.id, status: r.inv.status, total: r.itens.length, pendentesDecisao: r.itens.filter((i) => !i.decisao).length, itens: r.itens })
  }))

  router.post('/inventarios/:id/itens/:itemId/decidir', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req), userId = getUserId(req)
    const d = parseBody(z.object({ acao: z.enum(['AJUSTAR_LOCAL', 'MANTER', 'BAIXAR', 'INVESTIGAR', 'REGULARIZAR']), motivo: z.string().min(5) }), req.body)
    const inv = await prisma.infInventario.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!inv) return res.status(404).json({ error: 'Inventário não encontrado.' })
    if (inv.status !== 'FECHADO') fail(409, 'Decisões sobre divergências são tomadas após fechar o inventário (as não lidas viram NAO_ENCONTRADO).')
    const item = await prisma.infInventarioItem.findFirst({ where: { id: String(req.params.itemId), tenantId, inventarioId: inv.id } })
    if (!item) return res.status(404).json({ error: 'Item do inventário não encontrado.' })
    if (item.divergencia === 'NENHUMA') fail(409, 'Item sem divergência.')
    if (await prisma.cppInventarioDecisao.findFirst({ where: { itemId: item.id } })) fail(409, 'Este item já teve a divergência decidida.')
    if (d.acao === 'AJUSTAR_LOCAL' && (item.divergencia !== 'LOCAL_DIVERGENTE' || !item.bemId || !item.spaceEncontradoId)) fail(409, 'Ajuste de local só se aplica a bem encontrado em outro local.')
    if (d.acao === 'BAIXAR' && !item.bemId) fail(409, 'Não há bem cadastrado para baixar.')
    if (d.acao === 'BAIXAR' && item.divergencia === 'SOBRA') fail(409, 'Bem encontrado fisicamente (sobra) não deve ser baixado; regularize o cadastro.')
    let resultado: any = null
    if (d.acao === 'AJUSTAR_LOCAL') {
      const bem = await prisma.infBem.findFirst({ where: { id: item.bemId!, tenantId } })
      if (!bem || bem.status === 'BAIXADO') fail(409, 'Bem inexistente ou baixado.')
      await prisma.infBem.update({ where: { id: bem.id }, data: { spaceId: item.spaceEncontradoId } })
      await registrarMov(tenantId, bem.id, userId, { tipo: 'TRANSFERENCIA', origemSpaceId: bem.spaceId, destinoSpaceId: item.spaceEncontradoId, motivo: `Inventário ${inv.titulo}: ${d.motivo}` })
    } else if (d.acao === 'BAIXAR') {
      resultado = await baixarBem(tenantId, userId, item.bemId!, { motivo: `Inventário ${inv.titulo}: ${d.motivo}`, documento: `INV-${inv.id.slice(0, 8)}` })
    } else if (d.acao === 'INVESTIGAR') {
      await scheduleReminder({ tenantId, modulo: MODULO, refType: 'InfInventarioItem', refId: item.id, dedupeKey: `cpp-inv-investigar-${item.id}`, titulo: `Investigar divergência do inventário "${inv.titulo}": ${item.tombamentoLido ?? item.bemId}`, descricao: d.motivo, dueAt: new Date(Date.now() + 7 * 86_400_000), assigneeRole: 'FACILITIES', severity: 'ATENCAO' })
    }
    const dec = await prisma.cppInventarioDecisao.create({ data: { tenantId, inventarioId: inv.id, itemId: item.id, bemId: item.bemId, acao: d.acao, motivo: d.motivo, decididoPorId: userId } })
    await audit({ tenantId, userId, modulo: MODULO, acao: `INVENTARIO_DECISAO_${d.acao}`, refType: 'InfInventario', refId: inv.id, detalhes: { itemId: item.id, bemId: item.bemId } })
    res.status(201).json({ decisao: dec, bem: resultado })
  }))

  // Relatório do inventário (JSON, HTML imprimível ou CSV).
  router.get('/inventarios/:id/relatorio', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await divergencias(tenantId, String(req.params.id), undefined)
    if (!r) return res.status(404).json({ error: 'Inventário não encontrado.' })
    const todos = await prisma.infInventarioItem.findMany({ where: { tenantId, inventarioId: r.inv.id }, select: { contado: true, divergencia: true } })
    const resumo: Record<string, number> = { ...resumoInventario(todos.map((i) => i.divergencia as any)), contados: todos.filter((i) => i.contado).length }
    const leituras = await prisma.cppLeituraInventario.count({ where: { tenantId, inventarioId: r.inv.id } })
    const valorNaoEncontrados = money(r.itens.filter((i) => i.divergencia === 'NAO_ENCONTRADO').reduce((s, i) => s + (i.bem?.valorContabil ?? 0), 0))
    const porTipo = (t: string) => r.itens.filter((i) => i.divergencia === t)
    const out = { inventario: { id: r.inv.id, titulo: r.inv.titulo, status: r.inv.status, fechadoEm: r.inv.fechadoEm, resumo: r.inv.resumo ?? resumo }, resumo, leituras, valorContabilNaoEncontrados: valorNaoEncontrados, divergencias: r.itens, pendentesDecisao: r.itens.filter((i) => !i.decisao).length, baixas: r.itens.filter((i) => i.decisao?.acao === 'BAIXAR').length }
    if (qs(req.query.format) === 'csv') {
      const cel = (v: any) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="inventario-patrimonio.csv"')
      return res.send('﻿' + ['tombamento;descricao;divergencia;esperado;encontrado;decisao', ...r.itens.map((i) => [i.tombamento, i.bem?.descricao, i.divergencia, i.esperado, i.encontrado, i.decisao?.acao].map(cel).join(';'))].join('\n'))
    }
    if (qs(req.query.format) !== 'html') return res.json(out)
    const b = await getBranding(tenantId)
    const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const tabela = (t: string, nome: string) => `<h3>${nome} (${porTipo(t).length})</h3>${porTipo(t).length ? `<table border="1" cellpadding="5" style="border-collapse:collapse;width:100%"><tr style="background:#f1f5f9"><th>Tombamento</th><th align="left">Descrição</th><th>Esperado</th><th>Encontrado</th><th>Decisão</th></tr>${porTipo(t).map((i) => `<tr><td>${esc(String(i.tombamento ?? ''))}</td><td>${esc(i.bem?.descricao ?? i.observacao ?? '')}</td><td>${esc(i.esperado ?? '—')}</td><td>${esc(i.encontrado ?? '—')}</td><td>${esc(i.decisao ? `${i.decisao.acao}: ${i.decisao.motivo}` : 'pendente')}</td></tr>`).join('')}</table>` : '<p>Nenhum.</p>'}`
    res.type('html').send(`<!doctype html><meta charset="utf-8"><body style="max-width:1000px;margin:auto;font:13px sans-serif">${brandHeaderHtml(b, { titulo: `Inventário físico — ${r.inv.titulo}`, subtitulo: `Situação: ${r.inv.status}${r.inv.fechadoEm ? ' · fechado em ' + r.inv.fechadoEm.toLocaleDateString('pt-BR') : ''}` })}<div style="padding:16px 28px">
<p>Itens: <b>${resumo.total}</b> · lidos: <b>${resumo.contados}</b> · acuracidade: <b>${resumo.acuracidadePct}%</b> · leituras de QR: <b>${leituras}</b> · valor contábil dos não encontrados: <b>${brl(valorNaoEncontrados)}</b></p>
${tabela('NAO_ENCONTRADO', 'Não encontrados')}${tabela('LOCAL_DIVERGENTE', 'Local divergente')}${tabela('ESTADO_DIVERGENTE', 'Estado divergente')}${tabela('SOBRA', 'Sobras (fora do cadastro/baixados)')}
<div style="display:flex;gap:40px;margin-top:70px"><div style="flex:1;border-top:1px solid #000;text-align:center">Responsável pelo inventário</div><div style="flex:1;border-top:1px solid #000;text-align:center">Direção / Patrimônio</div></div></div></body>`)
  }))
}
