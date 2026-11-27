// Regras de cotação obrigatória (mínimo de 3 propostas ou exceção formal aprovada), mapa comparativo
// persistido, política de compras e departamentos. Estende compras.ts (que chama estas funções no encerramento).
import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, pageParams, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { brandHeaderHtml, escapeHtml as esc, getBranding } from '../core/branding'
import { LEITURA, GESTAO } from './catalogo'
import { alcadasNecessarias, compararCotacoes, round2, DAY } from './logic'
import { CPP_SUPER, cppNumero, getPolitica, httpErr } from './cpp'

const roleOf = (req: AuthenticatedRequest) => String(req.user?.role || '').toUpperCase()
const APROVADORES = ['COORDINATOR', 'FINANCE', 'SUPPLIES', 'FACILITIES'] as const
export const MOTIVOS_EXCECAO = ['FORNECEDOR_UNICO', 'EXCLUSIVIDADE', 'URGENCIA', 'MERCADO_RESTRITO', 'VALOR_BAIXO', 'OUTRO'] as const

/** Papel que aprova uma exceção: o do maior nível da alçada exigido para o valor. */
export async function papelAprovadorExcecao(tenantId: string, valor: number): Promise<string> {
  const alcadas = await prisma.supAlcada.findMany({ where: { tenantId, ativo: true }, orderBy: { nivel: 'asc' } })
  const exigidas = alcadasNecessarias(valor, alcadas)
  return exigidas[exigidas.length - 1].papel
}

export async function carregarCotacaoCompleta(tenantId: string, id: string) {
  const c = await prisma.supCotacao.findFirst({ where: { id, tenantId }, include: { propostas: { include: { precos: true } }, requisicao: { include: { itens: true } } } })
  if (!c) throw httpErr(404, 'Cotação não encontrada.')
  return c
}

/** Mapa comparativo calculado (mesmos números do /cotacoes/:id/mapa) com nomes dos fornecedores. */
export async function montarMapaCotacao(tenantId: string, c: Awaited<ReturnType<typeof carregarCotacaoCompleta>>) {
  const forn = await prisma.supFornecedor.findMany({ where: { tenantId, id: { in: c.propostas.map((p) => p.fornecedorId) } }, select: { id: true, razaoSocial: true, cnpj: true, avaliacaoMedia: true, status: true, prazoPagamentoDias: true } })
  const m = compararCotacoes(
    c.requisicao.itens.map((i) => ({ id: i.id, quantidade: i.quantidade, precoEstimado: i.precoEstimado })),
    c.propostas.map((p) => ({ fornecedorId: p.fornecedorId, respondeu: p.respondeu, frete: p.frete, prazoEntregaDias: p.prazoEntregaDias, notaFornecedor: forn.find((f) => f.id === p.fornecedorId)?.avaliacaoMedia ?? null, precos: p.precos.map((x) => ({ requisicaoItemId: x.requisicaoItemId, precoUnitario: x.precoUnitario })) })),
    c.criterio as any,
  )
  return { ...m, fornecedores: forn, itens: c.requisicao.itens }
}

export interface Exigencia { minimo: number; respondidas: number; convidados: number; atende: boolean; excecao: { id: string; numero: string; status: string; motivo: string } | null; liberadoPorExcecao: boolean }

/** Quantas propostas respondidas (fornecedores distintos) a cotação tem versus o mínimo da política, e se há exceção aprovada. */
export async function avaliarExigencia(tenantId: string, c: { requisicaoId: string; propostas: Array<{ respondeu: boolean; fornecedorId: string }> }): Promise<Exigencia> {
  const pol = await getPolitica(tenantId)
  const respondidas = new Set(c.propostas.filter((p) => p.respondeu).map((p) => p.fornecedorId)).size
  const exc = await prisma.cppExcecaoCotacao.findFirst({ where: { tenantId, tipo: 'REQUISICAO', requisicaoId: c.requisicaoId, status: 'APROVADA' }, orderBy: { decididoEm: 'desc' } })
  const atende = respondidas >= pol.minCotacoes
  return {
    minimo: pol.minCotacoes, respondidas, convidados: c.propostas.length, atende,
    excecao: exc ? { id: exc.id, numero: exc.numero, status: exc.status, motivo: exc.motivo } : null,
    liberadoPorExcecao: !atende && !!exc,
  }
}

/** Bloqueio de avanço: lança 409 (com código) quando faltam cotações e não há exceção aprovada. */
export async function exigirCotacoes(tenantId: string, c: { requisicaoId: string; propostas: Array<{ respondeu: boolean; fornecedorId: string }> }): Promise<Exigencia> {
  const ex = await avaliarExigencia(tenantId, c)
  if (!ex.atende && !ex.excecao) {
    throw httpErr(409, `Mínimo de ${ex.minimo} cotações respondidas de fornecedores distintos (há ${ex.respondidas}). Registre mais propostas ou solicite uma exceção formal justificada e aprovada.`, { codigo: 'COTACOES_INSUFICIENTES', exigencia: ex })
  }
  return ex
}

export function registerCotacaoRegras(router: Router) {
  const mod = 'suprimentos'

  // ---------- Política ----------
  router.get('/politica-compras', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await getPolitica(getTenantId(req)))
  }))
  router.put('/politica-compras', requireRole('FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({
      minCotacoes: z.coerce.number().int().min(1).max(10).optional(), valorDispensaCotacao: z.coerce.number().min(0).optional(),
      exigirAprovacaoCompra: z.boolean().optional(), exigirConferencia: z.boolean().optional(), toleranciaPrecoPct: z.coerce.number().min(0).max(50).optional(),
      exigirAceiteTransferencia: z.boolean().optional(), prazoAceiteDias: z.coerce.number().int().min(1).max(90).optional(),
    }), req.body ?? {})
    await prisma.cppPolitica.upsert({ where: { tenantId }, create: { tenantId, ...d, updatedById: getUserId(req) }, update: { ...d, updatedById: getUserId(req) } })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'POLITICA_COMPRAS', refType: 'CppPolitica', refId: tenantId, detalhes: d })
    res.json(await getPolitica(tenantId))
  }))

  // ---------- Departamentos (compartilhado com o patrimônio) ----------
  mountCrud(router, {
    model: 'cppDepartamento', path: '/departamentos', read: [], readAll: true, write: ['SUPPLIES', 'FACILITIES', 'FINANCE'], modulo: mod, removeMode: 'soft',
    create: z.object({
      codigo: z.string().min(1).max(30).transform((s) => s.trim().toUpperCase()), nome: z.string().min(2),
      responsavelUserId: z.string().optional().nullable(), centroCustoId: z.string().optional().nullable(), campusId: z.string().optional().nullable(), ativo: z.boolean().optional(),
    }),
    search: ['nome', 'codigo'], filters: ['ativo'], orderBy: { nome: 'asc' },
    beforeCreate: async (data, req) => { await validarDepartamento(getTenantId(req), data); return data },
    beforeUpdate: async (data, req) => { await validarDepartamento(getTenantId(req), data); return data },
  })

  // ---------- Exceções ao mínimo de cotações ----------
  const excSchema = z.object({
    tipo: z.enum(['REQUISICAO', 'PEDIDO_DIRETO']).default('REQUISICAO'), requisicaoId: z.string().optional().nullable(),
    motivo: z.enum(MOTIVOS_EXCECAO), justificativa: z.string().trim().min(30, 'Justifique formalmente (mínimo de 30 caracteres).'),
    valorEstimado: z.coerce.number().min(0), fornecedorSugeridoId: z.string().optional().nullable(), anexoUrl: z.string().url().optional().nullable(),
  })
  router.post('/excecoes-cotacao', requireRole(...GESTAO, 'COORDINATOR', 'FACILITIES'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(excSchema, req.body)
    let valor = d.valorEstimado
    if (d.tipo === 'REQUISICAO') {
      if (!d.requisicaoId) throw httpErr(400, 'Informe a requisição (requisicaoId).')
      const r = await prisma.supRequisicao.findFirst({ where: { id: d.requisicaoId, tenantId } })
      if (!r) throw httpErr(404, 'Requisição não encontrada.')
      if (!['APROVADA', 'EM_COTACAO', 'COTADA'].includes(r.status)) throw httpErr(409, 'A requisição precisa estar aprovada para pedir exceção de cotação.')
      if (valor <= 0) valor = r.valorEstimado
      const aberta = await prisma.cppExcecaoCotacao.findFirst({ where: { tenantId, requisicaoId: r.id, status: { in: ['SOLICITADA', 'APROVADA'] } } })
      if (aberta) throw httpErr(409, `Já existe a exceção ${aberta.numero} (${aberta.status}) para esta requisição.`)
    } else if (valor <= 0) throw httpErr(400, 'Informe o valor estimado do pedido direto.')
    if (d.fornecedorSugeridoId) {
      const f = await prisma.supFornecedor.findFirst({ where: { id: d.fornecedorSugeridoId, tenantId } })
      if (!f) throw httpErr(404, 'Fornecedor sugerido não encontrado.')
    }
    const papel = await papelAprovadorExcecao(tenantId, valor)
    const row = await prisma.$transaction(async (tx) => {
      const numero = await cppNumero(tx, tenantId, 'EXC')
      return tx.cppExcecaoCotacao.create({ data: { tenantId, numero, ...d, valorEstimado: valor, papelAprovador: papel, solicitadoPorId: getUserId(req) } })
    })
    await scheduleReminder({ tenantId, modulo: mod, refType: 'CppExcecaoCotacao', refId: row.id, dedupeKey: `cpp-exc-${row.id}`, titulo: `Aprovar exceção de cotação ${row.numero} (${row.motivo})`, dueAt: new Date(Date.now() + 3 * DAY), assigneeRole: papel, severity: 'ATENCAO' })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'EXCECAO_COTACAO_SOLICITADA', refType: 'CppExcecaoCotacao', refId: row.id, detalhes: { motivo: d.motivo, valor } })
    res.status(201).json(row)
  }))

  router.get('/excecoes-cotacao', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'tipo', 'requisicaoId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (qs(req.query.pendentesMinhaAprovacao) === 'true' && !CPP_SUPER.includes(roleOf(req))) { where.status = 'SOLICITADA'; where.papelAprovador = roleOf(req) }
    const [items, total] = await Promise.all([prisma.cppExcecaoCotacao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.cppExcecaoCotacao.count({ where })])
    res.json({ items, total, page, pageSize })
  }))

  router.get('/excecoes-cotacao/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.cppExcecaoCotacao.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!r) throw httpErr(404, 'Exceção não encontrada.')
    res.json(r)
  }))

  router.post('/excecoes-cotacao/:id/decidir', requireRole(...APROVADORES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ decisao: z.enum(['APROVADA', 'REPROVADA']), parecer: z.string().optional() }), req.body)
    const e = await prisma.cppExcecaoCotacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!e) throw httpErr(404, 'Exceção não encontrada.')
    if (e.status !== 'SOLICITADA') throw httpErr(409, `Exceção já está ${e.status}.`)
    if (e.solicitadoPorId === getUserId(req)) throw httpErr(403, 'O solicitante não pode decidir a própria exceção.')
    const role = roleOf(req)
    if (!CPP_SUPER.includes(role) && role !== e.papelAprovador) throw httpErr(403, `Esta exceção deve ser decidida por ${e.papelAprovador}.`)
    if (d.decisao === 'REPROVADA' && !d.parecer) throw httpErr(400, 'Informe o parecer para reprovar.')
    const claim = await prisma.cppExcecaoCotacao.updateMany({ where: { id: e.id, status: 'SOLICITADA' }, data: { status: d.decisao, decididoPorId: getUserId(req), decididoEm: new Date(), parecer: d.parecer } })
    if (claim.count === 0) throw httpErr(409, 'Exceção já decidida.')
    await completeReminders({ tenantId, refType: 'CppExcecaoCotacao', refId: e.id, userId: getUserId(req) })
    await notify({ tenantId, userId: e.solicitadoPorId, assunto: `Exceção de cotação ${e.numero} ${d.decisao === 'APROVADA' ? 'aprovada' : 'reprovada'}`, mensagem: `${d.decisao === 'APROVADA' ? 'Você pode encerrar a cotação com menos propostas.' : 'Obtenha as demais cotações.'}${d.parecer ? ' Parecer: ' + d.parecer : ''}`, refType: 'CppExcecaoCotacao', refId: e.id })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: `EXCECAO_COTACAO_${d.decisao}`, refType: 'CppExcecaoCotacao', refId: e.id, detalhes: { parecer: d.parecer } })
    res.json(await prisma.cppExcecaoCotacao.findFirst({ where: { id: e.id } }))
  }))

  router.post('/excecoes-cotacao/:id/cancelar', requireRole(...GESTAO, 'COORDINATOR', 'FACILITIES'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await prisma.cppExcecaoCotacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!e) throw httpErr(404, 'Exceção não encontrada.')
    if (e.solicitadoPorId !== getUserId(req) && !CPP_SUPER.includes(roleOf(req))) throw httpErr(403, 'Somente o solicitante cancela.')
    if (!['SOLICITADA', 'APROVADA'].includes(e.status)) throw httpErr(409, `Exceção em ${e.status} não pode ser cancelada.`)
    if (e.usadaEm) throw httpErr(409, 'Exceção já foi utilizada.')
    await prisma.cppExcecaoCotacao.update({ where: { id: e.id }, data: { status: 'CANCELADA' } })
    await completeReminders({ tenantId, refType: 'CppExcecaoCotacao', refId: e.id })
    res.json({ ok: true })
  }))

  // ---------- Convidar mais fornecedores para uma cotação aberta ----------
  router.post('/cotacoes/:id/fornecedores', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ fornecedorIds: z.array(z.string()).min(1).max(20) }), req.body)
    const c = await carregarCotacaoCompleta(tenantId, String(req.params.id))
    if (c.status !== 'ABERTA') throw httpErr(409, 'Cotação não está aberta.')
    const novos = [...new Set(d.fornecedorIds)].filter((id) => !c.propostas.some((p) => p.fornecedorId === id))
    if (!novos.length) throw httpErr(409, 'Todos os fornecedores já participam desta cotação.')
    const forn = await prisma.supFornecedor.findMany({ where: { tenantId, id: { in: novos }, ativo: true, status: { in: ['ATIVO', 'EM_ANALISE'] } } })
    if (forn.length !== novos.length) throw httpErr(400, 'Há fornecedores inexistentes, inativos ou bloqueados na lista.')
    await prisma.supCotacaoProposta.createMany({ data: forn.map((f) => ({ tenantId, cotacaoId: c.id, fornecedorId: f.id })) })
    res.status(201).json({ adicionados: forn.length, exigencia: await avaliarExigencia(tenantId, { requisicaoId: c.requisicaoId, propostas: [...c.propostas, ...forn.map((f) => ({ respondeu: false, fornecedorId: f.id }))] }) })
  }))

  // ---------- Mapa comparativo (com exigência, escolha e justificativa) ----------
  router.get('/cotacoes/:id/mapa-comparativo', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await carregarCotacaoCompleta(tenantId, String(req.params.id))
    const m = await montarMapaCotacao(tenantId, c)
    const exigencia = await avaliarExigencia(tenantId, c)
    const registro = await prisma.cppMapaCotacao.findFirst({ where: { tenantId, cotacaoId: c.id } })
    const excecao = await prisma.cppExcecaoCotacao.findFirst({ where: { tenantId, tipo: 'REQUISICAO', requisicaoId: c.requisicaoId, status: { in: ['SOLICITADA', 'APROVADA', 'REPROVADA'] } }, orderBy: { createdAt: 'desc' } })
    const compra = await prisma.cppCompra.findFirst({ where: { tenantId, cotacaoId: c.id, status: { not: 'CANCELADA' } }, orderBy: { createdAt: 'desc' } })
    const nome = (id?: string | null) => (id ? m.fornecedores.find((f) => f.id === id)?.razaoSocial ?? id : null)
    const escolha = registro
      ? { fornecedorId: registro.fornecedorEscolhidoId, fornecedor: nome(registro.fornecedorEscolhidoId), sugeridoId: registro.sugeridoFornecedorId, sugerido: nome(registro.sugeridoFornecedorId), justificativa: registro.justificativa, valor: registro.valorEscolhido, economia: registro.economia, referencia: registro.referencia, congeladoEm: registro.createdAt }
      : null
    const payload = {
      cotacao: { id: c.id, numero: c.numero, status: c.status, criterio: c.criterio, fornecedorVencedorId: c.fornecedorVencedorId, justificativaEscolha: c.justificativaEscolha },
      requisicao: { id: c.requisicaoId, numero: c.requisicao.numero, valorEstimado: c.requisicao.valorEstimado, justificativa: c.requisicao.justificativa },
      exigencia, excecao, escolha, compra: compra ? { id: compra.id, numero: compra.numero, status: compra.status, valorTotal: compra.valorTotal, formaPagamento: compra.formaPagamento } : null,
      ...m,
    }
    if (qs(req.query.format) !== 'html') return res.json(payload)
    const b = await getBranding(tenantId)
    const brl = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
    const linha = (id: string) => m.linhas.find((l) => l.fornecedorId === id)
    const th = m.fornecedores.map((f) => `<th align="right">${esc(f.razaoSocial)}${m.vencedor === f.id ? '<br><small>(menor custo)</small>' : ''}${registro?.fornecedorEscolhidoId === f.id ? '<br><b>ESCOLHIDO</b>' : ''}</th>`).join('')
    const rows = m.itens.map((i) => `<tr><td>${esc(i.descricao)} × ${i.quantidade}</td>${m.fornecedores.map((f) => `<td align="right">${brl(linha(f.id)?.precos?.[i.id])}</td>`).join('')}</tr>`).join('')
    res.type('html').send(`<!doctype html><meta charset="utf-8"><body style="max-width:1000px;margin:auto;font:13px sans-serif">${brandHeaderHtml(b, { titulo: `Mapa comparativo de cotações — ${c.numero}`, subtitulo: `Requisição ${c.requisicao.numero} · critério ${c.criterio.replace(/_/g, ' ')}` })}
<div style="padding:16px 28px"><p><b>Cotações recebidas:</b> ${exigencia.respondidas} de ${exigencia.convidados} convidados (mínimo ${exigencia.minimo}) ${exigencia.atende ? '— exigência atendida' : excecao?.status === 'APROVADA' ? `— exceção ${esc(excecao.numero)} APROVADA (${esc(excecao.motivo)})` : '— <b style="color:#b91c1c">exigência NÃO atendida</b>'}</p>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="6"><tr style="background:#f1f5f9"><th align="left">Item</th>${th}</tr>${rows}
<tr><td>Frete</td>${m.fornecedores.map((f) => `<td align="right">${brl(linha(f.id)?.frete)}</td>`).join('')}</tr>
<tr style="font-weight:700"><td>Total</td>${m.fornecedores.map((f) => `<td align="right">${brl(linha(f.id)?.total)}</td>`).join('')}</tr>
<tr><td>Prazo de entrega</td>${m.fornecedores.map((f) => `<td align="right">${linha(f.id)?.prazoEntregaDias ?? '—'}</td>`).join('')}</tr></table>
${escolha ? `<h3>Escolha</h3><p><b>${esc(String(escolha.fornecedor))}</b> — ${brl(escolha.valor)}${escolha.economia != null ? ` (economia ${brl(escolha.economia)})` : ''}</p><p><b>Justificativa:</b> ${esc(escolha.justificativa || (escolha.fornecedorId === escolha.sugeridoId ? 'Melhor proposta pelo critério adotado.' : '—'))}</p>` : '<p><i>Cotação ainda não encerrada.</i></p>'}
${compra ? `<p><b>Compra:</b> ${esc(compra.numero)} — ${brl(compra.valorTotal)} — ${esc(compra.formaPagamento)} — ${esc(compra.status)}</p>` : ''}
<div style="display:flex;gap:40px;margin-top:60px"><div style="flex:1;border-top:1px solid #000;text-align:center">Comprador</div><div style="flex:1;border-top:1px solid #000;text-align:center">Aprovador</div></div></div></body>`)
  }))
}

async function validarDepartamento(tenantId: string, d: any) {
  if (d.centroCustoId) {
    const cc = await prisma.eduCostCenter.findFirst({ where: { id: d.centroCustoId, tenantId }, select: { id: true } })
    if (!cc) throw httpErr(404, 'Centro de custo não encontrado.')
  }
  if (d.responsavelUserId) {
    const u = await prisma.user.findFirst({ where: { id: d.responsavelUserId, tenantId }, select: { id: true } })
    if (!u) throw httpErr(404, 'Responsável (usuário) não encontrado.')
  }
}

export { round2 }
