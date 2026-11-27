import { Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { parseBody, qs } from '../core/crud'
import { scheduleReminder } from '../core/reminders'
import { feriadosDe } from './apuracao'
import { addDiasStr, calcularFerias, diaLocal, diasDireitoFerias, diffDias, inicioFeriasInvalido, periodosAquisitivos, validarFracionamento } from './calculo'
import { HR, auditar, carregarColaborador, dia, diaDate, equipeIds, exigirAcesso, exigirRh, getConfig, httpError, isRh, meuColaborador, podeVer, tid, uid } from './common'
import { sincronizarStatus } from './saude'

const VARIAVEIS = new Set(['HE50', 'HE100', 'HE_NOT', 'ADIC_NOT', 'DSR_HE', 'BH_VENCIDO', 'COMISSAO', 'AULA_EXTRA'])
const ATIVAS = ['PROGRAMADA', 'APROVADA', 'EM_GOZO', 'CONCLUIDA']

/** Média mensal de verbas variáveis nos últimos 12 holerites mensais (base de férias e 13º). */
export async function mediaVariaveis(tenantId: string, colaboradorId: string): Promise<number> {
  const hs = await prisma.rheHolerite.findMany({ where: { tenantId, colaboradorId }, orderBy: { createdAt: 'desc' }, take: 40 })
  if (!hs.length) return 0
  const folhas = new Map((await prisma.rheFolha.findMany({ where: { tenantId, id: { in: hs.map((h) => h.folhaId) }, tipo: 'MENSAL' }, select: { id: true } })).map((f) => [f.id, true]))
  const m = hs.filter((h) => folhas.has(h.folhaId)).slice(0, 12)
  if (!m.length) return 0
  const tot = m.reduce((a, h) => a + (h.itens as any[]).filter((i) => VARIAVEIS.has(i.codigo) && i.tipo === 'PROVENTO').reduce((s, i) => s + i.valor, 0), 0)
  return Math.round((tot / m.length) * 100) / 100
}

export async function sincronizarPeriodos(tenantId: string, colaboradorId: string, hoje = new Date()) {
  const c = await prisma.rheColaborador.findFirst({ where: { id: colaboradorId, tenantId } })
  if (!c || !c.dataAdmissao || !['CLT', 'PROFESSOR_HORISTA'].includes(c.vinculo)) return []
  const h = diaLocal(hoje)
  const per = periodosAquisitivos(dia(c.dataAdmissao), h)
  const fechs = await prisma.rheFechamentoPonto.findMany({ where: { tenantId, colaboradorId, status: 'FECHADO' }, select: { competencia: true, resumo: true } })
  const out: any[] = []
  for (const p of per) {
    const faltas = fechs.filter((f) => f.competencia >= p.inicio.slice(0, 7) && f.competencia <= p.fim.slice(0, 7)).reduce((a, f) => a + Number((f.resumo as any)?.faltas ?? 0), 0)
    const direito = diasDireitoFerias(faltas)
    const ex = await prisma.rheFeriasPeriodo.findFirst({ where: { tenantId, colaboradorId, aquisitivoInicio: diaDate(p.inicio) } })
    const usados = (ex?.diasGozados ?? 0) + (ex?.diasVendidos ?? 0)
    let status = p.fim >= h ? 'EM_AQUISICAO' : usados >= direito ? 'GOZADO' : usados > 0 ? 'PARCIAL' : 'DISPONIVEL'
    if (p.fim < h && p.concessivoFim < h && usados < direito) status = 'VENCIDO'
    const data = { aquisitivoFim: diaDate(p.fim), concessivoFim: diaDate(p.concessivoFim), diasDireito: direito, faltasInjustificadas: faltas, status }
    out.push(ex ? await prisma.rheFeriasPeriodo.update({ where: { id: ex.id }, data }) : await prisma.rheFeriasPeriodo.create({ data: { tenantId, colaboradorId, aquisitivoInicio: diaDate(p.inicio), ...data } }))
  }
  return out
}

async function saldoPeriodo(tenantId: string, per: { id: string; diasDireito: number; diasGozados: number; diasVendidos: number }) {
  const progs = await prisma.rheFeriasProg.findMany({ where: { tenantId, periodoId: per.id, status: { in: ATIVAS } } })
  const comprometido = progs.filter((p) => p.status !== 'CONCLUIDA').reduce((a, p) => a + p.dias + p.diasAbono, 0)
  return { progs, comprometido, saldo: per.diasDireito - per.diasGozados - per.diasVendidos - comprometido }
}

export async function concluirProg(tenantId: string, id: string) {
  const p = await prisma.rheFeriasProg.findFirst({ where: { id, tenantId } })
  if (!p || p.status === 'CONCLUIDA' || p.status === 'CANCELADA' || p.status === 'REJEITADA') return null
  await prisma.rheFeriasProg.update({ where: { id }, data: { status: 'CONCLUIDA' } })
  const per = await prisma.rheFeriasPeriodo.update({ where: { id: p.periodoId }, data: { diasGozados: { increment: p.dias }, diasVendidos: { increment: p.diasAbono } } })
  await sincronizarPeriodos(tenantId, p.colaboradorId)
  await sincronizarStatus(tenantId, p.colaboradorId)
  return per
}

export async function alertasFerias(tenantId: string, ids: string[] | null, hoje = new Date()) {
  const cfg = await getConfig(tenantId)
  const h = diaLocal(hoje)
  const where: any = { tenantId, status: { in: ['DISPONIVEL', 'PARCIAL', 'VENCIDO'] } }
  if (ids) where.colaboradorId = { in: ids }
  const pers = await prisma.rheFeriasPeriodo.findMany({ where, orderBy: { concessivoFim: 'asc' } })
  const nomes = Object.fromEntries((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: pers.map((p) => p.colaboradorId) }, status: { not: 'DESLIGADO' } }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]))
  const out: any[] = []
  for (const p of pers) {
    if (!nomes[p.colaboradorId]) continue
    const { saldo, comprometido } = await saldoPeriodo(tenantId, p)
    const restam = diffDias(h, dia(p.concessivoFim))
    const semProgramar = p.diasDireito - p.diasGozados - p.diasVendidos - comprometido
    if (p.status === 'VENCIDO') out.push({ colaboradorId: p.colaboradorId, nome: nomes[p.colaboradorId], periodoId: p.id, concessivoFim: p.concessivoFim, diasParaVencer: restam, saldoDias: saldo, severidade: 'CRITICO', dobra: true, mensagem: 'Período concessivo vencido: férias a pagar em dobro (CLT art. 137).' })
    else if (restam <= cfg.alertaFeriasDias && semProgramar > 0) out.push({ colaboradorId: p.colaboradorId, nome: nomes[p.colaboradorId], periodoId: p.id, concessivoFim: p.concessivoFim, diasParaVencer: restam, saldoDias: semProgramar, severidade: restam <= 30 ? 'CRITICO' : 'ATENCAO', dobra: false, mensagem: `Faltam ${restam} dias para o fim do período concessivo e ${semProgramar} dias sem programação.` })
  }
  return out
}

export function mountFerias(router: Router) {
  router.post('/ferias/periodos/gerar', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ colaboradorId: z.string().optional() }), req.body ?? {})
    const cols = await prisma.rheColaborador.findMany({ where: { tenantId, ...(b.colaboradorId ? { id: b.colaboradorId } : {}), status: { not: 'DESLIGADO' }, vinculo: { in: ['CLT', 'PROFESSOR_HORISTA'] } }, select: { id: true } })
    if (b.colaboradorId && !cols.length) throw httpError(404, 'Colaborador CLT não encontrado.')
    let n = 0
    for (const c of cols) n += (await sincronizarPeriodos(tenantId, c.id)).length
    res.json({ colaboradores: cols.length, periodos: n })
  }))

  router.get('/ferias/periodos', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const me = await meuColaborador(req)
    const colaboradorId = qs(req.query.colaboradorId) ?? me?.id
    if (!colaboradorId) throw httpError(400, 'Informe colaboradorId.')
    await exigirAcesso(req, colaboradorId)
    await sincronizarPeriodos(tenantId, colaboradorId)
    const pers = await prisma.rheFeriasPeriodo.findMany({ where: { tenantId, colaboradorId }, orderBy: { aquisitivoInicio: 'asc' } })
    const items: any[] = []
    for (const p of pers) { const s = await saldoPeriodo(tenantId, p); items.push({ ...p, saldoDias: s.saldo, programacoes: s.progs.map(({ valores, ...x }) => (isRh(req) ? { ...x, valores } : x)) }) }
    res.json({ items })
  }))

  router.get('/ferias/simular', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await carregarColaborador(tid(req), qs(req.query.colaboradorId) ?? '')
    const dias = parseInt(qs(req.query.dias) ?? '30', 10), abono = parseInt(qs(req.query.diasAbono) ?? '0', 10)
    if (!(dias >= 5 && dias <= 30)) throw httpError(400, 'dias deve estar entre 5 e 30.')
    const media = await mediaVariaveis(tid(req), c.id)
    res.json({ ...calcularFerias({ salario: c.salarioBase, dias, diasAbono: abono, mediaVariaveis: media }), mediaVariaveis: media, aviso: 'Simulação (modelo a validar por contador).' })
  }))

  router.post('/ferias/programacoes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({
      colaboradorId: z.string().optional(), periodoId: z.string(), parcelas: z.array(z.object({ inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dias: z.number().int().min(1).max(30) })).min(1).max(3),
      diasAbono: z.number().int().min(0).max(10).default(0), adiantaDecimo: z.boolean().default(false), observacao: z.string().max(300).optional(),
    }), req.body)
    const me = await meuColaborador(req)
    const colaboradorId = b.colaboradorId ?? me?.id
    if (!colaboradorId) throw httpError(400, 'Informe colaboradorId.')
    await exigirAcesso(req, colaboradorId)
    const c = await carregarColaborador(tenantId, colaboradorId)
    if (!['CLT', 'PROFESSOR_HORISTA'].includes(c.vinculo)) throw httpError(422, 'Somente colaboradores CLT/horistas têm férias (PJ não; estagiário tem recesso, controlado à parte).')
    const per = await prisma.rheFeriasPeriodo.findFirst({ where: { id: b.periodoId, tenantId, colaboradorId } })
    if (!per) throw httpError(404, 'Período aquisitivo não encontrado.')
    if (per.status === 'EM_AQUISICAO') throw httpError(422, 'O período aquisitivo ainda não foi completado.')
    if (per.status === 'GOZADO') throw httpError(409, 'Período já totalmente gozado.')
    const existentes = await prisma.rheFeriasProg.findMany({ where: { tenantId, periodoId: per.id, status: { in: ATIVAS } } })
    const todas = [...existentes.map((e) => e.dias), ...b.parcelas.map((p) => p.dias)]
    const abonoTotal = existentes.reduce((a, e) => a + e.diasAbono, 0) + b.diasAbono
    let errosFinal = validarFracionamento(todas, per.diasDireito, abonoTotal)
    // programação parcial: a regra de "uma parcela >= 14 dias" só é cobrada quando todo o direito estiver programado
    if (todas.reduce((a, x) => a + x, 0) + abonoTotal < per.diasDireito) errosFinal = errosFinal.filter((m) => !m.includes('mínimo 14'))
    if (errosFinal.length) throw httpError(422, errosFinal.join(' '), { erros: errosFinal })
    const hoje = diaLocal(new Date())
    const novas: string[] = []
    // sobreposição entre as novas parcelas e com programações do colaborador
    const intervalos = b.parcelas.map((p) => ({ ini: p.inicio, fim: addDiasStr(p.inicio, p.dias - 1), dias: p.dias }))
    for (const [i, it] of intervalos.entries()) {
      if (it.ini < hoje && !isRh(req)) throw httpError(422, 'Início de férias no passado: peça ao RH.')
      if (it.ini <= dia(per.aquisitivoFim)) throw httpError(422, 'As férias só podem iniciar após o fim do período aquisitivo.')
      const fer = await feriadosDe(tenantId, it.ini.slice(0, 7))
      for (const x of await feriadosDe(tenantId, addDiasStr(it.ini, 3).slice(0, 7))) fer.add(x)
      if (inicioFeriasInvalido(it.ini, fer)) throw httpError(422, `Início em ${it.ini} não permitido: nos 2 dias que antecedem feriado ou repouso semanal (CLT art. 134 §3º).`)
      for (const [j, o] of intervalos.entries()) if (j > i && it.ini <= o.fim && o.ini <= it.fim) throw httpError(409, 'As parcelas se sobrepõem.')
      const choque = await prisma.rheFeriasProg.findFirst({ where: { tenantId, colaboradorId, status: { in: ['PROGRAMADA', 'APROVADA', 'EM_GOZO'] }, inicio: { lte: diaDate(it.fim) }, fim: { gte: diaDate(it.ini) } }, select: { id: true } })
      if (choque) throw httpError(409, 'Já existem férias programadas neste intervalo.')
    }
    const media = await mediaVariaveis(tenantId, colaboradorId)
    for (const [i, it] of intervalos.entries()) {
      const abono = i === 0 ? b.diasAbono : 0
      const valores = calcularFerias({ salario: c.vinculo === 'PROFESSOR_HORISTA' ? (c.cargaMensalHoras ?? 0) * (c.valorHora ?? 0) * 7 / 6 : c.salarioBase, dias: it.dias, diasAbono: abono, mediaVariaveis: media })
      const p = await prisma.rheFeriasProg.create({ data: { tenantId, colaboradorId, periodoId: per.id, inicio: diaDate(it.ini), fim: diaDate(it.fim), dias: it.dias, diasAbono: abono, adiantaDecimo: i === 0 && b.adiantaDecimo, valores: valores as any, observacao: b.observacao } })
      novas.push(p.id)
    }
    await prisma.rheFeriasPeriodo.update({ where: { id: per.id }, data: { status: 'PARCIAL' } })
    await auditar(req, 'PROGRAMAR_FERIAS', 'RheFeriasProg', novas[0], { parcelas: intervalos.length })
    const items = await prisma.rheFeriasProg.findMany({ where: { id: { in: novas } }, orderBy: { inicio: 'asc' } })
    res.status(201).json({ items: items.map(({ valores, ...x }) => (isRh(req) ? { ...x, valores } : x)) })
  }))

  router.get('/ferias/programacoes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const me = await meuColaborador(req)
    const where: any = { tenantId }
    if (!isRh(req)) {
      const eq = String(req.user?.role).toUpperCase() === 'COORDINATOR' ? await equipeIds(req) : []
      where.colaboradorId = { in: [...eq, ...(me ? [me.id] : [])] }
    } else { const c = qs(req.query.colaboradorId); if (c) where.colaboradorId = c }
    const st = qs(req.query.status); if (st) where.status = st
    const mes = qs(req.query.mes)
    if (mes) { where.inicio = { lte: diaDate(addDiasStr(mes + '-01', 40).slice(0, 7) + '-01') }; where.fim = { gte: diaDate(mes + '-01') } }
    const items = await prisma.rheFeriasProg.findMany({ where, orderBy: { inicio: 'asc' }, take: 500 })
    const nomes = Object.fromEntries((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: items.map((i) => i.colaboradorId) } }, select: { id: true, nome: true } })).map((x) => [x.id, x.nome]))
    res.json({ items: items.map(({ valores, ...x }) => ({ ...(isRh(req) ? { ...x, valores } : x), colaboradorNome: nomes[x.colaboradorId] })) })
  }))

  router.post('/ferias/programacoes/:id/decidir', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ aprovar: z.boolean(), motivo: z.string().min(3).max(500) }), req.body)
    const p = await prisma.rheFeriasProg.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) throw httpError(404, 'Programação não encontrada.')
    if (p.status !== 'PROGRAMADA') throw httpError(409, 'Programação já decidida.')
    if (!(await podeVer(req, p.colaboradorId)) || (!isRh(req) && String(req.user?.role).toUpperCase() !== 'COORDINATOR')) throw httpError(403, 'Sem permissão para decidir férias.')
    const me = await meuColaborador(req)
    if (me?.id === p.colaboradorId) throw httpError(403, 'Você não pode decidir as suas próprias férias.')
    const r = await prisma.rheFeriasProg.update({ where: { id: p.id }, data: { status: b.aprovar ? 'APROVADA' : 'REJEITADA', decididoPorId: uid(req), decididoEm: new Date(), observacao: b.motivo } })
    await sincronizarPeriodos(tenantId, p.colaboradorId)
    await sincronizarStatus(tenantId, p.colaboradorId)
    await auditar(req, b.aprovar ? 'APROVAR_FERIAS' : 'REJEITAR_FERIAS', 'RheFeriasProg', p.id)
    res.json(r)
  }))

  router.post('/ferias/programacoes/:id/cancelar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.rheFeriasProg.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) throw httpError(404, 'Programação não encontrada.')
    await exigirAcesso(req, p.colaboradorId)
    if (!['PROGRAMADA', 'APROVADA'].includes(p.status)) throw httpError(409, 'Esta programação não pode ser cancelada.')
    const r = await prisma.rheFeriasProg.update({ where: { id: p.id }, data: { status: 'CANCELADA' } })
    await sincronizarStatus(tenantId, p.colaboradorId)
    res.json(r)
  }))

  router.post('/ferias/programacoes/:id/concluir', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.rheFeriasProg.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) throw httpError(404, 'Programação não encontrada.')
    if (!['APROVADA', 'EM_GOZO'].includes(p.status)) throw httpError(409, 'Somente férias aprovadas podem ser concluídas.')
    await concluirProg(tenantId, p.id)
    res.json(await prisma.rheFeriasProg.findFirst({ where: { id: p.id } }))
  }))

  router.get('/ferias/alertas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    if (!isRh(req) && String(req.user?.role).toUpperCase() !== 'COORDINATOR') throw httpError(403, 'Sem permissão para esta ação.')
    const cols = await prisma.rheColaborador.findMany({ where: { tenantId, status: { not: 'DESLIGADO' }, vinculo: { in: ['CLT', 'PROFESSOR_HORISTA'] } }, select: { id: true } })
    for (const c of cols) await sincronizarPeriodos(tenantId, c.id)
    res.json({ items: await alertasFerias(tenantId, isRh(req) ? null : await equipeIds(req)) })
  }))
}

export async function jobFerias() {
  const tenants = await prisma.rheColaborador.findMany({ distinct: ['tenantId'], select: { tenantId: true } })
  let alertas = 0
  for (const { tenantId } of tenants) {
    const cols = await prisma.rheColaborador.findMany({ where: { tenantId, status: { not: 'DESLIGADO' }, vinculo: { in: ['CLT', 'PROFESSOR_HORISTA'] } }, select: { id: true } })
    for (const c of cols) await sincronizarPeriodos(tenantId, c.id)
    // conclui automaticamente férias já encerradas
    const encerradas = await prisma.rheFeriasProg.findMany({ where: { tenantId, status: { in: ['APROVADA', 'EM_GOZO'] }, fim: { lt: diaDate(diaLocal(new Date())) } }, select: { id: true } })
    for (const e of encerradas) await concluirProg(tenantId, e.id)
    await prisma.rheFeriasProg.updateMany({ where: { tenantId, status: 'APROVADA', inicio: { lte: diaDate(diaLocal(new Date())) }, fim: { gte: diaDate(diaLocal(new Date())) } }, data: { status: 'EM_GOZO' } })
    for (const a of await alertasFerias(tenantId, null)) {
      await scheduleReminder({ tenantId, modulo: 'rh', titulo: `Férias: ${a.nome} - ${a.mensagem}`, dueAt: a.concessivoFim, assigneeRole: HR as string, refType: 'RheFeriasPeriodo', refId: a.periodoId, severity: a.severidade, dedupeKey: `rhe-ferias-${a.periodoId}` })
      alertas++
    }
  }
  return { alertas }
}
