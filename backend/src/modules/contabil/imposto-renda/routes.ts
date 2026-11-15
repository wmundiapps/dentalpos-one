import { createHash } from 'crypto'
import { Router } from 'express'
import { z } from 'zod'
import { AuthenticatedRequest, asyncHandler, auditar, httpError, nomeEmpresa, pageParams, papelDe, parseBody, porMetodo, prisma, qs, requireAuth, tid, uid } from '../host2'
import { versaoVigente, type TabelaIrpfAnual } from '../parametros'
import { AVISO_SIMULACAO, FAIXA_AVISO, mascaraCpf, meioDia, protocoloSim, soDigitos, validarCnpj, validarCpf } from '../util'
import { AVISO_IR, CHECKLIST_OBRIGACAO, ROTULO_OBRIGACAO, calcIrpf, checarMalha, estimativaPj, mensais, obrigacoesDoRegime, prazoObrigacao, situacaoObrigacao, type ItemIr, type TipoObrigacao } from './calculo'

// Imposto de renda PF/PJ e obrigações acessórias. A "transmissão" é uma SIMULAÇÃO (recibo fictício): nada vai à Receita Federal.
// Montado em /api/edu/contabil/imposto-renda.
const router = Router()
router.use(requireAuth)
router.use(porMetodo)
const MOD = 'imposto-renda'
const SECOES = ['RENDIMENTO', 'DEDUCAO', 'BEM', 'DIVIDA', 'DEPENDENTE', 'IMPOSTO'] as const
const CATEGORIAS: Record<string, string[]> = {
  RENDIMENTO: ['SALARIO', 'ALUGUEL', 'AUTONOMO', 'OUTROS_TRIBUTAVEIS', 'ISENTO', 'EXCLUSIVO'],
  DEDUCAO: ['PREVIDENCIA_OFICIAL', 'PREVIDENCIA_PRIVADA', 'SAUDE', 'EDUCACAO', 'PENSAO', 'LIVRO_CAIXA'],
  IMPOSTO: ['IRRF', 'CARNE_LEAO'],
  BEM: ['IMOVEL', 'VEICULO', 'APLICACAO', 'CONTA', 'OUTRO'], DIVIDA: ['FINANCIAMENTO', 'EMPRESTIMO', 'OUTRA'], DEPENDENTE: ['FILHO', 'CONJUGE', 'PAIS', 'OUTRO'],
}
const MAX_ANEXO_B64 = 2_800_000
const MIMES = ['application/pdf', 'image/png', 'image/jpeg']
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'data deve ser AAAA-MM-DD')

async function declaracao(tenantId: string, id: string) {
  const d = await prisma.ctbIrDeclaracao.findFirst({ where: { id, tenantId } })
  if (!d) throw httpError(404, 'Declaração não encontrada.')
  return d
}
const docVisivel = (req: AuthenticatedRequest) => papelDe(req) !== 'LEITOR'
const outDecl = (d: any, ver: boolean) => ({ ...d, titularDoc: ver ? d.titularDoc : d.tipo === 'PF' ? mascaraCpf(d.titularDoc) : d.titularDoc })
const tabelaIr = async (tenantId: string, anoCalendario: number) => (await versaoVigente<TabelaIrpfAnual>(tenantId, 'IRPF_ANUAL', new Date(Date.UTC(anoCalendario, 11, 31, 12)))).dados
const asItens = (rows: any[]): ItemIr[] => rows.map((r) => ({ id: r.id, secao: r.secao, categoria: r.categoria, descricao: r.descricao, valor: r.valor, valorAnterior: r.valorAnterior, documento: r.documento, dados: r.dados }))

/** Recalcula resultado e pendências da declaração e grava. */
async function reavaliar(tenantId: string, d: { id: string; tipo: string; titularDoc: string | null; exercicio: number; anoCalendario: number; modelo: string }) {
  const rows = await prisma.ctbIrItem.findMany({ where: { tenantId, declaracaoId: d.id }, orderBy: { createdAt: 'asc' } })
  const itens = asItens(rows)
  const anexos = await prisma.ctbIrAnexo.findMany({ where: { tenantId, declaracaoId: d.id, itemId: { not: null } }, select: { itemId: true } })
  let resultado: any = null
  if (d.tipo === 'PF') resultado = calcIrpf(itens, await tabelaIr(tenantId, d.anoCalendario))
  else resultado = estimativaPj(itens, { regime: d.modelo, atividade: (rows.find((r) => (r.dados as any)?.atividade)?.dados as any)?.atividade })
  const pendencias = checarMalha({ tipo: d.tipo, titularDoc: d.titularDoc, itens, anexosPorItem: new Set(anexos.map((a) => a.itemId!)), resultado: d.tipo === 'PF' ? resultado : null, exercicio: d.exercicio })
  await prisma.ctbIrDeclaracao.update({ where: { id: d.id }, data: { resultado: resultado as any, pendencias: pendencias as any } })
  return { resultado, pendencias }
}

// ---------------- meta ----------------
router.get('/meta', asyncHandler(async (_req, res) => {
  res.json({ faixa: FAIXA_AVISO, simulacao: AVISO_SIMULACAO, aviso: AVISO_IR, secoes: SECOES, categorias: CATEGORIAS, obrigacoes: Object.entries(ROTULO_OBRIGACAO).map(([tipo, nome]) => ({ tipo, nome, mensal: mensais(tipo as TipoObrigacao), checklist: CHECKLIST_OBRIGACAO[tipo as TipoObrigacao] })), regimes: ['MEI', 'SIMPLES', 'PRESUMIDO', 'REAL'] })
}))

router.get('/painel', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const hoje = new Date()
  const [decls, obrigacoes, trans] = await Promise.all([
    prisma.ctbIrDeclaracao.groupBy({ by: ['tipo', 'status'], where: { tenantId }, _count: true }),
    prisma.ctbIrObrigacao.findMany({ where: { tenantId, status: { notIn: ['CONFERIDA', 'ENTREGUE'] } }, select: { prazo: true, status: true } }),
    prisma.ctbIrTransmissao.count({ where: { tenantId, status: { in: ['RECEBIDA_SIMULADA', 'EM_PROCESSAMENTO_SIMULADO'] } } }),
  ])
  const sit = obrigacoes.map((o) => situacaoObrigacao(o, hoje))
  res.json({ declaracoes: decls.map((d) => ({ tipo: d.tipo, status: d.status, total: d._count })), obrigacoes: { abertas: obrigacoes.length, atrasadas: sit.filter((s) => s.situacao === 'ATRASADA').length, prazoProximo: sit.filter((s) => s.situacao === 'PRAZO_PROXIMO').length }, transmissoesEmAndamento: trans, faixa: FAIXA_AVISO, simulacao: AVISO_SIMULACAO })
}))

// ---------------- declarações ----------------
const declSchema = z.object({
  tipo: z.enum(['PF', 'PJ']), titularNome: z.string().min(3).max(160), titularDoc: z.string().max(20).optional().nullable(), empresaId: z.string().max(80).optional().nullable(),
  exercicio: z.number().int().min(2015).max(2100), modelo: z.enum(['COMPLETA', 'SIMPLIFICADA', 'MEI', 'SIMPLES', 'PRESUMIDO', 'REAL']).optional(), observacao: z.string().max(1000).optional().nullable(),
})
router.get('/declaracoes', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId, ...(qs(req.query.tipo) ? { tipo: qs(req.query.tipo) } : {}), ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}), ...(qs(req.query.exercicio) ? { exercicio: Number(qs(req.query.exercicio)) } : {}) }
  const [total, items] = await Promise.all([prisma.ctbIrDeclaracao.count({ where }), prisma.ctbIrDeclaracao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take })])
  res.json({ total, page, pageSize, items: items.map((d) => outDecl(d, false)) })
}))
router.post('/declaracoes', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const d = parseBody(declSchema, req.body)
  const doc = soDigitos(d.titularDoc)
  if (d.titularDoc && (d.tipo === 'PF' ? !validarCpf(doc) : !validarCnpj(doc))) throw httpError(400, d.tipo === 'PF' ? 'CPF do titular inválido.' : 'CNPJ inválido.')
  if (d.tipo === 'PJ' && !d.empresaId) throw httpError(400, 'Declaração PJ exige a empresa (empresaId).')
  const modelo = d.modelo ?? (d.tipo === 'PF' ? 'COMPLETA' : 'PRESUMIDO')
  if (d.tipo === 'PF' ? !['COMPLETA', 'SIMPLIFICADA'].includes(modelo) : !['MEI', 'SIMPLES', 'PRESUMIDO', 'REAL'].includes(modelo)) throw httpError(400, d.tipo === 'PF' ? 'Modelo PF: COMPLETA ou SIMPLIFICADA.' : 'Para PJ informe o regime: MEI, SIMPLES, PRESUMIDO ou REAL.')
  const dup = await prisma.ctbIrDeclaracao.findFirst({ where: { tenantId, tipo: d.tipo, exercicio: d.exercicio, titularDoc: doc || null, status: { notIn: ['CANCELADA', 'RETIFICADA'] }, retificaDeId: null } })
  if (dup && doc) throw httpError(409, 'Já existe declaração deste titular para o exercício (use retificadora para alterar).', { declaracaoId: dup.id })
  const nova = await prisma.ctbIrDeclaracao.create({ data: { tenantId, tipo: d.tipo, titularNome: d.titularNome, titularDoc: doc || null, empresaId: d.empresaId, exercicio: d.exercicio, anoCalendario: d.exercicio - 1, modelo, observacao: d.observacao, criadoPorId: uid(req) } })
  await reavaliar(tenantId, nova)
  await auditar(req, MOD, 'DECLARACAO_CRIADA', { tipo: 'CtbIrDeclaracao', id: nova.id }, { tipo: d.tipo, exercicio: d.exercicio })
  res.status(201).json(outDecl(await declaracao(tenantId, nova.id), docVisivel(req)))
}))
router.get('/declaracoes/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const d = await declaracao(tenantId, String(req.params.id))
  const [itens, anexos, transmissoes] = await Promise.all([
    prisma.ctbIrItem.findMany({ where: { tenantId, declaracaoId: d.id }, orderBy: [{ secao: 'asc' }, { createdAt: 'asc' }] }),
    prisma.ctbIrAnexo.findMany({ where: { tenantId, declaracaoId: d.id }, select: { id: true, itemId: true, nome: true, mime: true, tamanho: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
    prisma.ctbIrTransmissao.findMany({ where: { tenantId, declaracaoId: d.id }, orderBy: { createdAt: 'desc' } }),
  ])
  res.json({ ...outDecl(d, docVisivel(req)), itens, anexos, transmissoes, aviso: AVISO_IR, simulacao: AVISO_SIMULACAO })
}))
router.put('/declaracoes/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const cur = await declaracao(tenantId, String(req.params.id))
  if (['TRANSMITIDA_SIMULADA', 'RETIFICADA', 'CANCELADA'].includes(cur.status)) throw httpError(409, 'Declaração transmitida/cancelada: crie uma retificadora para alterar.')
  const d = parseBody(declSchema.pick({ titularNome: true, modelo: true, observacao: true }).partial().extend({ status: z.enum(['RASCUNHO', 'EM_REVISAO', 'PRONTA', 'CANCELADA']).optional() }), req.body)
  if (d.status === 'PRONTA') {
    const { pendencias } = await reavaliar(tenantId, cur)
    const erros = (pendencias as any[]).filter((p) => p.nivel === 'ERRO')
    if (erros.length) throw httpError(409, `Há ${erros.length} pendência(s) impeditiva(s) (ERRO) na malha de conferência.`, { pendencias: erros })
  }
  const nv = await prisma.ctbIrDeclaracao.update({ where: { id: cur.id }, data: d })
  await auditar(req, MOD, 'DECLARACAO_ATUALIZADA', { tipo: 'CtbIrDeclaracao', id: cur.id }, { status: d.status })
  res.json(outDecl(nv, docVisivel(req)))
}))

// ---------------- itens (assistente de lançamento) ----------------
const itemSchema = z.object({
  secao: z.enum(SECOES), categoria: z.string().max(40).optional().nullable(), descricao: z.string().min(2).max(200), valor: z.number().min(0).max(1e11).default(0),
  valorAnterior: z.number().min(0).max(1e11).optional().nullable(), documento: z.string().max(20).optional().nullable(), dados: z.record(z.any()).optional().nullable(),
})
function validarItem(d: z.infer<typeof itemSchema>) {
  if (d.categoria && CATEGORIAS[d.secao] && !CATEGORIAS[d.secao].includes(d.categoria)) throw httpError(400, `Categoria "${d.categoria}" inválida para ${d.secao}.`)
  if (d.documento) { const x = soDigitos(d.documento); if (!(x.length === 11 ? validarCpf(x) : x.length === 14 ? validarCnpj(x) : false)) throw httpError(400, 'CPF/CNPJ do campo documento inválido.') }
}
const limpaDoc = (v?: string | null) => (v ? soDigitos(v) : null)
router.post('/declaracoes/:id/itens', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const decl = await declaracao(tenantId, String(req.params.id))
  if (['TRANSMITIDA_SIMULADA', 'RETIFICADA', 'CANCELADA'].includes(decl.status)) throw httpError(409, 'Declaração transmitida/cancelada: crie uma retificadora.')
  const d = parseBody(itemSchema, req.body)
  validarItem(d)
  if (decl.tipo === 'PJ' && !['RENDIMENTO', 'DEDUCAO'].includes(d.secao)) throw httpError(400, 'Em PJ lance apenas receitas (RENDIMENTO) e despesas (DEDUCAO).')
  const item = await prisma.ctbIrItem.create({ data: { tenantId, declaracaoId: decl.id, ...d, documento: limpaDoc(d.documento), dados: d.dados as any } })
  if (decl.status === 'PRONTA') await prisma.ctbIrDeclaracao.update({ where: { id: decl.id }, data: { status: 'EM_REVISAO' } })
  const r = await reavaliar(tenantId, decl)
  res.status(201).json({ item, resultado: r.resultado, pendencias: r.pendencias })
}))
router.put('/declaracoes/:id/itens/:itemId', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const decl = await declaracao(tenantId, String(req.params.id))
  if (['TRANSMITIDA_SIMULADA', 'RETIFICADA', 'CANCELADA'].includes(decl.status)) throw httpError(409, 'Declaração transmitida/cancelada: crie uma retificadora.')
  const cur = await prisma.ctbIrItem.findFirst({ where: { id: String(req.params.itemId), tenantId, declaracaoId: decl.id } })
  if (!cur) throw httpError(404, 'Item não encontrado.')
  const d = parseBody(itemSchema.partial(), req.body)
  validarItem({ ...cur, ...d } as any)
  const item = await prisma.ctbIrItem.update({ where: { id: cur.id }, data: { ...d, ...(d.documento !== undefined ? { documento: limpaDoc(d.documento) } : {}), dados: (d.dados ?? undefined) as any } })
  const r = await reavaliar(tenantId, decl)
  res.json({ item, resultado: r.resultado, pendencias: r.pendencias })
}))
router.delete('/declaracoes/:id/itens/:itemId', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const decl = await declaracao(tenantId, String(req.params.id))
  if (['TRANSMITIDA_SIMULADA', 'RETIFICADA', 'CANCELADA'].includes(decl.status)) throw httpError(409, 'Declaração transmitida/cancelada: crie uma retificadora.')
  const r0 = await prisma.ctbIrItem.deleteMany({ where: { id: String(req.params.itemId), tenantId, declaracaoId: decl.id } })
  if (!r0.count) throw httpError(404, 'Item não encontrado.')
  await prisma.ctbIrAnexo.deleteMany({ where: { tenantId, declaracaoId: decl.id, itemId: String(req.params.itemId) } })
  const r = await reavaliar(tenantId, decl)
  res.json({ resultado: r.resultado, pendencias: r.pendencias })
}))
router.post('/declaracoes/:id/recalcular', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const decl = await declaracao(tenantId, String(req.params.id))
  res.json(await reavaliar(tenantId, decl))
}))

// ---------------- anexos (comprovantes) ----------------
router.post('/declaracoes/:id/anexos', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const decl = await declaracao(tenantId, String(req.params.id))
  const d = parseBody(z.object({ itemId: z.string().max(80).optional().nullable(), nome: z.string().min(1).max(160).regex(/\.(pdf|png|jpe?g)$/i, 'Envie PDF, PNG ou JPG.'), mime: z.enum(MIMES as [string, ...string[]]), conteudoBase64: z.string().min(20).max(MAX_ANEXO_B64) }), req.body)
  if (d.itemId) { const it = await prisma.ctbIrItem.findFirst({ where: { id: d.itemId, tenantId, declaracaoId: decl.id } }); if (!it) throw httpError(404, 'Item não encontrado nesta declaração.') }
  const b64 = d.conteudoBase64.replace(/^data:[^,]+,/, '')
  const buf = Buffer.from(b64, 'base64')
  const a = await prisma.ctbIrAnexo.create({ data: { tenantId, declaracaoId: decl.id, itemId: d.itemId, nome: d.nome, mime: d.mime, tamanho: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), conteudo: b64, enviadoPorId: uid(req) } })
  const r = await reavaliar(tenantId, decl)
  await auditar(req, MOD, 'ANEXO_ENVIADO', { tipo: 'CtbIrAnexo', id: a.id }, { tamanho: buf.length })
  res.status(201).json({ id: a.id, nome: a.nome, tamanho: a.tamanho, itemId: a.itemId, pendencias: r.pendencias })
}))
router.get('/declaracoes/:id/anexos/:aid', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const a = await prisma.ctbIrAnexo.findFirst({ where: { id: String(req.params.aid), tenantId, declaracaoId: String(req.params.id) } })
  if (!a) throw httpError(404, 'Anexo não encontrado.')
  res.json({ id: a.id, nome: a.nome, mime: a.mime, tamanho: a.tamanho, sha256: a.sha256, conteudoBase64: a.conteudo })
}))
router.delete('/declaracoes/:id/anexos/:aid', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const decl = await declaracao(tenantId, String(req.params.id))
  const r0 = await prisma.ctbIrAnexo.deleteMany({ where: { id: String(req.params.aid), tenantId, declaracaoId: decl.id } })
  if (!r0.count) throw httpError(404, 'Anexo não encontrado.')
  await reavaliar(tenantId, decl)
  res.json({ ok: true })
}))

// ---------------- transmissão SIMULADA e retificadora ----------------
function textoRecibo(d: any, protocolo: string, tipo: string, numeroRecibo: string, r: any) {
  return `*** SIMULAÇÃO — ESTE NÃO É UM RECIBO DA RECEITA FEDERAL ***
RECIBO FICTÍCIO DE TRANSMISSÃO DA DECLARAÇÃO DE IMPOSTO DE RENDA ${d.tipo === 'PF' ? 'PESSOA FÍSICA' : 'PESSOA JURÍDICA'} (${tipo})
Exercício ${d.exercicio} / Ano-calendário ${d.anoCalendario}
Contribuinte: ${d.titularNome}${d.tipo === 'PF' ? '' : ''}
Protocolo simulado: ${protocolo}
Número do recibo (fictício): ${numeroRecibo}
${d.tipo === 'PF' && r ? `Modelo: ${d.modelo} — ${r.recomendado === d.modelo ? 'coincide com o recomendado' : `o recomendado era ${r.recomendado}`}\nSituação estimada: ${(d.modelo === 'COMPLETA' ? r.completa : r.simplificada).situacao} de ${Math.abs((d.modelo === 'COMPLETA' ? r.completa : r.simplificada).saldo).toFixed(2)}\n` : ''}
Nenhum dado foi enviado à Receita Federal. Este documento serve apenas para treino e acompanhamento interno.
${AVISO_IR}`
}
router.post('/declaracoes/:id/transmitir', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const d = await declaracao(tenantId, String(req.params.id))
  if (d.status !== 'PRONTA') throw httpError(409, 'Marque a declaração como PRONTA (sem pendências impeditivas) antes de transmitir (simulação).')
  const { resultado, pendencias } = await reavaliar(tenantId, d)
  if ((pendencias as any[]).some((p) => p.nivel === 'ERRO')) throw httpError(409, 'Há pendências impeditivas na malha de conferência.', { pendencias })
  const retif = !!d.retificaDeId
  const protocolo = protocoloSim('IRPF', d.id)
  const recibo = String(Math.abs(parseInt(createHash('sha256').update(protocolo).digest('hex').slice(0, 10), 16))).padStart(12, '0').slice(0, 12)
  const tr = await prisma.ctbIrTransmissao.create({ data: { tenantId, declaracaoId: d.id, tipo: retif ? 'RETIFICADORA' : 'ORIGINAL', protocolo, recibo: textoRecibo(d, protocolo, retif ? 'RETIFICADORA' : 'ORIGINAL', recibo, resultado), simulado: true, historico: [{ em: new Date().toISOString(), status: 'RECEBIDA_SIMULADA' }] as any, criadoPorId: uid(req) } })
  await prisma.ctbIrDeclaracao.update({ where: { id: d.id }, data: { status: 'TRANSMITIDA_SIMULADA' } })
  if (d.retificaDeId) await prisma.ctbIrDeclaracao.updateMany({ where: { id: d.retificaDeId, tenantId }, data: { status: 'RETIFICADA' } })
  await auditar(req, MOD, 'TRANSMISSAO_SIMULADA', { tipo: 'CtbIrTransmissao', id: tr.id }, { retificadora: retif })
  res.status(201).json({ ...tr, simulacao: AVISO_SIMULACAO })
}))
router.post('/transmissoes/:tid/avancar', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const t = await prisma.ctbIrTransmissao.findFirst({ where: { id: String(req.params.tid), tenantId } })
  if (!t) throw httpError(404, 'Transmissão não encontrada.')
  const d = await declaracao(tenantId, t.declaracaoId)
  const pend = ((d.pendencias as any[]) || []).filter((p) => p.nivel === 'ALERTA').length
  const prox = t.status === 'RECEBIDA_SIMULADA' ? 'EM_PROCESSAMENTO_SIMULADO' : t.status === 'EM_PROCESSAMENTO_SIMULADO' ? (pend > 3 ? 'PENDENCIA_SIMULADA' : 'PROCESSADA_SIMULADA') : t.status
  if (prox === t.status) throw httpError(409, 'Transmissão já finalizada na simulação.')
  const nv = await prisma.ctbIrTransmissao.update({ where: { id: t.id }, data: { status: prox, historico: [...(((t.historico as any[]) || [])), { em: new Date().toISOString(), status: prox }] as any } })
  res.json({ ...nv, simulacao: AVISO_SIMULACAO })
}))
router.get('/transmissoes', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId: tid(req), ...(qs(req.query.declaracaoId) ? { declaracaoId: qs(req.query.declaracaoId) } : {}) }
  const [total, items] = await Promise.all([prisma.ctbIrTransmissao.count({ where }), prisma.ctbIrTransmissao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take })])
  res.json({ total, page, pageSize, items, simulacao: AVISO_SIMULACAO })
}))
router.post('/declaracoes/:id/retificar', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const o = await declaracao(tenantId, String(req.params.id))
  if (o.status !== 'TRANSMITIDA_SIMULADA') throw httpError(409, 'Só se retifica declaração já transmitida (simulação).')
  const ja = await prisma.ctbIrDeclaracao.findFirst({ where: { tenantId, retificaDeId: o.id, status: { notIn: ['CANCELADA'] } } })
  if (ja) throw httpError(409, 'Já existe retificadora em andamento para esta declaração.', { declaracaoId: ja.id })
  const nova = await prisma.ctbIrDeclaracao.create({ data: { tenantId, tipo: o.tipo, empresaId: o.empresaId, titularNome: o.titularNome, titularDoc: o.titularDoc, exercicio: o.exercicio, anoCalendario: o.anoCalendario, modelo: o.modelo, retificaDeId: o.id, observacao: 'Retificadora', criadoPorId: uid(req) } })
  const itens = await prisma.ctbIrItem.findMany({ where: { tenantId, declaracaoId: o.id } })
  const mapa = new Map<string, string>()
  for (const i of itens) { const c = await prisma.ctbIrItem.create({ data: { tenantId, declaracaoId: nova.id, secao: i.secao, categoria: i.categoria, descricao: i.descricao, valor: i.valor, valorAnterior: i.valorAnterior, documento: i.documento, dados: (i.dados ?? undefined) as any } }); mapa.set(i.id, c.id) }
  const anexos = await prisma.ctbIrAnexo.findMany({ where: { tenantId, declaracaoId: o.id } })
  for (const a of anexos) await prisma.ctbIrAnexo.create({ data: { tenantId, declaracaoId: nova.id, itemId: a.itemId ? mapa.get(a.itemId) : null, nome: a.nome, mime: a.mime, tamanho: a.tamanho, sha256: a.sha256, conteudo: a.conteudo, enviadoPorId: a.enviadoPorId } })
  await reavaliar(tenantId, nova)
  await auditar(req, MOD, 'RETIFICADORA_CRIADA', { tipo: 'CtbIrDeclaracao', id: nova.id }, { original: o.id })
  res.status(201).json(outDecl(await declaracao(tenantId, nova.id), docVisivel(req)))
}))

// ---------------- calculadora avulsa (sem gravar) ----------------
router.post('/calcular', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const d = parseBody(z.object({ anoCalendario: z.number().int().min(2015).max(2100), itens: z.array(itemSchema).max(300) }), req.body)
  res.json(calcIrpf(d.itens.map((i, n) => ({ ...i, id: String(n) })) as ItemIr[], await tabelaIr(tenantId, d.anoCalendario)))
}))

// ---------------- obrigações acessórias (PJ) ----------------
router.get('/obrigacoes', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId, ...(qs(req.query.empresaId) ? { empresaId: qs(req.query.empresaId) } : {}), ...(qs(req.query.tipo) ? { tipo: qs(req.query.tipo) } : {}), ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}) }
  const [total, rows] = await Promise.all([prisma.ctbIrObrigacao.count({ where }), prisma.ctbIrObrigacao.findMany({ where, orderBy: { prazo: 'asc' }, skip, take })])
  let items = rows.map((o) => ({ ...o, nome: ROTULO_OBRIGACAO[o.tipo as TipoObrigacao], ...situacaoObrigacao(o) }))
  if (qs(req.query.alerta) === 'true') items = items.filter((o) => o.alerta)
  res.json({ total, page, pageSize, items, aviso: 'Prazos calculados sem considerar feriados e prorrogações: confira no calendário oficial. Este sistema não gera nem envia arquivos oficiais.' })
}))
router.post('/obrigacoes/gerar', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const d = parseBody(z.object({ empresaId: z.string().min(1).max(80), empresaNome: z.string().max(160).optional().nullable(), regime: z.enum(['MEI', 'SIMPLES', 'PRESUMIDO', 'REAL']), ano: z.number().int().min(2015).max(2100), icms: z.boolean().default(false) }), req.body)
  const nome = await nomeEmpresa(tenantId, d.empresaId, d.empresaNome)
  let criadas = 0
  for (const tipo of obrigacoesDoRegime(d.regime, d.icms)) {
    const refs = mensais(tipo) ? Array.from({ length: 12 }, (_, i) => `${d.ano}-${String(i + 1).padStart(2, '0')}`) : [String(d.ano)]
    for (const referencia of refs) {
      const ja = await prisma.ctbIrObrigacao.findFirst({ where: { tenantId, empresaId: d.empresaId, tipo, referencia } })
      if (ja) continue
      await prisma.ctbIrObrigacao.create({ data: { tenantId, empresaId: d.empresaId, empresaNome: nome, tipo, referencia, prazo: prazoObrigacao(tipo, referencia), checklist: CHECKLIST_OBRIGACAO[tipo].map((item) => ({ item, ok: false })) as any } })
      criadas++
    }
  }
  await auditar(req, MOD, 'OBRIGACOES_GERADAS', { tipo: 'CtbIrObrigacao' }, { criadas, regime: d.regime, ano: d.ano })
  res.status(201).json({ criadas })
}))
router.put('/obrigacoes/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const o = await prisma.ctbIrObrigacao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!o) throw httpError(404, 'Obrigação não encontrada.')
  const d = parseBody(z.object({ status: z.enum(['PENDENTE', 'EM_CONFERENCIA', 'CONFERIDA', 'ENTREGUE']).optional(), checklist: z.array(z.object({ item: z.string().max(200), ok: z.boolean() })).max(30).optional(), observacao: z.string().max(1000).optional().nullable(), prazo: dataSchema.optional() }), req.body)
  if ((d.status === 'CONFERIDA' || d.status === 'ENTREGUE')) {
    const cl = (d.checklist ?? (o.checklist as any[]) ?? []) as Array<{ ok: boolean }>
    if (cl.some((c) => !c.ok)) throw httpError(409, 'Complete o checklist antes de marcar como conferida/entregue.')
  }
  const nv = await prisma.ctbIrObrigacao.update({ where: { id: o.id }, data: { ...d, checklist: d.checklist as any, prazo: d.prazo ? meioDia(d.prazo) : undefined } })
  await auditar(req, MOD, 'OBRIGACAO_ATUALIZADA', { tipo: 'CtbIrObrigacao', id: o.id }, { status: d.status })
  res.json({ ...nv, ...situacaoObrigacao(nv) })
}))
router.get('/obrigacoes/:id/conferencia', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const o = await prisma.ctbIrObrigacao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!o) throw httpError(404, 'Obrigação não encontrada.')
  const ano = o.referencia.slice(0, 4)
  const itens: Array<{ item: string; ok: boolean; detalhe: string }> = []
  const cl = (o.checklist as any[]) || []
  itens.push({ item: 'Checklist da obrigação', ok: cl.length > 0 && cl.every((c) => c.ok), detalhe: `${cl.filter((c) => c.ok).length}/${cl.length} itens concluídos` })
  const folhas = await prisma.ctbDpFolha.count({ where: { tenantId, empresaId: o.empresaId, competencia: { startsWith: ano }, tipo: 'MENSAL', status: 'FECHADA' } })
  itens.push({ item: 'Folhas mensais fechadas no ano (RH/DP)', ok: folhas >= 12 || (o.tipo !== 'ECD' && o.tipo !== 'ECF' && folhas > 0), detalhe: `${folhas} folha(s) fechada(s) em ${ano}` })
  const pj = await prisma.ctbIrDeclaracao.findFirst({ where: { tenantId, tipo: 'PJ', empresaId: o.empresaId, anoCalendario: Number(ano) } })
  itens.push({ item: 'Declaração PJ do ano-calendário lançada', ok: !!pj, detalhe: pj ? `Status ${pj.status}` : 'Não encontrada neste módulo' })
  res.json({ obrigacao: { id: o.id, tipo: o.tipo, referencia: o.referencia }, itens, aviso: 'Conferência de dados disponíveis neste módulo. Não é validação do arquivo oficial (use o PVA da Receita).' })
}))

export default router
