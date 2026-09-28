import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import {
  assetSchema,
  assetStatusSchema,
  bookableResourceSchema,
  expiringItemSchema,
  maintenanceOrderSchema,
  maintenanceStatusSchema,
  parkingAssignSchema,
  parkingSpotSchema,
  resourceBookingSchema
} from '../validators/eduFacilitiesValidator'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

function audit(input: { clinicId: string; tenantId: string; actorId: string; action: string; entityType: string; entityId: string; summary?: string }) {
  return writeAudit({ ...input, module: 'edu' })
}

// ---------------------------------------------------------------
// PATRIMÔNIO
// ---------------------------------------------------------------

export async function listAssets(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const rows = await prisma.eduAsset.findMany({ where: { clinicId, tenantId, ...(status ? { status } : {}) }, orderBy: { name: 'asc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar patrimônio.' })
  }
}

export async function createAsset(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = assetSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const duplicate = await prisma.eduAsset.findFirst({ where: { clinicId, code: parsed.data.code } })
    if (duplicate) return res.status(409).json({ error: 'Já existe um item de patrimônio com este código.' })

    const row = await prisma.eduAsset.create({
      data: { clinicId, tenantId, ...parsed.data, acquisitionDate: parsed.data.acquisitionDate ? new Date(parsed.data.acquisitionDate) : undefined }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_ASSET_CREATE', entityType: 'EduAsset', entityId: row.id, summary: `Patrimônio "${row.name}" (${row.code}) cadastrado.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cadastrar item de patrimônio.' })
  }
}

export async function updateAssetStatus(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduAsset.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Item de patrimônio não encontrado.' })

    const parsed = assetStatusSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduAsset.update({ where: { id }, data: parsed.data })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_ASSET_STATUS_UPDATE', entityType: 'EduAsset', entityId: id, summary: `Patrimônio "${existing.name}" → ${parsed.data.status}.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar status do patrimônio.' })
  }
}

// ---------------------------------------------------------------
// MANUTENÇÃO (pátio, iluminação e demais locais via "location")
// ---------------------------------------------------------------

export async function listMaintenanceOrders(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const rows = await prisma.eduMaintenanceOrder.findMany({
      where: { clinicId, tenantId, ...(status ? { status } : {}) },
      include: { asset: true },
      orderBy: [{ priority: 'desc' }, { openedAt: 'desc' }]
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar ordens de manutenção.' })
  }
}

export async function createMaintenanceOrder(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = maintenanceOrderSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })
    if (!parsed.data.assetId && !parsed.data.location) return res.status(400).json({ error: 'Informe o patrimônio ou o local da manutenção.' })

    if (parsed.data.assetId) {
      const asset = await prisma.eduAsset.findFirst({ where: { id: parsed.data.assetId, clinicId, tenantId } })
      if (!asset) return res.status(400).json({ error: 'Item de patrimônio inválido.' })
    }

    const row = await prisma.eduMaintenanceOrder.create({ data: { clinicId, tenantId, requestedById: actorId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_MAINTENANCE_ORDER_CREATE', entityType: 'EduMaintenanceOrder', entityId: row.id, summary: `Ordem de manutenção "${row.title}" aberta.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao abrir ordem de manutenção.' })
  }
}

export async function updateMaintenanceStatus(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduMaintenanceOrder.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Ordem de manutenção não encontrada.' })

    const parsed = maintenanceStatusSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduMaintenanceOrder.update({
      where: { id },
      data: { ...parsed.data, closedAt: parsed.data.status === 'CONCLUIDA' || parsed.data.status === 'CANCELADA' ? new Date() : existing.closedAt }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_MAINTENANCE_ORDER_STATUS', entityType: 'EduMaintenanceOrder', entityId: id, summary: `Ordem "${existing.title}" → ${parsed.data.status}.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar ordem de manutenção.' })
  }
}

// ---------------------------------------------------------------
// ESTACIONAMENTO
// ---------------------------------------------------------------

export async function listParkingSpots(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const rows = await prisma.eduParkingSpot.findMany({ where: { clinicId, tenantId }, include: { assignedToStudent: true }, orderBy: { code: 'asc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar vagas de estacionamento.' })
  }
}

export async function createParkingSpot(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = parkingSpotSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const duplicate = await prisma.eduParkingSpot.findFirst({ where: { clinicId, code: parsed.data.code } })
    if (duplicate) return res.status(409).json({ error: 'Já existe uma vaga com este código.' })

    const row = await prisma.eduParkingSpot.create({ data: { clinicId, tenantId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_PARKING_SPOT_CREATE', entityType: 'EduParkingSpot', entityId: row.id, summary: `Vaga ${row.code} cadastrada.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cadastrar vaga de estacionamento.' })
  }
}

export async function assignParkingSpot(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const spot = await prisma.eduParkingSpot.findFirst({ where: { id, clinicId, tenantId } })
    if (!spot) return res.status(404).json({ error: 'Vaga não encontrada.' })
    if (spot.isOccupied) return res.status(409).json({ error: 'Vaga já está ocupada.' })

    const parsed = parkingAssignSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })
    if (!parsed.data.assignedToStudentId && !parsed.data.assignedToUserId) return res.status(400).json({ error: 'Informe o aluno ou o colaborador para a vaga.' })

    const row = await prisma.eduParkingSpot.update({ where: { id }, data: { ...parsed.data, isOccupied: true } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_PARKING_SPOT_ASSIGN', entityType: 'EduParkingSpot', entityId: id, summary: `Vaga ${spot.code} atribuída.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atribuir vaga de estacionamento.' })
  }
}

export async function releaseParkingSpot(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const spot = await prisma.eduParkingSpot.findFirst({ where: { id, clinicId, tenantId } })
    if (!spot) return res.status(404).json({ error: 'Vaga não encontrada.' })

    const row = await prisma.eduParkingSpot.update({ where: { id }, data: { isOccupied: false, assignedToStudentId: null, assignedToUserId: null } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_PARKING_SPOT_RELEASE', entityType: 'EduParkingSpot', entityId: id, summary: `Vaga ${spot.code} liberada.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao liberar vaga de estacionamento.' })
  }
}

// ---------------------------------------------------------------
// RESERVA DE SALAS E EQUIPAMENTOS
// ---------------------------------------------------------------

export async function listBookableResources(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const rows = await prisma.eduBookableResource.findMany({ where: { clinicId, tenantId, isActive: true }, orderBy: { name: 'asc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar salas e equipamentos.' })
  }
}

export async function createBookableResource(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = bookableResourceSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduBookableResource.create({ data: { clinicId, tenantId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_BOOKABLE_RESOURCE_CREATE', entityType: 'EduBookableResource', entityId: row.id, summary: `Recurso "${row.name}" cadastrado para reserva.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cadastrar sala/equipamento.' })
  }
}

export async function listResourceBookings(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const resourceId = typeof req.query.resourceId === 'string' ? req.query.resourceId : undefined
    const rows = await prisma.eduResourceBooking.findMany({
      where: { clinicId, tenantId, status: { not: 'CANCELADA' }, ...(resourceId ? { resourceId } : {}) },
      include: { resource: true },
      orderBy: { startAt: 'asc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar reservas.' })
  }
}

export async function createResourceBooking(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = resourceBookingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const { resourceId, startAt, endAt } = parsed.data
    const start = new Date(startAt)
    const end = new Date(endAt)
    if (end <= start) return res.status(400).json({ error: 'O término da reserva deve ser depois do início.' })

    const resource = await prisma.eduBookableResource.findFirst({ where: { id: resourceId, clinicId, tenantId, isActive: true } })
    if (!resource) return res.status(400).json({ error: 'Sala/equipamento inválido.' })

    const conflict = await prisma.eduResourceBooking.findFirst({
      where: { resourceId, status: { not: 'CANCELADA' }, startAt: { lt: end }, endAt: { gt: start } }
    })
    if (conflict) return res.status(409).json({ error: 'Já existe uma reserva para este recurso nesse horário.' })

    const row = await prisma.eduResourceBooking.create({
      data: { clinicId, tenantId, resourceId, requestedById: actorId, purpose: parsed.data.purpose, startAt: start, endAt: end },
      include: { resource: true }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_RESOURCE_BOOKING_CREATE', entityType: 'EduResourceBooking', entityId: row.id, summary: `Reserva de "${resource.name}" confirmada.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar reserva.' })
  }
}

export async function cancelResourceBooking(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const booking = await prisma.eduResourceBooking.findFirst({ where: { id, clinicId, tenantId } })
    if (!booking) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (booking.requestedById !== actorId && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Só quem fez a reserva ou um administrador pode cancelá-la.' })
    }

    const row = await prisma.eduResourceBooking.update({ where: { id }, data: { status: 'CANCELADA' } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_RESOURCE_BOOKING_CANCEL', entityType: 'EduResourceBooking', entityId: id, summary: 'Reserva cancelada.' })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cancelar reserva.' })
  }
}

// ---------------------------------------------------------------
// VENCIMENTOS — regra de antecedência (vencimento − preparo − margem)
// ---------------------------------------------------------------

function alertDate(item: { expiresAt: Date; preparationDays: number; safetyMarginDays: number }) {
  const ms = item.expiresAt.getTime() - (item.preparationDays + item.safetyMarginDays) * 24 * 60 * 60 * 1000
  return new Date(ms)
}

export async function listExpiringItems(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const dueOnly = req.query.due === 'true'
    const rows = await prisma.eduExpiringItem.findMany({ where: { clinicId, tenantId, status: 'ATIVO' }, orderBy: { expiresAt: 'asc' } })
    const now = new Date()
    const withAlert = rows.map(row => ({ ...row, alertAt: alertDate(row), alertTriggered: alertDate(row) <= now }))
    return res.json(dueOnly ? withAlert.filter(row => row.alertTriggered) : withAlert)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar vencimentos.' })
  }
}

export async function createExpiringItem(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = expiringItemSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    if (parsed.data.relatedAssetId) {
      const asset = await prisma.eduAsset.findFirst({ where: { id: parsed.data.relatedAssetId, clinicId, tenantId } })
      if (!asset) return res.status(400).json({ error: 'Item de patrimônio inválido.' })
    }

    const row = await prisma.eduExpiringItem.create({
      data: { clinicId, tenantId, createdById: actorId, ...parsed.data, expiresAt: new Date(parsed.data.expiresAt) }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_EXPIRING_ITEM_CREATE', entityType: 'EduExpiringItem', entityId: row.id, summary: `Vencimento "${row.title}" cadastrado para ${row.expiresAt.toISOString().slice(0, 10)}.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cadastrar vencimento.' })
  }
}

export async function resolveExpiringItem(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduExpiringItem.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Vencimento não encontrado.' })

    const row = await prisma.eduExpiringItem.update({ where: { id }, data: { status: 'RESOLVIDO', resolvedAt: new Date() } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_EXPIRING_ITEM_RESOLVE', entityType: 'EduExpiringItem', entityId: id, summary: `Vencimento "${existing.title}" resolvido.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao resolver vencimento.' })
  }
}
