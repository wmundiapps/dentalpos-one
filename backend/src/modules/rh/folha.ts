import { Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { notify } from '../core/notify'
import { apurarColaboradorMes } from './apuracao'
import { ResumoMes, addDiasStr, avos, competenciaValida, diaLocal, diasDoMes, r2, saldoBanco } from './calculo'
import { bancoRows } from './ponto'
import { auditar, carregarColaborador, dia, diaDate, exigirAutenticado, exigirRh, exigirRhOuFinanceiro, getConfig, httpError, isFin, isRh, logSensivel, meuColaborador, revelar, tid, uid } from './common'
import { calcInssIndividual, calcIrrf, validarTabela } from './fiscal'
import { tabelasVigentes } from './fiscalDb'
import { calcularHolerite, salarioReferencia } from './holerite'
import { gerarLancamentosFolha, notificarFolhaFechada } from './integracao'
import { mediaVariaveis } from './ferias'

const TIPOS_FOLHA = ['MENSAL', 'DECIMO_1A', 'DECIMO_2A'] as const
const mesIni = (c: string) => `${c}-01`
const mesFim = (c: string) => { const d = diasDoMes(c); return d[d.length - 1] }
const sobreposicao = (ini: string, fim: string, a: string, b: string) => { const x = ini > a ? ini : a, y = fim < b ? fim : b; return x <= y ? Math.round((Date.parse(y) - Date.parse(x)) / 86400000) + 1 : 0 }

/** Dias do mês (base 30) sem remuneração: licença sem vencimento, afastamento previdenciário (a partir do 16º dia), suspensão disciplinar e férias gozadas. */
async function diasNaoRemunerados(tenantId: string, colaboradorId: string, comp: string) {
  const ini = mesIni(comp), fim = mesFim(comp)
  const [lic, atest, adv, fer] = await Promise.all([
    prisma.rheLicenca.findMany({ where: { tenantId, colaboradorId, remunerada: false, status: { in: ['APROVADA', 'ENCERRADA'] }, inicio: { lte: diaDate(fim) }, fim: { gte: diaDate(ini) } } }),
    prisma.rheAtestado.findMany({ where: { tenantId, colaboradorId, afastamento: true, status: { not: 'REJEITADO' }, dataInicio: { lte: diaDate(fim) }, dataFim: { gte: diaDate(ini) } } }),
    prisma.rheAdvertencia.findMany({ where: { tenantId, colaboradorId, nivel: 'SUSPENSAO', status: { not: 'CANCELADA' }, data: { lte: diaDate(fim) } } }),
    prisma.rheFeriasProg.findMany({ where: { tenantId, colaboradorId, status: { in: ['APROVADA', 'EM_GOZO', 'CONCLUIDA'] }, inicio: { lte: diaDate(fim) }, fim: { gte: diaDate(ini) } } }),
  ])
  let dnr = 0
  for (const l of lic) dnr += sobreposicao(ini, fim, dia(l.inicio), dia(l.fim))
  for (const a of atest) dnr += sobreposicao(ini, fim, addDiasStr(dia(a.dataInicio), 15), dia(a.dataFim))
  for (const a of adv) dnr += sobreposicao(ini, fim, dia(a.data), addDiasStr(dia(a.data), (a.diasSuspensao ?? 1) - 1))
  for (const f of fer) dnr += sobreposicao(ini, fim, dia(f.inicio), dia(f.fim))
  return Math.min(30, dnr)
}

export async function calcularFolha(tenantId: string, competencia: string, tipo: (typeof TIPOS_FOLHA)[number], userId: string) {
  const ini = mesIni(competencia), fim = mesFim(competencia)
  const cfg = await getConfig(tenantId)
  const tab = await tabelasVigentes(tenantId, competencia)
  const avisos: string[] = []
  if (tab.modeloAValidar) avisos.push('Tabelas fiscais (INSS/IRRF/FGTS) em modelo: validar com o contador antes do fechamento.')
  const cols = await prisma.rheColaborador.findMany({ where: { tenantId, status: { not: 'EM_ADMISSAO' }, dataAdmissao: { not: null, lte: diaDate(fim) }, OR: [{ dataDesligamento: null }, { dataDesligamento: { gte: diaDate(ini) } }] }, orderBy: { nome: 'asc' } })
  const jornadas = Object.fromEntries((await prisma.rheJornada.findMany({ where: { tenantId } })).map((j) => [j.id, j]))
  const folha = await prisma.rheFolha.upsert({ where: { tenantId_competencia_tipo: { tenantId, competencia, tipo } }, create: { tenantId, competencia, tipo }, update: {} })
  if (folha.status === 'FECHADA') throw Object.assign(new Error('Folha fechada: reabra para recalcular.'), { status: 409 })
  const holerites: any[] = []
  const tot = { bruto: 0, descontos: 0, liquido: 0, inss: 0, irrf: 0, fgts: 0, patronal: 0 }
  const eventosCat = Object.fromEntries((await prisma.rheEventoFolha.findMany({ where: { tenantId } })).map((e) => [e.codigo, e]))
  let semPonto = 0
  for (const c of cols) {
    const clt = c.vinculo === 'CLT' || c.vinculo === 'PROFESSOR_HORISTA'
    if (tipo !== 'MENSAL' && !clt) continue
    let h
    if (tipo === 'MENSAL') {
      let ponto: ResumoMes | null = null
      if (c.vinculo === 'CLT' && c.jornadaId) {
        const f = await prisma.rheFechamentoPonto.findFirst({ where: { tenantId, colaboradorId: c.id, competencia, status: 'FECHADO' } })
        if (f) ponto = f.resumo as any
        else { ponto = (await apurarColaboradorMes(tenantId, c, competencia)).resumo; semPonto++ }
      }
      const ferias = (await prisma.rheFeriasProg.findMany({ where: { tenantId, colaboradorId: c.id, status: { in: ['APROVADA', 'EM_GOZO', 'CONCLUIDA'] }, inicio: { gte: diaDate(ini), lte: diaDate(fim) } } })).map((p) => ({ ...(p.valores as any), dias: p.dias, diasAbono: p.diasAbono }))
      const bons = await prisma.rheBonificacao.findMany({ where: { tenantId, colaboradorId: c.id, competencia, status: { in: ['APROVADA', 'PAGA'] } } })
      const manuais = (await prisma.rheLancamentoFolha.findMany({ where: { tenantId, colaboradorId: c.id, competencia } })).map((l) => { const ev = eventosCat[l.eventoCodigo]; return { codigo: l.eventoCodigo, nome: l.descricao ?? ev?.nome ?? l.eventoCodigo, tipo: (ev?.tipo ?? 'PROVENTO') as 'PROVENTO' | 'DESCONTO', valor: l.valor, referencia: l.referencia, incideInss: ev?.incideInss ?? false, incideIrrf: ev?.incideIrrf ?? false, incideFgts: ev?.incideFgts ?? false } })
      const jor = c.jornadaId ? jornadas[c.jornadaId] : null
      let bhVencidoMin = 0
      if (jor?.bancoHoras) bhVencidoMin = saldoBanco(await bancoRows(tenantId, c.id), diaDate(fim)).vencidoMin
      h = calcularHolerite({
        competencia, tipoFolha: 'MENSAL', colab: { vinculo: c.vinculo, salarioBase: c.salarioBase, valorHora: c.valorHora, cargaMensalHoras: c.cargaMensalHoras, dependentesIrrf: c.dependentesIrrf, dataAdmissao: dia(c.dataAdmissao!), dataDesligamento: c.dataDesligamento ? dia(c.dataDesligamento) : null, bancoHoras: !!jor?.bancoHoras },
        ponto, cfg: { divisorHoras: cfg.divisorHoras, adicionalNoturnoPct: cfg.adicionalNoturnoPct, horaNoturnaReduzida: cfg.horaNoturnaReduzida, he50Pct: cfg.he50Pct, he100Pct: cfg.he100Pct, descontaDsrFalta: cfg.descontaDsrFalta },
        diasNaoRemunerados: await diasNaoRemunerados(tenantId, c.id, competencia), ferias, bonificacoes: bons.map((b) => ({ tipo: b.tipo, descricao: b.descricao, valor: b.valor, incideEncargos: b.incideEncargos })), manuais, bhVencidoMin, tabelas: tab,
      })
    } else {
      const ano = competencia.slice(0, 4)
      const refFim = c.dataDesligamento && dia(c.dataDesligamento) < fim ? dia(c.dataDesligamento) : fim
      const adm = dia(c.dataAdmissao!) > `${ano}-01-01` ? dia(c.dataAdmissao!) : `${ano}-01-01`
      const av = Math.min(12, avos(adm, refFim))
      if (av <= 0) continue
      let adiantamento = 0
      if (tipo === 'DECIMO_2A') {
        const f1 = await prisma.rheFolha.findMany({ where: { tenantId, tipo: 'DECIMO_1A', competencia: { startsWith: ano }, status: 'FECHADA' }, select: { id: true } })
        const hs = await prisma.rheHolerite.findMany({ where: { tenantId, colaboradorId: c.id, folhaId: { in: f1.map((x) => x.id) } } })
        adiantamento = hs.reduce((a, x) => a + x.bruto, 0)
        if (!f1.length) avisos.push('1ª parcela do 13º não encontrada (folha DECIMO_1A fechada): adiantamento considerado zero.')
      }
      h = calcularHolerite({ competencia, tipoFolha: tipo, colab: { vinculo: c.vinculo, salarioBase: c.salarioBase, valorHora: c.valorHora, cargaMensalHoras: c.cargaMensalHoras, dependentesIrrf: c.dependentesIrrf }, cfg: { divisorHoras: cfg.divisorHoras, adicionalNoturnoPct: cfg.adicionalNoturnoPct, horaNoturnaReduzida: cfg.horaNoturnaReduzida, he50Pct: cfg.he50Pct, he100Pct: cfg.he100Pct, descontaDsrFalta: cfg.descontaDsrFalta }, tabelas: tab, decimo: { avos: av, mediaVariaveis: tipo === 'DECIMO_2A' ? await mediaVariaveis(tenantId, c.id) : 0, adiantamento } })
    }
    if (!h.itens.length) continue
    for (const a of h.avisos) avisos.push(`${c.nome}: ${a}`)
    holerites.push({ tenantId, folhaId: folha.id, colaboradorId: c.id, vinculo: c.vinculo, itens: h.itens as any, bruto: h.bruto, descontos: h.descontos, liquido: h.liquido, inss: h.inss, irrf: h.irrf, fgts: h.fgts, baseInss: h.baseInss, baseIrrf: h.baseIrrf, patronal: h.patronal })
    for (const k of Object.keys(tot) as Array<keyof typeof tot>) tot[k] += (h as any)[k]
  }
  if (semPonto) avisos.push(`${semPonto} colaborador(es) sem fechamento de ponto: apuração provisória usada. Feche o ponto antes de fechar a folha.`)
  // pró-labore
  const prolab: any[] = []
  if (tipo === 'MENSAL') {
    const socios = await prisma.rheSocio.findMany({ where: { tenantId, ativo: true, proLaboreMensal: { gt: 0 } } })
    for (const s of socios) {
      const inss = calcInssIndividual(s.proLaboreMensal, tab.encargos.proLaboreInssPct, tab.inss)
      const ir = calcIrrf(s.proLaboreMensal, inss, s.dependentesIrrf, tab.irrf).imposto
      prolab.push({ tenantId, folhaId: folha.id, socioId: s.id, competencia, bruto: s.proLaboreMensal, inss, irrf: ir, liquido: r2(s.proLaboreMensal - inss - ir) })
    }
  }
  const pagsT = tipo === 'MENSAL' ? await prisma.rhePagamentoTerceiro.findMany({ where: { tenantId, competencia, status: { in: ['APROVADO', 'PAGO'] } } }) : []
  await prisma.$transaction(async (tx) => {
    await tx.rheHolerite.deleteMany({ where: { folhaId: folha.id } })
    await tx.rheProLabore.deleteMany({ where: { folhaId: folha.id } })
    if (holerites.length) await tx.rheHolerite.createMany({ data: holerites })
    if (prolab.length) await tx.rheProLabore.createMany({ data: prolab })
  }, { timeout: 30000, maxWait: 15000 })
  const totais = {
    colaboradores: holerites.length, bruto: r2(tot.bruto), descontos: r2(tot.descontos), liquido: r2(tot.liquido), inss: r2(tot.inss), irrf: r2(tot.irrf), fgts: r2(tot.fgts), patronalEstimado: r2(tot.patronal),
    proLabore: { socios: prolab.length, bruto: r2(prolab.reduce((a, p) => a + p.bruto, 0)), liquido: r2(prolab.reduce((a, p) => a + p.liquido, 0)), inss: r2(prolab.reduce((a, p) => a + p.inss, 0)), irrf: r2(prolab.reduce((a, p) => a + p.irrf, 0)) },
    terceiros: { pagamentos: pagsT.length, bruto: r2(pagsT.reduce((a, p) => a + p.bruto, 0)), liquido: r2(pagsT.reduce((a, p) => a + p.liquido, 0)) },
    custoTotalEstimado: r2(tot.bruto + tot.fgts + tot.patronal + prolab.reduce((a, p) => a + p.bruto, 0) + pagsT.reduce((a, p) => a + p.bruto + p.patronal, 0)),
    tabelas: tab.origem, modeloAValidar: tab.modeloAValidar,
  }
  return prisma.rheFolha.update({ where: { id: folha.id }, data: { status: 'CALCULADA', totais: totais as any, avisos: avisos.slice(0, 200) as any, calculadaEm: new Date(), calculadaPorId: userId } })
}

export function mountFolha(router: Router) {
  // ---------------------------------------------------------------- tabelas fiscais (por vigência)
  router.get('/folha/tabelas', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json({ items: await prisma.rheTabelaFiscal.findMany({ where: { tenantId: tid(req) }, orderBy: [{ tipo: 'asc' }, { vigenciaInicio: 'desc' }] }), aviso: 'MODELO A VALIDAR POR CONTADOR: confira as tabelas oficiais vigentes.' })
  }))
  router.get('/folha/tabelas/vigentes', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const comp = qs(req.query.competencia) ?? diaLocal(new Date()).slice(0, 7)
    if (!competenciaValida(comp)) throw httpError(400, 'Competência inválida.')
    res.json({ competencia: comp, ...(await tabelasVigentes(tid(req), comp)) })
  }))
  router.post('/folha/tabelas', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ tipo: z.enum(['INSS', 'IRRF', 'FGTS', 'ENCARGOS']), vigenciaInicio: dateISO(), descricao: z.string().max(300).optional(), faixas: z.array(z.object({ ate: z.number().positive().nullable(), aliquota: z.number(), deducao: z.number().optional() })).optional(), parametros: z.record(z.string(), z.any()).optional(), modeloAValidar: z.boolean().default(true), fonte: z.string().max(300).optional() }), req.body)
    const erros = validarTabela(b.tipo, b.faixas, b.parametros)
    if (erros.length) throw httpError(422, erros.join(' '), { erros })
    if (await prisma.rheFolha.findFirst({ where: { tenantId, status: 'FECHADA', competencia: { gte: dia(b.vigenciaInicio).slice(0, 7) } }, select: { id: true } })) throw httpError(409, 'Há folha fechada a partir desta vigência: reabra-a antes de alterar tabelas.')
    const r = await prisma.rheTabelaFiscal.upsert({ where: { tenantId_tipo_vigenciaInicio: { tenantId, tipo: b.tipo, vigenciaInicio: b.vigenciaInicio } }, create: { tenantId, tipo: b.tipo, vigenciaInicio: b.vigenciaInicio, descricao: b.descricao, faixas: b.faixas as any, parametros: b.parametros as any, modeloAValidar: b.modeloAValidar, fonte: b.fonte, criadoPorId: uid(req) }, update: { descricao: b.descricao, faixas: b.faixas as any, parametros: b.parametros as any, modeloAValidar: b.modeloAValidar, fonte: b.fonte } })
    await auditar(req, 'TABELA_FISCAL', 'RheTabelaFiscal', r.id, { tipo: b.tipo })
    res.status(201).json(r)
  }))
  router.delete('/folha/tabelas/:id', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const t = await prisma.rheTabelaFiscal.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!t) throw httpError(404, 'Tabela não encontrada.')
    if (await prisma.rheFolha.findFirst({ where: { tenantId: tid(req), status: 'FECHADA', competencia: { gte: dia(t.vigenciaInicio).slice(0, 7) } }, select: { id: true } })) throw httpError(409, 'Há folha fechada a partir desta vigência.')
    await prisma.rheTabelaFiscal.delete({ where: { id: t.id } })
    res.status(204).end()
  }))

  // ---------------------------------------------------------------- eventos e lançamentos manuais
  router.get('/folha/eventos', exigirRhOuFinanceiro, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json({ items: await prisma.rheEventoFolha.findMany({ where: { tenantId: tid(req) }, orderBy: [{ tipo: 'asc' }, { codigo: 'asc' }] }) })
  }))
  router.post('/folha/eventos', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ codigo: z.string().min(2).max(30).regex(/^[A-Za-z0-9_]+$/).transform((s) => s.toUpperCase()), nome: z.string().min(2).max(120), tipo: z.enum(['PROVENTO', 'DESCONTO']), incideInss: z.boolean().default(false), incideIrrf: z.boolean().default(false), incideFgts: z.boolean().default(false) }), req.body)
    if (await prisma.rheEventoFolha.findFirst({ where: { tenantId: tid(req), codigo: b.codigo }, select: { id: true } })) throw httpError(409, 'Já existe evento com este código.')
    res.status(201).json(await prisma.rheEventoFolha.create({ data: { ...b, tenantId: tid(req) } }))
  }))
  router.post('/folha/lancamentos', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ colaboradorId: z.string(), competencia: z.string(), eventoCodigo: z.string(), valor: z.number().positive().max(1_000_000), referencia: z.number().optional(), descricao: z.string().max(200).optional() }), req.body)
    if (!competenciaValida(b.competencia)) throw httpError(400, 'Competência inválida.')
    await carregarColaborador(tenantId, b.colaboradorId)
    const ev = await prisma.rheEventoFolha.findFirst({ where: { tenantId, codigo: b.eventoCodigo.toUpperCase(), ativo: true } })
    if (!ev) throw httpError(422, 'Evento não encontrado. Rode /bootstrap ou cadastre o evento.')
    if (['INSS', 'IRRF', 'FALTAS', 'ATRASOS', 'SAL', 'DSR_HE', 'DSR_FALTAS'].includes(ev.codigo)) throw httpError(422, 'Este evento é calculado automaticamente pela folha.')
    if (await prisma.rheFolha.findFirst({ where: { tenantId, competencia: b.competencia, tipo: 'MENSAL', status: 'FECHADA' }, select: { id: true } })) throw httpError(409, 'Folha da competência fechada.')
    const l = await prisma.rheLancamentoFolha.create({ data: { ...b, eventoCodigo: ev.codigo, tenantId, criadoPorId: uid(req) } })
    await auditar(req, 'LANCAR_EVENTO', 'RheLancamentoFolha', l.id, { evento: ev.codigo })
    res.status(201).json(l)
  }))
  router.get('/folha/lancamentos', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const where: any = { tenantId }
    for (const f of ['competencia', 'colaboradorId'] as const) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    res.json({ items: await prisma.rheLancamentoFolha.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 }) })
  }))
  router.delete('/folha/lancamentos/:id', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const l = await prisma.rheLancamentoFolha.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!l) throw httpError(404, 'Lançamento não encontrado.')
    if (await prisma.rheFolha.findFirst({ where: { tenantId: tid(req), competencia: l.competencia, tipo: 'MENSAL', status: 'FECHADA' }, select: { id: true } })) throw httpError(409, 'Folha da competência fechada.')
    await prisma.rheLancamentoFolha.delete({ where: { id: l.id } })
    res.status(204).end()
  }))

  // ---------------------------------------------------------------- cálculo / fechamento
  router.post('/folha/calcular', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ competencia: z.string(), tipo: z.enum(TIPOS_FOLHA).default('MENSAL') }), req.body)
    if (!competenciaValida(b.competencia)) throw httpError(400, 'Competência inválida (use YYYY-MM).')
    if (b.tipo === 'DECIMO_2A' && !b.competencia.endsWith('-12')) throw httpError(422, 'A 2ª parcela do 13º é calculada na competência de dezembro (até 20/12).')
    if (b.tipo === 'DECIMO_1A' && +b.competencia.slice(5) > 11) throw httpError(422, 'A 1ª parcela do 13º é paga até 30/11.')
    const f = await calcularFolha(tid(req), b.competencia, b.tipo, uid(req))
    await auditar(req, 'CALCULAR_FOLHA', 'RheFolha', f.id, { competencia: b.competencia, tipo: b.tipo })
    res.json(f)
  }))

  router.get('/folha', exigirRhOuFinanceiro, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const where: any = { tenantId: tid(req) }; const c = qs(req.query.competencia); if (c) where.competencia = c
    res.json({ items: await prisma.rheFolha.findMany({ where, orderBy: [{ competencia: 'desc' }, { tipo: 'asc' }], take: 100 }) })
  }))

  router.get('/folha/:id/holerites', exigirRhOuFinanceiro, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const f = await prisma.rheFolha.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!f) throw httpError(404, 'Folha não encontrada.')
    const hs = await prisma.rheHolerite.findMany({ where: { tenantId, folhaId: f.id } })
    const nomes = Object.fromEntries((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: hs.map((h) => h.colaboradorId) } }, select: { id: true, nome: true, matricula: true } })).map((c) => [c.id, c]))
    const prolab = await prisma.rheProLabore.findMany({ where: { tenantId, folhaId: f.id } })
    const socios = Object.fromEntries((await prisma.rheSocio.findMany({ where: { tenantId, id: { in: prolab.map((p) => p.socioId) } }, select: { id: true, nome: true } })).map((s) => [s.id, s.nome]))
    if (isRh(req)) await logSensivel(req, 'folha', 'REMUNERACAO')
    res.json({ folha: f, holerites: hs.map(({ itens, ...h }) => ({ ...h, colaboradorNome: nomes[h.colaboradorId]?.nome, matricula: nomes[h.colaboradorId]?.matricula })), proLabore: prolab.map((p) => ({ ...p, socioNome: socios[p.socioId] })) })
  }))

  router.get('/folha/holerite/:id', exigirAutenticado, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const h = await prisma.rheHolerite.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!h) throw httpError(404, 'Holerite não encontrado.')
    const me = await meuColaborador(req)
    const proprio = me?.id === h.colaboradorId
    if (!isRh(req) && !isFin(req) && !proprio) throw httpError(403, 'Sem permissão para este holerite.')
    const f = await prisma.rheFolha.findFirst({ where: { id: h.folhaId, tenantId } })
    if (proprio && !isRh(req) && f?.status !== 'FECHADA') throw httpError(403, 'O holerite estará disponível após o fechamento da folha.')
    const c = await carregarColaborador(tenantId, h.colaboradorId)
    if (!proprio) await logSensivel(req, 'holerite', 'REMUNERACAO', h.colaboradorId, h.id)
    res.json({ ...h, folha: f && { id: f.id, competencia: f.competencia, tipo: f.tipo, status: f.status }, colaborador: { id: c.id, nome: c.nome, matricula: c.matricula, cpfMascarado: c.cpfFinal ? `***.***.***-${c.cpfFinal}` : null }, aviso: 'Cálculo simplificado (modelo a validar por contador); não substitui o holerite oficial do eSocial.' })
  }))

  router.get('/meus/holerites', exigirAutenticado, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const me = await meuColaborador(req)
    if (!me) throw httpError(403, 'Seu usuário não está vinculado a um colaborador do RH.')
    const hs = await prisma.rheHolerite.findMany({ where: { tenantId, colaboradorId: me.id }, orderBy: { createdAt: 'desc' }, take: 60 })
    const fs = Object.fromEntries((await prisma.rheFolha.findMany({ where: { tenantId, id: { in: hs.map((h) => h.folhaId) } } })).map((f) => [f.id, f]))
    res.json({ items: hs.filter((h) => fs[h.folhaId]?.status === 'FECHADA').map(({ itens, ...h }) => ({ ...h, competencia: fs[h.folhaId].competencia, tipoFolha: fs[h.folhaId].tipo })) })
  }))

  router.post('/folha/:id/fechar', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ ignorarPonto: z.boolean().default(false) }).default({}), req.body ?? {})
    const f = await prisma.rheFolha.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!f) throw httpError(404, 'Folha não encontrada.')
    if (f.status === 'FECHADA') throw httpError(409, 'Folha já fechada.')
    if (f.status !== 'CALCULADA') throw httpError(422, 'Calcule a folha antes de fechar.')
    const pend: string[] = []
    if (f.tipo === 'MENSAL' && !b.ignorarPonto) {
      const hs = await prisma.rheHolerite.findMany({ where: { tenantId, folhaId: f.id, vinculo: 'CLT' }, select: { colaboradorId: true } })
      const fech = new Set((await prisma.rheFechamentoPonto.findMany({ where: { tenantId, competencia: f.competencia, status: 'FECHADO' }, select: { colaboradorId: true } })).map((x) => x.colaboradorId))
      const comJornada = new Set((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: hs.map((h) => h.colaboradorId) }, jornadaId: { not: null } }, select: { id: true } })).map((x) => x.id))
      const nomes = Object.fromEntries((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: hs.map((h) => h.colaboradorId) } }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]))
      for (const h of hs) if (comJornada.has(h.colaboradorId) && !fech.has(h.colaboradorId)) pend.push(`Ponto não fechado: ${nomes[h.colaboradorId]}`)
    }
    const semNf = f.tipo === 'MENSAL' ? await prisma.rhePagamentoTerceiro.count({ where: { tenantId, competencia: f.competencia, status: 'APROVADO' } }) : 0
    void semNf
    if (pend.length) return res.status(422).json({ error: 'Folha com pendências: feche o ponto dos colaboradores.', pendencias: pend.slice(0, 50) })
    const pagBanco: any[] = []
    if (f.tipo === 'MENSAL') {
      for (const h of await prisma.rheHolerite.findMany({ where: { tenantId, folhaId: f.id }, select: { colaboradorId: true, itens: true } })) {
        const bh = (h.itens as any[]).find((i) => i.codigo === 'BH_VENCIDO')
        // banco de horas vencido pago como hora extra: baixa os créditos (PAGAMENTO), uma única vez por competência
        if (bh?.referencia > 0) pagBanco.push({ tenantId, colaboradorId: h.colaboradorId, data: diaDate(mesFim(f.competencia)), tipo: 'PAGAMENTO', minutos: -Math.round(bh.referencia * 60), competencia: f.competencia, origem: 'FOLHA', observacao: `Banco vencido pago na folha ${f.competencia}`, criadoPorId: uid(req) })
      }
    }
    await prisma.$transaction(async (tx) => {
      if (f.tipo === 'MENSAL') {
        await tx.rheBonificacao.updateMany({ where: { tenantId, competencia: f.competencia, status: 'APROVADA' }, data: { status: 'PAGA' } })
        await tx.rheBancoLanc.deleteMany({ where: { tenantId, competencia: f.competencia, origem: 'FOLHA' } })
        if (pagBanco.length) await tx.rheBancoLanc.createMany({ data: pagBanco })
      }
      await tx.rheFolha.update({ where: { id: f.id }, data: { status: 'FECHADA', fechadaEm: new Date(), fechadaPorId: uid(req) } })
    }, { timeout: 30000, maxWait: 15000 })
    let lancamentos: any[] = []; let integ: any = null
    try {
      lancamentos = await gerarLancamentosFolha(tenantId, f.competencia)
      await prisma.rheFolha.update({ where: { id: f.id }, data: { lancamentosEm: new Date() } })
      integ = await notificarFolhaFechada({ tenantId, competencia: f.competencia, lancamentos })
    } catch (e: any) { console.error('[rh] lançamentos da folha:', e?.message) }
    const hs = await prisma.rheHolerite.findMany({ where: { tenantId, folhaId: f.id }, select: { colaboradorId: true } })
    const us = await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: hs.map((h) => h.colaboradorId) }, userId: { not: null } }, select: { userId: true } })
    for (const u of us) await notify({ tenantId, userId: u.userId!, assunto: 'Holerite disponível', mensagem: `Seu holerite de ${f.competencia} já está disponível.`, refType: 'RheFolha', refId: f.id })
    await auditar(req, 'FECHAR_FOLHA', 'RheFolha', f.id, { competencia: f.competencia, tipo: f.tipo, lancamentos: lancamentos.length })
    res.json({ id: f.id, status: 'FECHADA', lancamentos: lancamentos.length, integracao: integ })
  }))

  router.post('/folha/:id/reabrir', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ motivo: z.string().min(10).max(500) }), req.body)
    const f = await prisma.rheFolha.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!f) throw httpError(404, 'Folha não encontrada.')
    if (f.status !== 'FECHADA') throw httpError(409, 'A folha não está fechada.')
    await prisma.$transaction(async (tx) => {
      if (f.tipo === 'MENSAL') {
        await tx.rheBonificacao.updateMany({ where: { tenantId, competencia: f.competencia, status: 'PAGA' }, data: { status: 'APROVADA' } })
        await tx.rheBancoLanc.deleteMany({ where: { tenantId, competencia: f.competencia, origem: 'FOLHA' } })
      }
      await tx.rheFolha.update({ where: { id: f.id }, data: { status: 'CALCULADA', fechadaEm: null, fechadaPorId: null, lancamentosEm: null } })
    })
    await auditar(req, 'REABRIR_FOLHA', 'RheFolha', f.id, { motivo: b.motivo })
    res.json({ id: f.id, status: 'CALCULADA', aviso: 'Se os lançamentos já foram enviados ao Financeiro, cancele-os por lá: as chaves de idempotência serão as mesmas no novo fechamento.' })
  }))

  router.get('/folha/:competencia/lancamentos', exigirRhOuFinanceiro, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const comp = String(req.params.competencia)
    if (!competenciaValida(comp)) throw httpError(400, 'Competência inválida.')
    const items = await gerarLancamentosFolha(tid(req), comp)
    res.json({ competencia: comp, total: r2(items.reduce((a, i) => a + i.valor, 0)), items, aviso: 'Lançamentos para conferência/autorização no Financeiro. Valores e vencimentos são modelo a validar por contador.' })
  }))

  router.get('/dados-bancarios/:colaboradorId', exigirRhOuFinanceiro, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await carregarColaborador(tid(req), String(req.params.colaboradorId))
    await logSensivel(req, 'dados-bancarios', 'REMUNERACAO', c.id, c.id, 'pagamento')
    res.json({ colaboradorId: c.id, nome: c.nome, banco: c.banco, agencia: c.agencia, conta: revelar(c.contaCifrada), pix: revelar(c.pixCifrado), cnpjPj: c.cnpjPj })
  }))
}
void salarioReferencia
