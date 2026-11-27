import { Router } from 'express'
import { z } from 'zod'
import { adapter } from '../adapter'
import { garantirPlano } from '../contabilidade/plano'
import { lancar } from '../contabilidade/lancamentos'
import { empresaDoTenant } from '../empresas/service'
import { auditar } from '../nucleo/auditoria'
import { prisma } from '../nucleo/db'
import { asyncHandler, httpError, pageParams, parseBody, qs } from '../nucleo/http'
import { kv, paginaHtml } from '../nucleo/html'
import { ctxDe, exigir } from '../nucleo/rbac'
import { brl, dia, fmtDoc, hojeMeioDia, iso10, r2 } from '../nucleo/util'
import { ETAPAS, executarRegua, provedorCobranca, registrarCobranca } from './cobranca'
import { MAX_LINHAS, lerCsv, lerOfx, sugerir } from './conciliacao'
import { baixarTitulo, cancelarTitulo, criarTitulo, diasAtrasoDe, situacaoDe } from './titulos'
import { CONTA } from '../contabilidade/plano'

const router = Router()
const dataStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use AAAA-MM-DD')

const comSituacao = (t: any) => ({ ...t, situacao: situacaoDe(t), diasAtraso: diasAtrasoDe(t) })

// ---------------- títulos (contas a pagar / a receber) ----------------
const tituloSchema = z.object({
  empresaId: z.string().min(1), tipo: z.enum(['PAGAR', 'RECEBER']), descricao: z.string().trim().min(2).max(200), parceiroNome: z.string().trim().min(2).max(160),
  parceiroDoc: z.string().max(20).nullish(), parceiroEmail: z.string().email().max(160).nullish(), parceiroTelefone: z.string().max(30).nullish(),
  valor: z.number().positive().max(1e9), emissao: dataStr.optional(), vencimento: dataStr, categoria: z.string().max(80).nullish(), contaContabilCodigo: z.string().max(20).nullish(),
  notaId: z.string().nullish(), lancar: z.boolean().optional(),
  /** Cadastro de título JÁ liquidado (importação de histórico): cria e baixa na mesma chamada. */
  pagoEm: dataStr.optional(), formaPagamento: z.string().max(40).nullish(),
})

router.get('/titulos', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId: c.tenantId }
  const emp = qs(req.query.empresaId); if (emp) where.empresaId = emp
  const tipo = qs(req.query.tipo); if (tipo === 'PAGAR' || tipo === 'RECEBER') where.tipo = tipo
  const st = qs(req.query.status), hoje = hojeMeioDia()
  if (st === 'VENCIDO') { where.status = 'ABERTO'; where.vencimento = { lt: hoje } }
  else if (st === 'ABERTO') { where.status = 'ABERTO'; where.vencimento = { gte: hoje } }
  else if (st === 'PAGO' || st === 'CANCELADO') where.status = st
  const de = qs(req.query.de), ate = qs(req.query.ate)
  if (de || ate) where.vencimento = { ...(where.vencimento ?? {}), ...(de ? { gte: dia(de) } : {}), ...(ate ? { lte: dia(ate) } : {}) }
  const q = qs(req.query.q); if (q) where.OR = [{ descricao: { contains: q, mode: 'insensitive' } }, { parceiroNome: { contains: q, mode: 'insensitive' } }]
  const [total, items, ab] = await Promise.all([
    prisma.ctbTitulo.count({ where }), prisma.ctbTitulo.findMany({ where, orderBy: { vencimento: 'asc' }, skip, take }),
    prisma.ctbTitulo.aggregate({ where, _sum: { valor: true } }),
  ])
  res.json({ total, page, pageSize, somaValor: r2(ab._sum.valor ?? 0), items: items.map(comSituacao) })
}))

router.get('/titulos/:id', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const t = await prisma.ctbTitulo.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!t) throw httpError(404, 'Título não encontrado.')
  const cobrancas = await prisma.ctbCobranca.findMany({ where: { tenantId: c.tenantId, tituloId: t.id }, orderBy: { createdAt: 'desc' }, take: 30 })
  res.json({ ...comSituacao(t), cobrancasHistorico: cobrancas })
}))

router.post('/titulos', exigir('financeiro.escrever'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(tituloSchema, req.body)
  const e = await empresaDoTenant(c.tenantId, b.empresaId)
  if (b.notaId) { const n = await prisma.ctbNota.findFirst({ where: { id: b.notaId, tenantId: c.tenantId, empresaId: e.id } }); if (!n) throw httpError(404, 'Nota informada não encontrada nesta empresa.') }
  if (b.pagoEm && dia(b.pagoEm) > new Date(Date.now() + 86_400_000)) throw httpError(400, 'A data de pagamento não pode estar no futuro.')
  let t = await criarTitulo(c, e, { ...b, parceiroDoc: b.parceiroDoc ?? null, emissao: dia(b.emissao ?? iso10(new Date())), vencimento: dia(b.vencimento) })
  if (b.pagoEm) t = await baixarTitulo(c, t, { pagoEm: dia(b.pagoEm), formaPagamento: b.formaPagamento ?? null })
  if (b.notaId) await prisma.ctbNota.updateMany({ where: { id: b.notaId, tenantId: c.tenantId }, data: { tituloId: t.id } })
  await auditar(c, 'titulo.criar', { entidade: 'CtbTitulo', entidadeId: t.id, empresaId: e.id, detalhes: { tipo: t.tipo, valor: t.valor, vencimento: iso10(t.vencimento) } })
  res.status(201).json(comSituacao(t))
}))

router.patch('/titulos/:id', exigir('financeiro.escrever'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const t = await prisma.ctbTitulo.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!t) throw httpError(404, 'Título não encontrado.')
  if (t.status !== 'ABERTO') throw httpError(409, 'Só é possível alterar título em aberto.')
  const b = parseBody(z.object({ vencimento: dataStr.optional(), parceiroEmail: z.string().email().nullish(), parceiroTelefone: z.string().max(30).nullish(), descricao: z.string().trim().min(2).max(200).optional() }), req.body)
  const r = await prisma.ctbTitulo.update({ where: { id: t.id }, data: { ...(b.vencimento ? { vencimento: dia(b.vencimento) } : {}), ...(b.parceiroEmail !== undefined ? { parceiroEmail: b.parceiroEmail } : {}), ...(b.parceiroTelefone !== undefined ? { parceiroTelefone: b.parceiroTelefone } : {}), ...(b.descricao ? { descricao: b.descricao } : {}) } })
  await auditar(c, 'titulo.alterar', { entidade: 'CtbTitulo', entidadeId: t.id, empresaId: t.empresaId, detalhes: b })
  res.json(comSituacao(r))
}))

router.post('/titulos/:id/baixar', exigir('financeiro.escrever'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const t = await prisma.ctbTitulo.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!t) throw httpError(404, 'Título não encontrado.')
  const b = parseBody(z.object({ pagoEm: dataStr.optional(), valorPago: z.number().positive().max(1e9).optional(), formaPagamento: z.string().max(40).nullish() }), req.body ?? {})
  const r = await baixarTitulo(c, t, { pagoEm: dia(b.pagoEm ?? iso10(new Date())), valorPago: b.valorPago, formaPagamento: b.formaPagamento })
  await auditar(c, 'titulo.baixar', { entidade: 'CtbTitulo', entidadeId: t.id, empresaId: t.empresaId, detalhes: { valor: t.valor, valorPago: r.valorPago } })
  res.json(comSituacao(r))
}))

router.post('/titulos/:id/cancelar', exigir('financeiro.escrever'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const t = await prisma.ctbTitulo.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!t) throw httpError(404, 'Título não encontrado.')
  const b = parseBody(z.object({ motivo: z.string().trim().min(5).max(300) }), req.body)
  const r = await cancelarTitulo(c, t, b.motivo)
  await auditar(c, 'titulo.cancelar', { entidade: 'CtbTitulo', entidadeId: t.id, empresaId: t.empresaId, detalhes: { motivo: b.motivo } })
  res.json(comSituacao(r))
}))

router.get('/titulos/:id/segunda-via', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const t = await prisma.ctbTitulo.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!t) throw httpError(404, 'Título não encontrado.')
  if (t.tipo !== 'RECEBER') throw httpError(400, 'Segunda via só existe para contas a receber.')
  const e = await empresaDoTenant(c.tenantId, t.empresaId)
  const s = comSituacao(t)
  await prisma.ctbCobranca.create({ data: { tenantId: c.tenantId, empresaId: t.empresaId, tituloId: t.id, etapa: 'SEGUNDA_VIA', canal: 'EMAIL', assunto: 'Segunda via', mensagem: 'Segunda via emitida (documento de cobrança sem boleto bancário).', status: 'SIMULADO', criadoPorId: c.userId } })
  const html = paginaHtml('Segunda via de cobrança', `${kv([['Emitente', `${e.razaoSocial} (${fmtDoc(e.documento)})`], ['Cliente', t.parceiroNome], ['Documento', fmtDoc(t.parceiroDoc)], ['Descrição', t.descricao], ['Vencimento', iso10(t.vencimento).split('-').reverse().join('/')], ['Valor', brl(t.valor)], ['Situação', s.situacao + (s.diasAtraso ? ` (${s.diasAtraso} dias de atraso)` : '')]])}
    <p>Este documento é uma <b>segunda via de cobrança sem boleto bancário</b>: não contém linha digitável nem código de barras. Para pagar, use os dados bancários combinados com o emitente.</p>`, { instituicao: await adapter().nomeInstituicao(c.tenantId), simulacao: true, subtitulo: 'Cobrança' })
  res.type('html').send(html)
}))

// ---------------- cobrança (régua, simulada) ----------------
router.get('/cobranca/regua', asyncHandler(async (_req, res) => { res.json({ etapas: ETAPAS, provedor: { nome: provedorCobranca().nome, simulado: provedorCobranca().simulado }, aviso: 'Envio SIMULADO: as mensagens são registradas, mas nada é enviado por e-mail ou WhatsApp.' }) }))

router.post('/cobranca/executar-regua', exigir('financeiro.escrever'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ empresaId: z.string().min(1) }), req.body)
  const e = await empresaDoTenant(c.tenantId, b.empresaId)
  const r = await executarRegua(c, e)
  await auditar(c, 'cobranca.regua', { empresaId: e.id, detalhes: { avaliados: r.avaliados, enviados: r.enviados } })
  res.json(r)
}))

router.post('/titulos/:id/cobrar', exigir('financeiro.escrever'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const t = await prisma.ctbTitulo.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!t) throw httpError(404, 'Título não encontrado.')
  if (t.tipo !== 'RECEBER' || t.status !== 'ABERTO') throw httpError(409, 'Só é possível cobrar contas a receber em aberto.')
  const b = parseBody(z.object({ canal: z.enum(['EMAIL', 'WHATSAPP']), mensagem: z.string().trim().min(5).max(1000).optional() }), req.body)
  const e = await empresaDoTenant(c.tenantId, t.empresaId)
  const r = await registrarCobranca(c, t, e.razaoSocial, 'MANUAL', b.canal, b.mensagem)
  await auditar(c, 'cobranca.manual', { entidade: 'CtbTitulo', entidadeId: t.id, empresaId: t.empresaId, detalhes: { canal: b.canal } })
  res.status(201).json({ ...r, simulado: true })
}))

router.get('/cobrancas', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId: c.tenantId }
  if (qs(req.query.empresaId)) where.empresaId = qs(req.query.empresaId)
  if (qs(req.query.tituloId)) where.tituloId = qs(req.query.tituloId)
  const [total, items] = await Promise.all([prisma.ctbCobranca.count({ where }), prisma.ctbCobranca.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take })])
  res.json({ total, page, pageSize, items })
}))

// ---------------- contas bancárias e extrato ----------------
router.get('/contas-bancarias', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const where: any = { tenantId: c.tenantId }
  if (qs(req.query.empresaId)) where.empresaId = qs(req.query.empresaId)
  res.json({ items: await prisma.ctbContaBancaria.findMany({ where, orderBy: { apelido: 'asc' } }) })
}))

router.post('/contas-bancarias', exigir('conciliar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ empresaId: z.string().min(1), apelido: z.string().trim().min(2).max(80), banco: z.string().max(60).nullish(), agencia: z.string().max(20).nullish(), conta: z.string().max(30).nullish(), saldoInicial: z.number().min(-1e10).max(1e10).default(0) }), req.body)
  const e = await empresaDoTenant(c.tenantId, b.empresaId)
  const r = await prisma.ctbContaBancaria.create({ data: { ...b, tenantId: c.tenantId } })
  await auditar(c, 'banco.criar', { entidade: 'CtbContaBancaria', entidadeId: r.id, empresaId: e.id })
  res.status(201).json(r)
}))

router.post('/contas-bancarias/:id/importar', exigir('conciliar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const cb = await prisma.ctbContaBancaria.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!cb) throw httpError(404, 'Conta bancária não encontrada.')
  const b = parseBody(z.object({ formato: z.enum(['OFX', 'CSV']), conteudo: z.string().min(10).max(2_500_000) }), req.body)
  const lido = b.formato === 'OFX' ? lerOfx(b.conteudo) : lerCsv(b.conteudo)
  if (!lido.linhas.length) throw httpError(400, `Nenhuma linha válida encontrada no arquivo ${b.formato}${lido.invalidas ? ` (${lido.invalidas} linha(s) ignoradas)` : ''}.`)
  const r = await prisma.ctbExtrato.createMany({ data: lido.linhas.map((l) => ({ tenantId: c.tenantId, empresaId: cb.empresaId, contaBancariaId: cb.id, data: l.data, descricao: l.descricao, valor: l.valor, fitid: l.fitid })), skipDuplicates: true })
  const resumo = { lidas: lido.linhas.length, importadas: r.count, duplicadas: lido.linhas.length - r.count, invalidas: lido.invalidas, limite: MAX_LINHAS }
  await auditar(c, 'extrato.importar', { entidade: 'CtbContaBancaria', entidadeId: cb.id, empresaId: cb.empresaId, detalhes: { formato: b.formato, ...resumo } })
  res.status(201).json(resumo)
}))

router.get('/extrato', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId: c.tenantId }
  for (const k of ['empresaId', 'contaBancariaId'] as const) if (qs(req.query[k])) where[k] = qs(req.query[k])
  const st = qs(req.query.status); if (st) where.status = st
  const [total, items, pend] = await Promise.all([
    prisma.ctbExtrato.count({ where }), prisma.ctbExtrato.findMany({ where, orderBy: [{ data: 'desc' }, { createdAt: 'desc' }], skip, take }),
    prisma.ctbExtrato.groupBy({ by: ['status'], where: { ...where, status: undefined }, _count: { _all: true }, _sum: { valor: true } }),
  ])
  const pendentes = items.filter((i) => i.status === 'PENDENTE')
  let sugestoes: Record<string, any[]> = {}
  if (pendentes.length) {
    const empIds = [...new Set(pendentes.map((p) => p.empresaId))]
    const titulos = await prisma.ctbTitulo.findMany({ where: { tenantId: c.tenantId, empresaId: { in: empIds }, status: 'ABERTO' }, select: { id: true, empresaId: true, tipo: true, valor: true, vencimento: true, descricao: true, parceiroNome: true }, take: 3000 })
    sugestoes = Object.fromEntries(pendentes.map((p) => [p.id, sugerir(p, titulos.filter((t) => t.empresaId === p.empresaId))]))
  }
  res.json({ total, page, pageSize, resumo: pend.map((g) => ({ status: g.status, quantidade: g._count._all, soma: r2(g._sum.valor ?? 0) })), items: items.map((i) => ({ ...i, sugestoes: sugestoes[i.id] ?? [] })) })
}))

async function linhaPendente(c: { tenantId: string }, id: string) {
  const l = await prisma.ctbExtrato.findFirst({ where: { id, tenantId: c.tenantId } })
  if (!l) throw httpError(404, 'Linha de extrato não encontrada.')
  if (l.status !== 'PENDENTE') throw httpError(409, `Esta linha já está ${l.status.toLowerCase()}.`)
  return l
}

async function conciliarLinha(c: ReturnType<typeof ctxDe>, l: any, tituloId: string) {
  const t = await prisma.ctbTitulo.findFirst({ where: { id: tituloId, tenantId: c.tenantId, empresaId: l.empresaId } })
  if (!t) throw httpError(404, 'Título não encontrado nesta empresa.')
  if (t.status !== 'ABERTO') throw httpError(409, 'O título não está em aberto.')
  if ((l.valor > 0) !== (t.tipo === 'RECEBER')) throw httpError(409, l.valor > 0 ? 'Entrada no extrato só concilia com conta a receber.' : 'Saída no extrato só concilia com conta a pagar.')
  const titulo = await baixarTitulo(c, t, { pagoEm: l.data, valorPago: Math.abs(l.valor), formaPagamento: 'CONCILIACAO', extratoId: l.id })
  const upd = await prisma.ctbExtrato.updateMany({ where: { id: l.id, status: 'PENDENTE' }, data: { status: 'CONCILIADO', tituloId: t.id, conciliadoPorId: c.userId, conciliadoEm: new Date() } })
  if (upd.count !== 1) throw httpError(409, 'A linha foi conciliada por outra pessoa.')
  await auditar(c, 'extrato.conciliar', { entidade: 'CtbExtrato', entidadeId: l.id, empresaId: l.empresaId, detalhes: { tituloId: t.id, valor: l.valor } })
  return titulo
}

router.post('/extrato/:id/conciliar', exigir('conciliar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ tituloId: z.string().min(1) }), req.body)
  const l = await linhaPendente(c, String(req.params.id))
  const t = await conciliarLinha(c, l, b.tituloId)
  res.json({ ok: true, titulo: comSituacao(t) })
}))

router.post('/extrato/:id/ajustar', exigir('conciliar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ contaCodigo: z.string().min(1).max(20), historico: z.string().trim().max(200).optional() }), req.body)
  const l = await linhaPendente(c, String(req.params.id))
  await garantirPlano(c.tenantId, l.empresaId)
  const abs = Math.abs(l.valor)
  const lanc = await lancar(c.tenantId, l.empresaId, c.userId, {
    data: l.data, historico: b.historico || `Ajuste de conciliação: ${l.descricao}`, origem: 'CONCILIACAO', refId: l.id,
    partidas: l.valor > 0 ? [{ conta: CONTA.BANCO, tipo: 'D', valor: abs }, { conta: b.contaCodigo, tipo: 'C', valor: abs }] : [{ conta: b.contaCodigo, tipo: 'D', valor: abs }, { conta: CONTA.BANCO, tipo: 'C', valor: abs }],
  })
  const upd = await prisma.ctbExtrato.updateMany({ where: { id: l.id, status: 'PENDENTE' }, data: { status: 'AJUSTADO', lancamentoId: lanc.id, observacao: b.historico ?? null, conciliadoPorId: c.userId, conciliadoEm: new Date() } })
  if (upd.count !== 1) throw httpError(409, 'A linha foi tratada por outra pessoa.')
  await auditar(c, 'extrato.ajustar', { entidade: 'CtbExtrato', entidadeId: l.id, empresaId: l.empresaId, detalhes: { contaCodigo: b.contaCodigo, valor: l.valor, lancamento: lanc.numero } })
  res.json({ ok: true, lancamentoNumero: lanc.numero })
}))

router.post('/extrato/:id/ignorar', exigir('conciliar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ observacao: z.string().trim().max(200).optional() }), req.body ?? {})
  const l = await linhaPendente(c, String(req.params.id))
  await prisma.ctbExtrato.update({ where: { id: l.id }, data: { status: 'IGNORADO', observacao: b.observacao ?? null, conciliadoPorId: c.userId, conciliadoEm: new Date() } })
  await auditar(c, 'extrato.ignorar', { entidade: 'CtbExtrato', entidadeId: l.id, empresaId: l.empresaId })
  res.json({ ok: true })
}))

router.post('/extrato/:id/reabrir', exigir('conciliar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const l = await prisma.ctbExtrato.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!l) throw httpError(404, 'Linha de extrato não encontrada.')
  if (l.status !== 'IGNORADO') throw httpError(409, 'Só linhas ignoradas podem ser reabertas (conciliações geram lançamentos; estorne-os para desfazer).')
  await prisma.ctbExtrato.update({ where: { id: l.id }, data: { status: 'PENDENTE', conciliadoPorId: null, conciliadoEm: null } })
  await auditar(c, 'extrato.reabrir', { entidade: 'CtbExtrato', entidadeId: l.id, empresaId: l.empresaId })
  res.json({ ok: true })
}))

/** Concilia sozinho só o que é inequívoco (pontuação ≥ 90 e única); o restante fica para revisão humana. */
router.post('/conciliacao/auto', exigir('conciliar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ empresaId: z.string().min(1), minimo: z.number().min(80).max(100).default(90) }), req.body)
  const e = await empresaDoTenant(c.tenantId, b.empresaId)
  const linhas = await prisma.ctbExtrato.findMany({ where: { tenantId: c.tenantId, empresaId: e.id, status: 'PENDENTE' }, orderBy: { data: 'asc' }, take: 1000 })
  const titulos = await prisma.ctbTitulo.findMany({ where: { tenantId: c.tenantId, empresaId: e.id, status: 'ABERTO' }, select: { id: true, tipo: true, valor: true, vencimento: true, descricao: true, parceiroNome: true } })
  const usados = new Set<string>()
  let conciliadas = 0, revisar = 0
  for (const l of linhas) {
    const s = sugerir(l, titulos.filter((t) => !usados.has(t.id)))
    const top = s[0]
    if (top && top.score >= b.minimo && !(s[1] && s[1].score >= top.score)) {
      try { await conciliarLinha(c, l, top.tituloId); usados.add(top.tituloId); conciliadas++ } catch { revisar++ }
    } else revisar++
  }
  await auditar(c, 'extrato.conciliar-auto', { empresaId: e.id, detalhes: { conciliadas, revisar, minimo: b.minimo } })
  res.json({ avaliadas: linhas.length, conciliadas, revisar })
}))

export default router
