import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { LEITURA, OPERA, dia, httpError, log, r2, tid, uid } from './common'
import { lancarDeducaoReceita, registrarBaixaComLancamento } from './contabil'
import { lancarMovimento, contaDoTenant } from './contas'
import { emitirRecibo, rotuloRecibo } from './recibos'
import { liquidarPermuta } from './permutas'

// ---------- cálculo (puro) ----------
export interface ConcessaoLite { id: string; programaId: string; percentual: number; valorMensal: number | null; inicio: Date; fim: Date }

export function ehMensalidade(r: { descricao: string; numeroParcela: number | null }) {
  return r.numeroParcela != null || /mensalidade|parcela/i.test(r.descricao)
}

/** Bolsa total sobre o valor original: soma de % e valor fixo das concessões vigentes na data de vencimento, limitada ao valor. */
export function calcularBolsa(original: number, concessoes: ConcessaoLite[], venc: Date) {
  const vigentes = concessoes.filter((c) => c.inicio <= venc && c.fim >= venc)
  const pct = vigentes.reduce((a, c) => a + (c.percentual || 0), 0)
  const fixo = vigentes.reduce((a, c) => a + (c.valorMensal || 0), 0)
  const bolsa = Math.min(original, r2((original * pct) / 100 + fixo))
  return { vigentes, percentual: Math.min(100, r2(pct)), valor: r2(bolsa) }
}

/** Encargos de atraso: multa de 2% e juros de 1% a.m. pro rata die sobre o valor devido (modelo; ajustar ao contrato). */
export function calcularEncargos(devido: number, vencimento: Date, pagamento: Date, multaPct = 2, jurosMesPct = 1) {
  const dias = Math.floor((pagamento.getTime() - vencimento.getTime()) / 86_400_000)
  if (dias <= 0) return { dias: 0, multa: 0, juros: 0 }
  return { dias, multa: r2((devido * multaPct) / 100), juros: r2((devido * (jurosMesPct / 100) * dias) / 30) }
}

export async function aplicarBolsaAoRecebivel(tenantId: string, rec: any, userId?: string) {
  if (['PAGO', 'CANCELADO'].includes(rec.status)) return null
  if (!ehMensalidade(rec)) return null
  const conc = await prisma.apoConcessaoBolsa.findMany({ where: { tenantId, studentId: rec.studentId, status: { in: ['ATIVA', 'RENOVACAO_PENDENTE'] } } })
  const atual = await prisma.tesRecebivelAjuste.findUnique({ where: { tenantId_receivableId: { tenantId, receivableId: rec.id } } })
  const b = calcularBolsa(rec.valor, conc.map((c) => ({ id: c.id, programaId: c.programaId, percentual: c.percentual, valorMensal: c.valorMensal, inicio: c.inicio, fim: c.fim })), rec.dataVencimento)
  if (!atual && b.valor === 0) return null
  const programas = b.vigentes.length ? await prisma.apoProgramaBolsa.findMany({ where: { tenantId, id: { in: b.vigentes.map((c) => c.programaId) } }, select: { nome: true } }) : []
  const descontoValor = atual?.descontoValor ?? 0
  const liquido = Math.max(0, r2(rec.valor - b.valor - descontoValor))
  const data = {
    valorOriginal: rec.valor, bolsaPercentual: b.percentual, bolsaValor: b.valor, concessaoId: b.vigentes[0]?.id ?? null,
    programaNome: programas.map((p) => p.nome).join(' + ') || null, valorLiquido: liquido, conferencia: 'OK', conferenciaDetalhe: null as string | null, aplicadoPorId: userId,
  }
  return prisma.tesRecebivelAjuste.upsert({
    where: { tenantId_receivableId: { tenantId, receivableId: rec.id } },
    create: { tenantId, receivableId: rec.id, studentId: rec.studentId, origem: 'AUTOMATICO', ...data },
    update: data,
  })
}

const FORMA_BASE: Record<string, 'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO' | 'TRANSFERENCIA'> = { BOLETO: 'BOLETO', PIX: 'PIX', CARTAO: 'CARTAO', DINHEIRO: 'DINHEIRO', TRANSFERENCIA: 'TRANSFERENCIA' }

const receberSchema = z.object({
  forma: z.enum(['BOLETO', 'PIX', 'CARTAO', 'DINHEIRO', 'TRANSFERENCIA', 'PERMUTA']),
  contaId: z.string().optional(),
  data: dateISO().optional(),
  desconto: z.number().min(0).default(0),
  juros: z.number().min(0).optional(),
  multa: z.number().min(0).optional(),
  aplicarEncargos: z.boolean().default(false),
  emitirRecibo: z.boolean().default(true),
  permutaId: z.string().optional(),
  observacao: z.string().max(300).optional(),
})

/** Baixa de recebível (forma, conta, bolsa/desconto/encargos, permuta, recibo). Usada pela tela e pela conciliação. */
export async function receberRecebivel(req: AuthenticatedRequest, id: string, raw: unknown) {
    const tenantId = tid(req)
    const d = parseBody(receberSchema, raw)
    const rec = await prisma.accountReceivable.findFirst({ where: { id, tenantId } })
    if (!rec) throw httpError(404, 'Conta a receber não encontrada.')
    if (rec.status === 'PAGO') throw httpError(409, 'Esta conta já está paga.')
    if (rec.status === 'CANCELADO') throw httpError(409, 'Esta conta está cancelada.')
    const data = d.data ?? new Date()
    if (d.forma !== 'PERMUTA') {
      if (!d.contaId) throw httpError(400, 'Informe a conta bancária/caixa de destino (contaId).')
      const conta = await contaDoTenant(tenantId, d.contaId)
      if (!conta.ativa) throw httpError(409, 'Conta de destino inativa.')
      if (d.forma === 'DINHEIRO' && conta.tipo === 'BANCO') throw httpError(400, 'Dinheiro deve entrar em conta do tipo CAIXA.')
    } else if (!d.permutaId) throw httpError(400, 'Recebimento por PERMUTA exige permutaId (permuta APROVADA com documento).')

    const aj = await prisma.tesRecebivelAjuste.findUnique({ where: { tenantId_receivableId: { tenantId, receivableId: id } } })
    const devido = aj ? aj.valorLiquido : rec.valor
    const enc = d.aplicarEncargos ? calcularEncargos(devido, rec.dataVencimento, data) : { multa: 0, juros: 0 }
    const juros = d.juros ?? enc.juros, multa = d.multa ?? enc.multa
    if (d.desconto > devido) throw httpError(400, 'Desconto maior que o valor devido.')
    const recebido = r2(devido - d.desconto + juros + multa)
    if (recebido <= 0) throw httpError(400, 'Valor a receber deve ser positivo.')
    const bolsa = aj?.bolsaValor ?? 0
    const descontoTotal = r2((aj?.descontoValor ?? 0) + d.desconto)

    if (d.forma === 'PERMUTA') {
      const pm = await prisma.tesPermuta.findFirst({ where: { id: d.permutaId, tenantId } })
      if (!pm) throw httpError(404, 'Permuta não encontrada.')
      if (pm.sentido !== 'RECEBER') throw httpError(400, 'A permuta informada é do sentido PAGAR.')
      if (Math.abs(pm.valorEquivalente - recebido) > 0.009) throw httpError(409, `O valor equivalente da permuta (${pm.valorEquivalente}) deve ser igual ao valor a receber (${recebido}).`, { code: 'PERMUTA_VALOR' })
    }

    const claim = await prisma.accountReceivable.updateMany({ where: { id, tenantId, status: { in: ['PENDENTE', 'ATRASADO'] } }, data: { status: 'PAGO', dataPagamento: data } })
    if (claim.count === 0) throw httpError(409, 'Esta conta já foi baixada.')
    try {
      let transacaoId: string | undefined, movimentoId: string | undefined, permutaId: string | undefined
      if (d.forma === 'PERMUTA') {
        const pm = await liquidarPermuta(tenantId, d.permutaId!, { receivableId: id }, data)
        permutaId = pm.id
      } else {
        const baixa = await registrarBaixaComLancamento({ tenantId, tipo: 'RECEITA', valor: recebido, formaPagamento: FORMA_BASE[d.forma], historico: `Recebimento — ${rec.descricao}`, accountReceivableId: id, dataTransacao: data })
        transacaoId = baixa.transacao.id
        const mov = await lancarMovimento({ tenantId, contaId: d.contaId!, data, valor: recebido, tipo: 'RECEBIMENTO', descricao: `Recebimento ${rec.descricao}`, refTipo: 'RECEBIVEL', refId: id, userId: uid(req) })
        movimentoId = mov.id
      }
      await lancarDeducaoReceita(tenantId, r2(bolsa + descontoTotal), `Bolsa/desconto — ${rec.descricao}`, data)
      const aluno = await prisma.student.findFirst({ where: { id: rec.studentId, tenantId }, select: { nomeCompleto: true, cpf: true } })
      const recb = await prisma.tesRecebimento.create({
        data: { tenantId, receivableId: id, studentId: rec.studentId, forma: d.forma, valorOriginal: rec.valor, bolsa, desconto: descontoTotal, juros, multa, valorRecebido: recebido, contaId: d.contaId, data, paymentTransactionId: transacaoId, movimentoId, permutaId, observacao: d.observacao, recebidoPorId: uid(req) },
      })
      let recibo: any = null
      if (d.emitirRecibo) {
        recibo = await emitirRecibo({ tenantId, userId: uid(req), pagadorNome: aluno?.nomeCompleto || 'Aluno', pagadorDocumento: aluno?.cpf, valor: recebido, descricao: rec.descricao, forma: d.forma, receivableId: id, recebimentoId: recb.id, studentId: rec.studentId })
        await prisma.tesRecebimento.update({ where: { id: recb.id }, data: { reciboId: recibo.id } })
      }
      await log(req, 'RECEBIMENTO', 'AccountReceivable', id, { forma: d.forma, valor: recebido, bolsa, desconto: descontoTotal, recibo: recibo ? rotuloRecibo(recibo) : null })
      return ({ receivable: await prisma.accountReceivable.findUniqueOrThrow({ where: { id } }), recebimento: { ...recb, reciboId: recibo?.id ?? null }, recibo: recibo ? { ...recibo, rotulo: rotuloRecibo(recibo) } : null })
    } catch (e) {
      await prisma.accountReceivable.update({ where: { id }, data: { status: rec.status, dataPagamento: null } })
      throw e
    }
}

export function mountRecebiveis(router: Router) {
  router.get('/recebiveis', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { page, pageSize, skip, take } = pageParams(req.query)
    const where: any = { tenantId }
    const status = qs(req.query.status)
    const agora = new Date()
    if (status === 'ATRASADO') { where.status = { in: ['PENDENTE', 'ATRASADO'] }; where.dataVencimento = { lt: agora } }
    else if (status === 'PENDENTE') { where.status = { in: ['PENDENTE', 'ATRASADO'] }; where.dataVencimento = { gte: agora } }
    else if (status) where.status = status
    const studentId = qs(req.query.studentId)
    if (studentId) where.studentId = studentId
    const de = qs(req.query.de), ate = qs(req.query.ate)
    if (de || ate) where.dataVencimento = { ...(where.dataVencimento || {}), ...(de ? { gte: dia(de) } : {}), ...(ate ? { lte: new Date(dia(ate).getTime() + 12 * 3600_000) } : {}) }
    const q = qs(req.query.q)
    if (q) {
      const alunos = await prisma.student.findMany({ where: { tenantId, OR: [{ nomeCompleto: { contains: q, mode: 'insensitive' } }, { ra: { contains: q, mode: 'insensitive' } }] }, select: { id: true }, take: 200 })
      where.OR = [{ descricao: { contains: q, mode: 'insensitive' } }, { studentId: { in: alunos.map((a) => a.id) } }]
    }
    const [total, rows] = await Promise.all([prisma.accountReceivable.count({ where }), prisma.accountReceivable.findMany({ where, orderBy: { dataVencimento: 'asc' }, skip, take })])
    const ids = rows.map((r) => r.id)
    const [ajustes, alunos, recs] = await Promise.all([
      prisma.tesRecebivelAjuste.findMany({ where: { tenantId, receivableId: { in: ids } } }),
      prisma.student.findMany({ where: { tenantId, id: { in: Array.from(new Set(rows.map((r) => r.studentId))) } }, select: { id: true, nomeCompleto: true, ra: true } }),
      prisma.tesRecebimento.findMany({ where: { tenantId, receivableId: { in: ids } } }),
    ])
    const mA = new Map(ajustes.map((a) => [a.receivableId, a])), mS = new Map(alunos.map((a) => [a.id, a])), mR = new Map(recs.map((r) => [r.receivableId, r]))
    const items = rows.map((r) => {
      const aj = mA.get(r.id)
      const devido = aj ? aj.valorLiquido : r.valor
      const atrasado = ['PENDENTE', 'ATRASADO'].includes(r.status) && r.dataVencimento < agora
      return {
        ...r, status: atrasado ? 'ATRASADO' : r.status, aluno: mS.get(r.studentId) ?? null, ajuste: aj ?? null, valorDevido: r2(devido),
        encargosSugeridos: atrasado ? calcularEncargos(devido, r.dataVencimento, agora) : null, recebimento: mR.get(r.id) ?? null,
      }
    })
    res.json({ total, page, pageSize, items })
  }))

  const novoSchema = z.object({ studentId: z.string().min(1), enrollmentId: z.string().optional(), descricao: z.string().min(3).max(200), valor: z.number().positive(), dataVencimento: dateISO(), numeroParcela: z.number().int().min(1).optional() })
  router.post('/recebiveis', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = parseBody(novoSchema, req.body)
    if (!(await prisma.student.findFirst({ where: { id: d.studentId, tenantId }, select: { id: true } }))) throw httpError(404, 'Aluno não encontrado.')
    if (d.enrollmentId && !(await prisma.enrollment.findFirst({ where: { id: d.enrollmentId, studentId: d.studentId }, select: { id: true } }))) throw httpError(404, 'Matrícula não encontrada para este aluno.')
    const rec = await prisma.accountReceivable.create({ data: { tenantId, ...d } })
    const ajuste = await aplicarBolsaAoRecebivel(tenantId, rec, uid(req))
    await log(req, 'RECEBIVEL_CRIADO', 'AccountReceivable', rec.id, { valor: rec.valor, bolsa: ajuste?.bolsaValor ?? 0 })
    res.status(201).json({ ...rec, ajuste })
  }))

  // Carnê: gera N mensalidades já com a bolsa vigente aplicada.
  const carneSchema = z.object({
    studentId: z.string().min(1), enrollmentId: z.string().optional(), valorParcela: z.number().positive(), quantidadeParcelas: z.number().int().min(1).max(60),
    diaVencimento: z.number().int().min(1).max(28), primeiroVencimento: dateISO(), descricaoBase: z.string().min(3).max(120).default('Mensalidade'),
  })
  router.post('/recebiveis/gerar-mensalidades', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = parseBody(carneSchema, req.body)
    if (!(await prisma.student.findFirst({ where: { id: d.studentId, tenantId }, select: { id: true } }))) throw httpError(404, 'Aluno não encontrado.')
    if (d.enrollmentId && !(await prisma.enrollment.findFirst({ where: { id: d.enrollmentId, studentId: d.studentId }, select: { id: true } }))) throw httpError(404, 'Matrícula não encontrada para este aluno.')
    const ja = await prisma.accountReceivable.count({ where: { tenantId, studentId: d.studentId, enrollmentId: d.enrollmentId ?? null, status: { not: 'CANCELADO' }, descricao: { startsWith: `${d.descricaoBase} ` }, numeroParcela: { not: null } } })
    if (ja > 0) throw httpError(409, `Já existem ${ja} parcela(s) "${d.descricaoBase}" para este aluno/matrícula.`)
    const base = new Date(d.primeiroVencimento)
    const criadas: any[] = []
    for (let i = 0; i < d.quantidadeParcelas; i++) {
      const v = new Date(base); v.setUTCDate(1); v.setUTCMonth(base.getUTCMonth() + i); v.setUTCDate(d.diaVencimento); v.setUTCHours(12, 0, 0, 0)
      criadas.push(await prisma.accountReceivable.create({ data: { tenantId, studentId: d.studentId, enrollmentId: d.enrollmentId, descricao: `${d.descricaoBase} ${i + 1}/${d.quantidadeParcelas}`, numeroParcela: i + 1, valor: d.valorParcela, dataVencimento: v } }))
    }
    let comBolsa = 0
    for (const r of criadas) if (await aplicarBolsaAoRecebivel(tenantId, r, uid(req))) comBolsa++
    await log(req, 'MENSALIDADES_GERADAS', 'Student', d.studentId, { parcelas: criadas.length, comBolsa })
    res.status(201).json({ parcelasGeradas: criadas.length, comBolsa, parcelas: criadas })
  }))

  // Varredura: aplica/atualiza a bolsa em todas as mensalidades em aberto (ou nas informadas).
  router.post('/recebiveis/aplicar-bolsas', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = parseBody(z.object({ ids: z.array(z.string()).max(2000).optional(), studentId: z.string().optional() }), req.body ?? {})
    const where: any = { tenantId, status: { in: ['PENDENTE', 'ATRASADO'] } }
    if (d.ids?.length) where.id = { in: d.ids }
    if (d.studentId) where.studentId = d.studentId
    const recs = await prisma.accountReceivable.findMany({ where, take: 5000 })
    let aplicados = 0, comBolsa = 0
    for (const r of recs) {
      const aj = await aplicarBolsaAoRecebivel(tenantId, r, uid(req))
      if (aj) { aplicados++; if (aj.bolsaValor > 0) comBolsa++ }
    }
    await log(req, 'BOLSAS_APLICADAS', 'AccountReceivable', tenantId, { analisados: recs.length, aplicados, comBolsa })
    res.json({ analisados: recs.length, aplicados, comBolsa })
  }))

  // Desconto manual (pontualidade, acordo...) com motivo; recalcula o líquido.
  router.put('/recebiveis/:id/desconto', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = parseBody(z.object({ percentual: z.number().min(0).max(100).default(0), valor: z.number().min(0).default(0), motivo: z.string().min(3).max(200) }), req.body)
    const rec = await prisma.accountReceivable.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!rec) throw httpError(404, 'Conta a receber não encontrada.')
    if (['PAGO', 'CANCELADO'].includes(rec.status)) throw httpError(409, `Conta ${rec.status}: não é possível alterar o desconto.`)
    const atual = await prisma.tesRecebivelAjuste.findUnique({ where: { tenantId_receivableId: { tenantId, receivableId: rec.id } } })
    const bolsa = atual?.bolsaValor ?? 0
    const descontoValor = r2(Math.min(rec.valor - bolsa, (rec.valor * d.percentual) / 100 + d.valor))
    const liquido = Math.max(0, r2(rec.valor - bolsa - descontoValor))
    const aj = await prisma.tesRecebivelAjuste.upsert({
      where: { tenantId_receivableId: { tenantId, receivableId: rec.id } },
      create: { tenantId, receivableId: rec.id, studentId: rec.studentId, valorOriginal: rec.valor, descontoPercentual: d.percentual, descontoValor, descontoMotivo: d.motivo, valorLiquido: liquido, origem: 'MANUAL', aplicadoPorId: uid(req) },
      update: { descontoPercentual: d.percentual, descontoValor, descontoMotivo: d.motivo, valorLiquido: liquido, origem: 'MANUAL', aplicadoPorId: uid(req) },
    })
    await log(req, 'DESCONTO_MANUAL', 'AccountReceivable', rec.id, { descontoValor, motivo: d.motivo })
    res.json(aj)
  }))

  // Conferência contra apoio/bolsas: o que o financeiro aplicou x o que as concessões vigentes determinam.
  router.get('/bolsas/conferencia', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const recs = await prisma.accountReceivable.findMany({ where: { tenantId, status: { in: ['PENDENTE', 'ATRASADO'] } }, orderBy: { dataVencimento: 'asc' }, take: 5000 })
    const mens = recs.filter(ehMensalidade)
    const alunosIds = Array.from(new Set(mens.map((r) => r.studentId)))
    const [conc, ajustes, alunos] = await Promise.all([
      prisma.apoConcessaoBolsa.findMany({ where: { tenantId, studentId: { in: alunosIds }, status: { in: ['ATIVA', 'RENOVACAO_PENDENTE'] } } }),
      prisma.tesRecebivelAjuste.findMany({ where: { tenantId, receivableId: { in: mens.map((r) => r.id) } } }),
      prisma.student.findMany({ where: { tenantId, id: { in: alunosIds } }, select: { id: true, nomeCompleto: true, ra: true } }),
    ])
    const mA = new Map(ajustes.map((a) => [a.receivableId, a])), mS = new Map(alunos.map((a) => [a.id, a]))
    const divergencias: any[] = []
    let ok = 0
    for (const r of mens) {
      const cs = conc.filter((c) => c.studentId === r.studentId).map((c) => ({ id: c.id, programaId: c.programaId, percentual: c.percentual, valorMensal: c.valorMensal, inicio: c.inicio, fim: c.fim }))
      const esperado = calcularBolsa(r.valor, cs, r.dataVencimento)
      const aj = mA.get(r.id)
      const aplicado = aj?.bolsaValor ?? 0
      if (Math.abs(esperado.valor - aplicado) > 0.009) {
        divergencias.push({
          receivableId: r.id, descricao: r.descricao, vencimento: r.dataVencimento, aluno: mS.get(r.studentId) ?? { id: r.studentId },
          bolsaEsperada: esperado.valor, bolsaAplicada: aplicado, diferenca: r2(esperado.valor - aplicado),
          motivo: !aj ? 'Concessão vigente sem bolsa aplicada na mensalidade' : esperado.valor === 0 ? 'Bolsa aplicada sem concessão vigente (encerrada/suspensa)' : 'Valor da bolsa difere da concessão vigente',
        })
      } else ok++
    }
    // marca no ajuste (para exibir no recebível)
    for (const dv of divergencias) {
      if (mA.get(dv.receivableId)) await prisma.tesRecebivelAjuste.update({ where: { tenantId_receivableId: { tenantId, receivableId: dv.receivableId } }, data: { conferencia: 'DIVERGENTE', conferenciaDetalhe: dv.motivo } })
    }
    res.json({ analisadas: mens.length, conferidas: ok, divergentes: divergencias.length, divergencias, concessoesAtivas: conc.length })
  }))

  router.post('/recebiveis/:id/receber', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await receberRecebivel(req, String(req.params.id), req.body))
  }))

  router.get('/recebimentos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { page, pageSize, skip, take } = pageParams(req.query)
    const where: any = { tenantId }
    const forma = qs(req.query.forma)
    if (forma) where.forma = forma
    const de = qs(req.query.de), ate = qs(req.query.ate)
    if (de || ate) where.data = { ...(de ? { gte: dia(de) } : {}), ...(ate ? { lte: new Date(dia(ate).getTime() + 12 * 3600_000) } : {}) }
    const [total, items] = await Promise.all([prisma.tesRecebimento.count({ where }), prisma.tesRecebimento.findMany({ where, orderBy: { data: 'desc' }, skip, take })])
    res.json({ total, page, pageSize, items })
  }))
}
