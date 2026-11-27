import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireAuth, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, pageParams, qs, dateISO } from '../core/crud'
import { audit } from '../core/notify'
import { scheduleReminder, completeReminders } from '../core/reminders'
import { consumoEntre, desvioConsumo } from './calc'
import { abrirChamado } from './manutencao'
import { GESTAO, LEITURA, MODULO, ensureSpace, fail, money } from './util'

const LEITOR = [...GESTAO, 'SUPPORT', 'STAFF'] as const

export function mountEnergia(router: Router) {
  // ----- Iluminação -----
  mountCrud(router, {
    model: 'infPontoLuz', path: '/iluminacao/pontos', read: [...LEITURA, 'SUPPORT', 'STAFF'], write: GESTAO, modulo: MODULO,
    create: z.object({ spaceId: z.string().optional().nullable(), codigo: z.string().min(1), descricao: z.string().optional().nullable(), tipo: z.string().default('LED'), potenciaW: z.number().positive().optional().nullable(), quantidade: z.number().int().min(1).default(1), ultimaTroca: dateISO().optional().nullable() }),
    update: z.object({ spaceId: z.string().nullable(), descricao: z.string().nullable(), tipo: z.string(), potenciaW: z.number().positive().nullable(), quantidade: z.number().int().min(1), ultimaTroca: dateISO().nullable() }).partial(),
    search: ['codigo', 'descricao'], filters: ['status', 'spaceId', 'tipo'], orderBy: { codigo: 'asc' },
    beforeCreate: async (d: any, req) => { await ensureSpace(getTenantId(req), d.spaceId) },
  })

  // Qualquer usuário autenticado/equipe reporta lâmpada queimada -> chamado automático.
  router.post(
    '/iluminacao/pontos/:id/reportar',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ status: z.enum(['QUEIMADA', 'INTERMITENTE']).default('QUEIMADA'), observacao: z.string().optional() }), req.body ?? {})
      const p = await prisma.infPontoLuz.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!p) return res.status(404).json({ error: 'Ponto de iluminação não encontrado.' })
      if (p.status === 'DESATIVADA') fail(409, 'Ponto desativado.')
      if (p.chamadoId) {
        const aberto = await prisma.infChamado.findFirst({ where: { id: p.chamadoId, tenantId, status: { in: ['ABERTO', 'EM_ATENDIMENTO'] } } })
        if (aberto) return res.json({ ponto: p, chamado: aberto, jaReportado: true })
      }
      const space = p.spaceId ? await prisma.eduSpace.findFirst({ where: { id: p.spaceId, tenantId } }) : null
      const ch = await abrirChamado({ tenantId, solicitanteUserId: getUserId(req), categoria: 'ILUMINACAO', prioridade: p.tipo === 'POSTE' || p.tipo === 'REFLETOR' ? 'ALTA' : 'MEDIA', titulo: `Lâmpada ${d.status === 'QUEIMADA' ? 'queimada' : 'intermitente'}: ${p.codigo}${space ? ' — ' + space.nome : ''}`, descricao: d.observacao ?? p.descricao, spaceId: p.spaceId, origem: 'ILUMINACAO' })
      const ponto = await prisma.infPontoLuz.update({ where: { id: p.id }, data: { status: d.status, chamadoId: ch.id } })
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'LAMPADA_REPORTADA', refType: 'InfPontoLuz', refId: p.id })
      res.status(201).json({ ponto, chamado: ch })
    }),
  )

  router.post(
    '/iluminacao/pontos/:id/substituir',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const p = await prisma.infPontoLuz.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!p) return res.status(404).json({ error: 'Ponto não encontrado.' })
      const ponto = await prisma.infPontoLuz.update({ where: { id: p.id }, data: { status: 'OK', ultimaTroca: new Date() } })
      if (p.chamadoId) {
        const ch = await prisma.infChamado.findFirst({ where: { id: p.chamadoId, tenantId, status: { in: ['ABERTO', 'EM_ATENDIMENTO'] } } })
        if (ch) {
          await prisma.infChamado.update({ where: { id: ch.id }, data: { status: 'RESOLVIDO', resolvidoEm: new Date(), atendenteUserId: getUserId(req) } })
          await completeReminders({ tenantId, refType: 'InfChamado', refId: ch.id, userId: getUserId(req) })
        }
      }
      res.json(ponto)
    }),
  )

  router.get(
    '/iluminacao/resumo',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const pts = await prisma.infPontoLuz.findMany({ where: { tenantId } })
      const por: Record<string, number> = {}
      let potenciaTotalW = 0
      for (const p of pts) { por[p.status] = (por[p.status] ?? 0) + 1; if (p.status !== 'DESATIVADA') potenciaTotalW += (p.potenciaW ?? 0) * p.quantidade }
      res.json({ totalPontos: pts.length, porStatus: por, potenciaInstaladaKw: money(potenciaTotalW / 1000), pctLed: pts.length ? money((pts.filter((p) => p.tipo === 'LED').length / pts.length) * 100) : 0, comProblema: pts.filter((p) => ['QUEIMADA', 'INTERMITENTE'].includes(p.status)).length })
    }),
  )

  // ----- Medidores e leituras -----
  mountCrud(router, {
    model: 'infMedidor', path: '/medidores', read: [...LEITURA, 'SUPPORT', 'STAFF'], write: GESTAO, modulo: MODULO, removeMode: 'soft',
    create: z.object({ codigo: z.string().min(1), tipo: z.enum(['ENERGIA', 'AGUA', 'GAS']), spaceId: z.string().optional().nullable(), campusId: z.string().optional().nullable(), unidade: z.string().optional(), limiarDesvioPct: z.number().min(1).max(500).default(25), janelaLeituras: z.number().int().min(2).max(24).default(6), ativo: z.boolean().optional() }),
    search: ['codigo'], filters: ['tipo', 'ativo', 'spaceId'], orderBy: { codigo: 'asc' },
    beforeCreate: async (d: any, req) => { await ensureSpace(getTenantId(req), d.spaceId); d.unidade = d.unidade ?? (d.tipo === 'ENERGIA' ? 'kWh' : d.tipo === 'AGUA' ? 'm³' : 'm³') },
  })

  router.post(
    '/medidores/:id/leituras',
    requireRole(...LEITOR),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ dataLeitura: dateISO().optional(), valor: z.number().min(0) }), req.body)
      const m = await prisma.infMedidor.findFirst({ where: { id: String(req.params.id), tenantId, ativo: true } })
      if (!m) return res.status(404).json({ error: 'Medidor não encontrado ou inativo.' })
      const data = d.dataLeitura ?? new Date()
      if (data.getTime() > Date.now() + 86_400_000) fail(400, 'Data de leitura no futuro.')
      const ant = await prisma.infLeitura.findFirst({ where: { tenantId, medidorId: m.id, dataLeitura: { lt: data } }, orderBy: { dataLeitura: 'desc' } })
      const posterior = await prisma.infLeitura.findFirst({ where: { tenantId, medidorId: m.id, dataLeitura: { gte: data } } })
      if (posterior) fail(409, 'Já existe leitura nesta data ou posterior; só é possível lançar leituras em ordem cronológica.')
      let extra: any = {}
      if (ant) {
        let c
        try { c = consumoEntre({ dataLeitura: ant.dataLeitura, valor: ant.valor }, { dataLeitura: data, valor: d.valor }) } catch (e: any) { fail(400, e.message) }
        const hist = await prisma.infLeitura.findMany({ where: { tenantId, medidorId: m.id, mediaDiaria: { not: null } }, orderBy: { dataLeitura: 'desc' }, take: m.janelaLeituras })
        const dv = desvioConsumo(c.mediaDiaria, hist.map((h) => h.mediaDiaria as number), m.limiarDesvioPct)
        extra = { consumo: c.consumo, dias: c.dias, mediaDiaria: c.mediaDiaria, desvioPct: dv.desvioPct, alerta: dv.alerta }
      }
      const l = await prisma.infLeitura.create({ data: { tenantId, medidorId: m.id, dataLeitura: data, valor: d.valor, registradoPorId: getUserId(req), ...extra } })
      if (l.alerta) {
        await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Desvio de consumo (${m.tipo}) no medidor ${m.codigo}: ${l.desvioPct! > 0 ? '+' : ''}${l.desvioPct}%`, descricao: 'Verifique vazamentos/equipamentos ligados fora de horário ou erro de leitura.', dueAt: new Date(Date.now() + 3 * 86_400_000), antecedenciaDias: 0, severity: Math.abs(l.desvioPct!) > m.limiarDesvioPct * 2 ? 'CRITICO' : 'ATENCAO', refType: 'InfLeitura', refId: l.id, assigneeRole: 'FACILITIES', dedupeKey: `inf-desvio-${l.id}` })
        if (l.desvioPct! > 0) await abrirChamado({ tenantId, solicitanteUserId: getUserId(req), categoria: m.tipo === 'AGUA' ? 'HIDRAULICA' : 'ELETRICA', prioridade: 'MEDIA', titulo: `Investigar consumo anormal — medidor ${m.codigo} (+${l.desvioPct}%)`, spaceId: m.spaceId, origem: 'MEDIDOR' })
      }
      res.status(201).json(l)
    }),
  )

  router.get(
    '/medidores/:id/leituras',
    requireRole(...LEITURA, ...LEITOR),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId, medidorId: String(req.params.id) }
      if (qs(req.query.de) || qs(req.query.ate)) where.dataLeitura = { ...(qs(req.query.de) ? { gte: new Date(qs(req.query.de)!) } : {}), ...(qs(req.query.ate) ? { lte: new Date(qs(req.query.ate)!) } : {}) }
      if (qs(req.query.alerta) === 'true') where.alerta = true
      const [items, total] = await Promise.all([prisma.infLeitura.findMany({ where, orderBy: { dataLeitura: 'desc' }, skip, take }), prisma.infLeitura.count({ where })])
      res.json({ items, total, page, pageSize })
    }),
  )

  // Consumo por período (soma dos consumos das leituras no intervalo), por medidor e por tipo.
  router.get(
    '/consumo',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const ate = qs(req.query.ate) ? new Date(qs(req.query.ate)!) : new Date()
      const de = qs(req.query.de) ? new Date(qs(req.query.de)!) : new Date(ate.getTime() - 90 * 86_400_000)
      const tipo = qs(req.query.tipo)
      const medidores = await prisma.infMedidor.findMany({ where: { tenantId, ...(tipo ? { tipo: tipo as any } : {}) } })
      const leituras = await prisma.infLeitura.findMany({ where: { tenantId, medidorId: { in: medidores.map((m) => m.id) }, dataLeitura: { gte: de, lte: ate }, consumo: { not: null } }, orderBy: { dataLeitura: 'asc' } })
      const porMedidor = medidores.map((m) => {
        const ls = leituras.filter((l) => l.medidorId === m.id)
        const total = ls.reduce((s, l) => s + (l.consumo ?? 0), 0)
        const dias = ls.reduce((s, l) => s + (l.dias ?? 0), 0)
        return { medidorId: m.id, codigo: m.codigo, tipo: m.tipo, unidade: m.unidade, consumoTotal: money(total), mediaDiaria: dias ? money(total / dias) : null, alertas: ls.filter((l) => l.alerta).length, serie: ls.map((l) => ({ data: l.dataLeitura, consumo: l.consumo, desvioPct: l.desvioPct })) }
      })
      const porTipo: Record<string, number> = {}
      for (const p of porMedidor) porTipo[p.tipo] = money((porTipo[p.tipo] ?? 0) + p.consumoTotal)
      res.json({ periodo: { de, ate }, porTipo, porMedidor })
    }),
  )

  mountCrud(router, {
    model: 'infAcaoEficiencia', path: '/acoes-eficiencia', read: LEITURA, write: GESTAO, modulo: MODULO,
    create: z.object({ titulo: z.string().min(3), tipo: z.enum(['ENERGIA', 'AGUA', 'RESIDUOS', 'OUTRO']).default('ENERGIA'), descricao: z.string().optional().nullable(), medidorId: z.string().optional().nullable(), economiaEstimadaPct: z.number().min(0).max(100).optional().nullable(), custo: z.number().min(0).default(0), status: z.enum(['PLANEJADA', 'EM_EXECUCAO', 'CONCLUIDA', 'CANCELADA']).default('PLANEJADA'), prazo: dateISO().optional().nullable(), responsavelUserId: z.string().optional().nullable() }),
    search: ['titulo'], filters: ['status', 'tipo'], orderBy: { createdAt: 'desc' },
    afterCreate: async (row: any) => { if (row.prazo && row.status !== 'CONCLUIDA') await scheduleReminder({ tenantId: row.tenantId, modulo: MODULO, titulo: `Ação de eficiência: ${row.titulo}`, dueAt: row.prazo, refType: 'InfAcaoEficiencia', refId: row.id, assigneeUserId: row.responsavelUserId ?? undefined, assigneeRole: row.responsavelUserId ? undefined : 'FACILITIES', dedupeKey: `inf-efic-${row.id}` }) },
    afterUpdate: async (row: any, req) => { if (['CONCLUIDA', 'CANCELADA'].includes(row.status)) await completeReminders({ tenantId: row.tenantId, refType: 'InfAcaoEficiencia', refId: row.id, userId: getUserId(req) }) },
  })
}

// Job: pontos de luz com chamado já resolvido voltam a OK; medidores sem leitura há >35 dias geram lembrete.
export async function jobEnergia(agora = new Date()) {
  const pts = await prisma.infPontoLuz.findMany({ where: { status: { in: ['QUEIMADA', 'INTERMITENTE'] }, chamadoId: { not: null } }, take: 1000 })
  let normalizados = 0
  for (const p of pts) {
    const ch = await prisma.infChamado.findFirst({ where: { id: p.chamadoId!, tenantId: p.tenantId, status: { in: ['RESOLVIDO', 'FECHADO'] } } })
    if (ch) { await prisma.infPontoLuz.update({ where: { id: p.id }, data: { status: 'OK', ultimaTroca: ch.resolvidoEm ?? agora } }); normalizados++ }
  }
  const meds = await prisma.infMedidor.findMany({ where: { ativo: true }, take: 2000 })
  let semLeitura = 0
  for (const m of meds) {
    const ult = await prisma.infLeitura.findFirst({ where: { medidorId: m.id }, orderBy: { dataLeitura: 'desc' } })
    const ref = ult?.dataLeitura ?? m.createdAt
    if (agora.getTime() - ref.getTime() > 35 * 86_400_000) {
      semLeitura++
      await scheduleReminder({ tenantId: m.tenantId, modulo: MODULO, titulo: `Realizar leitura do medidor ${m.codigo} (${m.tipo})`, dueAt: agora, remindAt: agora, severity: 'ATENCAO', refType: 'InfMedidor', refId: m.id, assigneeRole: 'FACILITIES', recorrenciaDias: 5, dedupeKey: `inf-leitura-${m.id}-${agora.toISOString().slice(0, 7)}` })
    }
  }
  return { pontosNormalizados: normalizados, medidoresSemLeitura: semLeitura }
}
