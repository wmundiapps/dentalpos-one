import { Router } from 'express'
import { z } from 'zod'
import { adapter } from '../adapter'
import { empresaDoTenant } from '../empresas/service'
import { auditar } from '../nucleo/auditoria'
import { prisma } from '../nucleo/db'
import { paginaHtml } from '../nucleo/html'
import { asyncHandler, httpError, pageParams, parseBody, qs } from '../nucleo/http'
import { ctxDe, exigir } from '../nucleo/rbac'
import { brl, dia, esc, hojeMeioDia, iso10, pct } from '../nucleo/util'
import { estornar, lancar } from './lancamentos'
import { garantirPlano } from './plano'
import { balancete, csv, dre } from './relatorios'

const router = Router()
const dataStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use AAAA-MM-DD')
const periodo = (req: any) => {
  const hoje = hojeMeioDia()
  const de = dia(qs(req.query.de) ?? `${hoje.getUTCFullYear()}-01-01`)
  const ate = new Date(dia(qs(req.query.ate) ?? iso10(hoje)).getTime() + 11 * 3600_000 + 59 * 60_000)   // fim do dia
  if (de > ate) throw httpError(400, 'A data inicial é posterior à final.')
  if (ate.getTime() - de.getTime() > 800 * 86_400_000) throw httpError(400, 'Período máximo de 800 dias.')
  return { de, ate }
}
const empresaQ = async (req: any) => {
  const c = ctxDe(req)
  const id = qs(req.query.empresaId)
  if (!id) throw httpError(400, 'Informe empresaId.')
  const e = await empresaDoTenant(c.tenantId, id)
  await garantirPlano(c.tenantId, e.id)
  return { c, e }
}

// ---------------- plano de contas ----------------
router.get('/plano', asyncHandler(async (req, res) => {
  const { c, e } = await empresaQ(req)
  res.json({ items: await prisma.ctbPlanoConta.findMany({ where: { tenantId: c.tenantId, empresaId: e.id }, orderBy: { codigo: 'asc' } }) })
}))

router.post('/plano', exigir('contabil.lancar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({
    empresaId: z.string().min(1), codigo: z.string().regex(/^\d(\.\d{1,2}){0,3}$/, 'código no formato 1.1.1.01'), nome: z.string().trim().min(2).max(120),
    tipo: z.enum(['ATIVO', 'PASSIVO', 'PL', 'RECEITA', 'CUSTO', 'DESPESA']), natureza: z.enum(['D', 'C']), analitica: z.boolean().default(true),
  }), req.body)
  const e = await empresaDoTenant(c.tenantId, b.empresaId)
  await garantirPlano(c.tenantId, e.id)
  if (await prisma.ctbPlanoConta.findFirst({ where: { tenantId: c.tenantId, empresaId: e.id, codigo: b.codigo } })) throw httpError(409, 'Já existe uma conta com este código.')
  const pai = b.codigo.includes('.') ? b.codigo.slice(0, b.codigo.lastIndexOf('.')) : null
  if (pai && !(await prisma.ctbPlanoConta.findFirst({ where: { tenantId: c.tenantId, empresaId: e.id, codigo: pai, analitica: false } }))) throw httpError(400, `A conta pai ${pai} não existe ou não é sintética.`)
  const r = await prisma.ctbPlanoConta.create({ data: { tenantId: c.tenantId, empresaId: e.id, codigo: b.codigo, nome: b.nome, tipo: b.tipo, natureza: b.natureza, analitica: b.analitica } })
  await auditar(c, 'plano.criar-conta', { entidade: 'CtbPlanoConta', entidadeId: r.id, empresaId: e.id, detalhes: { codigo: b.codigo } })
  res.status(201).json(r)
}))

router.patch('/plano/:id', exigir('contabil.lancar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ nome: z.string().trim().min(2).max(120).optional(), ativo: z.boolean().optional() }), req.body)
  const x = await prisma.ctbPlanoConta.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!x) throw httpError(404, 'Conta não encontrada.')
  const r = await prisma.ctbPlanoConta.update({ where: { id: x.id }, data: b })
  await auditar(c, 'plano.alterar-conta', { entidade: 'CtbPlanoConta', entidadeId: x.id, empresaId: x.empresaId, detalhes: b })
  res.json(r)
}))

// ---------------- lançamentos ----------------
router.get('/lancamentos', asyncHandler(async (req, res) => {
  const { c, e } = await empresaQ(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const { de, ate } = periodo(req)
  const where: any = { tenantId: c.tenantId, empresaId: e.id, data: { gte: de, lte: ate } }
  const conta = qs(req.query.conta)
  if (conta) { const ids = await prisma.ctbPartida.findMany({ where: { tenantId: c.tenantId, empresaId: e.id, contaCodigo: conta, data: { gte: de, lte: ate } }, select: { lancamentoId: true }, take: 5000 }); where.id = { in: ids.map((x) => x.lancamentoId) } }
  if (qs(req.query.origem)) where.origem = qs(req.query.origem)
  const [total, itens] = await Promise.all([prisma.ctbLancamento.count({ where }), prisma.ctbLancamento.findMany({ where, orderBy: [{ data: 'desc' }, { numero: 'desc' }], skip, take })])
  const partidas = await prisma.ctbPartida.findMany({ where: { tenantId: c.tenantId, lancamentoId: { in: itens.map((i) => i.id) } } })
  res.json({ total, page, pageSize, items: itens.map((l) => ({ ...l, partidas: partidas.filter((p) => p.lancamentoId === l.id).map((p) => ({ conta: p.contaCodigo, tipo: p.tipo, valor: p.valor })) })) })
}))

router.post('/lancamentos', exigir('contabil.lancar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({
    empresaId: z.string().min(1), data: dataStr, historico: z.string().trim().min(3).max(300),
    partidas: z.array(z.object({ conta: z.string().min(1).max(20), tipo: z.enum(['D', 'C']), valor: z.number().positive().max(1e10) })).min(2).max(40),
  }), req.body)
  const e = await empresaDoTenant(c.tenantId, b.empresaId)
  await garantirPlano(c.tenantId, e.id)
  const l = await lancar(c.tenantId, e.id, c.userId, { data: dia(b.data), historico: b.historico, origem: 'MANUAL', partidas: b.partidas })
  await auditar(c, 'lancamento.criar', { entidade: 'CtbLancamento', entidadeId: l.id, empresaId: e.id, detalhes: { numero: l.numero, partidas: b.partidas.length } })
  res.status(201).json(l)
}))

router.post('/lancamentos/:id/estornar', exigir('contabil.lancar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ motivo: z.string().trim().min(5).max(300), data: dataStr.optional() }), req.body)
  const l = await prisma.ctbLancamento.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!l) throw httpError(404, 'Lançamento não encontrado.')
  const novo = await estornar(c.tenantId, l.empresaId, c.userId, l.id, b.motivo, dia(b.data ?? iso10(new Date())))
  await auditar(c, 'lancamento.estornar', { entidade: 'CtbLancamento', entidadeId: l.id, empresaId: l.empresaId, detalhes: { numero: l.numero, motivo: b.motivo, estorno: novo.numero } })
  res.status(201).json(novo)
}))

// ---------------- relatórios ----------------
router.get('/balancete', asyncHandler(async (req, res) => {
  const { c, e } = await empresaQ(req)
  const { de, ate } = periodo(req)
  const r = await balancete(c.tenantId, e.id, de, ate, qs(req.query.todas) === 'true')
  const f = qs(req.query.formato)
  if (f === 'csv') {
    res.type('text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="balancete-${iso10(de)}-${iso10(ate)}.csv"`)
    return res.send(csv([['Código', 'Conta', 'Saldo anterior', 'Débitos', 'Créditos', 'Saldo atual'], ...r.linhas.map((l) => [l.codigo, l.nome, String(l.saldoAnterior).replace('.', ','), String(l.debitos).replace('.', ','), String(l.creditos).replace('.', ','), String(l.saldoAtual).replace('.', ',')])]))
  }
  if (f === 'html') {
    const corpo = `<table><tr><th>Código</th><th>Conta</th><th class="n">Saldo anterior</th><th class="n">Débitos</th><th class="n">Créditos</th><th class="n">Saldo atual</th></tr>${r.linhas.map((l) => `<tr style="${l.analitica ? '' : 'font-weight:700;background:#fafafa'}"><td>${esc(l.codigo)}</td><td>${esc(l.nome)}</td><td class="n">${brl(l.saldoAnterior)}</td><td class="n">${brl(l.debitos)}</td><td class="n">${brl(l.creditos)}</td><td class="n">${brl(l.saldoAtual)}</td></tr>`).join('')}</table><p>Total de débitos ${brl(r.totais.debitos)} · créditos ${brl(r.totais.creditos)} · ${r.totais.equilibrado ? 'balancete equilibrado' : 'ATENÇÃO: não equilibrado'}.</p>`
    return res.type('html').send(paginaHtml('Balancete de verificação', corpo, { instituicao: await adapter().nomeInstituicao(c.tenantId), subtitulo: `${e.razaoSocial} · ${iso10(de)} a ${iso10(ate)}` }))
  }
  res.json({ empresaId: e.id, ...r })
}))

router.get('/dre', asyncHandler(async (req, res) => {
  const { c, e } = await empresaQ(req)
  const { de, ate } = periodo(req)
  const modo = qs(req.query.modo) === 'mensal' ? 'mensal' : 'periodo'
  const comparar = qs(req.query.comparar) === 'ano' ? 'ano' : qs(req.query.comparar) === 'anterior' ? 'anterior' : null
  const r = await dre(c.tenantId, e.id, { de, ate, modo, comparar })
  const f = qs(req.query.formato)
  const fmt = (l: any, v: number) => (l.tipo === 'percentual' ? pct(v) : brl(v))
  if (f === 'csv') {
    res.type('text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="dre-${iso10(de)}-${iso10(ate)}.csv"`)
    const cab = ['Linha', ...r.colunas, ...(r.comparativo ? [r.comparativo.rotulo, 'Variação'] : [])]
    return res.send(csv([cab, ...r.linhas.map((l, i) => [l.nome, ...l.valores.map((v) => String(v).replace('.', ',')), ...(r.comparativo ? [String(r.comparativo.linhas[i].valores[0]).replace('.', ','), r.comparativo.variacao[i].percentual[0] == null ? '' : String(r.comparativo.variacao[i].percentual[0]).replace('.', ',') + '%'] : [])])]))
  }
  if (f === 'html') {
    const corpo = `<table><tr><th>Demonstração do resultado</th>${r.colunas.map((x) => `<th class="n">${esc(x)}</th>`).join('')}${r.comparativo ? `<th class="n">${esc(r.comparativo.rotulo)}</th><th class="n">Variação</th>` : ''}</tr>
      ${r.linhas.map((l, i) => `<tr style="${l.tipo === 'valor' && l.nivel === 2 ? 'color:#555' : l.tipo === 'valor' ? '' : 'font-weight:700;background:#f7f7f7'}"><td style="padding-left:${8 + l.nivel * 14}px">${esc(l.nome)}</td>${l.valores.map((v) => `<td class="n">${fmt(l, v)}</td>`).join('')}${r.comparativo ? `<td class="n">${fmt(l, r.comparativo.linhas[i].valores[0])}</td><td class="n">${r.comparativo.variacao[i].percentual[0] == null ? '—' : pct(r.comparativo.variacao[i].percentual[0]!)}</td>` : ''}</tr>`).join('')}</table>`
    return res.type('html').send(paginaHtml('DRE — Demonstração do Resultado do Exercício', corpo, { instituicao: await adapter().nomeInstituicao(c.tenantId), subtitulo: `${e.razaoSocial} · ${iso10(de)} a ${iso10(ate)}` }))
  }
  res.json({ empresaId: e.id, ...r })
}))

export default router
