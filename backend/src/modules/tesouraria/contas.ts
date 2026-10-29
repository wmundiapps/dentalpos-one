import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { CONFERE, LEITURA, OPERA, dia, getConfig, httpError, log, proximoNumero, r2, tid, uid } from './common'
import { ALCADAS_PADRAO, carregarAlcadas } from './workflow'

const contaSchema = z.object({
  tipo: z.enum(['BANCO', 'CAIXA', 'APLICACAO']).default('BANCO'),
  nome: z.string().min(2).max(120),
  bancoCodigo: z.string().max(5).optional(),
  bancoNome: z.string().max(80).optional(),
  agencia: z.string().max(10).optional(),
  numeroConta: z.string().max(20).optional(),
  digito: z.string().max(3).optional(),
  titularNome: z.string().max(120).optional(),
  titularDocumento: z.string().max(20).optional(),
  convenio: z.string().max(20).optional(),
  provedor: z.string().max(30).default('SIMULADO'),
  saldoInicial: z.number().default(0),
  saldoInicialData: dateISO().optional(),
  ativa: z.boolean().default(true),
  padraoPagamento: z.boolean().default(false),
  contaContabilId: z.string().optional(),
})

/** Saldo = saldo inicial + movimentos até a data (inclusive). */
export async function saldoDaConta(tenantId: string, conta: { id: string; saldoInicial: number }, ate?: Date) {
  const agg = await prisma.tesMovimento.aggregate({ where: { tenantId, contaId: conta.id, ...(ate ? { data: { lte: ate } } : {}) }, _sum: { valor: true } })
  return r2(conta.saldoInicial + (agg._sum.valor ?? 0))
}

/** Lança um movimento de caixa/banco. Chamado pelos fluxos de recebimento, pagamento e transferência. */
export async function lancarMovimento(p: {
  tenantId: string; contaId: string; data: Date; valor: number; tipo: string; descricao: string; refTipo?: string; refId?: string; grupoId?: string; userId?: string
}, tx: any = prisma) {
  return tx.tesMovimento.create({ data: { tenantId: p.tenantId, contaId: p.contaId, data: p.data, valor: r2(p.valor), tipo: p.tipo, descricao: p.descricao, refTipo: p.refTipo, refId: p.refId, grupoId: p.grupoId, criadoPorId: p.userId } })
}

export async function contaDoTenant(tenantId: string, id: string) {
  const c = await prisma.tesContaBancaria.findFirst({ where: { id, tenantId } })
  if (!c) throw httpError(404, 'Conta bancária/caixa não encontrada.')
  return c
}

export function mountContas(router: Router) {
  // ---------- configuração e alçadas ----------
  router.get('/config', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const [config, alcadas] = await Promise.all([getConfig(tenantId), carregarAlcadas(tenantId)])
    const personalizada = (await prisma.tesAlcada.count({ where: { tenantId } })) > 0
    res.json({ config, alcadas, alcadasPadrao: !personalizada })
  }))

  const configSchema = z.object({
    regimeTributario: z.enum(['IMUNE_ISENTA', 'SIMPLES', 'LUCRO_PRESUMIDO', 'LUCRO_REAL']).optional(),
    serieRecibo: z.string().min(1).max(5).optional(),
    limiteDuplaAprovacao: z.number().min(0).optional(),
    exige2faAcima: z.number().min(0).nullable().optional(),
    conferenteNaoAutoriza: z.boolean().optional(),
    toleranciaDiasConciliacao: z.number().int().min(0).max(30).optional(),
    inssPercentualRpa: z.number().min(0).max(100).optional(),
    tetoInss: z.number().min(0).optional(),
    issPercentualPadrao: z.number().min(0).max(100).optional(),
    tabelaIrrf: z.array(z.object({ ate: z.number().nullable(), aliquota: z.number().min(0).max(100), deduzir: z.number().min(0) })).optional(),
    sistemaContabil: z.string().max(60).nullable().optional(),
    layoutExportacao: z.string().max(30).optional(),
  })
  router.put('/config', requireRole('FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const data = parseBody(configSchema, req.body)
    const cfg = await prisma.tesConfig.upsert({ where: { tenantId }, create: { tenantId, ...(data as any) }, update: data as any })
    await log(req, 'CONFIG_ATUALIZADA', 'TesConfig', cfg.id, data)
    res.json(cfg)
  }))

  const alcadasSchema = z.object({
    faixas: z.array(z.object({
      nome: z.string().min(2).max(120),
      valorAte: z.number().positive().nullable(),
      papeis: z.array(z.string().min(2)).min(1),
      aprovacoes: z.number().int().min(1).max(3).default(1),
      exige2fa: z.boolean().default(false),
    })).min(1).max(8),
  })
  router.put('/alcadas', requireRole('FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    // Somente diretoria altera alçadas (segregação): FINANCE comum não redefine o próprio limite.
    const papel = String(req.user!.role).toUpperCase()
    if (!['ADMIN', 'OWNER', 'RECTOR', 'BOARD'].includes(papel)) throw httpError(403, 'Apenas a diretoria (ADMIN/OWNER/RECTOR/BOARD) altera as alçadas de autorização.')
    const { faixas } = parseBody(alcadasSchema, req.body)
    const ult = faixas[faixas.length - 1]
    if (ult.valorAte != null) throw httpError(400, 'A última faixa deve ser sem limite (valorAte nulo).')
    for (let i = 1; i < faixas.length; i++) if ((faixas[i].valorAte ?? Infinity) <= (faixas[i - 1].valorAte ?? Infinity)) throw httpError(400, 'Os tetos das faixas devem ser crescentes.')
    await prisma.$transaction([
      prisma.tesAlcada.deleteMany({ where: { tenantId } }),
      prisma.tesAlcada.createMany({ data: faixas.map((f, i) => ({ tenantId, ordem: i + 1, nome: f.nome, valorAte: f.valorAte, papeis: f.papeis.map((p) => p.toUpperCase()), aprovacoes: f.aprovacoes, exige2fa: f.exige2fa })) }),
    ])
    await log(req, 'ALCADAS_ATUALIZADAS', 'TesAlcada', tenantId, { faixas: faixas.length })
    res.json({ alcadas: await carregarAlcadas(tenantId) })
  }))
  router.delete('/alcadas', requireRole('FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const papel = String(req.user!.role).toUpperCase()
    if (!['ADMIN', 'OWNER', 'RECTOR', 'BOARD'].includes(papel)) throw httpError(403, 'Apenas a diretoria altera as alçadas.')
    await prisma.tesAlcada.deleteMany({ where: { tenantId: tid(req) } })
    await log(req, 'ALCADAS_RESTAURADAS', 'TesAlcada', tid(req))
    res.json({ alcadas: ALCADAS_PADRAO, alcadasPadrao: true })
  }))

  // ---------- contas bancárias e caixa ----------
  router.get('/contas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const contas = await prisma.tesContaBancaria.findMany({ where: { tenantId }, orderBy: [{ ativa: 'desc' }, { nome: 'asc' }] })
    const somas = await prisma.tesMovimento.groupBy({ by: ['contaId'], where: { tenantId }, _sum: { valor: true } })
    const m = new Map(somas.map((s) => [s.contaId, s._sum.valor ?? 0]))
    const itens = contas.map((c) => ({ ...c, saldo: r2(c.saldoInicial + (m.get(c.id) ?? 0)) }))
    res.json({ items: itens, saldoTotal: r2(itens.filter((c) => c.ativa).reduce((a, c) => a + c.saldo, 0)) })
  }))

  router.post('/contas', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const data = parseBody(contaSchema, req.body)
    if (data.tipo === 'BANCO' && !(data.bancoCodigo && data.numeroConta)) throw httpError(400, 'Conta bancária exige código do banco e número da conta.')
    const c = await prisma.$transaction(async (tx) => {
      if (data.padraoPagamento) await tx.tesContaBancaria.updateMany({ where: { tenantId }, data: { padraoPagamento: false } })
      return tx.tesContaBancaria.create({ data: { tenantId, ...data, saldoInicialData: data.saldoInicialData ?? new Date() } as any })
    })
    await log(req, 'CONTA_CRIADA', 'TesContaBancaria', c.id, { nome: c.nome, tipo: c.tipo })
    res.status(201).json(c)
  }))

  router.put('/contas/:id', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const atual = await contaDoTenant(tenantId, String(req.params.id))
    const data = parseBody(contaSchema.partial(), req.body)
    const c = await prisma.$transaction(async (tx) => {
      if (data.padraoPagamento) await tx.tesContaBancaria.updateMany({ where: { tenantId }, data: { padraoPagamento: false } })
      return tx.tesContaBancaria.update({ where: { id: atual.id }, data: data as any })
    })
    await log(req, 'CONTA_ATUALIZADA', 'TesContaBancaria', c.id, data)
    res.json(c)
  }))

  router.get('/contas/:id/extrato-sistema', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const conta = await contaDoTenant(tenantId, String(req.params.id))
    const { page, pageSize, skip, take } = pageParams(req.query)
    const where: any = { tenantId, contaId: conta.id }
    const de = qs(req.query.de), ate = qs(req.query.ate)
    if (de || ate) where.data = { ...(de ? { gte: dia(de) } : {}), ...(ate ? { lte: new Date(dia(ate).getTime() + 12 * 3600_000) } : {}) }
    const [total, itens] = await Promise.all([prisma.tesMovimento.count({ where }), prisma.tesMovimento.findMany({ where, orderBy: [{ data: 'desc' }, { createdAt: 'desc' }], skip, take })])
    res.json({ total, page, pageSize, items: itens, saldo: await saldoDaConta(tenantId, conta) })
  }))

  // ---------- movimentos manuais e transferências ----------
  const movSchema = z.object({
    contaId: z.string().min(1),
    tipo: z.enum(['TARIFA', 'RENDIMENTO', 'AJUSTE']),
    valor: z.number().refine((v) => v !== 0, 'valor não pode ser zero'),
    data: dateISO().optional(),
    descricao: z.string().min(2).max(200),
  })
  router.post('/movimentos', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = parseBody(movSchema, req.body)
    await contaDoTenant(tenantId, d.contaId)
    const sinal = d.tipo === 'TARIFA' ? -Math.abs(d.valor) : d.tipo === 'RENDIMENTO' ? Math.abs(d.valor) : d.valor
    const m = await lancarMovimento({ tenantId, contaId: d.contaId, data: d.data ?? new Date(), valor: sinal, tipo: d.tipo, descricao: d.descricao, userId: uid(req) })
    await log(req, 'MOVIMENTO_MANUAL', 'TesMovimento', m.id, { tipo: d.tipo, valor: sinal })
    res.status(201).json(m)
  }))

  const transfSchema = z.object({
    origemId: z.string().min(1), destinoId: z.string().min(1), valor: z.number().positive(), data: dateISO().optional(), descricao: z.string().max(200).optional(),
  })
  router.post('/transferencias', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = parseBody(transfSchema, req.body)
    if (d.origemId === d.destinoId) throw httpError(400, 'Origem e destino devem ser diferentes.')
    const [o, de] = [await contaDoTenant(tenantId, d.origemId), await contaDoTenant(tenantId, d.destinoId)]
    if (!o.ativa || !de.ativa) throw httpError(409, 'Conta inativa.')
    const data = d.data ?? new Date()
    const grupoId = `trf-${await proximoNumero(tenantId, 'transferencia')}`
    const desc = d.descricao || `Transferência ${o.nome} → ${de.nome}`
    const [saida, entrada] = await prisma.$transaction([
      prisma.tesMovimento.create({ data: { tenantId, contaId: o.id, data, valor: -d.valor, tipo: 'TRANSFERENCIA', descricao: desc, grupoId, criadoPorId: uid(req) } }),
      prisma.tesMovimento.create({ data: { tenantId, contaId: de.id, data, valor: d.valor, tipo: 'TRANSFERENCIA', descricao: desc, grupoId, criadoPorId: uid(req) } }),
    ])
    await log(req, 'TRANSFERENCIA', 'TesMovimento', grupoId, { origem: o.id, destino: de.id, valor: d.valor })
    res.status(201).json({ grupoId, saida, entrada })
  }))

  // Conferência de saldo: informa o saldo do banco numa data e compara com o sistema.
  router.post('/contas/:id/conferir-saldo', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const conta = await contaDoTenant(tenantId, String(req.params.id))
    const d = parseBody(z.object({ saldoBanco: z.number(), data: dateISO().optional() }), req.body)
    const fim = d.data ?? new Date()
    const saldoSistema = await saldoDaConta(tenantId, conta, fim)
    const pendentes = await prisma.tesExtratoItem.count({ where: { tenantId, contaId: conta.id, status: 'PENDENTE' } })
    res.json({ saldoSistema, saldoBanco: d.saldoBanco, diferenca: r2(d.saldoBanco - saldoSistema), itensExtratoPendentes: pendentes })
  }))
}
