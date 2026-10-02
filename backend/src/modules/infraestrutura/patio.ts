import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireAuth, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, pageParams, qs, dateISO } from '../core/crud'
import { audit, notify } from '../core/notify'
import { scheduleReminder, cancelReminders, completeReminders } from '../core/reminders'
import { conflitoHorario } from './calc'
import { GESTAO, LEITURA, MODULO, ensureSpace, fail } from './util'

const TIPOS_RESERVAVEIS = ['PATIO', 'QUADRA', 'ESTACIONAMENTO', 'AUDITORIO', 'OUTRO']
const MAX_HORAS = 14

// Reservas aprovadas que conflitam com o intervalo.
export async function conflitosReserva(tenantId: string, spaceId: string, inicio: Date, fim: Date, ignorarId?: string) {
  const cand = await prisma.infReservaArea.findMany({
    where: { tenantId, spaceId, status: 'APROVADA', inicio: { lt: fim }, fim: { gt: inicio }, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
  })
  return cand.filter((c) => conflitoHorario({ inicio, fim }, c))
}

export function mountPatio(router: Router) {
  mountCrud(router, {
    model: 'infRegraUso', path: '/regras-uso', read: [], write: GESTAO, readAll: true, modulo: MODULO, removeMode: 'soft',
    create: z.object({ spaceId: z.string().optional().nullable(), titulo: z.string().min(3), texto: z.string().min(3), ordem: z.number().int().default(1), ativo: z.boolean().optional() }),
    filters: ['spaceId', 'ativo'], orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
    beforeCreate: async (d: any, req) => { await ensureSpace(getTenantId(req), d.spaceId) },
  })

  const reservaCreate = z.object({
    spaceId: z.string().min(1), titulo: z.string().min(3), finalidade: z.string().optional(),
    inicio: dateISO(), fim: dateISO(), publicoEstimado: z.number().int().min(0).optional(),
    necessidades: z.array(z.string()).optional(), aceiteRegras: z.boolean().default(false),
  })

  router.post(
    '/reservas',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const d = parseBody(reservaCreate, req.body)
      const space = await ensureSpace(tenantId, d.spaceId)
      if (!TIPOS_RESERVAVEIS.includes(space!.tipo)) fail(400, `Espaço do tipo ${space!.tipo} não é uma área reservável (use o cronograma acadêmico).`)
      if (!space!.ativo) fail(409, 'Espaço inativo.')
      if (d.fim <= d.inicio) fail(400, 'Fim deve ser posterior ao início.')
      if (d.inicio.getTime() < Date.now() - 5 * 60_000) fail(400, 'Início no passado.')
      if ((d.fim.getTime() - d.inicio.getTime()) / 3_600_000 > MAX_HORAS) fail(400, `Reserva excede ${MAX_HORAS}h.`)
      if (space!.capacidade > 0 && d.publicoEstimado && d.publicoEstimado > space!.capacidade) fail(400, `Público estimado excede a capacidade do espaço (${space!.capacidade}).`)
      const regras = await prisma.infRegraUso.count({ where: { tenantId, ativo: true, OR: [{ spaceId: null }, { spaceId: d.spaceId }] } })
      if (regras > 0 && !d.aceiteRegras) fail(400, 'É necessário aceitar as regras de uso (aceiteRegras=true).')
      const conf = await conflitosReserva(tenantId, d.spaceId, d.inicio, d.fim)
      if (conf.length) return res.status(409).json({ error: 'Conflito de horário com reserva aprovada.', conflitos: conf.map((c) => ({ id: c.id, titulo: c.titulo, inicio: c.inicio, fim: c.fim })) })
      const r = await prisma.infReservaArea.create({ data: { ...d, tenantId, solicitanteUserId: userId } })
      await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Analisar reserva: ${r.titulo} (${space!.nome})`, dueAt: new Date(Math.max(Date.now() + 3_600_000, r.inicio.getTime() - 2 * 86_400_000)), antecedenciaDias: 0, refType: 'InfReservaArea', refId: r.id, assigneeRole: 'FACILITIES', dedupeKey: `inf-res-analise-${r.id}` })
      await audit({ tenantId, userId, modulo: MODULO, acao: 'RESERVA_SOLICITADA', refType: 'InfReservaArea', refId: r.id })
      res.status(201).json(r)
    }),
  )

  router.get(
    '/reservas',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      for (const f of ['status', 'spaceId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
      if (qs(req.query.de)) where.fim = { gte: new Date(qs(req.query.de)!) }
      if (qs(req.query.ate)) where.inicio = { lte: new Date(qs(req.query.ate)!) }
      const [items, total] = await Promise.all([prisma.infReservaArea.findMany({ where, orderBy: { inicio: 'asc' }, skip, take }), prisma.infReservaArea.count({ where })])
      res.json({ items, total, page, pageSize })
    }),
  )

  router.get(
    '/reservas/minhas',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const items = await prisma.infReservaArea.findMany({ where: { tenantId: getTenantId(req), solicitanteUserId: getUserId(req) }, orderBy: { inicio: 'desc' }, take: 200 })
      res.json({ items, total: items.length })
    }),
  )

  // Agenda pública interna (qualquer autenticado vê o que está ocupado, sem dados do solicitante).
  router.get(
    '/reservas/agenda',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const de = qs(req.query.de) ? new Date(qs(req.query.de)!) : new Date()
      const ate = qs(req.query.ate) ? new Date(qs(req.query.ate)!) : new Date(de.getTime() + 30 * 86_400_000)
      const spaceId = qs(req.query.spaceId)
      const items = await prisma.infReservaArea.findMany({ where: { tenantId, status: 'APROVADA', inicio: { lt: ate }, fim: { gt: de }, ...(spaceId ? { spaceId } : {}) }, orderBy: { inicio: 'asc' }, select: { id: true, spaceId: true, titulo: true, inicio: true, fim: true } })
      res.json({ items })
    }),
  )

  router.get(
    '/reservas/disponibilidade',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const spaceId = qs(req.query.spaceId), i = qs(req.query.inicio), f = qs(req.query.fim)
      if (!spaceId || !i || !f) fail(400, 'Informe spaceId, inicio e fim.')
      const inicio = new Date(i), fim = new Date(f)
      if (isNaN(inicio.getTime()) || isNaN(fim.getTime()) || fim <= inicio) fail(400, 'Intervalo inválido.')
      const conf = await conflitosReserva(tenantId, spaceId, inicio, fim)
      res.json({ disponivel: conf.length === 0, conflitos: conf.map((c) => ({ titulo: c.titulo, inicio: c.inicio, fim: c.fim })) })
    }),
  )

  router.post(
    '/reservas/:id/decidir',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const d = parseBody(z.object({ aprovar: z.boolean(), motivo: z.string().optional() }), req.body)
      const r = await prisma.infReservaArea.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!r) return res.status(404).json({ error: 'Reserva não encontrada.' })
      if (r.status !== 'SOLICITADA') fail(409, 'Reserva já decidida.')
      if (!d.aprovar && !d.motivo) fail(400, 'Informe o motivo da recusa.')
      if (d.aprovar) {
        if (r.inicio.getTime() < Date.now()) fail(409, 'Reserva já passou do início.')
        const conf = await conflitosReserva(tenantId, r.spaceId, r.inicio, r.fim, r.id)
        if (conf.length) fail(409, `Conflito com reserva aprovada "${conf[0].titulo}".`)
      }
      const novo = await prisma.infReservaArea.update({ where: { id: r.id }, data: { status: d.aprovar ? 'APROVADA' : 'RECUSADA', decididoPorId: userId, decididoEm: new Date(), motivoDecisao: d.motivo } })
      await completeReminders({ tenantId, refType: 'InfReservaArea', refId: r.id, userId })
      if (d.aprovar) {
        await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Preparar área para evento: ${r.titulo}`, dueAt: r.inicio, antecedenciaDias: 1, refType: 'InfReservaArea', refId: r.id, assigneeRole: 'FACILITIES', dedupeKey: `inf-res-prep-${r.id}` })
      }
      await notify({ tenantId, userId: r.solicitanteUserId, assunto: `Reserva ${d.aprovar ? 'aprovada' : 'recusada'}: ${r.titulo}`, mensagem: `Sua reserva "${r.titulo}" (${r.inicio.toLocaleString('pt-BR')}) foi ${d.aprovar ? 'APROVADA' : 'RECUSADA'}.${d.motivo ? ' ' + d.motivo : ''}`, refType: 'InfReservaArea', refId: r.id })
      await audit({ tenantId, userId, modulo: MODULO, acao: d.aprovar ? 'RESERVA_APROVADA' : 'RESERVA_RECUSADA', refType: 'InfReservaArea', refId: r.id })
      res.json(novo)
    }),
  )

  router.post(
    '/reservas/:id/cancelar',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const r = await prisma.infReservaArea.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!r) return res.status(404).json({ error: 'Reserva não encontrada.' })
      const gestor = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD', 'FACILITIES'].includes(String(req.user?.role))
      if (!gestor && r.solicitanteUserId !== getUserId(req)) fail(403, 'Sem permissão.')
      if (!['SOLICITADA', 'APROVADA'].includes(r.status)) fail(409, 'Reserva não pode ser cancelada.')
      await cancelReminders({ tenantId, refType: 'InfReservaArea', refId: r.id })
      res.json(await prisma.infReservaArea.update({ where: { id: r.id }, data: { status: 'CANCELADA' } }))
    }),
  )
}

// Job: encerra reservas passadas (aprovadas -> REALIZADA; solicitadas sem decisão -> CANCELADA e avisa).
export async function jobReservas(agora = new Date()) {
  const realizadas = await prisma.infReservaArea.updateMany({ where: { status: 'APROVADA', fim: { lt: agora } }, data: { status: 'REALIZADA' } })
  const expiradas = await prisma.infReservaArea.findMany({ where: { status: 'SOLICITADA', inicio: { lt: agora } }, take: 500 })
  for (const r of expiradas) {
    await prisma.infReservaArea.update({ where: { id: r.id }, data: { status: 'CANCELADA', motivoDecisao: 'Expirada sem decisão antes do início.' } })
    await cancelReminders({ tenantId: r.tenantId, refType: 'InfReservaArea', refId: r.id })
    await notify({ tenantId: r.tenantId, userId: r.solicitanteUserId, assunto: `Reserva expirada: ${r.titulo}`, mensagem: `Sua solicitação "${r.titulo}" expirou sem decisão. Faça uma nova solicitação.`, refType: 'InfReservaArea', refId: r.id })
  }
  return { realizadas: realizadas.count, expiradas: expiradas.length }
}
