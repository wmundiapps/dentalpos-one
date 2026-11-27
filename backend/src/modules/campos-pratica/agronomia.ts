import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { DIA, LEITURA, MOD, dt, ehGestor, exigir, exigirUser, getConfig, httpErr, mapaProgramas, mapaUsuarios, urlOpc, zId } from './servico'

const ESCRITA = ['COORDINATOR', 'TEACHER'] as const
const TIPOS_ATIV = ['PREPARO_SOLO', 'ADUBACAO', 'PLANTIO', 'APLICACAO_DEFENSIVO', 'IRRIGACAO', 'CAPINA', 'COLHEITA', 'OUTRO'] as const
const ANTES_DO_PLANTIO = ['PREPARO_SOLO', 'PLANTIO']

export const dentroDaJanela = (mes: number, ini: number, fim: number) => (ini <= fim ? mes >= ini && mes <= fim : mes >= ini || mes <= fim)
const somaDias = (d: Date, n: number) => new Date(d.getTime() + n * DIA)

async function ciclo(tenantId: string, id: string) { return exigir(prisma.cprCiclo.findFirst({ where: { id, tenantId } }), 'Ciclo não encontrado.') }

/** Estudante só registra campo em ciclos ligados a uma turma (aula prática) em que está matriculado. */
async function podeRegistrar(req: AuthenticatedRequest, c: { classSectionId: string | null }) {
  const u = req.user!
  if (ehGestor(req) || u.role === 'TEACHER') return true
  if (u.role === 'STUDENT' && c.classSectionId && u.studentId) {
    const n = await prisma.classSectionEnrollment.count({ where: { classSectionId: c.classSectionId, enrollment: { studentId: u.studentId } } })
    return n > 0
  }
  return false
}

async function recalcularCusto(tenantId: string, cicloId: string) {
  const s = await prisma.cprAtividadeCampo.aggregate({ where: { tenantId, cicloId }, _sum: { custo: true } })
  await prisma.cprCiclo.update({ where: { id: cicloId }, data: { custoTotal: Math.round((s._sum.custo ?? 0) * 100) / 100 } })
}
async function maxCarencia(tenantId: string, cicloId: string) {
  const r = await prisma.cprAtividadeCampo.aggregate({ where: { tenantId, cicloId, carenciaAte: { not: null } }, _max: { carenciaAte: true } })
  return r._max.carenciaAte
}

export async function alertasAgro(tenantId: string) {
  const cfg = await getConfig(tenantId)
  const agora = new Date()
  const lim = somaDias(agora, cfg.diasAlertaColheita)
  const out: Array<{ tipo: string; severidade: 'INFO' | 'ATENCAO' | 'CRITICO'; titulo: string; refType: string; refId: string; data?: Date | null }> = []
  const cs = await prisma.cprCiclo.findMany({ where: { tenantId, status: { in: ['PLANEJADO', 'PLANTADO', 'EM_MANEJO'] } } })
  const [culturas, talhoes] = await Promise.all([prisma.cprCultura.findMany({ where: { tenantId } }), prisma.cprTalhao.findMany({ where: { tenantId } })])
  const nome = (c: any) => `${culturas.find((x) => x.id === c.culturaId)?.nome ?? 'Cultura'} · ${talhoes.find((t) => t.id === c.talhaoId)?.nome ?? 'talhão'} (${c.safra})`
  for (const c of cs) {
    if (c.status === 'PLANEJADO') {
      if (c.plantioPrevisto < agora) out.push({ tipo: 'PLANTIO_ATRASADO', severidade: 'CRITICO', titulo: `Plantio atrasado: ${nome(c)}`, refType: 'CprCiclo', refId: c.id, data: c.plantioPrevisto })
      else if (c.plantioPrevisto <= lim) out.push({ tipo: 'JANELA_PLANTIO', severidade: 'ATENCAO', titulo: `Plantio previsto em ${Math.ceil((c.plantioPrevisto.getTime() - agora.getTime()) / DIA)} dia(s): ${nome(c)}`, refType: 'CprCiclo', refId: c.id, data: c.plantioPrevisto })
    } else {
      if (c.colheitaPrevista < agora) out.push({ tipo: 'COLHEITA_ATRASADA', severidade: 'CRITICO', titulo: `Colheita atrasada: ${nome(c)}`, refType: 'CprCiclo', refId: c.id, data: c.colheitaPrevista })
      else if (c.colheitaPrevista <= lim) out.push({ tipo: 'JANELA_COLHEITA', severidade: 'ATENCAO', titulo: `Colheita prevista em ${Math.ceil((c.colheitaPrevista.getTime() - agora.getTime()) / DIA)} dia(s): ${nome(c)}`, refType: 'CprCiclo', refId: c.id, data: c.colheitaPrevista })
    }
  }
  const car = await prisma.cprAtividadeCampo.findMany({ where: { tenantId, carenciaAte: { gt: agora }, cicloId: { in: cs.map((c) => c.id) } } })
  for (const a of car) {
    const c = cs.find((x) => x.id === a.cicloId)!
    const libera = a.carenciaAte!
    out.push({ tipo: 'CARENCIA_DEFENSIVO', severidade: libera > c.colheitaPrevista ? 'CRITICO' : 'ATENCAO', titulo: `Carência de ${a.insumo ?? 'defensivo'} até ${libera.toLocaleDateString('pt-BR')} (${nome(c)})${libera > c.colheitaPrevista ? ' — vai além da colheita prevista' : ''}`, refType: 'CprAtividadeCampo', refId: a.id, data: libera })
  }
  const mons = await prisma.cprMonitoramento.findMany({ where: { tenantId, resolvido: false, severidade: 'ALTA' } })
  for (const m of mons) out.push({ tipo: 'INFESTACAO', severidade: 'CRITICO', titulo: `${m.tipo.replace(/_/g, ' ')} de severidade alta sem resolução: ${m.descricao.slice(0, 80)}`, refType: 'CprMonitoramento', refId: m.id, data: m.data })
  const ordem = { CRITICO: 0, ATENCAO: 1, INFO: 2 }
  return out.sort((a, b) => ordem[a.severidade] - ordem[b.severidade])
}

export async function jobAlertasAgro() {
  const tenants = await prisma.cprCiclo.findMany({ distinct: ['tenantId'], select: { tenantId: true } })
  let n = 0
  for (const { tenantId } of tenants) {
    for (const a of await alertasAgro(tenantId)) {
      const resp = a.refType === 'CprCiclo' ? (await prisma.cprCiclo.findFirst({ where: { id: a.refId, tenantId } }))?.responsavelUserId : undefined
      await scheduleReminder({ tenantId, modulo: MOD, titulo: a.titulo, dueAt: a.data ?? new Date(), remindAt: new Date(), severity: a.severidade, refType: a.refType, refId: a.refId, dedupeKey: `cpr:agro:${a.tipo}:${a.refId}`, assigneeUserId: resp ?? undefined, assigneeRole: resp ? undefined : 'COORDINATOR' })
      n++
    }
  }
  return { lembretes: n }
}

export function mountAgronomia(router: Router) {
  const ler = requireRole(...LEITURA)
  const escrever = requireRole(...ESCRITA)
  const campo = requireRole(...LEITURA)

  mountCrud(router, {
    model: 'cprArea', path: '/agro/areas', read: LEITURA, write: [...ESCRITA], modulo: MOD, search: ['nome'], filters: ['tipo', 'ativo'], orderBy: { nome: 'asc' },
    create: z.object({ nome: z.string().trim().min(2).max(120), tipo: z.enum(['CAMPO_EXPERIMENTAL', 'HORTA', 'POMAR', 'ESTUFA', 'PASTAGEM', 'VIVEIRO']).default('CAMPO_EXPERIMENTAL'), hectares: z.number().min(0).max(100000).default(0), localizacao: z.string().max(200).optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), ativo: z.boolean().optional() }),
  })
  mountCrud(router, {
    model: 'cprTalhao', path: '/agro/talhoes', read: LEITURA, write: [...ESCRITA], modulo: MOD, search: ['nome'], filters: ['areaId', 'ativo'], orderBy: { nome: 'asc' },
    create: z.object({ areaId: zId, nome: z.string().trim().min(1).max(80), hectares: z.number().positive().max(100000), solo: z.string().max(80).optional(), irrigado: z.boolean().optional(), ativo: z.boolean().optional() }),
    beforeCreate: async (d, req) => {
      const t = getTenantId(req)
      const a = await exigir(prisma.cprArea.findFirst({ where: { id: d.areaId, tenantId: t } }), 'Área não encontrada.', 400)
      const s = await prisma.cprTalhao.aggregate({ where: { tenantId: t, areaId: a.id, ativo: true }, _sum: { hectares: true } })
      if (a.hectares > 0 && (s._sum.hectares ?? 0) + d.hectares > a.hectares + 1e-9) throw httpErr(409, `Os talhões ultrapassariam a área total (${a.hectares} ha).`, 'AREA_EXCEDIDA')
    },
  })
  mountCrud(router, {
    model: 'cprCultura', path: '/agro/culturas', read: LEITURA, write: [...ESCRITA], modulo: MOD, search: ['nome', 'especie'], filters: ['ativo'], orderBy: { nome: 'asc' },
    create: z.object({ nome: z.string().trim().min(2).max(80), especie: z.string().max(120).optional(), cicloDias: z.number().int().min(10).max(1500).default(120), mesPlantioInicio: z.number().int().min(1).max(12).default(1), mesPlantioFim: z.number().int().min(1).max(12).default(12), ativo: z.boolean().optional() }),
  })
  mountCrud(router, {
    model: 'cprCultivar', path: '/agro/cultivares', read: LEITURA, write: [...ESCRITA], modulo: MOD, search: ['nome'], filters: ['culturaId', 'ativo'], orderBy: { nome: 'asc' },
    create: z.object({ culturaId: zId, nome: z.string().trim().min(1).max(100), cicloDias: z.number().int().min(10).max(1500).optional(), obtentor: z.string().max(100).optional(), ativo: z.boolean().optional() }),
    beforeCreate: async (d, req) => { await exigir(prisma.cprCultura.findFirst({ where: { id: d.culturaId, tenantId: getTenantId(req) } }), 'Cultura não encontrada.', 400) },
  })

  // ---------------------------------------------------------------- ciclos
  router.post('/agro/ciclos', escrever, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ talhaoId: zId, culturaId: zId, cultivarId: zId.optional(), safra: z.string().trim().regex(/^\d{4}(\/\d{2,4})?$/, 'Safra no formato 2026/27').max(12), areaHa: z.number().positive().optional(), plantioPrevisto: dt, colheitaPrevista: dt.optional(), responsavelUserId: zId.optional(), classSectionId: zId.optional(), disciplineId: zId.optional(), observacao: z.string().max(500).optional(), confirmarForaJanela: z.boolean().optional() }), req.body)
    const talhao = await exigir(prisma.cprTalhao.findFirst({ where: { id: b.talhaoId, tenantId, ativo: true } }), 'Talhão não encontrado.', 400)
    const cultura = await exigir(prisma.cprCultura.findFirst({ where: { id: b.culturaId, tenantId, ativo: true } }), 'Cultura não encontrada.', 400)
    const cultivar = b.cultivarId ? await exigir(prisma.cprCultivar.findFirst({ where: { id: b.cultivarId, tenantId, culturaId: cultura.id } }), 'Cultivar não pertence à cultura.', 400) : null
    const areaHa = b.areaHa ?? talhao.hectares
    if (areaHa > talhao.hectares + 1e-9) throw httpErr(409, `Área do ciclo (${areaHa} ha) maior que o talhão (${talhao.hectares} ha).`, 'AREA_EXCEDIDA')
    const cicloDias = cultivar?.cicloDias ?? cultura.cicloDias
    const colheitaPrevista = b.colheitaPrevista ?? somaDias(b.plantioPrevisto, cicloDias)
    if (colheitaPrevista <= b.plantioPrevisto) throw httpErr(400, 'A colheita deve ser depois do plantio.')
    const fora = !dentroDaJanela(b.plantioPrevisto.getUTCMonth() + 1, cultura.mesPlantioInicio, cultura.mesPlantioFim)
    if (fora && !b.confirmarForaJanela) throw httpErr(409, `Plantio fora da janela recomendada de ${cultura.nome} (meses ${cultura.mesPlantioInicio} a ${cultura.mesPlantioFim}). Confirme para registrar mesmo assim.`, 'FORA_DA_JANELA')
    const sobre = await prisma.cprCiclo.findFirst({ where: { tenantId, talhaoId: talhao.id, status: { in: ['PLANEJADO', 'PLANTADO', 'EM_MANEJO'] }, plantioPrevisto: { lt: colheitaPrevista }, colheitaPrevista: { gt: b.plantioPrevisto } } })
    if (sobre) throw httpErr(409, 'O talhão já tem outro ciclo planejado ou em andamento neste período.', 'TALHAO_OCUPADO')
    if (b.responsavelUserId) await exigirUser(tenantId, b.responsavelUserId, 'Responsável não encontrado.')
    if (b.classSectionId) await exigir(prisma.classSection.findFirst({ where: { id: b.classSectionId, tenantId } }), 'Turma não encontrada.', 400)
    if (b.disciplineId) await exigir(prisma.discipline.findFirst({ where: { id: b.disciplineId, tenantId } }), 'Disciplina não encontrada.', 400)
    const { confirmarForaJanela, ...dados } = b
    void confirmarForaJanela
    const c = await prisma.cprCiclo.create({ data: { ...dados, tenantId, areaHa, colheitaPrevista, foraDaJanela: fora } })
    await scheduleReminder({ tenantId, modulo: MOD, titulo: 'Plantio previsto: preparar o talhão e conferir insumos', dueAt: c.plantioPrevisto, antecedenciaDias: 7, refType: 'CprCiclo', refId: c.id, assigneeUserId: c.responsavelUserId ?? undefined, assigneeRole: c.responsavelUserId ? undefined : 'COORDINATOR', dedupeKey: `cpr:plantio:${c.id}` })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_CICLO', refType: 'CprCiclo', refId: c.id })
    res.status(201).json({ ...c, avisos: fora ? ['Plantio fora da janela recomendada.'] : [] })
  }))

  async function enriquecer(tenantId: string, rows: any[]) {
    const [culturas, talhoes, areas, us] = await Promise.all([prisma.cprCultura.findMany({ where: { tenantId } }), prisma.cprTalhao.findMany({ where: { tenantId } }), prisma.cprArea.findMany({ where: { tenantId } }), mapaUsuarios(tenantId, rows.map((r) => r.responsavelUserId))])
    const turmas = rows.some((r) => r.classSectionId) ? await prisma.classSection.findMany({ where: { tenantId, id: { in: rows.map((r) => r.classSectionId).filter(Boolean) } }, select: { id: true, nome: true } }) : []
    return rows.map((r) => {
      const t = talhoes.find((x) => x.id === r.talhaoId)
      return { ...r, cultura: culturas.find((x) => x.id === r.culturaId)?.nome ?? null, talhao: t?.nome ?? null, area: areas.find((a) => a.id === t?.areaId)?.nome ?? null, responsavel: r.responsavelUserId ? us.get(r.responsavelUserId) ?? null : null, turma: turmas.find((x) => x.id === r.classSectionId)?.nome ?? null, custoPorHa: r.areaHa ? Math.round((r.custoTotal / r.areaHa) * 100) / 100 : null }
    })
  }

  router.get('/agro/ciclos', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId }
    for (const f of ['talhaoId', 'culturaId', 'safra', 'status', 'classSectionId', 'responsavelUserId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const rows = await prisma.cprCiclo.findMany({ where, orderBy: { plantioPrevisto: 'desc' }, take: 500 })
    res.json({ items: await enriquecer(tenantId, rows), total: rows.length })
  }))

  router.get('/agro/ciclos/:id', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await ciclo(tenantId, String(req.params.id))
    const [ativ, mon] = await Promise.all([prisma.cprAtividadeCampo.findMany({ where: { tenantId, cicloId: c.id }, orderBy: { data: 'asc' } }), prisma.cprMonitoramento.findMany({ where: { tenantId, cicloId: c.id }, orderBy: { data: 'desc' } })])
    const us = await mapaUsuarios(tenantId, [...ativ.map((a) => a.responsavelUserId), ...mon.map((m) => m.responsavelUserId)])
    const carencia = await maxCarencia(tenantId, c.id)
    res.json({ ...(await enriquecer(tenantId, [c]))[0], atividades: ativ.map((a) => ({ ...a, responsavel: a.responsavelUserId ? us.get(a.responsavelUserId) ?? null : null })), monitoramentos: mon.map((m) => ({ ...m, responsavel: m.responsavelUserId ? us.get(m.responsavelUserId) ?? null : null })), liberaColheitaEm: carencia && carencia > new Date() ? carencia : null })
  }))

  router.post('/agro/ciclos/:id/plantar', escrever, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await ciclo(tenantId, String(req.params.id))
    const b = parseBody(z.object({ data: dt.default(new Date()) }), req.body ?? {})
    if (c.status !== 'PLANEJADO') throw httpErr(409, `Ciclo está ${c.status}.`)
    if (b.data.getTime() > Date.now() + DIA) throw httpErr(409, 'A data de plantio não pode ser futura.', 'DATA_FUTURA')
    const ocupado = await prisma.cprCiclo.findFirst({ where: { tenantId, talhaoId: c.talhaoId, id: { not: c.id }, status: { in: ['PLANTADO', 'EM_MANEJO'] } } })
    if (ocupado) throw httpErr(409, 'Há outra cultura em andamento neste talhão.', 'TALHAO_OCUPADO')
    const cultura = await prisma.cprCultura.findFirst({ where: { id: c.culturaId, tenantId } })
    const fora = cultura ? !dentroDaJanela(b.data.getUTCMonth() + 1, cultura.mesPlantioInicio, cultura.mesPlantioFim) : false
    const cultivar = c.cultivarId ? await prisma.cprCultivar.findFirst({ where: { id: c.cultivarId, tenantId } }) : null
    const colheitaPrevista = somaDias(b.data, cultivar?.cicloDias ?? cultura?.cicloDias ?? 120)
    const r = await prisma.cprCiclo.update({ where: { id: c.id }, data: { status: 'PLANTADO', plantioReal: b.data, colheitaPrevista, foraDaJanela: fora } })
    await completeReminders({ tenantId, refType: 'CprCiclo', refId: c.id, userId: getUserId(req) })
    await scheduleReminder({ tenantId, modulo: MOD, titulo: 'Colheita prevista: conferir carência e maturação', dueAt: colheitaPrevista, antecedenciaDias: 15, refType: 'CprCiclo', refId: c.id, assigneeUserId: c.responsavelUserId ?? undefined, assigneeRole: c.responsavelUserId ? undefined : 'COORDINATOR', dedupeKey: `cpr:colheita:${c.id}`, reabrir: true })
    res.json(r)
  }))

  router.post('/agro/ciclos/:id/colher', escrever, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await ciclo(tenantId, String(req.params.id))
    const b = parseBody(z.object({ data: dt.default(new Date()), producaoKg: z.number().positive().max(1e9) }), req.body)
    if (!['PLANTADO', 'EM_MANEJO'].includes(c.status)) throw httpErr(409, 'O ciclo precisa estar plantado para ser colhido.', 'CICLO_NAO_PLANTADO')
    if (c.plantioReal && b.data < c.plantioReal) throw httpErr(400, 'A colheita não pode ser antes do plantio.')
    const lib = await maxCarencia(tenantId, c.id)
    if (lib && b.data < lib) throw Object.assign(httpErr(409, `Carência de defensivo em vigor: a colheita só é liberada a partir de ${lib.toLocaleDateString('pt-BR')}.`, 'CARENCIA_DEFENSIVO'), { liberaEm: lib })
    const prod = Math.round((b.producaoKg / c.areaHa) * 100) / 100
    const r = await prisma.cprCiclo.update({ where: { id: c.id }, data: { status: 'COLHIDO', colheitaReal: b.data, producaoKg: b.producaoKg, produtividadeKgHa: prod } })
    await completeReminders({ tenantId, refType: 'CprCiclo', refId: c.id, userId: getUserId(req) })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'COLHER', refType: 'CprCiclo', refId: c.id, detalhes: { kgHa: prod } })
    res.json(r)
  }))

  router.post('/agro/ciclos/:id/cancelar', escrever, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await ciclo(tenantId, String(req.params.id))
    if (['COLHIDO', 'CANCELADO'].includes(c.status)) throw httpErr(409, `Ciclo está ${c.status}.`)
    const b = parseBody(z.object({ motivo: z.string().trim().min(5).max(300) }), req.body)
    await completeReminders({ tenantId, refType: 'CprCiclo', refId: c.id })
    res.json(await prisma.cprCiclo.update({ where: { id: c.id }, data: { status: 'CANCELADO', observacao: `${c.observacao ?? ''} [Cancelado: ${b.motivo}]`.trim() } }))
  }))

  // ---------------------------------------------------------------- atividades de campo
  router.post('/agro/ciclos/:id/atividades', campo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await ciclo(tenantId, String(req.params.id))
    if (!(await podeRegistrar(req, c))) throw httpErr(403, 'Você não pode registrar atividades neste ciclo (alunos só nas aulas práticas da própria turma).')
    const b = parseBody(z.object({ tipo: z.enum(TIPOS_ATIV), data: dt, insumo: z.string().max(120).optional(), supItemId: zId.optional(), quantidade: z.number().min(0).max(1e8).optional(), unidade: z.string().max(12).optional(), custoUnitario: z.number().min(0).max(1e7).optional(), custo: z.number().min(0).max(1e9).optional(), responsavelUserId: zId.optional(), classSectionId: zId.optional(), carenciaDias: z.number().int().min(0).max(365).optional(), observacao: z.string().max(500).optional() }), req.body)
    if (['COLHIDO', 'CANCELADO'].includes(c.status)) throw httpErr(409, `Ciclo ${c.status === 'COLHIDO' ? 'já colhido' : 'cancelado'}.`)
    if (!ANTES_DO_PLANTIO.includes(b.tipo) && c.status === 'PLANEJADO') throw httpErr(409, 'Plante o ciclo antes de registrar manejo (só preparo do solo e plantio são permitidos antes).', 'CICLO_NAO_PLANTADO')
    if (b.tipo === 'APLICACAO_DEFENSIVO') {
      if (!b.insumo) throw httpErr(400, 'Informe o produto aplicado.')
      if (b.carenciaDias === undefined) throw httpErr(400, 'Informe o período de carência (dias) do defensivo, conforme a bula.', 'CARENCIA_OBRIGATORIA')
      if (!b.quantidade) throw httpErr(400, 'Informe a dose/quantidade aplicada.')
    }
    if (b.tipo === 'COLHEITA') {
      const lib = await maxCarencia(tenantId, c.id)
      if (lib && b.data < lib) throw Object.assign(httpErr(409, `Carência de defensivo em vigor até ${lib.toLocaleDateString('pt-BR')}.`, 'CARENCIA_DEFENSIVO'), { liberaEm: lib })
    }
    if (b.supItemId) await exigir(prisma.supItem.findFirst({ where: { id: b.supItemId, tenantId } }), 'Item do estoque (suprimentos) não encontrado.', 400)
    if (b.responsavelUserId) await exigirUser(tenantId, b.responsavelUserId, 'Responsável não encontrado.')
    const resp = req.user!.role === 'STUDENT' ? req.user!.id : b.responsavelUserId ?? req.user!.id
    const custo = b.custo ?? (b.quantidade !== undefined && b.custoUnitario !== undefined ? Math.round(b.quantidade * b.custoUnitario * 100) / 100 : 0)
    const carenciaAte = b.tipo === 'APLICACAO_DEFENSIVO' ? somaDias(b.data, b.carenciaDias!) : undefined
    const a = await prisma.cprAtividadeCampo.create({ data: { ...b, tenantId, cicloId: c.id, custo, responsavelUserId: resp, classSectionId: b.classSectionId ?? c.classSectionId ?? undefined, carenciaAte } })
    if (c.status === 'PLANTADO' && b.tipo !== 'PLANTIO') await prisma.cprCiclo.update({ where: { id: c.id }, data: { status: 'EM_MANEJO' } })
    await recalcularCusto(tenantId, c.id)
    const avisos: string[] = []
    if (carenciaAte && carenciaAte > c.colheitaPrevista) avisos.push(`A carência termina em ${carenciaAte.toLocaleDateString('pt-BR')}, depois da colheita prevista.`)
    res.status(201).json({ ...a, avisos })
  }))

  router.delete('/agro/atividades/:aid', escrever, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const a = await exigir(prisma.cprAtividadeCampo.findFirst({ where: { id: String(req.params.aid), tenantId } }), 'Atividade não encontrada.')
    const c = await ciclo(tenantId, a.cicloId)
    if (c.status === 'COLHIDO') throw httpErr(409, 'Ciclo colhido: custos e carências ficam congelados.')
    await prisma.cprAtividadeCampo.delete({ where: { id: a.id } })
    await recalcularCusto(tenantId, c.id)
    res.status(204).end()
  }))

  // ---------------------------------------------------------------- monitoramento
  router.post('/agro/ciclos/:id/monitoramentos', campo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await ciclo(tenantId, String(req.params.id))
    if (!(await podeRegistrar(req, c))) throw httpErr(403, 'Você não pode registrar monitoramento neste ciclo.')
    const b = parseBody(z.object({ data: dt.default(new Date()), tipo: z.enum(['PRAGA', 'DOENCA', 'PLANTA_DANINHA', 'CLIMA', 'ESTADO_FENOLOGICO', 'OBSERVACAO']), descricao: z.string().trim().min(5).max(800), severidade: z.enum(['BAIXA', 'MEDIA', 'ALTA']).default('BAIXA'), fotoUrl: urlOpc, acao: z.string().max(400).optional() }), req.body)
    const m = await prisma.cprMonitoramento.create({ data: { ...b, tenantId, cicloId: c.id, responsavelUserId: getUserId(req) } })
    if (b.severidade === 'ALTA' && ['PRAGA', 'DOENCA', 'PLANTA_DANINHA'].includes(b.tipo)) {
      await scheduleReminder({ tenantId, modulo: MOD, titulo: `Infestação alta registrada: avaliar controle (${b.descricao.slice(0, 60)})`, dueAt: somaDias(new Date(), 3), remindAt: new Date(), severity: 'CRITICO', refType: 'CprMonitoramento', refId: m.id, assigneeUserId: c.responsavelUserId ?? undefined, assigneeRole: c.responsavelUserId ? undefined : 'COORDINATOR', dedupeKey: `cpr:infest:${m.id}` })
    }
    res.status(201).json(m)
  }))
  router.post('/agro/monitoramentos/:mid/resolver', escrever, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const m = await exigir(prisma.cprMonitoramento.findFirst({ where: { id: String(req.params.mid), tenantId } }), 'Registro não encontrado.')
    const b = parseBody(z.object({ acao: z.string().trim().min(3).max(400) }), req.body)
    await completeReminders({ tenantId, refType: 'CprMonitoramento', refId: m.id, userId: getUserId(req) })
    res.json(await prisma.cprMonitoramento.update({ where: { id: m.id }, data: { resolvido: true, acao: b.acao } }))
  }))

  // ---------------------------------------------------------------- calendário, produtividade, alertas, aulas práticas, painel
  router.get('/agro/calendario', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const safra = qs(req.query.safra)
    const rows = await prisma.cprCiclo.findMany({ where: { tenantId, status: { not: 'CANCELADO' }, ...(safra ? { safra } : {}) }, orderBy: { plantioPrevisto: 'asc' }, take: 500 })
    const enr = await enriquecer(tenantId, rows)
    const culturas = await prisma.cprCultura.findMany({ where: { tenantId, ativo: true } })
    res.json({ ciclos: enr.map((c) => ({ id: c.id, cultura: c.cultura, talhao: c.talhao, safra: c.safra, status: c.status, plantio: c.plantioReal ?? c.plantioPrevisto, colheita: c.colheitaReal ?? c.colheitaPrevista, foraDaJanela: c.foraDaJanela })), janelas: culturas.map((c) => ({ cultura: c.nome, mesInicio: c.mesPlantioInicio, mesFim: c.mesPlantioFim, cicloDias: c.cicloDias })) })
  }))

  router.get('/agro/produtividade', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId, status: 'COLHIDO' }
    for (const f of ['safra', 'culturaId', 'talhaoId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const rows = await enriquecer(tenantId, await prisma.cprCiclo.findMany({ where, orderBy: { colheitaReal: 'desc' }, take: 500 }))
    const items = rows.map((c) => ({ id: c.id, safra: c.safra, cultura: c.cultura, talhao: c.talhao, areaHa: c.areaHa, producaoKg: c.producaoKg, produtividadeKgHa: c.produtividadeKgHa, custoTotal: c.custoTotal, custoPorHa: c.custoPorHa, custoPorKg: c.producaoKg ? Math.round((c.custoTotal / c.producaoKg) * 1000) / 1000 : null }))
    const porCultura = new Map<string, { cultura: string; producaoKg: number; areaHa: number; custo: number }>()
    for (const i of items) { const k = i.cultura ?? '—'; const a = porCultura.get(k) ?? { cultura: k, producaoKg: 0, areaHa: 0, custo: 0 }; a.producaoKg += i.producaoKg ?? 0; a.areaHa += i.areaHa; a.custo += i.custoTotal; porCultura.set(k, a) }
    res.json({ items, porCultura: [...porCultura.values()].map((a) => ({ ...a, produtividadeMediaKgHa: a.areaHa ? Math.round((a.producaoKg / a.areaHa) * 100) / 100 : null })) })
  }))

  router.get('/agro/alertas', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const al = await alertasAgro(getTenantId(req))
    res.json({ items: al, total: al.length })
  }))

  router.get('/agro/aulas-praticas', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cs = await prisma.cprCiclo.findMany({ where: { tenantId, classSectionId: { not: null } }, take: 300 })
    const secs = await prisma.classSection.findMany({ where: { tenantId, id: { in: cs.map((c) => c.classSectionId!) } }, select: { id: true, nome: true, disciplineId: true } })
    const discs = await prisma.discipline.findMany({ where: { tenantId, id: { in: secs.map((s) => s.disciplineId) } }, select: { id: true, nome: true } })
    const ativ = await prisma.cprAtividadeCampo.groupBy({ by: ['cicloId'], where: { tenantId, cicloId: { in: cs.map((c) => c.id) } }, _count: true })
    const enr = await enriquecer(tenantId, cs)
    res.json({ items: secs.map((s) => ({ classSectionId: s.id, turma: s.nome, disciplina: discs.find((d) => d.id === s.disciplineId)?.nome ?? null, ciclos: enr.filter((c) => c.classSectionId === s.id).map((c) => ({ id: c.id, cultura: c.cultura, talhao: c.talhao, status: c.status, atividades: ativ.find((a) => a.cicloId === c.id)?._count ?? 0 })) })) })
  }))

  router.get('/agro/painel', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const [areas, talhoes, cs, al] = await Promise.all([prisma.cprArea.aggregate({ where: { tenantId, ativo: true }, _sum: { hectares: true }, _count: true }), prisma.cprTalhao.count({ where: { tenantId, ativo: true } }), prisma.cprCiclo.groupBy({ by: ['status'], where: { tenantId }, _count: true, _sum: { custoTotal: true } }), alertasAgro(tenantId)])
    const emCampo = await prisma.cprCiclo.aggregate({ where: { tenantId, status: { in: ['PLANTADO', 'EM_MANEJO'] } }, _sum: { areaHa: true } })
    const n = (s: string) => cs.find((c) => c.status === s)?._count ?? 0
    res.json({ areas: areas._count, hectares: areas._sum.hectares ?? 0, talhoes, planejados: n('PLANEJADO'), emAndamento: n('PLANTADO') + n('EM_MANEJO'), colhidos: n('COLHIDO'), hectaresEmCultivo: emCampo._sum.areaHa ?? 0, custoTotal: Math.round(cs.reduce((s, c) => s + (c._sum.custoTotal ?? 0), 0) * 100) / 100, alertas: al.length, alertasCriticos: al.filter((a) => a.severidade === 'CRITICO').length })
  }))
  void mapaProgramas
}
