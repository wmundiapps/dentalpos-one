import { Router } from 'express'
import { z } from 'zod'
import { adapter } from '../adapter'
import { criarTitulo } from '../financeiro/titulos'
import { empresaDoTenant } from '../empresas/service'
import { auditar } from '../nucleo/auditoria'
import { prisma } from '../nucleo/db'
import { valorPorExtenso } from '../nucleo/extenso'
import { kv, paginaHtml } from '../nucleo/html'
import { asyncHandler, httpError, pageParams, parseBody, qs } from '../nucleo/http'
import { ctxDe, exigir } from '../nucleo/rbac'
import { proximoNumero } from '../nucleo/sequencia'
import { brl, competenciaDe, dia, esc, fmtDoc, iso10, r2, soDigitos } from '../nucleo/util'
import { provedorFiscal } from './provedor'
import { MAX_XML, lerXmlNota } from './xml'

const router = Router()
const dataStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use AAAA-MM-DD')
const TIPOS = ['NFE', 'NFSE', 'NFCE'] as const

const itemSchema = z.object({ descricao: z.string().trim().min(1).max(200), quantidade: z.number().positive().max(1e7).default(1), valorUnitario: z.number().min(0).max(1e9) })
const impostosSchema = z.object({ iss: z.number().min(0).optional(), icms: z.number().min(0).optional(), pis: z.number().min(0).optional(), cofins: z.number().min(0).optional(), irrf: z.number().min(0).optional(), inss: z.number().min(0).optional(), csll: z.number().min(0).optional() }).partial()

const emitirSchema = z.object({
  empresaId: z.string().min(1), tipo: z.enum(TIPOS), serie: z.string().trim().min(1).max(5).default('1'),
  parceiroNome: z.string().trim().min(2).max(160), parceiroDoc: z.string().max(20).nullish(), descricao: z.string().trim().max(500).nullish(),
  itens: z.array(itemSchema).min(1).max(100), impostos: impostosSchema.optional(),
  gerarTitulo: z.boolean().default(false), vencimento: dataStr.optional(), emissao: dataStr.optional(),
})

const resumo = (n: any) => ({ ...n, xml: undefined, temXml: !!n.xml })

router.get('/provedores-fiscais', asyncHandler(async (_req, res) => {
  res.json({ nome: provedorFiscal().nome, simulado: provedorFiscal().simulado, aviso: 'Emissão SIMULADA: nenhuma nota é transmitida à SEFAZ, prefeitura ou Ambiente Nacional. Integração real exige certificado digital A1 e provedor próprio (ver README).' })
}))

router.get('/notas', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId: c.tenantId }
  for (const k of ['empresaId', 'direcao', 'tipo', 'status'] as const) if (qs(req.query[k])) where[k] = qs(req.query[k])
  const de = qs(req.query.de), ate = qs(req.query.ate)
  if (de || ate) where.emitidaEm = { ...(de ? { gte: dia(de) } : {}), ...(ate ? { lte: new Date(dia(ate).getTime() + 12 * 3600_000) } : {}) }
  const q = qs(req.query.q); if (q) where.OR = [{ parceiroNome: { contains: q, mode: 'insensitive' } }, { descricao: { contains: q, mode: 'insensitive' } }]
  const [total, items, soma] = await Promise.all([prisma.ctbNota.count({ where }), prisma.ctbNota.findMany({ where, orderBy: [{ emitidaEm: 'desc' }, { createdAt: 'desc' }], skip, take }), prisma.ctbNota.aggregate({ where: { ...where, status: { not: 'CANCELADA' } }, _sum: { valorTotal: true } })])
  res.json({ total, page, pageSize, somaValor: r2(soma._sum.valorTotal ?? 0), items: items.map(resumo) })
}))

router.get('/notas/:id', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const n = await prisma.ctbNota.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!n) throw httpError(404, 'Nota não encontrada.')
  res.json(resumo(n))
}))

/** Emissão SIMULADA de nota de saída com numeração sequencial por empresa/tipo/série. */
router.post('/notas/emitir', exigir('nota.emitir'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(emitirSchema, req.body)
  const e = await empresaDoTenant(c.tenantId, b.empresaId)
  if (!e.ativo) throw httpError(409, 'Empresa inativa.')
  if (b.parceiroDoc && soDigitos(b.parceiroDoc).length && ![11, 14].includes(soDigitos(b.parceiroDoc).length)) throw httpError(400, 'Documento do cliente deve ter 11 (CPF) ou 14 (CNPJ) dígitos.')
  if (b.gerarTitulo && !b.vencimento) throw httpError(400, 'Informe o vencimento para gerar a conta a receber.')
  const itens = b.itens.map((i) => ({ ...i, valorTotal: r2(i.quantidade * i.valorUnitario) }))
  const total = r2(itens.reduce((a, i) => a + i.valorTotal, 0))
  if (!(total > 0)) throw httpError(400, 'O valor total da nota deve ser maior que zero.')
  const servico = b.tipo === 'NFSE'
  const emitidaEm = b.emissao ? dia(b.emissao) : new Date()
  const impostos = { ...(servico && e.issAliquota != null && e.regimeAtual !== 'SIMPLES' && e.regimeAtual !== 'MEI' ? { iss: r2((total * e.issAliquota) / 100) } : {}), ...(b.impostos ?? {}) }
  const numero = await proximoNumero(c.tenantId, e.id, `nota:SAIDA:${b.tipo}:${b.serie}`)
  const prov = provedorFiscal()
  const r = await prov.emitir({ tenantId: c.tenantId, empresaId: e.id, documentoEmitente: e.documento, tipo: b.tipo, serie: b.serie, numero, valorTotal: total, uf: e.uf, emitidaEm })
  const nota = await prisma.ctbNota.create({
    data: { tenantId: c.tenantId, empresaId: e.id, direcao: 'SAIDA', tipo: b.tipo, serie: b.serie, numero, chaveAcesso: r.chaveAcesso, status: 'EMITIDA', emitidaEm, competencia: competenciaDe(emitidaEm), parceiroNome: b.parceiroNome, parceiroDoc: soDigitos(b.parceiroDoc) || null, descricao: b.descricao ?? null,
      valorTotal: total, valorServicos: servico ? total : 0, valorProdutos: servico ? 0 : total, itens: itens as any, impostos: impostos as any, protocolo: r.protocolo, provedor: prov.nome, simulacao: r.simulado, criadoPorId: c.userId },
  })
  let tituloId: string | null = null
  if (b.gerarTitulo && b.vencimento) {
    const t = await criarTitulo(c, e, { tipo: 'RECEBER', descricao: `${b.tipo} ${numero} — ${b.descricao ?? b.itens[0].descricao}`.slice(0, 200), parceiroNome: b.parceiroNome, parceiroDoc: soDigitos(b.parceiroDoc) || null, valor: total, emissao: emitidaEm, vencimento: dia(b.vencimento), notaId: nota.id, contaContabilCodigo: servico ? '3.1.2.01' : '3.1.1.01' })
    tituloId = t.id
    await prisma.ctbNota.update({ where: { id: nota.id }, data: { tituloId } })
  }
  await auditar(c, 'nota.emitir', { entidade: 'CtbNota', entidadeId: nota.id, empresaId: e.id, detalhes: { tipo: b.tipo, numero, serie: b.serie, valor: total, simulacao: r.simulado, tituloId } })
  res.status(201).json({ ...resumo({ ...nota, tituloId }), avisos: r.avisos, codigoVerificacao: r.codigoVerificacao })
}))

/** Cadastro manual de nota de ENTRADA (compra/serviço tomado). */
router.post('/notas/entrada', exigir('nota.emitir'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({
    empresaId: z.string().min(1), tipo: z.enum(TIPOS), numero: z.number().int().positive().max(999999999).nullish(), serie: z.string().trim().max(5).default('1'), chaveAcesso: z.string().regex(/^\d{44}$/).nullish(),
    parceiroNome: z.string().trim().min(2).max(160), parceiroDoc: z.string().max(20).nullish(), descricao: z.string().trim().max(500).nullish(), emissao: dataStr.optional(), valorTotal: z.number().positive().max(1e9),
    impostos: impostosSchema.optional(), gerarTitulo: z.boolean().default(false), vencimento: dataStr.optional(),
  }), req.body)
  const e = await empresaDoTenant(c.tenantId, b.empresaId)
  if (b.gerarTitulo && !b.vencimento) throw httpError(400, 'Informe o vencimento para gerar a conta a pagar.')
  const emitidaEm = b.emissao ? dia(b.emissao) : new Date()
  if (b.chaveAcesso && await prisma.ctbNota.findFirst({ where: { tenantId: c.tenantId, empresaId: e.id, chaveAcesso: b.chaveAcesso } })) throw httpError(409, 'Já existe uma nota com esta chave de acesso.')
  const nota = await prisma.ctbNota.create({
    data: { tenantId: c.tenantId, empresaId: e.id, direcao: 'ENTRADA', tipo: b.tipo, serie: b.serie, numero: b.numero ?? null, chaveAcesso: b.chaveAcesso ?? null, status: 'IMPORTADA', emitidaEm, competencia: competenciaDe(emitidaEm), parceiroNome: b.parceiroNome, parceiroDoc: soDigitos(b.parceiroDoc) || null, descricao: b.descricao ?? null,
      valorTotal: r2(b.valorTotal), valorServicos: b.tipo === 'NFSE' ? r2(b.valorTotal) : 0, valorProdutos: b.tipo === 'NFSE' ? 0 : r2(b.valorTotal), impostos: (b.impostos ?? {}) as any, provedor: 'CADASTRO_MANUAL', simulacao: false, criadoPorId: c.userId },
  })
  let tituloId: string | null = null
  if (b.gerarTitulo && b.vencimento) {
    const t = await criarTitulo(c, e, { tipo: 'PAGAR', descricao: `${b.tipo} ${b.numero ?? ''} — ${b.descricao ?? b.parceiroNome}`.slice(0, 200), parceiroNome: b.parceiroNome, parceiroDoc: soDigitos(b.parceiroDoc) || null, valor: nota.valorTotal, emissao: emitidaEm, vencimento: dia(b.vencimento), notaId: nota.id })
    tituloId = t.id; await prisma.ctbNota.update({ where: { id: nota.id }, data: { tituloId } })
  }
  await auditar(c, 'nota.entrada', { entidade: 'CtbNota', entidadeId: nota.id, empresaId: e.id, detalhes: { tipo: b.tipo, valor: nota.valorTotal, tituloId } })
  res.status(201).json(resumo({ ...nota, tituloId }))
}))

/** Importação de XML (leitura local, sem consulta à SEFAZ). Define ENTRADA/SAÍDA pelo CNPJ da empresa. */
router.post('/notas/importar-xml', exigir('nota.emitir'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ empresaId: z.string().min(1), xml: z.string().min(50).max(MAX_XML), direcao: z.enum(['ENTRADA', 'SAIDA']).optional(), gerarTitulo: z.boolean().default(false), vencimento: dataStr.optional() }), req.body)
  const e = await empresaDoTenant(c.tenantId, b.empresaId)
  const x = lerXmlNota(b.xml)
  const direcao = b.direcao ?? (x.emitenteDoc && x.emitenteDoc === e.documento ? 'SAIDA' : x.destinatarioDoc && x.destinatarioDoc === e.documento ? 'ENTRADA' : null)
  if (!direcao) throw httpError(422, 'O CNPJ do emitente/destinatário do XML não confere com o da empresa. Informe a direção (ENTRADA/SAIDA) para importar mesmo assim.', { codigo: 'CTB_XML_DOC_DIVERGENTE' })
  if (!x.valorTotal || x.valorTotal <= 0) throw httpError(422, 'Não encontrei o valor total da nota no XML.')
  if (x.chaveAcesso && await prisma.ctbNota.findFirst({ where: { tenantId: c.tenantId, empresaId: e.id, chaveAcesso: x.chaveAcesso } })) throw httpError(409, 'Esta nota (mesma chave de acesso) já foi importada.')
  if (b.gerarTitulo && !b.vencimento) throw httpError(400, 'Informe o vencimento para gerar a conta.')
  const emitidaEm = x.emitidaEm ?? new Date()
  const parceiro = direcao === 'ENTRADA' ? { nome: x.emitenteNome, doc: x.emitenteDoc } : { nome: x.destinatarioNome, doc: x.destinatarioDoc }
  const nota = await prisma.ctbNota.create({
    data: { tenantId: c.tenantId, empresaId: e.id, direcao, tipo: x.tipo, serie: x.serie, numero: x.numero, chaveAcesso: x.chaveAcesso, status: 'IMPORTADA', emitidaEm, competencia: competenciaDe(emitidaEm), parceiroNome: parceiro.nome || 'Não informado', parceiroDoc: parceiro.doc || null,
      valorTotal: r2(x.valorTotal), valorServicos: r2(x.valorServicos), valorProdutos: r2(x.valorProdutos), itens: x.itens as any, impostos: x.impostos as any, xml: b.xml, provedor: 'IMPORTACAO_XML', simulacao: false, criadoPorId: c.userId },
  })
  let tituloId: string | null = null
  if (b.gerarTitulo && b.vencimento) {
    const t = await criarTitulo(c, e, { tipo: direcao === 'ENTRADA' ? 'PAGAR' : 'RECEBER', descricao: `${x.tipo} ${x.numero ?? ''} — ${parceiro.nome}`.slice(0, 200), parceiroNome: parceiro.nome || 'Não informado', parceiroDoc: parceiro.doc || null, valor: nota.valorTotal, emissao: emitidaEm, vencimento: dia(b.vencimento), notaId: nota.id })
    tituloId = t.id; await prisma.ctbNota.update({ where: { id: nota.id }, data: { tituloId } })
  }
  await auditar(c, 'nota.importar-xml', { entidade: 'CtbNota', entidadeId: nota.id, empresaId: e.id, detalhes: { direcao, tipo: x.tipo, numero: x.numero, valor: nota.valorTotal, tituloId } })
  res.status(201).json({ ...resumo({ ...nota, tituloId }), aviso: 'XML lido localmente: assinatura digital e situação na SEFAZ NÃO foram verificadas.' })
}))

router.post('/notas/:id/cancelar', exigir('nota.cancelar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ motivo: z.string().trim().min(15, 'Descreva o motivo com pelo menos 15 caracteres').max(300) }), req.body)
  const n = await prisma.ctbNota.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!n) throw httpError(404, 'Nota não encontrada.')
  if (n.status === 'CANCELADA') throw httpError(409, 'Nota já cancelada.')
  if (n.direcao !== 'SAIDA' || n.status !== 'EMITIDA') throw httpError(409, 'Só é possível cancelar nota de saída emitida neste sistema (nota importada de terceiros não se cancela aqui).')
  if (n.tituloId) {
    const t = await prisma.ctbTitulo.findFirst({ where: { id: n.tituloId, tenantId: c.tenantId } })
    if (t?.status === 'PAGO') throw httpError(409, 'A conta a receber vinculada já foi paga. Estorne o recebimento antes de cancelar a nota.', { codigo: 'CTB_TITULO_PAGO' })
  }
  const r = await provedorFiscal().cancelar({ chaveAcesso: n.chaveAcesso, protocolo: n.protocolo, motivo: b.motivo })
  const upd = await prisma.ctbNota.updateMany({ where: { id: n.id, tenantId: c.tenantId, status: 'EMITIDA' }, data: { status: 'CANCELADA', canceladaEm: new Date(), motivoCancelamento: b.motivo, canceladaPorId: c.userId } })
  if (upd.count !== 1) throw httpError(409, 'Nota já foi cancelada.')
  if (n.tituloId) {
    const { cancelarTitulo } = await import('../financeiro/titulos')
    const t = await prisma.ctbTitulo.findFirst({ where: { id: n.tituloId, tenantId: c.tenantId } })
    if (t && t.status === 'ABERTO') await cancelarTitulo(c, t, `nota ${n.numero} cancelada`)
  }
  await auditar(c, 'nota.cancelar', { entidade: 'CtbNota', entidadeId: n.id, empresaId: n.empresaId, detalhes: { numero: n.numero, motivo: b.motivo, protocoloCancelamento: r.protocolo, simulacao: r.simulado } })
  res.json({ ok: true, protocoloCancelamento: r.protocolo, simulacao: r.simulado })
}))

router.post('/notas/:id/vincular-titulo', exigir('financeiro.escrever'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ tituloId: z.string().min(1) }), req.body)
  const n = await prisma.ctbNota.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!n) throw httpError(404, 'Nota não encontrada.')
  const t = await prisma.ctbTitulo.findFirst({ where: { id: b.tituloId, tenantId: c.tenantId, empresaId: n.empresaId } })
  if (!t) throw httpError(404, 'Título não encontrado nesta empresa.')
  if ((n.direcao === 'SAIDA') !== (t.tipo === 'RECEBER')) throw httpError(409, 'Nota de saída vincula a conta a receber; nota de entrada, a conta a pagar.')
  await prisma.$transaction([prisma.ctbNota.update({ where: { id: n.id }, data: { tituloId: t.id } }), prisma.ctbTitulo.update({ where: { id: t.id }, data: { notaId: n.id } })])
  await auditar(c, 'nota.vincular-titulo', { entidade: 'CtbNota', entidadeId: n.id, empresaId: n.empresaId, detalhes: { tituloId: t.id } })
  res.json({ ok: true })
}))

router.get('/notas/:id/espelho', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const n = await prisma.ctbNota.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!n) throw httpError(404, 'Nota não encontrada.')
  const e = await empresaDoTenant(c.tenantId, n.empresaId)
  const itens: any[] = Array.isArray(n.itens) ? (n.itens as any[]) : []
  const imp: Record<string, number> = (n.impostos as any) ?? {}
  const nomeTipo = { NFE: 'NF-e (modelo 55)', NFCE: 'NFC-e (modelo 65)', NFSE: 'NFS-e' }[n.tipo] ?? n.tipo
  const corpo = `
    ${kv([['Direção', n.direcao === 'SAIDA' ? 'Saída (emitida)' : 'Entrada (recebida)'], ['Tipo', nomeTipo], ['Número / série', `${n.numero ?? '—'} / ${n.serie}`], ['Situação', n.status], ['Emissão', n.emitidaEm ? iso10(n.emitidaEm).split('-').reverse().join('/') : '—'], ['Protocolo', n.protocolo ?? '—'], ['Chave de acesso', n.chaveAcesso ?? '—']])}
    <h2>${n.direcao === 'SAIDA' ? 'Emitente' : 'Destinatário (empresa)'}</h2>${kv([['Razão social', e.razaoSocial], ['CNPJ/CPF', fmtDoc(e.documento)], ['UF / município', `${e.uf ?? '—'} / ${e.municipio ?? '—'}`]])}
    <h2>${n.direcao === 'SAIDA' ? 'Cliente (tomador/destinatário)' : 'Fornecedor (emitente)'}</h2>${kv([['Nome', n.parceiroNome], ['CNPJ/CPF', fmtDoc(n.parceiroDoc)]])}
    <h2>Itens / serviços</h2>
    <table><tr><th>Descrição</th><th class="n">Qtd.</th><th class="n">Valor unit.</th><th class="n">Total</th></tr>${itens.length ? itens.map((i) => `<tr><td>${esc(i.descricao)}</td><td class="n">${esc(i.quantidade)}</td><td class="n">${brl(i.valorUnitario)}</td><td class="n">${brl(i.valorTotal)}</td></tr>`).join('') : `<tr><td colspan="4">${esc(n.descricao ?? 'Sem itens detalhados')}</td></tr>`}
    <tr><th colspan="3" class="n">Valor total</th><th class="n">${brl(n.valorTotal)}</th></tr></table>
    ${Object.keys(imp).length ? `<h2>Impostos destacados/retidos</h2>${kv(Object.entries(imp).filter(([, v]) => Number(v)).map(([k, v]) => [k.toUpperCase(), brl(Number(v))] as [string, string]))}` : ''}
    ${n.status === 'CANCELADA' ? `<h2>Cancelamento</h2>${kv([['Motivo', n.motivoCancelamento], ['Em', n.canceladaEm?.toISOString().slice(0, 16).replace('T', ' ')]])}` : ''}
    <p><b>${n.simulacao ? 'ESPELHO DE NOTA SIMULADA' : 'Espelho de nota importada'}:</b> ${n.simulacao ? 'não foi transmitida a nenhum órgão e não tem valor fiscal.' : 'XML lido localmente, sem verificação de assinatura ou de situação na SEFAZ. Este espelho não é o DANFE/DANFSe oficial.'}</p>`
  res.type('html').send(paginaHtml(`Espelho de nota — ${nomeTipo}${n.numero ? ' nº ' + n.numero : ''}`, corpo, { instituicao: await adapter().nomeInstituicao(c.tenantId), simulacao: n.simulacao, subtitulo: e.razaoSocial }))
}))

// ---------------- recibos ----------------
const reciboSchema = z.object({
  empresaId: z.string().min(1), tipo: z.enum(['RECEBIMENTO', 'PAGAMENTO']).default('RECEBIMENTO'), pessoaNome: z.string().trim().min(2).max(160), pessoaDoc: z.string().max(20).nullish(),
  valor: z.number().positive().max(1e9), referente: z.string().trim().min(3).max(300), formaPagamento: z.string().max(40).nullish(), data: dataStr.optional(), tituloId: z.string().nullish(), notaId: z.string().nullish(),
})

router.get('/recibos', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId: c.tenantId }
  for (const k of ['empresaId', 'tipo', 'status'] as const) if (qs(req.query[k])) where[k] = qs(req.query[k])
  const [total, items] = await Promise.all([prisma.ctbRecibo.count({ where }), prisma.ctbRecibo.findMany({ where, orderBy: [{ data: 'desc' }, { numero: 'desc' }], skip, take })])
  res.json({ total, page, pageSize, items })
}))

router.post('/recibos', exigir('nota.emitir'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(reciboSchema, req.body)
  const e = await empresaDoTenant(c.tenantId, b.empresaId)
  if (b.tituloId && !(await prisma.ctbTitulo.findFirst({ where: { id: b.tituloId, tenantId: c.tenantId, empresaId: e.id } }))) throw httpError(404, 'Título informado não encontrado nesta empresa.')
  if (b.notaId && !(await prisma.ctbNota.findFirst({ where: { id: b.notaId, tenantId: c.tenantId, empresaId: e.id } }))) throw httpError(404, 'Nota informada não encontrada nesta empresa.')
  const numero = await proximoNumero(c.tenantId, e.id, 'recibo')
  const r = await prisma.ctbRecibo.create({ data: { tenantId: c.tenantId, empresaId: e.id, tipo: b.tipo, numero, pessoaNome: b.pessoaNome, pessoaDoc: soDigitos(b.pessoaDoc) || null, valor: r2(b.valor), referente: b.referente, formaPagamento: b.formaPagamento ?? null, data: dia(b.data ?? iso10(new Date())), tituloId: b.tituloId ?? null, notaId: b.notaId ?? null, criadoPorId: c.userId } })
  await auditar(c, 'recibo.emitir', { entidade: 'CtbRecibo', entidadeId: r.id, empresaId: e.id, detalhes: { numero, valor: r.valor, tipo: r.tipo } })
  res.status(201).json(r)
}))

router.post('/recibos/:id/cancelar', exigir('nota.cancelar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ motivo: z.string().trim().min(10).max(300) }), req.body)
  const r = await prisma.ctbRecibo.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!r) throw httpError(404, 'Recibo não encontrado.')
  const u = await prisma.ctbRecibo.updateMany({ where: { id: r.id, status: 'EMITIDO' }, data: { status: 'CANCELADO' } })
  if (u.count !== 1) throw httpError(409, 'Recibo já cancelado.')
  await auditar(c, 'recibo.cancelar', { entidade: 'CtbRecibo', entidadeId: r.id, empresaId: r.empresaId, detalhes: { numero: r.numero, motivo: b.motivo } })
  res.json({ ok: true })
}))

router.get('/recibos/:id/imprimir', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const r = await prisma.ctbRecibo.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!r) throw httpError(404, 'Recibo não encontrado.')
  const e = await empresaDoTenant(c.tenantId, r.empresaId)
  const dataBr = iso10(r.data).split('-').reverse().join('/')
  const recebimento = r.tipo === 'RECEBIMENTO'
  const corpo = `<p style="font-size:16px;line-height:1.7">${recebimento
    ? `Recebi de <b>${esc(r.pessoaNome)}</b>${r.pessoaDoc ? ` (${esc(fmtDoc(r.pessoaDoc))})` : ''} a importância de <b>${brl(r.valor)}</b> (${esc(valorPorExtenso(r.valor))}), referente a ${esc(r.referente)}.`
    : `Paguei a <b>${esc(r.pessoaNome)}</b>${r.pessoaDoc ? ` (${esc(fmtDoc(r.pessoaDoc))})` : ''} a importância de <b>${brl(r.valor)}</b> (${esc(valorPorExtenso(r.valor))}), referente a ${esc(r.referente)}.`}</p>
    ${kv([['Forma de pagamento', r.formaPagamento ?? '—'], ['Data', dataBr], ['Emitente', `${e.razaoSocial} (${fmtDoc(e.documento)})`], ['Situação', r.status]])}
    <p style="margin-top:50px">______________________________________________<br>${esc(e.razaoSocial)}</p>
    <p style="color:#666;font-size:12px">Recibo simples de controle interno. Não substitui nota fiscal quando esta for exigida.</p>`
  res.type('html').send(paginaHtml(`Recibo nº ${r.numero}${r.status === 'CANCELADO' ? ' (CANCELADO)' : ''}`, corpo, { instituicao: await adapter().nomeInstituicao(c.tenantId), simulacao: false, subtitulo: e.razaoSocial }))
}))

export default router
