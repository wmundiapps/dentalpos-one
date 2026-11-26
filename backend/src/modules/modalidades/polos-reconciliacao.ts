import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, dateISO } from '../core/crud'
import { audit } from '../core/notify'
import { assertPoloAcesso } from './common'
import { competenciaValida, intervaloCompetencia, r2 } from './polos-logic'

// Reconciliação financeira do polo: descontos/bolsas (TesRecebivelAjuste), correções de boleto — juros/multa por
// atraso e desconto por antecipação (TesRecebimento), estornos por desistência (PolEstorno) e o cronograma de
// adiantamento/devolução de aluguel (PolAdiantamento). Mesmo relatório para o financeiro e para o gestor/reitoria
// do polo — montado em /api/edu/modalidades/polos-ead (mesmo BASE de polos-rede.ts).
// GESTOR_POLO só acessa os próprios polos (assertPoloAcesso em poloOr404); demais papéis do FIN veem qualquer polo.
const router = Router()
const BASE = '/polos-ead'
const FIN = ['COORDINATOR', 'SECRETARY', 'FINANCE', 'GESTOR_POLO'] as const
// Aprovação/pagamento efetivo (ações financeiras de fato, não só acompanhamento): sem GESTOR_POLO de propósito.
const FIN_APROVA = ['COORDINATOR', 'SECRETARY', 'FINANCE'] as const
const err = (status: number, message: string) => Object.assign(new Error(message), { status })

async function poloOr404(req: AuthenticatedRequest, tenantId: string, id: string) {
  assertPoloAcesso(req, id)
  const p = await prisma.modPolo.findFirst({ where: { id, tenantId } })
  if (!p) throw err(404, 'Polo não encontrado.')
  return p
}
async function idsDoPolo(tenantId: string, poloId: string) {
  const v = await prisma.modPoloAluno.findMany({ where: { tenantId, poloId }, select: { studentId: true } })
  return v.map((x) => x.studentId)
}
async function nomesAlunos(tenantId: string, ids: string[]) {
  const sts = ids.length ? await prisma.student.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, nomeCompleto: true } }) : []
  return new Map(sts.map((s) => [s.id, s.nomeCompleto]))
}

// ---------------------------------------------------------------- adiantamento de aluguel
const adiantamentoSchema = z.object({
  valorTotal: z.coerce.number().positive(),
  mesesAdiantados: z.coerce.number().int().positive().default(3),
  parcelasDevolucao: z.coerce.number().int().min(1).max(60),
  dataInicio: dateISO(),
  observacao: z.string().max(2000).optional(),
})

router.post(`${BASE}/polo/:id/adiantamentos`, requireRole(...FIN), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(req, tenantId, poloId)
  const d = parseBody(adiantamentoSchema, req.body)
  const valorParcela = r2(d.valorTotal / d.parcelasDevolucao)
  const adto = await prisma.$transaction(async (tx) => {
    const a = await tx.polAdiantamento.create({ data: { tenantId, poloId, valorTotal: d.valorTotal, mesesAdiantados: d.mesesAdiantados, parcelasDevolucao: d.parcelasDevolucao, dataInicio: d.dataInicio, observacao: d.observacao, criadoPorId: getUserId(req) } })
    const parcelas = Array.from({ length: d.parcelasDevolucao }, (_, i) => {
      const venc = new Date(d.dataInicio)
      venc.setUTCMonth(venc.getUTCMonth() + i + 1)
      return { tenantId, adiantamentoId: a.id, numero: i + 1, valor: i === d.parcelasDevolucao - 1 ? r2(d.valorTotal - valorParcela * (d.parcelasDevolucao - 1)) : valorParcela, vencimento: venc }
    })
    await tx.polAdiantamentoParcela.createMany({ data: parcelas })
    return a
  })
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'ADIANTAMENTO_ALUGUEL_CRIADO', refType: 'PolAdiantamento', refId: adto.id, detalhes: { poloId, valorTotal: d.valorTotal, parcelasDevolucao: d.parcelasDevolucao } })
  res.status(201).json(adto)
}))

router.get(`${BASE}/polo/:id/adiantamentos`, requireRole(...FIN), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(req, tenantId, poloId)
  const itens = await prisma.polAdiantamento.findMany({ where: { tenantId, poloId }, orderBy: { dataInicio: 'desc' }, include: { parcelas: { orderBy: { numero: 'asc' } } } })
  res.json({ items: itens.map((a) => ({ ...a, devolvido: r2(a.parcelas.filter((p) => p.pago).reduce((s, p) => s + p.valor, 0)), saldo: r2(a.parcelas.filter((p) => !p.pago).reduce((s, p) => s + p.valor, 0)) })) })
}))

router.post(`${BASE}/adiantamentos/parcelas/:pid/pagar`, requireRole(...FIN_APROVA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await prisma.polAdiantamentoParcela.findFirst({ where: { id: String(req.params.pid), tenantId } })
  if (!r) throw err(404, 'Parcela não encontrada.')
  const up = await prisma.polAdiantamentoParcela.update({ where: { id: r.id }, data: { pago: true, pagoEm: new Date() } })
  const restantes = await prisma.polAdiantamentoParcela.count({ where: { adiantamentoId: r.adiantamentoId, pago: false } })
  if (restantes === 0) await prisma.polAdiantamento.update({ where: { id: r.adiantamentoId }, data: { status: 'QUITADO' } })
  res.json(up)
}))

// ---------------------------------------------------------------- estorno por desistência
const estornoSchema = z.object({
  studentId: z.string().min(1),
  receivableId: z.string().optional(),
  valor: z.coerce.number().positive(),
  motivo: z.enum(['DESISTENCIA', 'CANCELAMENTO', 'OUTRO']).default('DESISTENCIA'),
  observacao: z.string().max(2000).optional(),
})

router.post(`${BASE}/polo/:id/estornos`, requireRole(...FIN), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(req, tenantId, poloId)
  const d = parseBody(estornoSchema, req.body)
  const vinc = await prisma.modPoloAluno.findFirst({ where: { tenantId, poloId, studentId: d.studentId } })
  if (!vinc) throw err(404, 'Aluno não vinculado a este polo.')
  const r = await prisma.polEstorno.create({ data: { tenantId, poloId, ...d } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'ESTORNO_CRIADO', refType: 'PolEstorno', refId: r.id, detalhes: { poloId, valor: d.valor } })
  res.status(201).json(r)
}))

router.get(`${BASE}/polo/:id/estornos`, requireRole(...FIN), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(req, tenantId, poloId)
  const itens = await prisma.polEstorno.findMany({ where: { tenantId, poloId }, orderBy: { createdAt: 'desc' }, take: 300 })
  const nomes = await nomesAlunos(tenantId, itens.map((e) => e.studentId))
  res.json({ items: itens.map((e) => ({ ...e, aluno: nomes.get(e.studentId) ?? '—' })) })
}))

for (const [acao, status] of [['aprovar', 'APROVADO'], ['pagar', 'PAGO']] as const) {
  router.post(`${BASE}/estornos/:id/${acao}`, requireRole(...FIN_APROVA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.polEstorno.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!r) throw err(404, 'Estorno não encontrado.')
    if (r.status === 'PAGO') throw err(409, 'Estorno já pago.')
    const up = await prisma.polEstorno.update({ where: { id: r.id }, data: { status, ...(status === 'APROVADO' ? { aprovadoPorId: getUserId(req) } : {}), ...(status === 'PAGO' ? { pagoEm: new Date() } : {}) } })
    res.json(up)
  }))
}

// ---------------------------------------------------------------- relatório de reconciliação do mês
router.get(`${BASE}/polo/:id/reconciliacao`, requireRole(...FIN), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(req, tenantId, poloId)
  const competencia = String(req.query.competencia ?? '')
  if (!competenciaValida(competencia)) throw err(400, 'Informe competencia no formato AAAA-MM.')
  const { ini, fim } = intervaloCompetencia(competencia)
  const ids = await idsDoPolo(tenantId, poloId)
  const nomes = await nomesAlunos(tenantId, ids)

  const [ajustes, recebimentos, estornos, adiantamentos, repasse] = await Promise.all([
    ids.length ? prisma.tesRecebivelAjuste.findMany({ where: { tenantId, studentId: { in: ids }, createdAt: { gte: ini, lt: fim } } }) : [],
    ids.length ? prisma.tesRecebimento.findMany({ where: { tenantId, studentId: { in: ids }, data: { gte: ini, lt: fim } } }) : [],
    prisma.polEstorno.findMany({ where: { tenantId, poloId, createdAt: { gte: ini, lt: fim } } }),
    prisma.polAdiantamentoParcela.findMany({ where: { tenantId, vencimento: { gte: ini, lt: fim }, adiantamento: { poloId } }, include: { adiantamento: true } }),
    prisma.polRepasse.findFirst({ where: { tenantId, poloId, competencia } }),
  ])

  const totalDescontos = r2(ajustes.reduce((s, a) => s + a.descontoValor, 0))
  const totalBolsas = r2(ajustes.reduce((s, a) => s + a.bolsaValor, 0))
  const totalJuros = r2(recebimentos.reduce((s, r) => s + r.juros, 0))
  const totalMulta = r2(recebimentos.reduce((s, r) => s + r.multa, 0))
  const totalDescontoAntecipacao = r2(recebimentos.reduce((s, r) => s + r.desconto, 0))
  const totalEstornos = r2(estornos.reduce((s, e) => s + e.valor, 0))
  const totalAdiantamentoDevido = r2(adiantamentos.reduce((s, p) => s + p.valor, 0))
  const totalAdiantamentoRecebido = r2(adiantamentos.filter((p) => p.pago).reduce((s, p) => s + p.valor, 0))

  res.json({
    competencia,
    resumo: {
      descontos: totalDescontos, bolsas: totalBolsas, jurosMulta: r2(totalJuros + totalMulta), descontoAntecipacao: totalDescontoAntecipacao,
      estornos: totalEstornos, adiantamentoAluguelDevido: totalAdiantamentoDevido, adiantamentoAluguelRecebido: totalAdiantamentoRecebido,
      repasseDoMes: repasse?.valorRepasse ?? 0, repasseStatus: repasse?.status ?? null,
    },
    descontosBolsas: ajustes.map((a) => ({ ...a, aluno: nomes.get(a.studentId) ?? '—' })),
    correcoesBoleto: recebimentos.filter((r) => r.juros || r.multa || r.desconto).map((r) => ({ id: r.id, aluno: nomes.get(r.studentId ?? '') ?? '—', juros: r.juros, multa: r.multa, desconto: r.desconto, data: r.data })),
    estornos: estornos.map((e) => ({ ...e, aluno: nomes.get(e.studentId) ?? '—' })),
    adiantamentoParcelas: adiantamentos.map((p) => ({ id: p.id, adiantamentoId: p.adiantamentoId, numero: p.numero, valor: p.valor, vencimento: p.vencimento, pago: p.pago, pagoEm: p.pagoEm })),
  })
}))

export default router
