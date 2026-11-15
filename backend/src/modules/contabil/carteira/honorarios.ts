import type { Request, Router } from 'express'
import {
  CONTADORES, EQUIPE, FINANCEIRO, INTERNO, comp, compAtual, dataOpt, dia, diaDoMes, exigir, getCfg, ehGestao, hojeMeioDia, httpError, idsVisiveis, iso10, pageParams, papelDe, parseBody, prisma, qs, r2,
  restrito, somaDias, somaMeses, tid, txt, txtOpt, uid, z, clienteOuErro,
} from './common'
import { asyncHandler, auditar, nomesDeUsuarios } from './host'
import { valorVigente, vigenteEm } from './calculos'

const LEITURA_HON = [...CONTADORES, 'FINANCE']

/** Honorário com situação derivada (ATRASADO quando aberto e vencido). */
export const situacaoHon = (h: { status: string; vencimento: Date }, hoje = hojeMeioDia()) => (h.status === 'ABERTO' && h.vencimento < hoje ? 'ATRASADO' : h.status)

export async function resumoHonorarios(tenantId: string, ids: string[] | null, competencia?: string) {
  const hoje = hojeMeioDia()
  const base: any = { tenantId, status: { not: 'CANCELADO' }, ...(ids ? { clienteId: { in: ids } } : {}), ...(competencia ? { competencia } : {}) }
  const rows = await prisma.ctbHonorario.findMany({ where: base, select: { valor: true, valorPago: true, status: true, vencimento: true, clienteId: true } })
  let emitido = 0, recebido = 0, aberto = 0, atrasado = 0, qtdAtrasados = 0
  for (const h of rows) {
    emitido += h.valor
    if (h.status === 'PAGO') recebido += h.valorPago ?? h.valor
    else if (h.vencimento < hoje) { atrasado += h.valor; qtdAtrasados++ } else aberto += h.valor
  }
  return { emitido: r2(emitido), recebido: r2(recebido), aVencer: r2(aberto), atrasado: r2(atrasado), qtdAtrasados, inadimplenciaPct: emitido ? r2((atrasado / emitido) * 100) : 0, quantidade: rows.length }
}

export function registrarHonorarios(router: Router) {
  router.get('/honorarios', exigir(LEITURA_HON), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const { page, pageSize, skip, take } = pageParams(req.query)
    const ids = await idsVisiveis(req)
    const where: any = { tenantId, ...(ids ? { clienteId: { in: ids } } : {}) }
    if (qs(req.query.competencia)) where.competencia = qs(req.query.competencia)
    if (qs(req.query.clienteId)) { if (ids && !ids.includes(qs(req.query.clienteId)!)) where.clienteId = '__nenhum__'; else where.clienteId = qs(req.query.clienteId) }
    const st = qs(req.query.status)
    if (st === 'ATRASADO') { where.status = 'ABERTO'; where.vencimento = { lt: hojeMeioDia() } } else if (st === 'ABERTO') { where.status = 'ABERTO'; where.vencimento = { gte: hojeMeioDia() } } else if (st) where.status = st
    const [total, rows] = await Promise.all([prisma.ctbHonorario.count({ where }), prisma.ctbHonorario.findMany({ where, orderBy: [{ vencimento: 'desc' }, { createdAt: 'desc' }], skip, take })])
    const clis = await prisma.ctbCliente.findMany({ where: { tenantId, id: { in: rows.map((r) => r.clienteId) } }, select: { id: true, nome: true } })
    const hoje = hojeMeioDia()
    res.json({
      items: rows.map((h) => ({ ...h, situacao: situacaoHon(h, hoje), clienteNome: clis.find((c) => c.id === h.clienteId)?.nome ?? null, diasAtraso: h.status === 'ABERTO' && h.vencimento < hoje ? Math.floor((hoje.getTime() - h.vencimento.getTime()) / 86_400_000) : 0 })),
      total, page, pageSize,
    })
  }))

  router.get('/honorarios/resumo', exigir(LEITURA_HON), asyncHandler(async (req, res) => {
    res.json(await resumoHonorarios(tid(req), await idsVisiveis(req), qs(req.query.competencia)))
  }))

  router.get('/honorarios/inadimplencia', exigir(LEITURA_HON), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const ids = await idsVisiveis(req)
    const hoje = hojeMeioDia()
    const rows = await prisma.ctbHonorario.findMany({ where: { tenantId, status: 'ABERTO', vencimento: { lt: hoje }, ...(ids ? { clienteId: { in: ids } } : {}) }, orderBy: { vencimento: 'asc' } })
    const por = new Map<string, { clienteId: string; valor: number; titulos: number; maisAntigo: Date }>()
    for (const h of rows) {
      const x = por.get(h.clienteId) ?? { clienteId: h.clienteId, valor: 0, titulos: 0, maisAntigo: h.vencimento }
      x.valor += h.valor; x.titulos++; if (h.vencimento < x.maisAntigo) x.maisAntigo = h.vencimento
      por.set(h.clienteId, x)
    }
    const clis = await prisma.ctbCliente.findMany({ where: { tenantId, id: { in: [...por.keys()] } }, select: { id: true, nome: true, status: true, responsavelId: true, telefone: true, email: true } })
    const nomes = await nomesDeUsuarios(tenantId, clis.map((c) => c.responsavelId))
    const items = [...por.values()].map((x) => { const c = clis.find((y) => y.id === x.clienteId); const dias = Math.floor((hoje.getTime() - x.maisAntigo.getTime()) / 86_400_000); return { ...x, valor: r2(x.valor), clienteNome: c?.nome ?? '—', clienteStatus: c?.status, responsavelNome: c?.responsavelId ? nomes.get(c.responsavelId) ?? null : null, diasAtraso: dias, faixa: dias <= 15 ? '1-15 dias' : dias <= 30 ? '16-30 dias' : dias <= 60 ? '31-60 dias' : '60+ dias' } }).sort((a, b) => b.valor - a.valor)
    res.json({ items, total: r2(items.reduce((s, i) => s + i.valor, 0)) })
  }))

  const avulso = z.object({ clienteId: z.string().max(80), competencia: comp, descricao: txtOpt(200), valor: z.number().positive().max(10_000_000), vencimento: dataOpt })
  router.post('/honorarios', exigir(FINANCEIRO), asyncHandler(async (req, res) => {
    const d = parseBody(avulso, req.body)
    const tenantId = tid(req)
    await clienteOuErro(req, d.clienteId)
    const h = await prisma.ctbHonorario.create({ data: { tenantId, clienteId: d.clienteId, competencia: d.competencia, descricao: d.descricao ?? 'Honorário avulso', valor: d.valor, vencimento: d.vencimento ?? diaDoMes(d.competencia, 10), avulso: true } })
    await auditar(req, 'HONORARIO_AVULSO', 'CtbHonorario', h.id, { valor: h.valor })
    res.status(201).json(h)
  }))

  // Geração mensal: uma cobrança por contrato vigente do mês (idempotente pela chave contrato+competência).
  router.post('/honorarios/gerar', exigir(FINANCEIRO), asyncHandler(async (req, res) => {
    const d = parseBody(z.object({ competencia: comp.default(compAtual()) }), req.body)
    const tenantId = tid(req)
    if (d.competencia > somaMeses(compAtual(), 1)) throw httpError(400, 'Não é possível gerar honorários de competência futura (além do próximo mês).')
    const contratos = await prisma.ctbContrato.findMany({ where: { tenantId, status: 'VIGENTE' } })
    const clientes = await prisma.ctbCliente.findMany({ where: { tenantId, id: { in: contratos.map((c) => c.clienteId) } }, select: { id: true, status: true } })
    const ativos = new Set(clientes.filter((c) => c.status === 'ATIVO').map((c) => c.id))
    let criados = 0, existentes = 0, ignorados = 0, total = 0
    for (const c of contratos) {
      if (!ativos.has(c.clienteId) || !vigenteEm(c, d.competencia)) { ignorados++; continue }
      const jaTem = await prisma.ctbHonorario.findFirst({ where: { tenantId, contratoId: c.id, competencia: d.competencia }, select: { id: true } })
      if (jaTem) { existentes++; continue }
      const valor = valorVigente(c, d.competencia)
      try {
        await prisma.ctbHonorario.create({ data: { tenantId, clienteId: c.clienteId, contratoId: c.id, competencia: d.competencia, descricao: `Honorários contábeis ${d.competencia} (contrato ${c.numero})`, valor, vencimento: diaDoMes(d.competencia, c.diaVencimento) } })
        criados++; total += valor
      } catch (e: any) { if (e?.code === 'P2002') existentes++; else throw e }
    }
    await auditar(req, 'HONORARIOS_GERADOS', 'CtbHonorario', d.competencia, { criados, existentes, ignorados, total: r2(total) })
    res.status(201).json({ competencia: d.competencia, criados, jaExistiam: existentes, ignorados, valorTotal: r2(total) })
  }))

  router.post('/honorarios/:id/baixar', exigir(FINANCEIRO), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const h = await prisma.ctbHonorario.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!h) throw httpError(404, 'Honorário não encontrado.')
    if (h.status !== 'ABERTO') throw httpError(409, `Honorário ${h.status === 'PAGO' ? 'já está pago' : 'cancelado'}.`)
    const d = parseBody(z.object({ valorPago: z.number().positive().max(10_000_000).optional(), pagoEm: dataOpt, forma: z.enum(['PIX', 'BOLETO', 'TRANSFERENCIA', 'CARTAO', 'DINHEIRO']).default('PIX') }), req.body)
    const r = await prisma.ctbHonorario.update({ where: { id: h.id }, data: { status: 'PAGO', pagoEm: d.pagoEm ?? hojeMeioDia(), valorPago: d.valorPago ?? h.valor, forma: d.forma } })
    await auditar(req, 'HONORARIO_BAIXADO', 'CtbHonorario', h.id, { valor: r.valorPago, forma: d.forma })
    res.json(r)
  }))

  router.post('/honorarios/:id/cancelar', exigir(FINANCEIRO), asyncHandler(async (req, res) => {
    const h = await prisma.ctbHonorario.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!h) throw httpError(404, 'Honorário não encontrado.')
    if (h.status !== 'ABERTO') throw httpError(409, 'Só honorário em aberto pode ser cancelado.')
    const d = parseBody(z.object({ motivo: txt(300).pipe(z.string().min(3)) }), req.body)
    await auditar(req, 'HONORARIO_CANCELADO', 'CtbHonorario', h.id, { motivo: d.motivo, valor: h.valor })
    res.json(await prisma.ctbHonorario.update({ where: { id: h.id }, data: { status: 'CANCELADO', descricao: `${h.descricao ?? ''} [cancelado: ${d.motivo}]`.slice(0, 300) } }))
  }))

  // ============ apontamento de horas ============
  router.get('/apontamentos', exigir(INTERNO), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const { page, pageSize, skip, take } = pageParams(req.query)
    const ids = await idsVisiveis(req)
    const where: any = { tenantId, ...(ids ? { clienteId: { in: ids } } : {}) }
    if (qs(req.query.clienteId)) where.clienteId = qs(req.query.clienteId)
    if (qs(req.query.userId)) where.userId = qs(req.query.userId)
    if (qs(req.query.de) || qs(req.query.ate)) where.data = { ...(qs(req.query.de) ? { gte: dia(qs(req.query.de)!) ?? undefined } : {}), ...(qs(req.query.ate) ? { lte: dia(qs(req.query.ate)!) ?? undefined } : {}) }
    const [total, rows, soma] = await Promise.all([prisma.ctbApontamento.count({ where }), prisma.ctbApontamento.findMany({ where, orderBy: [{ data: 'desc' }, { createdAt: 'desc' }], skip, take }), prisma.ctbApontamento.aggregate({ where, _sum: { minutos: true } })])
    const [clis, nomes] = await Promise.all([prisma.ctbCliente.findMany({ where: { tenantId, id: { in: rows.map((r) => r.clienteId) } }, select: { id: true, nome: true } }), nomesDeUsuarios(tenantId, rows.map((r) => r.userId))])
    res.json({ items: rows.map((a) => ({ ...a, clienteNome: clis.find((c) => c.id === a.clienteId)?.nome ?? null, userNome: nomes.get(a.userId) ?? null })), total, page, pageSize, totalMinutos: soma._sum.minutos ?? 0 })
  }))

  router.post('/apontamentos', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const d = parseBody(z.object({ clienteId: z.string().max(80), data: dataOpt, minutos: z.number().int().min(1).max(1440), categoria: z.string().trim().max(40).default('GERAL'), descricao: txtOpt(300), tarefaId: z.string().max(80).optional().nullable() }), req.body)
    const tenantId = tid(req)
    await clienteOuErro(req, d.clienteId)
    const data = d.data ?? hojeMeioDia()
    if (data > somaDias(hojeMeioDia(), 1)) throw httpError(400, 'Não é possível apontar horas em data futura.')
    const a = await prisma.ctbApontamento.create({ data: { tenantId, clienteId: d.clienteId, userId: uid(req), data, minutos: d.minutos, categoria: d.categoria, descricao: d.descricao, tarefaId: d.tarefaId ?? null } })
    res.status(201).json(a)
  }))

  router.delete('/apontamentos/:id', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const a = await prisma.ctbApontamento.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!a) throw httpError(404, 'Apontamento não encontrado.')
    if (a.userId !== uid(req) && !ehGestao(req)) throw httpError(403, 'Só quem apontou (ou a gestão) pode remover.')
    await prisma.ctbApontamento.delete({ where: { id: a.id } })
    res.status(204).end()
  }))

  // ============ rentabilidade ============
  router.get('/rentabilidade', exigir(LEITURA_HON), asyncHandler(async (req, res) => {
    res.json(await rentabilidade(req, Number(qs(req.query.meses)) || 3))
  }))
}

export async function rentabilidade(req: Request, meses = 3) {
  const tenantId = tid(req)
  meses = Math.min(12, Math.max(1, meses))
  const cfg = await getCfg(tenantId)
  const ids = await idsVisiveis(req)
  const inicio = new Date(Date.UTC(hojeMeioDia().getUTCFullYear(), hojeMeioDia().getUTCMonth() - meses + 1, 1, 12))
  const [clientes, contratos, apont] = await Promise.all([
    prisma.ctbCliente.findMany({ where: { tenantId, status: 'ATIVO', ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, nome: true, regime: true, segmento: true, responsavelId: true } }),
    prisma.ctbContrato.findMany({ where: { tenantId, status: 'VIGENTE' } }),
    prisma.ctbApontamento.groupBy({ by: ['clienteId'], where: { tenantId, data: { gte: inicio } }, _sum: { minutos: true } }),
  ])
  const comp = compAtual()
  const horas = new Map(apont.map((a) => [a.clienteId, (a._sum.minutos ?? 0) / 60]))
  const receita = new Map<string, number>()
  for (const c of contratos) if (vigenteEm(c, comp)) receita.set(c.clienteId, (receita.get(c.clienteId) ?? 0) + valorVigente(c, comp))
  const items = clientes.map((c) => {
    const rec = r2(receita.get(c.id) ?? 0)
    const hMes = r2((horas.get(c.id) ?? 0) / meses)
    const custo = r2(hMes * cfg.custoHora)
    const margem = r2(rec - custo)
    return { clienteId: c.id, cliente: c.nome, regime: c.regime, segmento: c.segmento, responsavelId: c.responsavelId, receitaMensal: rec, horasMes: hMes, custoMensal: custo, margem, margemPct: rec ? r2((margem / rec) * 100) : null, receitaPorHora: hMes ? r2(rec / hMes) : null, semApontamento: hMes === 0 }
  }).sort((a, b) => b.margem - a.margem)
  return { meses, custoHora: cfg.custoHora, items, aviso: 'Margem estimada = honorário mensal vigente − (horas apontadas/mês × custo-hora configurado). Clientes sem apontamento aparecem com margem cheia: apontamento incompleto distorce o ranking.' }
}
