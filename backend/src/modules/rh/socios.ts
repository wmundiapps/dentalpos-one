import { Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { competenciaValida, r2 } from './calculo'
import { auditar, exigirRh, exigirRhOuFinanceiro, hashCpf, httpError, isRh, logSensivel, mascaraCpfFinal, proteger, tid, uid, validarCpf } from './common'
import { calcInssIndividual, calcIrrf } from './fiscal'
import { tabelasVigentes } from './fiscalDb'
import { soDigitos } from '../lgpd/mascara'

const socioVisao = (s: any, rh: boolean) => { const { cpfHash, cpfCifrado, ...r } = s; const o: any = { ...r, cpfMascarado: mascaraCpfFinal(s.cpfFinal) }; if (!rh) { delete o.proLaboreMensal; delete o.dependentesIrrf } return o }
function validarCnpj(v: string): string {
  const d = soDigitos(v)
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) throw httpError(400, 'CNPJ inválido.')
  const calc = (n: number) => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = pesos.reduce((a, p, i) => a + p * +d[i], 0); const r = s % 11; return r < 2 ? 0 : 11 - r }
  if (calc(12) !== +d[12] || calc(13) !== +d[13]) throw httpError(400, 'CNPJ inválido.')
  return d
}

export function mountSocios(router: Router) {
  // ---------------------------------------------------------------- sócios e pró-labore
  router.get('/socios', exigirRhOuFinanceiro, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = await prisma.rheSocio.findMany({ where: { tenantId: tid(req) }, orderBy: { nome: 'asc' } })
    if (isRh(req)) await logSensivel(req, 'socios', 'REMUNERACAO')
    res.json({ items: items.map((s) => socioVisao(s, isRh(req))) })
  }))
  const socioSchema = z.object({ nome: z.string().min(3).max(150), cpf: z.string().optional(), participacaoPct: z.number().min(0).max(100).default(0), proLaboreMensal: z.number().min(0).max(1_000_000).default(0), dependentesIrrf: z.number().int().min(0).max(20).default(0), desde: dateISO().optional(), userId: z.string().optional(), ativo: z.boolean().default(true) })
  router.post('/socios', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const b = parseBody(socioSchema, req.body)
    const { cpf, ...resto } = b
    const data: any = { ...resto, tenantId }
    if (cpf) { const d = validarCpf(cpf); const h = hashCpf(tenantId, d)!; if (await prisma.rheSocio.findFirst({ where: { tenantId, cpfHash: h }, select: { id: true } })) throw httpError(409, 'Já existe sócio com este CPF.'); Object.assign(data, { cpfHash: h, cpfCifrado: proteger(d), cpfFinal: d.slice(-2) }) }
    const soma = (await prisma.rheSocio.aggregate({ where: { tenantId, ativo: true }, _sum: { participacaoPct: true } }))._sum.participacaoPct ?? 0
    if (soma + (b.ativo ? b.participacaoPct : 0) > 100.0001) throw httpError(422, `A soma das participações ativas excede 100% (atual: ${soma}%).`)
    const s = await prisma.rheSocio.create({ data })
    await logSensivel(req, 'socios', 'REMUNERACAO', undefined, s.id)
    await auditar(req, 'CRIAR_SOCIO', 'RheSocio', s.id)
    res.status(201).json(socioVisao(s, true))
  }))
  router.put('/socios/:id', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const b = parseBody(socioSchema.partial(), req.body)
    const cur = await prisma.rheSocio.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) throw httpError(404, 'Sócio não encontrado.')
    const { cpf, ...resto } = b
    const data: any = { ...resto }
    if (cpf) { const d = validarCpf(cpf); const h = hashCpf(tenantId, d)!; if (await prisma.rheSocio.findFirst({ where: { tenantId, cpfHash: h, NOT: { id: cur.id } }, select: { id: true } })) throw httpError(409, 'Já existe sócio com este CPF.'); Object.assign(data, { cpfHash: h, cpfCifrado: proteger(d), cpfFinal: d.slice(-2) }) }
    if (data.participacaoPct !== undefined || data.ativo !== undefined) {
      const outros = (await prisma.rheSocio.aggregate({ where: { tenantId, ativo: true, NOT: { id: cur.id } }, _sum: { participacaoPct: true } }))._sum.participacaoPct ?? 0
      if ((data.ativo ?? cur.ativo) && outros + (data.participacaoPct ?? cur.participacaoPct) > 100.0001) throw httpError(422, 'A soma das participações ativas excede 100%.')
    }
    const s = await prisma.rheSocio.update({ where: { id: cur.id }, data })
    await auditar(req, 'ATUALIZAR_SOCIO', 'RheSocio', s.id, { campos: Object.keys(data).filter((k) => !/cpf/i.test(k)) })
    res.json(socioVisao(s, true))
  }))
  router.get('/pro-labore', exigirRhOuFinanceiro, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const where: any = { tenantId }; const c = qs(req.query.competencia); if (c) where.competencia = c
    const items = await prisma.rheProLabore.findMany({ where, orderBy: { competencia: 'desc' }, take: 300 })
    const nomes = Object.fromEntries((await prisma.rheSocio.findMany({ where: { tenantId, id: { in: items.map((i) => i.socioId) } }, select: { id: true, nome: true } })).map((s) => [s.id, s.nome]))
    res.json({ items: items.map((i) => ({ ...i, socioNome: nomes[i.socioId] })) })
  }))
  router.get('/pro-labore/simular', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const bruto = Number(qs(req.query.valor)); const dep = parseInt(qs(req.query.dependentes) ?? '0', 10) || 0; const comp = qs(req.query.competencia) ?? new Date().toISOString().slice(0, 7)
    if (!(bruto > 0) || !competenciaValida(comp)) throw httpError(400, 'Informe valor > 0 e competência YYYY-MM.')
    const t = await tabelasVigentes(tid(req), comp)
    const inss = calcInssIndividual(bruto, t.encargos.proLaboreInssPct, t.inss)
    const ir = calcIrrf(bruto, inss, dep, t.irrf)
    res.json({ bruto, inss, irrf: ir.imposto, liquido: r2(bruto - inss - ir.imposto), baseIrrf: ir.base, metodoIrrf: ir.metodo, patronalEstimado: r2(bruto * 0.2), modeloAValidar: t.modeloAValidar })
  }))

  // ---------------------------------------------------------------- terceiros (RPA / PJ)
  const terceiroVisao = (t: any) => { const { cpfHash, documentoCifrado, pixCifrado, ...r } = t; return { ...r, documentoMascarado: t.documentoFinal ? (t.tipo === 'RPA' ? `***.***.***-${t.documentoFinal}` : `**.***.***/****-${t.documentoFinal}`) : null } }
  router.get('/terceiros', exigirRhOuFinanceiro, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query); const where: any = { tenantId: tid(req) }
    const t = qs(req.query.tipo); if (t) where.tipo = t
    const q = qs(req.query.q); if (q) where.nome = { contains: q, mode: 'insensitive' }
    const [items, total] = await Promise.all([prisma.rheTerceiro.findMany({ where, orderBy: { nome: 'asc' }, skip, take }), prisma.rheTerceiro.count({ where })])
    res.json({ items: items.map(terceiroVisao), total, page, pageSize })
  }))
  router.post('/terceiros', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ tipo: z.enum(['RPA', 'PJ']), nome: z.string().min(3).max(150), documento: z.string(), email: z.string().email().optional(), servico: z.string().max(200).optional(), pix: z.string().max(120).optional() }), req.body)
    const doc = b.tipo === 'RPA' ? validarCpf(b.documento) : validarCnpj(b.documento)
    const h = hashCpf(tenantId, doc.padStart(11, '0')) ?? ''
    if (await prisma.rheTerceiro.findFirst({ where: { tenantId, cpfHash: h }, select: { id: true } })) throw httpError(409, 'Já existe terceiro com este documento.')
    const t = await prisma.rheTerceiro.create({ data: { tenantId, tipo: b.tipo, nome: b.nome, email: b.email, servico: b.servico, cpfHash: h, documentoCifrado: proteger(doc), documentoFinal: doc.slice(-2), pixCifrado: proteger(b.pix) } })
    await auditar(req, 'CRIAR_TERCEIRO', 'RheTerceiro', t.id, { tipo: b.tipo })
    res.status(201).json(terceiroVisao(t))
  }))
  router.put('/terceiros/:id', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ nome: z.string().min(3).max(150), email: z.string().email(), servico: z.string().max(200), pix: z.string().max(120), ativo: z.boolean() }).partial(), req.body)
    const t = await prisma.rheTerceiro.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!t) throw httpError(404, 'Terceiro não encontrado.')
    const { pix, ...r } = b
    res.json(terceiroVisao(await prisma.rheTerceiro.update({ where: { id: t.id }, data: { ...r, ...(pix !== undefined ? { pixCifrado: proteger(pix) } : {}) } })))
  }))

  router.post('/terceiros/pagamentos', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ terceiroId: z.string(), competencia: z.string(), descricao: z.string().min(5).max(300), bruto: z.number().positive().max(1_000_000), issPct: z.number().min(0).max(5).default(0), outrasRetencoes: z.number().min(0).default(0), notaFiscal: z.string().max(40).optional(), dataPrevista: dateISO().optional(), dependentes: z.number().int().min(0).max(20).default(0) }), req.body)
    if (!competenciaValida(b.competencia)) throw httpError(400, 'Competência inválida.')
    const t = await prisma.rheTerceiro.findFirst({ where: { id: b.terceiroId, tenantId, ativo: true } })
    if (!t) throw httpError(404, 'Terceiro não encontrado ou inativo.')
    if (t.tipo === 'PJ' && !b.notaFiscal) throw httpError(422, 'Pagamento a PJ exige o número da nota fiscal.')
    if (await prisma.rheFolha.findFirst({ where: { tenantId, competencia: b.competencia, tipo: 'MENSAL', status: 'FECHADA' }, select: { id: true } })) throw httpError(409, 'A folha desta competência está fechada: lance em outra competência.')
    let inss = 0, irrf = 0, iss = 0, patronal = 0
    if (t.tipo === 'RPA') {
      const tab = await tabelasVigentes(tenantId, b.competencia)
      // INSS limitado ao teto considerando o já retido do mesmo autônomo na competência
      const ja = (await prisma.rhePagamentoTerceiro.aggregate({ where: { tenantId, terceiroId: t.id, competencia: b.competencia, status: { not: 'CANCELADO' } }, _sum: { inss: true } }))._sum.inss ?? 0
      inss = calcInssIndividual(b.bruto, tab.encargos.rpaInssPct, tab.inss, ja)
      iss = r2(b.bruto * b.issPct / 100)
      irrf = calcIrrf(b.bruto, inss, b.dependentes, tab.irrf).imposto
      patronal = r2(b.bruto * 0.2)
    }
    const liquido = r2(b.bruto - inss - irrf - iss - b.outrasRetencoes)
    if (liquido <= 0) throw httpError(422, 'O valor líquido deve ser positivo.')
    const p = await prisma.rhePagamentoTerceiro.create({ data: { tenantId, terceiroId: t.id, competencia: b.competencia, descricao: b.descricao, bruto: b.bruto, inss, irrf, iss, outrasRetencoes: b.outrasRetencoes, liquido, patronal, notaFiscal: b.notaFiscal, dataPrevista: b.dataPrevista } })
    await auditar(req, 'CRIAR_PAGAMENTO_TERCEIRO', 'RhePagamentoTerceiro', p.id)
    res.status(201).json(p)
  }))
  router.get('/terceiros/pagamentos', exigirRhOuFinanceiro, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { skip, take, page, pageSize } = pageParams(req.query); const where: any = { tenantId }
    for (const f of ['competencia', 'status', 'terceiroId'] as const) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [items, total] = await Promise.all([prisma.rhePagamentoTerceiro.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.rhePagamentoTerceiro.count({ where })])
    const nomes = Object.fromEntries((await prisma.rheTerceiro.findMany({ where: { tenantId, id: { in: items.map((i) => i.terceiroId) } }, select: { id: true, nome: true, tipo: true } })).map((t) => [t.id, t]))
    res.json({ items: items.map((i) => ({ ...i, terceiroNome: nomes[i.terceiroId]?.nome, terceiroTipo: nomes[i.terceiroId]?.tipo })), total, page, pageSize })
  }))
  router.post('/terceiros/pagamentos/:id/aprovar', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const p = await prisma.rhePagamentoTerceiro.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!p) throw httpError(404, 'Pagamento não encontrado.')
    if (p.status !== 'RASCUNHO') throw httpError(409, 'Pagamento já tratado.')
    res.json(await prisma.rhePagamentoTerceiro.update({ where: { id: p.id }, data: { status: 'APROVADO', aprovadoPorId: uid(req), aprovadoEm: new Date() } }))
  }))
  router.post('/terceiros/pagamentos/:id/cancelar', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const p = await prisma.rhePagamentoTerceiro.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!p) throw httpError(404, 'Pagamento não encontrado.')
    if (!['RASCUNHO', 'APROVADO'].includes(p.status)) throw httpError(409, 'Pagamento não pode ser cancelado.')
    res.json(await prisma.rhePagamentoTerceiro.update({ where: { id: p.id }, data: { status: 'CANCELADO' } }))
  }))
  router.post('/terceiros/pagamentos/:id/pago', exigirRhOuFinanceiro, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const p = await prisma.rhePagamentoTerceiro.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!p) throw httpError(404, 'Pagamento não encontrado.')
    if (p.status !== 'APROVADO') throw httpError(409, 'Somente pagamentos aprovados podem ser baixados.')
    if (p.aprovadoPorId === uid(req)) throw httpError(403, 'Segregação de funções: a baixa deve ser feita por outra pessoa que não aprovou.')
    res.json(await prisma.rhePagamentoTerceiro.update({ where: { id: p.id }, data: { status: 'PAGO' } }))
  }))
}
