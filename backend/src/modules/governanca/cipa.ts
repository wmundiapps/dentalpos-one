import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, dateISO } from '../core/crud'
import { audit } from '../core/notify'
import { completeReminders, cancelReminders } from '../core/reminders'
import { READ, WRITE_CIPA as W, MOD, DAY, STATUS_ACAO, ensureReminder, fail, optDate } from './common'
import { pontuacaoRisco, prazoCat, competencia, fimGestao, reunioesMensaisFaltantes, validarComposicaoCipa } from './cipaLogic'

const R = [...READ, ...W]
const AGENTES = ['FISICO', 'QUIMICO', 'BIOLOGICO', 'ERGONOMICO', 'ACIDENTE'] as const

async function agendarGestao(g: any) {
  const base = { tenantId: g.tenantId, modulo: MOD, refType: 'GovCipaGestao', refId: g.id, assigneeRole: 'FACILITIES' }
  await ensureReminder({ ...base, titulo: `CIPA: convocar eleição da próxima gestão (NR-5: 60 dias antes do fim do mandato)`, dueAt: new Date(g.fim.getTime() - 60 * DAY), antecedenciaDias: 15, severity: 'ATENCAO', dedupeKey: `gov:cipa:eleicao:${g.id}` })
  await ensureReminder({ ...base, titulo: `CIPA: mandato da gestão "${g.nome}" termina`, dueAt: g.fim, antecedenciaDias: 30, severity: 'ATENCAO', dedupeKey: `gov:cipa:fim:${g.id}` })
}

// Garante lembrete da reunião ordinária do mês corrente e próximo (idempotente).
export async function garantirReunioesCipa(g: { id: string; tenantId: string; nome: string; inicio: Date; fim: Date }, now = new Date()) {
  const feitas = await prisma.govCipaReuniao.findMany({ where: { tenantId: g.tenantId, gestaoId: g.id, realizada: true, tipo: 'ORDINARIA' }, select: { competencia: true } })
  const feitasSet = new Set(feitas.map((f) => f.competencia))
  const faltantes = reunioesMensaisFaltantes(g.inicio, g.fim, [...feitasSet], now)
  for (const c of faltantes) {
    await ensureReminder({ tenantId: g.tenantId, modulo: MOD, titulo: `CIPA ATRASADA: reunião ordinária de ${c} não realizada (${g.nome})`, dueAt: new Date(now.getTime() - DAY), refType: 'GovCipaGestao', refId: g.id, assigneeRole: 'FACILITIES', severity: 'CRITICO', dedupeKey: `gov:cipa:atraso:${g.id}:${c}` })
  }
  for (const d of [now, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))]) {
    if (d < g.inicio || d > g.fim) continue
    const c = competencia(d)
    if (feitasSet.has(c)) continue
    const fimMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59))
    await ensureReminder({ tenantId: g.tenantId, modulo: MOD, titulo: `CIPA: realizar reunião ordinária mensal de ${c} (${g.nome})`, dueAt: fimMes, antecedenciaDias: 10, refType: 'GovCipaGestao', refId: g.id, assigneeRole: 'FACILITIES', severity: 'ATENCAO', dedupeKey: `gov:cipa:reuniao:${g.id}:${c}` })
  }
  return { faltantes }
}

async function agendarAcaoPlano(a: any) {
  if (a.status === 'CONCLUIDA' || a.status === 'CANCELADA') return
  await ensureReminder({ tenantId: a.tenantId, modulo: MOD, titulo: `Plano de ação SST: ${a.acao.slice(0, 90)}`, dueAt: a.prazo, antecedenciaDias: 5, refType: 'GovCipaPlanoAcao', refId: a.id, assigneeUserId: a.responsavelId ?? undefined, assigneeRole: a.responsavelId ? undefined : 'FACILITIES', severity: 'ATENCAO', dedupeKey: `gov:cipa:acao:${a.id}` })
}

export function registerCipa(router: Router) {
  // ---- Gestão (mandato de 1 ano) ----
  mountCrud(router, {
    model: 'govCipaGestao', path: '/cipa/gestoes', read: R, write: W, modulo: 'governanca.cipa', filters: ['status'], orderBy: { inicio: 'desc' },
    create: z.object({ nome: z.string().min(3), inicio: dateISO(), eleicaoEm: optDate(), ataEleicao: z.string().optional() }),
    update: z.object({ nome: z.string().min(3), eleicaoEm: dateISO(), ataEleicao: z.string() }).partial(),
    beforeCreate: (d) => { d.fim = fimGestao(d.inicio) },       // mandato SEMPRE de 1 ano
    afterCreate: agendarGestao,
    include: { membros: { where: { ativo: true } } },
  })

  router.post('/cipa/gestoes/:id/ativar', requireRole(...W), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const g = await prisma.govCipaGestao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { membros: true } })
    if (!g) return res.status(404).json({ error: 'Gestão não encontrada.' })
    if (g.status !== 'ELEICAO') fail(409, 'Somente gestões em fase de eleição podem ser ativadas.')
    const comp = validarComposicaoCipa(g.membros)
    if (!comp.conforme) return res.status(422).json({ error: 'Composição da CIPA não conforme com a NR-5.', problemas: comp.problemas })
    await prisma.govCipaGestao.updateMany({ where: { tenantId, status: 'VIGENTE', id: { not: g.id } }, data: { status: 'ENCERRADA' } })
    const row = await prisma.govCipaGestao.update({ where: { id: g.id }, data: { status: 'VIGENTE' } })
    await garantirReunioesCipa(row)
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.cipa', acao: 'ATIVAR_GESTAO', refType: 'GovCipaGestao', refId: g.id })
    res.json(row)
  }))
  router.post('/cipa/gestoes/:id/encerrar', requireRole(...W), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const g = await prisma.govCipaGestao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!g) return res.status(404).json({ error: 'Gestão não encontrada.' })
    await cancelReminders({ tenantId, refType: 'GovCipaGestao', refId: g.id })
    res.json(await prisma.govCipaGestao.update({ where: { id: g.id }, data: { status: 'ENCERRADA' } }))
  }))

  router.get('/cipa/gestoes/:id/situacao', requireRole(...R), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const g = await prisma.govCipaGestao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { membros: true } })
    if (!g) return res.status(404).json({ error: 'Gestão não encontrada.' })
    const feitas = await prisma.govCipaReuniao.findMany({ where: { tenantId, gestaoId: g.id, realizada: true, tipo: 'ORDINARIA' }, select: { competencia: true } })
    res.json({
      gestao: { id: g.id, nome: g.nome, inicio: g.inicio, fim: g.fim, status: g.status },
      diasParaFim: Math.ceil((g.fim.getTime() - Date.now()) / DAY), composicao: validarComposicaoCipa(g.membros),
      reunioesRealizadas: feitas.length, reunioesMensaisFaltantes: reunioesMensaisFaltantes(g.inicio, g.fim, feitas.map((f) => f.competencia)),
    })
  }))

  mountCrud(router, {
    model: 'govCipaMembro', path: '/cipa/membros', read: R, write: W, modulo: 'governanca.cipa', filters: ['gestaoId', 'representacao', 'tipo', 'ativo'], orderBy: { nome: 'asc' },
    create: z.object({ gestaoId: z.string().uuid(), nome: z.string().min(2), userId: z.string().optional(), representacao: z.enum(['EMPREGADOR', 'EMPREGADOS']), tipo: z.enum(['TITULAR', 'SUPLENTE']).default('TITULAR'), cargo: z.enum(['PRESIDENTE', 'VICE_PRESIDENTE', 'SECRETARIO', 'MEMBRO']).default('MEMBRO') }),
    beforeCreate: async (d, req) => {
      const g = await prisma.govCipaGestao.findFirst({ where: { id: d.gestaoId, tenantId: getTenantId(req) } })
      if (!g) fail(400, 'Gestão não encontrada.')
      if (g!.status === 'ENCERRADA') fail(409, 'Gestão encerrada.')
      if (d.cargo === 'PRESIDENTE' && d.representacao !== 'EMPREGADOR') fail(422, 'NR-5: o presidente é indicado pelo empregador.')
      if (d.cargo === 'VICE_PRESIDENTE' && d.representacao !== 'EMPREGADOS') fail(422, 'NR-5: o vice-presidente é eleito pelos empregados.')
      if (d.cargo === 'PRESIDENTE' || d.cargo === 'VICE_PRESIDENTE') {
        if (await prisma.govCipaMembro.findFirst({ where: { tenantId: getTenantId(req), gestaoId: d.gestaoId, cargo: d.cargo, ativo: true } })) fail(409, `Já existe ${d.cargo} ativo nesta gestão.`)
      }
    },
    beforeUpdate: (d) => { delete d.gestaoId },
  })

  mountCrud(router, {
    model: 'govCipaReuniao', path: '/cipa/reunioes', read: R, write: W, modulo: 'governanca.cipa', filters: ['gestaoId', 'competencia', 'realizada', 'tipo'], orderBy: { data: 'desc' },
    create: z.object({ gestaoId: z.string().uuid(), tipo: z.enum(['ORDINARIA', 'EXTRAORDINARIA']).default('ORDINARIA'), data: dateISO(), pauta: z.string().optional(), ata: z.string().optional(), realizada: z.boolean().default(false) }),
    beforeCreate: async (d, req) => {
      if (!(await prisma.govCipaGestao.findFirst({ where: { id: d.gestaoId, tenantId: getTenantId(req) } }))) fail(400, 'Gestão não encontrada.')
      d.competencia = competencia(d.data)
    },
    beforeUpdate: (d, _req, cur) => {
      delete d.gestaoId
      if (d.data) d.competencia = competencia(d.data)
      if (d.realizada && !(d.ata ?? cur.ata)) fail(422, 'Registre a ata para marcar a reunião como realizada.')
    },
    afterCreate: async (row) => { if (row.realizada) await afterReuniao(row) },
    afterUpdate: async (row) => { if (row.realizada) await afterReuniao(row) },
  })
  async function afterReuniao(row: any) {
    // limpa só as pendências de reunião (não as de eleição/fim de mandato da gestão)
    await prisma.eduReminder.updateMany({
      where: { tenantId: row.tenantId, refType: 'GovCipaGestao', refId: row.gestaoId, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] }, OR: [{ dedupeKey: { startsWith: `gov:cipa:reuniao:${row.gestaoId}:` } }, { dedupeKey: { startsWith: `gov:cipa:atraso:${row.gestaoId}:${row.competencia}` } }] },
      data: { status: 'CONCLUIDO', concluidoEm: new Date() },
    })
    const g = await prisma.govCipaGestao.findFirst({ where: { id: row.gestaoId, tenantId: row.tenantId } })
    if (g && g.status === 'VIGENTE') await garantirReunioesCipa(g)
  }

  // ---- Mapa de riscos ----
  mountCrud(router, {
    model: 'govCipaRisco', path: '/cipa/riscos', read: R, write: W, modulo: 'governanca.cipa', filters: ['agente', 'nivel', 'status', 'spaceId'], search: ['local', 'descricao'], orderBy: { pontuacao: 'desc' },
    create: z.object({ local: z.string().min(2), spaceId: z.string().optional(), setor: z.string().optional(), agente: z.enum(AGENTES), descricao: z.string().min(3), gravidade: z.number().int().min(1).max(5), probabilidade: z.number().int().min(1).max(5), medidaControle: z.string().optional(), status: z.enum(['ABERTO', 'EM_CONTROLE', 'CONTROLADO']).default('ABERTO') }),
    beforeCreate: (d) => { Object.assign(d, pontuacaoRisco(d.gravidade, d.probabilidade)) },
    beforeUpdate: (d, _req, cur) => { if (d.gravidade != null || d.probabilidade != null) Object.assign(d, pontuacaoRisco(d.gravidade ?? cur.gravidade, d.probabilidade ?? cur.probabilidade)) },
    afterCreate: async (row) => {
      if (row.nivel !== 'ALTO' && row.nivel !== 'CRITICO') return
      const prazo = new Date(Date.now() + (row.nivel === 'CRITICO' ? 15 : 45) * DAY)
      const a = await prisma.govCipaPlanoAcao.create({ data: { tenantId: row.tenantId, origem: 'RISCO', origemId: row.id, acao: `Eliminar/controlar risco ${row.nivel}: ${row.descricao} (${row.local})`, prazo } })
      await agendarAcaoPlano(a)
    },
  })

  // ---- Inspeções ----
  mountCrud(router, {
    model: 'govCipaInspecao', path: '/cipa/inspecoes', read: R, write: W, modulo: 'governanca.cipa', filters: ['realizada'], orderBy: { data: 'desc' },
    create: z.object({ data: dateISO(), local: z.string().min(2), responsavelId: z.string().optional(), achados: z.string().optional(), conclusao: z.string().optional(), realizada: z.boolean().default(false) }),
    afterCreate: async (row) => { if (!row.realizada) await ensureReminder({ tenantId: row.tenantId, modulo: MOD, titulo: `Inspeção de segurança: ${row.local}`, dueAt: row.data, antecedenciaDias: 3, refType: 'GovCipaInspecao', refId: row.id, assigneeUserId: row.responsavelId ?? undefined, assigneeRole: row.responsavelId ? undefined : 'FACILITIES', dedupeKey: `gov:cipa:insp:${row.id}` }) },
    afterUpdate: async (row) => { if (row.realizada) await completeReminders({ tenantId: row.tenantId, refType: 'GovCipaInspecao', refId: row.id }) },
  })

  // ---- Acidentes / CAT ----
  mountCrud(router, {
    model: 'govCipaAcidente', path: '/cipa/acidentes', read: R, write: W, modulo: 'governanca.cipa', filters: ['vinculo', 'tipo', 'gravidade', 'catObrigatoria', 'catEmitida'], search: ['pessoaNome', 'descricao'], orderBy: { data: 'desc' },
    create: z.object({ data: dateISO(), pessoaNome: z.string().min(2), vinculo: z.enum(['EMPREGADO', 'ALUNO', 'TERCEIRO']).default('EMPREGADO'), tipo: z.enum(['TIPICO', 'TRAJETO', 'DOENCA_OCUPACIONAL', 'INCIDENTE']).default('TIPICO'), gravidade: z.enum(['LEVE', 'MODERADO', 'GRAVE', 'FATAL']).default('LEVE'), local: z.string().optional(), descricao: z.string().min(5), diasAfastamento: z.number().int().min(0).default(0) }),
    beforeCreate: (d) => { const c = prazoCat(d); d.catObrigatoria = c.obrigatoria; d.catPrazo = c.prazo },
    beforeUpdate: (d, _req, cur) => {
      delete d.catEmitida; delete d.catNumero
      const m = { data: d.data ?? cur.data, vinculo: d.vinculo ?? cur.vinculo, tipo: d.tipo ?? cur.tipo, gravidade: d.gravidade ?? cur.gravidade }
      const c = prazoCat(m); d.catObrigatoria = c.obrigatoria; d.catPrazo = c.prazo
    },
    afterCreate: async (row) => {
      if (row.catObrigatoria && row.catPrazo) await ensureReminder({ tenantId: row.tenantId, modulo: MOD, titulo: `EMITIR CAT: acidente de ${row.pessoaNome} (${row.gravidade})`, descricao: 'CAT deve ser emitida até o 1º dia útil seguinte (imediatamente em caso de morte).', dueAt: row.catPrazo, remindAt: new Date(), refType: 'GovCipaAcidente', refId: row.id, assigneeRole: 'FACILITIES', severity: 'CRITICO', dedupeKey: `gov:cipa:cat:${row.id}` })
      if (row.tipo !== 'INCIDENTE') {
        const a = await prisma.govCipaPlanoAcao.create({ data: { tenantId: row.tenantId, origem: 'ACIDENTE', origemId: row.id, acao: `Investigar causas e prevenir recorrência do acidente de ${row.pessoaNome} (${row.local ?? 'local não informado'})`, prazo: new Date(Date.now() + 30 * DAY) } })
        await agendarAcaoPlano(a)
      }
    },
  })
  router.post('/cipa/acidentes/:id/cat', requireRole(...W), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const body = parseBody(z.object({ catNumero: z.string().min(3), catEmitidaEm: optDate() }), req.body)
    const a = await prisma.govCipaAcidente.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) return res.status(404).json({ error: 'Acidente não encontrado.' })
    if (!a.catObrigatoria) fail(409, 'CAT não é exigida para este registro.')
    if (a.catEmitida) fail(409, 'CAT já registrada.')
    const row = await prisma.govCipaAcidente.update({ where: { id: a.id }, data: { catEmitida: true, catNumero: body.catNumero, catEmitidaEm: body.catEmitidaEm ?? new Date() } })
    await completeReminders({ tenantId, refType: 'GovCipaAcidente', refId: a.id, userId: getUserId(req) })
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.cipa', acao: 'EMITIR_CAT', refType: 'GovCipaAcidente', refId: a.id, detalhes: { catNumero: body.catNumero } })
    res.json({ ...row, emitidaForaDoPrazo: !!a.catPrazo && row.catEmitidaEm! > new Date(a.catPrazo.getTime() + DAY - 1) })
  }))

  // ---- SIPAT ----
  mountCrud(router, {
    model: 'govCipaSipat', path: '/cipa/sipat', read: R, write: W, modulo: 'governanca.cipa', filters: ['ano', 'status'], orderBy: { inicio: 'desc' },
    create: z.object({ ano: z.number().int().min(2000).max(2100), tema: z.string().min(3), inicio: dateISO(), fim: dateISO(), programacao: z.any().optional(), participantes: z.number().int().min(0).default(0), status: z.enum(['PLANEJADA', 'REALIZADA', 'CANCELADA']).default('PLANEJADA') }),
    beforeCreate: (d) => { if (d.fim < d.inicio) fail(400, 'fim deve ser igual ou posterior ao início.') },
    afterCreate: async (row) => { if (row.status === 'PLANEJADA') await ensureReminder({ tenantId: row.tenantId, modulo: MOD, titulo: `SIPAT ${row.ano}: finalizar organização (tema: ${row.tema})`, dueAt: row.inicio, antecedenciaDias: 45, refType: 'GovCipaSipat', refId: row.id, assigneeRole: 'FACILITIES', dedupeKey: `gov:cipa:sipat:${row.id}` }) },
    afterUpdate: async (row) => { if (row.status !== 'PLANEJADA') await cancelReminders({ tenantId: row.tenantId, refType: 'GovCipaSipat', refId: row.id }) },
  })

  // ---- Plano de ação ----
  mountCrud(router, {
    model: 'govCipaPlanoAcao', path: '/cipa/plano-acao', read: R, write: W, modulo: 'governanca.cipa', filters: ['status', 'origem', 'origemId'], orderBy: { prazo: 'asc' },
    create: z.object({ origem: z.string().optional(), origemId: z.string().optional(), acao: z.string().min(5), responsavelId: z.string().optional(), prazo: dateISO(), status: z.enum(STATUS_ACAO).default('PLANEJADA') }),
    afterCreate: agendarAcaoPlano,
    afterUpdate: async (row) => {
      if (row.status === 'CONCLUIDA') await completeReminders({ tenantId: row.tenantId, refType: 'GovCipaPlanoAcao', refId: row.id })
      else if (row.status === 'CANCELADA') await cancelReminders({ tenantId: row.tenantId, refType: 'GovCipaPlanoAcao', refId: row.id })
      else await agendarAcaoPlano(row)
    },
  })

  router.get('/cipa/painel', requireRole(...R), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const [gestao, riscos, acidentes12m, catPendentes, acoesAbertas, acoesAtrasadas] = await Promise.all([
      prisma.govCipaGestao.findFirst({ where: { tenantId, status: 'VIGENTE' } }),
      prisma.govCipaRisco.groupBy({ by: ['nivel'], where: { tenantId, status: { not: 'CONTROLADO' } }, _count: { _all: true } }),
      prisma.govCipaAcidente.count({ where: { tenantId, data: { gte: new Date(Date.now() - 365 * DAY) } } }),
      prisma.govCipaAcidente.count({ where: { tenantId, catObrigatoria: true, catEmitida: false } }),
      prisma.govCipaPlanoAcao.count({ where: { tenantId, status: { in: ['PLANEJADA', 'EM_ANDAMENTO'] } } }),
      prisma.govCipaPlanoAcao.count({ where: { tenantId, status: { in: ['PLANEJADA', 'EM_ANDAMENTO'] }, prazo: { lt: new Date() } } }),
    ])
    let reunioesFaltantes: string[] = []
    if (gestao) {
      const feitas = await prisma.govCipaReuniao.findMany({ where: { tenantId, gestaoId: gestao.id, realizada: true, tipo: 'ORDINARIA' }, select: { competencia: true } })
      reunioesFaltantes = reunioesMensaisFaltantes(gestao.inicio, gestao.fim, feitas.map((f) => f.competencia))
    }
    res.json({ gestaoVigente: gestao, riscosAbertosPorNivel: Object.fromEntries(riscos.map((r) => [r.nivel, r._count._all])), acidentesUltimos12Meses: acidentes12m, catPendentes, planoAcao: { abertas: acoesAbertas, atrasadas: acoesAtrasadas }, reunioesMensaisFaltantes: reunioesFaltantes })
  }))
}
