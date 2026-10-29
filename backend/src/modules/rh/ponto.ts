import { Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { notify } from '../core/notify'
import { apurarColaboradorMes } from './apuracao'
import { BancoRow, addMeses, competenciaDe, competenciaValida, creditoBancoMin, diaLocal, diasDoMes, hhmmToMin, instanteLocal, minToHhmm, saldoBanco } from './calculo'
import { HR, auditar, carregarColaborador, dia, diaDate, exigirAcesso, exigirMeuColaborador, exigirRh, getConfig, httpError, ipHashDe, isRh, meuColaborador, podeVer, equipeIds, tid, uid } from './common'

const TIPOS_MARC = ['ENTRADA', 'SAIDA_INTERVALO', 'RETORNO_INTERVALO', 'SAIDA'] as const
const SEQ: Record<string, string> = { '': 'ENTRADA', ENTRADA: 'SAIDA_INTERVALO', SAIDA_INTERVALO: 'RETORNO_INTERVALO', RETORNO_INTERVALO: 'SAIDA', SAIDA: 'ENTRADA' }

export async function competenciaFechada(tenantId: string, colaboradorId: string, comp: string) {
  const f = await prisma.rheFechamentoPonto.findFirst({ where: { tenantId, colaboradorId, competencia: comp, status: 'FECHADO' }, select: { id: true } })
  return !!f
}
async function exigirAberta(tenantId: string, colaboradorId: string, d: string) {
  if (await competenciaFechada(tenantId, colaboradorId, competenciaDe(d))) throw httpError(409, `O ponto de ${competenciaDe(d)} está fechado. Peça a reabertura ao RH.`)
}

export async function bancoRows(tenantId: string, colaboradorId: string): Promise<BancoRow[]> {
  const rows = await prisma.rheBancoLanc.findMany({ where: { tenantId, colaboradorId }, orderBy: [{ data: 'asc' }, { createdAt: 'asc' }] })
  return rows.map((r) => ({ id: r.id, data: r.data, tipo: r.tipo, minutos: r.minutos, venceEm: r.venceEm, createdAt: r.createdAt }))
}
const fimDoMes = (comp: string) => { const d = diasDoMes(comp); return diaDate(d[d.length - 1]) }

export function mountPonto(router: Router) {
  // ---------------------------------------------------------------- marcação (autosserviço)
  router.get('/ponto/hoje', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const me = await exigirMeuColaborador(req); const tenantId = tid(req)
    const hoje = diaLocal(new Date())
    const ms = await prisma.rheMarcacao.findMany({ where: { tenantId, colaboradorId: me.id, dataHora: { gte: instanteLocal(hoje, '00:00'), lt: new Date(instanteLocal(hoje, '00:00').getTime() + 86400000) } }, orderBy: { dataHora: 'asc' } })
    const ult = ms.length ? ms[ms.length - 1].tipo : ''
    res.json({ data: hoje, marcacoes: ms.map((m) => ({ id: m.id, tipo: m.tipo, dataHora: m.dataHora, origem: m.origem })), proximo: SEQ[ult] })
  }))

  router.post('/ponto/marcar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const me = await exigirMeuColaborador(req); const tenantId = tid(req)
    const b = parseBody(z.object({ tipo: z.enum(TIPOS_MARC).optional(), origem: z.enum(['WEB', 'APP']).default('WEB'), observacao: z.string().max(300).optional() }), req.body)
    const c = await carregarColaborador(tenantId, me.id)
    if (c.status === 'DESLIGADO') throw httpError(409, 'Colaborador desligado não registra ponto.')
    if (c.vinculo === 'PJ') throw httpError(409, 'Colaboradores PJ não registram ponto.')
    const agora = new Date(); const hojeStr = diaLocal(agora)
    await exigirAberta(tenantId, c.id, hojeStr)
    const ult = await prisma.rheMarcacao.findFirst({ where: { tenantId, colaboradorId: c.id, dataHora: { gte: new Date(agora.getTime() - 16 * 3600000) } }, orderBy: { dataHora: 'desc' } })
    if (ult && agora.getTime() - ult.dataHora.getTime() < 60_000) throw httpError(429, 'Marcação duplicada: aguarde 1 minuto.')
    const tipo = b.tipo ?? SEQ[ult && agora.getTime() - ult.dataHora.getTime() <= 16 * 3600000 ? ult.tipo : '']
    const m = await prisma.rheMarcacao.create({ data: { tenantId, colaboradorId: c.id, dataHora: agora, tipo, origem: b.origem, ipHash: ipHashDe(req), observacao: b.observacao, criadoPorId: uid(req) } })
    res.status(201).json({ id: m.id, tipo: m.tipo, dataHora: m.dataHora, origem: m.origem, proximo: SEQ[m.tipo] })
  }))

  router.get('/ponto/marcacoes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const me = await meuColaborador(req)
    const colaboradorId = qs(req.query.colaboradorId) ?? me?.id
    if (!colaboradorId) throw httpError(400, 'Informe colaboradorId.')
    await exigirAcesso(req, colaboradorId)
    const de = qs(req.query.de), ate = qs(req.query.ate)
    const where: any = { tenantId, colaboradorId }
    if (de || ate) where.dataHora = { ...(de ? { gte: instanteLocal(de, '00:00') } : {}), ...(ate ? { lt: new Date(instanteLocal(ate, '00:00').getTime() + 86400000) } : {}) }
    const { skip, take, page, pageSize } = pageParams(req.query)
    const [items, total] = await Promise.all([prisma.rheMarcacao.findMany({ where, orderBy: { dataHora: 'desc' }, skip, take }), prisma.rheMarcacao.count({ where })])
    res.json({ items: items.map(({ ipHash, ...m }) => m), total, page, pageSize })
  }))

  // Importação de relógio/AFD simplificado (RH): [{matricula|colaboradorId, dataHora, tipo}]
  router.post('/ponto/importar', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ marcacoes: z.array(z.object({ matricula: z.string().optional(), colaboradorId: z.string().optional(), dataHora: dateISO(), tipo: z.enum(TIPOS_MARC) })).min(1).max(5000) }), req.body)
    const cols = await prisma.rheColaborador.findMany({ where: { tenantId }, select: { id: true, matricula: true } })
    const porMat = new Map(cols.map((c) => [c.matricula, c.id])); const ids = new Set(cols.map((c) => c.id))
    const rejeitadas: Array<{ indice: number; motivo: string }> = []; const ok: any[] = []
    for (const [i, m] of b.marcacoes.entries()) {
      const id = m.colaboradorId ?? (m.matricula ? porMat.get(m.matricula) : undefined)
      if (!id || !ids.has(id)) { rejeitadas.push({ indice: i, motivo: 'Colaborador não encontrado' }); continue }
      if (await competenciaFechada(tenantId, id, competenciaDe(diaLocal(m.dataHora)))) { rejeitadas.push({ indice: i, motivo: 'Competência fechada' }); continue }
      const dup = await prisma.rheMarcacao.findFirst({ where: { tenantId, colaboradorId: id, dataHora: m.dataHora, tipo: m.tipo }, select: { id: true } })
      if (dup) { rejeitadas.push({ indice: i, motivo: 'Marcação já existente' }); continue }
      ok.push({ tenantId, colaboradorId: id, dataHora: m.dataHora, tipo: m.tipo, origem: 'IMPORTACAO', criadoPorId: uid(req) })
    }
    if (ok.length) await prisma.rheMarcacao.createMany({ data: ok })
    await auditar(req, 'IMPORTAR_PONTO', 'RheMarcacao', undefined, { importadas: ok.length, rejeitadas: rejeitadas.length })
    res.status(201).json({ importadas: ok.length, rejeitadas })
  }))

  // ---------------------------------------------------------------- espelho
  router.get('/ponto/espelho', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const me = await meuColaborador(req)
    const colaboradorId = qs(req.query.colaboradorId) ?? me?.id
    const comp = qs(req.query.competencia) ?? competenciaDe(diaLocal(new Date()))
    if (!colaboradorId) throw httpError(400, 'Informe colaboradorId.')
    if (!competenciaValida(comp)) throw httpError(400, 'Competência inválida (use YYYY-MM).')
    await exigirAcesso(req, colaboradorId)
    const c = await carregarColaborador(tenantId, colaboradorId)
    const f = await prisma.rheFechamentoPonto.findFirst({ where: { tenantId, colaboradorId, competencia: comp, status: 'FECHADO' } })
    if (f) return res.json({ colaborador: { id: c.id, nome: c.nome, matricula: c.matricula }, competencia: comp, fechado: true, fechadoEm: f.fechadoEm, resumo: f.resumo, dias: f.espelho })
    const ap = await apurarColaboradorMes(tenantId, c, comp)
    res.json({ colaborador: { id: c.id, nome: c.nome, matricula: c.matricula }, competencia: comp, fechado: false, resumo: ap.resumo, dias: ap.dias, avisos: ap.avisos })
  }))

  // ---------------------------------------------------------------- ajustes com justificativa e aprovação
  router.post('/ponto/ajustes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({
      colaboradorId: z.string().optional(), data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), tipo: z.enum(['INCLUIR_MARCACOES', 'ABONO_FALTA', 'JUSTIFICAR_ATRASO']),
      marcacoes: z.array(z.object({ tipo: z.enum(TIPOS_MARC), hora: z.string().regex(/^\d{2}:\d{2}$/) })).max(8).optional(), justificativa: z.string().min(10).max(1000), anexoUrl: z.string().url().max(500).optional(),
    }), req.body)
    const me = await meuColaborador(req)
    const colaboradorId = b.colaboradorId ?? me?.id
    if (!colaboradorId) throw httpError(400, 'Informe colaboradorId.')
    await exigirAcesso(req, colaboradorId)
    await carregarColaborador(tenantId, colaboradorId)
    if (b.tipo === 'INCLUIR_MARCACOES') { if (!b.marcacoes?.length) throw httpError(422, 'Informe as marcações a incluir.'); b.marcacoes.forEach((m) => hhmmToMin(m.hora)) }
    if (b.data > diaLocal(new Date())) throw httpError(422, 'Não é possível ajustar o ponto de data futura.')
    await exigirAberta(tenantId, colaboradorId, b.data)
    const a = await prisma.rheAjustePonto.create({ data: { tenantId, colaboradorId, data: diaDate(b.data), tipo: b.tipo, marcacoes: b.marcacoes as any, justificativa: b.justificativa, anexoUrl: b.anexoUrl, solicitanteId: uid(req) } })
    await auditar(req, 'SOLICITAR_AJUSTE', 'RheAjustePonto', a.id)
    res.status(201).json(a)
  }))

  router.get('/ponto/ajustes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { skip, take, page, pageSize } = pageParams(req.query)
    const me = await meuColaborador(req)
    const where: any = { tenantId }
    const st = qs(req.query.status); if (st) where.status = st
    if (!isRh(req)) {
      const ids = String(req.user?.role).toUpperCase() === 'COORDINATOR' ? await equipeIds(req) : []
      where.colaboradorId = { in: [...ids, ...(me ? [me.id] : [])] }
    } else { const c = qs(req.query.colaboradorId); if (c) where.colaboradorId = c }
    const [items, total] = await Promise.all([prisma.rheAjustePonto.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.rheAjustePonto.count({ where })])
    const nomes = Object.fromEntries((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: items.map((i) => i.colaboradorId) } }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]))
    res.json({ items: items.map((i) => ({ ...i, colaboradorNome: nomes[i.colaboradorId] })), total, page, pageSize })
  }))

  router.post('/ponto/ajustes/:id/decidir', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ aprovar: z.boolean(), motivo: z.string().min(3).max(500) }), req.body)
    const a = await prisma.rheAjustePonto.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) throw httpError(404, 'Ajuste não encontrado.')
    if (a.status !== 'PENDENTE') throw httpError(409, 'Ajuste já decidido.')
    const me = await meuColaborador(req)
    if (!(await podeVer(req, a.colaboradorId))) throw httpError(403, 'Sem permissão para decidir este ajuste.')
    if (!isRh(req) && String(req.user?.role).toUpperCase() !== 'COORDINATOR') throw httpError(403, 'Somente gestor ou RH aprovam ajustes.')
    if (me?.id === a.colaboradorId || a.solicitanteId === uid(req)) throw httpError(403, 'Você não pode decidir um ajuste solicitado por você ou sobre você.')
    await exigirAberta(tenantId, a.colaboradorId, dia(a.data))
    if (b.aprovar && a.tipo === 'INCLUIR_MARCACOES') {
      const dd = dia(a.data); const ms = (a.marcacoes as any[]) ?? []
      await prisma.rheMarcacao.createMany({ data: ms.map((m) => ({ tenantId, colaboradorId: a.colaboradorId, dataHora: instanteLocal(dd, m.hora), tipo: m.tipo, origem: 'AJUSTE', ajusteId: a.id, observacao: 'Ajuste aprovado', criadoPorId: uid(req) })) })
    }
    const r = await prisma.rheAjustePonto.update({ where: { id: a.id }, data: { status: b.aprovar ? 'APROVADO' : 'REJEITADO', decididoPorId: uid(req), decididoEm: new Date(), motivoDecisao: b.motivo } })
    await auditar(req, b.aprovar ? 'APROVAR_AJUSTE' : 'REJEITAR_AJUSTE', 'RheAjustePonto', a.id)
    const col = await prisma.rheColaborador.findFirst({ where: { id: a.colaboradorId, tenantId }, select: { userId: true } })
    if (col?.userId) await notify({ tenantId, userId: col.userId, assunto: 'Ajuste de ponto ' + (b.aprovar ? 'aprovado' : 'rejeitado'), mensagem: `Seu ajuste de ponto de ${dia(a.data)} foi ${b.aprovar ? 'aprovado' : 'rejeitado'}.`, refType: 'RheAjustePonto', refId: a.id })
    res.json(r)
  }))

  // ---------------------------------------------------------------- fechamento mensal
  router.post('/ponto/fechamento', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ competencia: z.string(), colaboradorId: z.string().optional(), refazer: z.boolean().default(false) }), req.body)
    if (!competenciaValida(b.competencia)) throw httpError(400, 'Competência inválida (use YYYY-MM).')
    if (b.competencia > competenciaDe(diaLocal(new Date()))) throw httpError(422, 'Não é possível fechar competência futura.')
    if (await prisma.rheFolha.findFirst({ where: { tenantId, competencia: b.competencia, tipo: 'MENSAL', status: 'FECHADA' }, select: { id: true } })) throw httpError(409, 'A folha desta competência já está fechada.')
    const cfg = await getConfig(tenantId)
    const cols = await prisma.rheColaborador.findMany({ where: { tenantId, ...(b.colaboradorId ? { id: b.colaboradorId } : {}), status: { not: 'EM_ADMISSAO' }, vinculo: { not: 'PJ' } } })
    if (b.colaboradorId && !cols.length) throw httpError(404, 'Colaborador não encontrado.')
    const fimComp = fimDoMes(b.competencia)
    const fechados: string[] = []; const ignorados: Array<{ id: string; motivo: string }> = []
    for (const c of cols) {
      const ini = c.dataAdmissao ? dia(c.dataAdmissao).slice(0, 7) : '0000-00'
      if (ini > b.competencia || (c.dataDesligamento && dia(c.dataDesligamento).slice(0, 7) < b.competencia)) { ignorados.push({ id: c.id, motivo: 'Fora do período de contrato' }); continue }
      const ja = await prisma.rheFechamentoPonto.findFirst({ where: { tenantId, colaboradorId: c.id, competencia: b.competencia } })
      if (ja?.status === 'FECHADO' && !b.refazer) { ignorados.push({ id: c.id, motivo: 'Já fechado' }); continue }
      const ap = await apurarColaboradorMes(tenantId, c, b.competencia)
      const jornada = c.jornadaId ? await prisma.rheJornada.findFirst({ where: { id: c.jornadaId } }) : null
      await prisma.$transaction(async (tx) => {
        await tx.rheBancoLanc.deleteMany({ where: { tenantId, colaboradorId: c.id, competencia: b.competencia, origem: 'FECHAMENTO' } })
        if (jornada?.bancoHoras) {
          const cred = creditoBancoMin(ap.resumo.extra50Min, ap.resumo.extra100Min, cfg.bancoFator100)
          if (cred > 0) await tx.rheBancoLanc.create({ data: { tenantId, colaboradorId: c.id, data: fimComp, tipo: 'CREDITO', minutos: cred, venceEm: addMeses(fimComp, cfg.bancoValidadeMeses), competencia: b.competencia, origem: 'FECHAMENTO', observacao: `Horas extras ${b.competencia} (50%: ${minToHhmm(ap.resumo.extra50Min)}, 100%: ${minToHhmm(ap.resumo.extra100Min)} x${cfg.bancoFator100})`, criadoPorId: uid(req) } })
          if (ap.resumo.atrasoMin > 0) await tx.rheBancoLanc.create({ data: { tenantId, colaboradorId: c.id, data: fimComp, tipo: 'DEBITO', minutos: -ap.resumo.atrasoMin, competencia: b.competencia, origem: 'FECHAMENTO', observacao: `Atrasos e saídas antecipadas ${b.competencia}`, criadoPorId: uid(req) } })
        }
        const dados = { status: 'FECHADO', resumo: ap.resumo as any, espelho: ap.dias as any, fechadoPorId: uid(req), fechadoEm: new Date(), reabertoEm: null, reabertoPorId: null, motivoReabertura: null }
        await tx.rheFechamentoPonto.upsert({ where: { tenantId_colaboradorId_competencia: { tenantId, colaboradorId: c.id, competencia: b.competencia } }, create: { tenantId, colaboradorId: c.id, competencia: b.competencia, ...dados }, update: dados })
      }, { timeout: 30000, maxWait: 15000 })
      fechados.push(c.id)
    }
    await auditar(req, 'FECHAR_PONTO', 'RheFechamentoPonto', undefined, { competencia: b.competencia, fechados: fechados.length })
    res.json({ competencia: b.competencia, fechados: fechados.length, ignorados })
  }))

  router.post('/ponto/fechamento/reabrir', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ competencia: z.string(), colaboradorId: z.string().optional(), motivo: z.string().min(10).max(500) }), req.body)
    if (!competenciaValida(b.competencia)) throw httpError(400, 'Competência inválida.')
    if (await prisma.rheFolha.findFirst({ where: { tenantId, competencia: b.competencia, tipo: 'MENSAL', status: 'FECHADA' }, select: { id: true } })) throw httpError(409, 'A folha desta competência está fechada: reabra a folha antes do ponto.')
    const where: any = { tenantId, competencia: b.competencia, status: 'FECHADO', ...(b.colaboradorId ? { colaboradorId: b.colaboradorId } : {}) }
    const fs = await prisma.rheFechamentoPonto.findMany({ where, select: { colaboradorId: true } })
    await prisma.rheBancoLanc.deleteMany({ where: { tenantId, competencia: b.competencia, origem: 'FECHAMENTO', colaboradorId: { in: fs.map((f) => f.colaboradorId) } } })
    const r = await prisma.rheFechamentoPonto.updateMany({ where, data: { status: 'REABERTO', reabertoPorId: uid(req), reabertoEm: new Date(), motivoReabertura: b.motivo } })
    await auditar(req, 'REABRIR_PONTO', 'RheFechamentoPonto', undefined, { competencia: b.competencia, qtd: r.count, motivo: b.motivo })
    res.json({ reabertos: r.count })
  }))

  router.get('/ponto/fechamentos', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const comp = qs(req.query.competencia)
    const items = await prisma.rheFechamentoPonto.findMany({ where: { tenantId, ...(comp ? { competencia: comp } : {}) }, select: { id: true, colaboradorId: true, competencia: true, status: true, resumo: true, fechadoEm: true }, orderBy: { fechadoEm: 'desc' }, take: 500 })
    const nomes = Object.fromEntries((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: items.map((i) => i.colaboradorId) } }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]))
    res.json({ items: items.map((i) => ({ ...i, colaboradorNome: nomes[i.colaboradorId] })) })
  }))

  // ---------------------------------------------------------------- banco de horas
  const resumoBanco = async (tenantId: string, colaboradorId: string) => {
    const rows = await bancoRows(tenantId, colaboradorId)
    return { rows, saldo: saldoBanco(rows) }
  }
  router.get('/banco-horas/saldo', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const me = await meuColaborador(req)
    const colaboradorId = qs(req.query.colaboradorId) ?? me?.id
    if (!colaboradorId) throw httpError(400, 'Informe colaboradorId.')
    await exigirAcesso(req, colaboradorId)
    await carregarColaborador(tenantId, colaboradorId)
    const { rows, saldo } = await resumoBanco(tenantId, colaboradorId)
    const extrato = await prisma.rheBancoLanc.findMany({ where: { tenantId, colaboradorId }, orderBy: [{ data: 'desc' }, { createdAt: 'desc' }], take: 100 })
    res.json({ colaboradorId, ...saldo, saldo: minToHhmm(saldo.saldoMin), extrato, lancamentos: rows.length })
  }))

  router.get('/banco-horas/saldos', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const cols = await prisma.rheColaborador.findMany({ where: { tenantId, status: { notIn: ['DESLIGADO'] } }, select: { id: true, nome: true, matricula: true, jornadaId: true } })
    const all = await prisma.rheBancoLanc.findMany({ where: { tenantId, colaboradorId: { in: cols.map((c) => c.id) } } })
    const por = new Map<string, BancoRow[]>()
    for (const r of all) { const a = por.get(r.colaboradorId) ?? []; a.push({ id: r.id, data: r.data, tipo: r.tipo, minutos: r.minutos, venceEm: r.venceEm, createdAt: r.createdAt }); por.set(r.colaboradorId, a) }
    const items = cols.map((c) => { const s = saldoBanco(por.get(c.id) ?? []); return { colaboradorId: c.id, nome: c.nome, matricula: c.matricula, saldoMin: s.saldoMin, saldo: minToHhmm(s.saldoMin), vencidoMin: s.vencidoMin, aVencerMin: s.aVencerMin } }).filter((x) => x.saldoMin !== 0 || x.vencidoMin || x.aVencerMin)
    res.json({ items, totais: { saldoMin: items.reduce((a, i) => a + i.saldoMin, 0), vencidoMin: items.reduce((a, i) => a + i.vencidoMin, 0), aVencerMin: items.reduce((a, i) => a + i.aVencerMin, 0) } })
  }))

  router.post('/banco-horas/lancamentos', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const cfg = await getConfig(tenantId)
    const b = parseBody(z.object({ colaboradorId: z.string(), tipo: z.enum(['CREDITO', 'DEBITO', 'COMPENSACAO', 'PAGAMENTO', 'AJUSTE']), minutos: z.number().int().refine((n) => n !== 0, 'minutos não pode ser 0'), data: dateISO().optional(), venceEm: dateISO().optional(), observacao: z.string().min(5).max(300) }), req.body)
    await carregarColaborador(tenantId, b.colaboradorId)
    const data = b.data ?? new Date()
    let minutos = Math.abs(b.minutos)
    if (b.tipo === 'AJUSTE') minutos = b.minutos
    else if (['DEBITO', 'COMPENSACAO', 'PAGAMENTO'].includes(b.tipo)) minutos = -minutos
    if (b.tipo !== 'AJUSTE' && b.minutos < 0 && b.tipo === 'CREDITO') throw httpError(422, 'Crédito deve ser positivo.')
    const { saldo } = await resumoBanco(tenantId, b.colaboradorId)
    if (b.tipo === 'COMPENSACAO' || b.tipo === 'PAGAMENTO') {
      // compensação só consome créditos não vencidos; o pagamento (hora extra) pode quitar também os vencidos
      const disponivel = b.tipo === 'PAGAMENTO' ? saldo.creditoMin : saldo.creditos.filter((c) => !c.vencido).reduce((a, c) => a + c.restanteMin, 0)
      if (disponivel < -minutos) throw httpError(422, `Saldo insuficiente no banco de horas (${minToHhmm(disponivel)} disponíveis${b.tipo === 'COMPENSACAO' ? ', sem contar créditos vencidos' : ''}).`)
    }
    const venceEm = minutos > 0 ? (b.venceEm ?? addMeses(data, cfg.bancoValidadeMeses)) : null
    if (venceEm && venceEm.getTime() > addMeses(data, 12).getTime()) throw httpError(422, 'O banco de horas não pode vencer em mais de 12 meses (CLT art. 59 §2º).')
    const l = await prisma.rheBancoLanc.create({ data: { tenantId, colaboradorId: b.colaboradorId, data, tipo: b.tipo, minutos, venceEm, competencia: competenciaDe(diaLocal(data)), origem: 'MANUAL', observacao: b.observacao, criadoPorId: uid(req) } })
    await auditar(req, 'LANCAR_BANCO', 'RheBancoLanc', l.id, { tipo: b.tipo, minutos })
    res.status(201).json(l)
  }))

  router.get('/banco-horas/vencimentos', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const dias = Math.min(365, parseInt(qs(req.query.dias) ?? '30', 10) || 30)
    const cols = await prisma.rheColaborador.findMany({ where: { tenantId, status: { not: 'DESLIGADO' } }, select: { id: true, nome: true } })
    const out: any[] = []
    for (const c of cols) {
      const s = saldoBanco(await bancoRows(tenantId, c.id), new Date(), dias)
      if (s.vencidoMin || s.aVencerMin) out.push({ colaboradorId: c.id, nome: c.nome, vencidoMin: s.vencidoMin, aVencerMin: s.aVencerMin, creditos: s.creditos.filter((x) => x.vencido || (x.venceEm && Date.parse(x.venceEm) <= Date.now() + dias * 86400000)) })
    }
    res.json({ dias, items: out })
  }))
}
void requireRole; void HR
