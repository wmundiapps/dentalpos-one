import { Router, Response } from 'express'
import { z } from 'zod'
import { createHash } from 'crypto'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { dateISO, parseBody, qs } from '../core/crud'
import { LEITURA, OPERA, getConfig, httpError, log, r2, soDigitos, tid, uid } from './common'
import { competenciaValida, vencimentoTributoRetido } from './fiscal'
import { pendenciasPagamento, criarTitulo, totalRet } from './titulos'
import { IRRF_PADRAO, calcularRetencoes } from './workflow'

// ============================================================
// Integração com a FOLHA / pró-labore / terceiros.
//
// CONTRATO com o módulo RH (backend/src/modules/rh):
//   export async function gerarLancamentosFolha(tenantId: string, competencia: string /* 'AAAA-MM' */):
//     Promise<LancamentoFolha[] | { lancamentos: LancamentoFolha[] }>
// A tesouraria NÃO calcula folha: recebe os lançamentos prontos (valores bruto/retenções/líquido) e cria
// títulos a pagar em RASCUNHO, para conferência e autorização. Idempotente por (competência, tipo, funcionário/documento, referência).
// ============================================================

export const TIPOS_FOLHA = ['SALARIO', 'PROLABORE', 'RPA', 'PJ', 'ENCARGO', 'DECIMO_TERCEIRO', 'FERIAS', 'RESCISAO', 'BENEFICIO', 'OUTRO'] as const
export type TipoFolha = (typeof TIPOS_FOLHA)[number]

export interface LancamentoFolha {
  tipo: TipoFolha
  favorecidoNome: string
  documento?: string                 // CPF/CNPJ
  funcionarioId?: string             // id de origem (RH) - compõe a chave de idempotência
  referencia?: string                // ex.: "salário", "adiantamento", nº do contrato
  bruto: number
  inss?: number
  irrf?: number
  iss?: number
  outrasRetencoes?: number
  liquido?: number                   // opcional; se informado deve bater com bruto - retenções
  vencimento?: string | Date
  formaPagamento?: 'PIX' | 'TED' | 'CREDITO_CONTA'
  banco?: string; agencia?: string; conta?: string; tipoConta?: 'CORRENTE' | 'POUPANCA'
  chavePix?: string; tipoChavePix?: 'CPF' | 'CNPJ' | 'EMAIL' | 'TELEFONE' | 'ALEATORIA'
  centroCustoId?: string
  calcularRetencoes?: boolean        // usa o modelo de retenção para RPA/PJ/PRO-LABORE quando não vieram retenções
  issAliquota?: number
  retemTributos?: boolean            // PJ: retém IRRF 1,5% + PIS/COFINS/CSLL 4,65%
}

const lancSchema = z.object({
  tipo: z.enum(TIPOS_FOLHA),
  favorecidoNome: z.string().min(2).max(150),
  documento: z.string().max(20).optional(),
  funcionarioId: z.string().max(80).optional(),
  referencia: z.string().max(80).optional(),
  bruto: z.number().positive(),
  inss: z.number().min(0).optional(), irrf: z.number().min(0).optional(), iss: z.number().min(0).optional(), outrasRetencoes: z.number().min(0).optional(),
  liquido: z.number().min(0).optional(),
  vencimento: dateISO().optional(),
  formaPagamento: z.enum(['PIX', 'TED', 'CREDITO_CONTA']).optional(),
  banco: z.string().max(5).optional(), agencia: z.string().max(10).optional(), conta: z.string().max(25).optional(), tipoConta: z.enum(['CORRENTE', 'POUPANCA']).optional(),
  chavePix: z.string().max(100).optional(), tipoChavePix: z.enum(['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA']).optional(),
  centroCustoId: z.string().optional(),
  calcularRetencoes: z.boolean().optional(), issAliquota: z.number().min(0).max(100).optional(), retemTributos: z.boolean().optional(),
})

const importSchema = z.object({
  competencia: z.string().refine(competenciaValida, 'competência deve ser AAAA-MM'),
  tipo: z.enum(['FOLHA', 'PROLABORE', 'TERCEIROS', 'MISTO']).default('MISTO'),
  vencimentoPadrao: dateISO().optional(),
  contaBancariaId: z.string().optional(),
  lancamentos: z.array(lancSchema).min(1).max(2000),
})

const ORIGEM: Record<string, 'FOLHA' | 'PROLABORE' | 'TERCEIRO'> = { SALARIO: 'FOLHA', ENCARGO: 'FOLHA', DECIMO_TERCEIRO: 'FOLHA', FERIAS: 'FOLHA', RESCISAO: 'FOLHA', BENEFICIO: 'FOLHA', OUTRO: 'FOLHA', PROLABORE: 'PROLABORE', RPA: 'TERCEIRO', PJ: 'TERCEIRO' }

/** Localiza a função do RH em tempo de execução (o módulo é desenvolvido em paralelo). */
export async function carregarGeradorRh(): Promise<((tenantId: string, competencia: string) => Promise<any>) | null> {
  for (const caminho of ['../rh/folha', '../rh/index', '../rh/lancamentos', '../rh']) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const m = require(caminho)
      if (typeof m?.gerarLancamentosFolha === 'function') return m.gerarLancamentosFolha
    } catch (e: any) {
      if (e?.code !== 'MODULE_NOT_FOUND') console.warn('[tesouraria] erro ao carregar módulo RH', caminho, e?.message)
    }
  }
  return null
}

export async function importarLancamentos(req: AuthenticatedRequest, d: z.infer<typeof importSchema>, origem: 'RH' | 'IMPORTACAO') {
  const tenantId = tid(req)
  const cfg = await getConfig(tenantId)
  const chave = `${origem}:${d.competencia}:${d.tipo}:${createHash('sha256').update(JSON.stringify(d.lancamentos)).digest('hex').slice(0, 12)}`
  if (await prisma.tesFolhaLote.findFirst({ where: { tenantId, chave }, select: { id: true } })) throw httpError(409, 'Este mesmo lote já foi importado para a competência.', { code: 'LOTE_DUPLICADO' })
  let contaId = d.contaBancariaId
  if (contaId) { if (!(await prisma.tesContaBancaria.findFirst({ where: { id: contaId, tenantId, ativa: true }, select: { id: true } }))) throw httpError(404, 'Conta bancária pagadora não encontrada.') }
  else contaId = (await prisma.tesContaBancaria.findFirst({ where: { tenantId, ativa: true, tipo: 'BANCO', padraoPagamento: true }, select: { id: true } }))?.id
  const [a, m] = d.competencia.split('-').map(Number)
  const vencDefault = d.vencimentoPadrao ?? new Date(Date.UTC(m === 12 ? a + 1 : a, m === 12 ? 0 : m, 5, 12))   // 5º dia do mês seguinte
  const lote = await prisma.tesFolhaLote.create({ data: { tenantId, competencia: d.competencia, tipo: d.tipo, origem, chave, importadoPorId: uid(req) } })
  const criados: any[] = [], ignorados: any[] = []
  let bruto = 0, ret = 0, liq = 0
  for (const l of d.lancamentos) {
    const ref = `folha:${d.competencia}:${l.tipo}:${l.funcionarioId || soDigitos(l.documento) || l.favorecidoNome.toLowerCase()}:${l.referencia ?? ''}`
    if (await prisma.tesTitulo.findFirst({ where: { tenantId, origemRef: ref }, select: { id: true } })) { ignorados.push({ favorecido: l.favorecidoNome, motivo: 'já lançado nesta competência (idempotência)' }); continue }
    let { inss = 0, irrf = 0, iss = 0, outrasRetencoes: outras = 0 } = l
    const informou = inss + irrf + iss + outras > 0
    let obs = ''
    if (!informou && (l.calcularRetencoes || ['RPA', 'PJ'].includes(l.tipo) || l.tipo === 'PROLABORE') && l.calcularRetencoes !== false) {
      const tipoCalc = l.tipo === 'RPA' || l.tipo === 'PJ' || l.tipo === 'PROLABORE' ? l.tipo : 'OUTRO'
      const c = calcularRetencoes(tipoCalc, l.bruto, { issAliquota: l.issAliquota, retemTributos: l.retemTributos, params: { inssPercentualRpa: cfg.inssPercentualRpa, tetoInss: cfg.tetoInss, issPercentualPadrao: cfg.issPercentualPadrao, tabelaIrrf: (cfg.tabelaIrrf as any) ?? IRRF_PADRAO } })
      inss = c.inss; irrf = c.irrf; iss = c.iss; outras = c.outras
      obs = c.detalhe
    }
    if (l.liquido != null && Math.abs(l.liquido - (l.bruto - inss - irrf - iss - outras)) > 0.01) { ignorados.push({ favorecido: l.favorecidoNome, motivo: `líquido informado (${l.liquido}) não bate com bruto - retenções (${r2(l.bruto - inss - irrf - iss - outras)})` }); continue }
    const forma = l.formaPagamento ?? (l.chavePix ? 'PIX' : 'TED')
    const venc = l.vencimento ?? vencDefault
    try {
      const t = await criarTitulo(req, {
        origem: ORIGEM[l.tipo], descricao: `${l.tipo === 'SALARIO' ? 'Folha' : l.tipo} ${d.competencia}${l.referencia ? ' — ' + l.referencia : ''} — ${l.favorecidoNome}`.slice(0, 300),
        fornecedor: l.favorecidoNome, fornecedorDocumento: l.documento, categoria: ORIGEM[l.tipo] === 'FOLHA' ? 'folha' : ORIGEM[l.tipo] === 'PROLABORE' ? 'pró-labore' : 'terceiros',
        centroCustoId: l.centroCustoId, contaBancariaId: contaId, formaPagamento: forma, favorecidoBanco: l.banco, favorecidoAgencia: l.agencia, favorecidoConta: l.conta, favorecidoTipoConta: l.tipoConta,
        chavePix: l.chavePix, tipoChavePix: l.tipoChavePix, valorBruto: l.bruto, retencaoInss: inss, retencaoIrrf: irrf, retencaoIss: iss, retencaoOutras: outras,
        vencimento: venc instanceof Date ? venc : new Date(venc), competencia: d.competencia,
      } as any, { origemRef: ref, folhaLoteId: lote.id })
      bruto += t.valorBruto; ret += totalRet(t); liq += t.valorLiquido
      criados.push({ id: t.id, numero: t.numero, favorecido: l.favorecidoNome, tipo: l.tipo, bruto: t.valorBruto, retencoes: totalRet(t), liquido: t.valorLiquido, pendencias: pendenciasPagamento(t), calculo: obs || undefined })
    } catch (e: any) { ignorados.push({ favorecido: l.favorecidoNome, motivo: e.message }) }
  }
  await prisma.tesFolhaLote.update({ where: { id: lote.id }, data: { qtd: criados.length, qtdIgnorados: ignorados.length, valorBruto: r2(bruto), valorRetencoes: r2(ret), valorLiquido: r2(liq) } })
  await log(req, 'FOLHA_IMPORTADA', 'TesFolhaLote', lote.id, { competencia: d.competencia, origem, criados: criados.length, ignorados: ignorados.length, bruto: r2(bruto) })
  return { lote: { ...lote, qtd: criados.length, qtdIgnorados: ignorados.length, valorBruto: r2(bruto), valorRetencoes: r2(ret), valorLiquido: r2(liq) }, criados, ignorados, semContaPagadora: !contaId }
}

export function mountFolha(router: Router) {
  router.get('/folha/contrato', requireRole(...LEITURA), (_req, res) => {
    res.json({
      descricao: 'Contrato de integração com a folha de pagamento. O RH expõe gerarLancamentosFolha(tenantId, competencia) em backend/src/modules/rh; a tesouraria cria títulos em RASCUNHO para conferência/autorização.',
      assinatura: 'gerarLancamentosFolha(tenantId: string, competencia: "AAAA-MM"): Promise<LancamentoFolha[] | { lancamentos: LancamentoFolha[] }>',
      tipos: TIPOS_FOLHA,
      campos: { obrigatorios: ['tipo', 'favorecidoNome', 'bruto'], opcionais: ['documento', 'funcionarioId', 'referencia', 'inss', 'irrf', 'iss', 'outrasRetencoes', 'liquido', 'vencimento', 'formaPagamento', 'banco', 'agencia', 'conta', 'tipoConta', 'chavePix', 'tipoChavePix', 'centroCustoId', 'calcularRetencoes', 'issAliquota', 'retemTributos'] },
      idempotencia: 'chave = competência + tipo + (funcionarioId | documento | nome) + referência',
      endpoints: { importar: 'POST /api/edu/tesouraria/folha/importar', gerarDoRh: 'POST /api/edu/tesouraria/folha/gerar { competencia }', calcularRetencoes: 'POST /api/edu/tesouraria/folha/calcular-retencoes' },
    })
  })

  router.post('/folha/importar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const d = parseBody(importSchema, req.body)
    res.status(201).json(await importarLancamentos(req, d, 'IMPORTACAO'))
  }))

  router.post('/folha/gerar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { competencia, contaBancariaId, vencimentoPadrao } = parseBody(z.object({ competencia: z.string().refine(competenciaValida, 'competência deve ser AAAA-MM'), contaBancariaId: z.string().optional(), vencimentoPadrao: dateISO().optional() }), req.body)
    const gerar = await carregarGeradorRh()
    if (!gerar) throw httpError(501, 'O módulo de RH ainda não expõe gerarLancamentosFolha. Importe os lançamentos por POST /folha/importar (contrato em GET /folha/contrato).', { code: 'RH_INDISPONIVEL' })
    const out = await gerar(tenantId, competencia)
    const lista: any[] = Array.isArray(out) ? out : out?.lancamentos
    if (!Array.isArray(lista) || !lista.length) throw httpError(404, `O RH não retornou lançamentos para ${competencia}.`)
    const d = parseBody(importSchema, { competencia, tipo: 'MISTO', contaBancariaId, vencimentoPadrao, lancamentos: lista })
    res.status(201).json(await importarLancamentos(req, d, 'RH'))
  }))

  const calcSchema = z.object({ tipo: z.enum(['RPA', 'PJ', 'PROLABORE']), bruto: z.number().positive(), issAliquota: z.number().min(0).max(100).optional(), retemTributos: z.boolean().optional() })
  router.post('/folha/calcular-retencoes', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const d = parseBody(calcSchema, req.body)
    const cfg = await getConfig(tid(req))
    const c = calcularRetencoes(d.tipo, d.bruto, { issAliquota: d.issAliquota, retemTributos: d.retemTributos, params: { inssPercentualRpa: cfg.inssPercentualRpa, tetoInss: cfg.tetoInss, issPercentualPadrao: cfg.issPercentualPadrao, tabelaIrrf: (cfg.tabelaIrrf as any) ?? IRRF_PADRAO } })
    res.json({ ...c, aviso: 'Cálculo-modelo (tabelas e alíquotas configuráveis em /config). Valide com o contador antes de usar.' })
  }))

  router.get('/folha/lotes', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const competencia = qs(req.query.competencia)
    const items = await prisma.tesFolhaLote.findMany({ where: { tenantId, ...(competencia ? { competencia } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 })
    res.json({ items })
  }))

  // Painel da competência: andamento do fluxo conferência -> pagamento por tipo.
  router.get('/folha/resumo', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const competencia = qs(req.query.competencia)
    if (!competencia || !competenciaValida(competencia)) throw httpError(400, 'Informe competencia=AAAA-MM.')
    const ts = await prisma.tesTitulo.findMany({ where: { tenantId, competencia, origem: { in: ['FOLHA', 'PROLABORE', 'TERCEIRO'] } }, select: { origem: true, status: true, valorBruto: true, valorLiquido: true, retencaoInss: true, retencaoIrrf: true, retencaoIss: true, retencaoOutras: true } })
    const por: Record<string, any> = {}
    for (const t of ts) {
      const k = t.origem
      const o = (por[k] ||= { origem: k, qtd: 0, bruto: 0, retencoes: 0, liquido: 0, porStatus: {} as Record<string, number> })
      o.qtd++; o.bruto = r2(o.bruto + t.valorBruto); o.liquido = r2(o.liquido + t.valorLiquido); o.retencoes = r2(o.retencoes + totalRet(t))
      o.porStatus[t.status] = (o.porStatus[t.status] ?? 0) + 1
    }
    const pagos = ts.filter((t) => ['PAGO', 'CONCILIADO'].includes(t.status))
    res.json({ competencia, grupos: Object.values(por), totalLiquido: r2(ts.reduce((a, t) => a + t.valorLiquido, 0)), totalPago: r2(pagos.reduce((a, t) => a + t.valorLiquido, 0)), retencoes: {
      inss: r2(ts.reduce((a, t) => a + t.retencaoInss, 0)), irrf: r2(ts.reduce((a, t) => a + t.retencaoIrrf, 0)), iss: r2(ts.reduce((a, t) => a + t.retencaoIss, 0)), outras: r2(ts.reduce((a, t) => a + t.retencaoOutras, 0)),
    } })
  }))

  // Tributos retidos a recolher (guias): soma do que já foi pago aos favorecidos, com vencimento estimado.
  router.get('/retencoes/a-recolher', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const ts = await prisma.tesTitulo.findMany({ where: { tenantId, status: { in: ['PAGO', 'CONCILIADO'] }, pagoEm: { not: null } }, select: { pagoEm: true, retencaoInss: true, retencaoIrrf: true, retencaoIss: true, retencaoOutras: true } })
    const por = new Map<string, { vencimento: Date; competenciaPagamento: string; inss: number; irrf: number; iss: number; outras: number }>()
    for (const t of ts) {
      const venc = vencimentoTributoRetido(t.pagoEm!)
      const k = venc.toISOString().slice(0, 10)
      const o = por.get(k) ?? { vencimento: venc, competenciaPagamento: t.pagoEm!.toISOString().slice(0, 7), inss: 0, irrf: 0, iss: 0, outras: 0 }
      o.inss = r2(o.inss + t.retencaoInss); o.irrf = r2(o.irrf + t.retencaoIrrf); o.iss = r2(o.iss + t.retencaoIss); o.outras = r2(o.outras + t.retencaoOutras)
      por.set(k, o)
    }
    const items = Array.from(por.values()).filter((o) => o.inss + o.irrf + o.iss + o.outras > 0).sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())
    res.json({ items, aviso: 'Vencimentos estimados (dia 20 do mês seguinte ao pagamento). Confirme o prazo de cada guia (DARF, GPS, ISS municipal) com o contador.' })
  }))
}
