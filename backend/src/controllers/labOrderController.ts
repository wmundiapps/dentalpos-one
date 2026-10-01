import { Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

const DELIVERED = ['Entregue', 'Liberado']

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

const text = (v: unknown, max = 300) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max))

// Data só com dia vira meio-dia de Brasília (evita aparecer o dia anterior).
function parseDay(v: unknown) {
  const raw = text(v, 40)
  if (!raw) return null
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00-03:00`) : new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

type Incoming = { localId: string; data: Record<string, unknown> }

// Grava (ou atualiza) uma ordem. Vale a versão mais recente (updatedAtISO). Nunca desfaz uma exclusão (arquivo).
async function upsertOne(clinicId: string, tenantId: string, actorId: string, item: Incoming) {
  const localId = text(item.localId, 60)
  const data = item.data || {}
  const patientName = text(data.patientName, 200)
  const workType = text(data.workType, 200)
  if (!localId || !patientName || !workType) return { ok: false as const, reason: 'Dados da ordem incompletos.' }
  if (JSON.stringify(data).length > 200_000) return { ok: false as const, reason: 'Ordem grande demais.' }

  const status = text(data.status, 60) || 'Recebido'
  const existing = await prisma.labOrder.findUnique({ where: { clinicId_localId: { clinicId, localId } } })
  if (existing) {
    const prevAt = String((existing.data as Record<string, unknown>)?.updatedAtISO || '')
    const newAt = String(data.updatedAtISO || '')
    if (prevAt && newAt && newAt < prevAt) return { ok: true as const, accepted: false as const, row: existing }
  }
  const delivered = DELIVERED.includes(status)
  const fields = {
    trackingCode: text(data.trackingCode, 60) || null,
    patientName,
    dentistName: text(data.dentistName, 200) || null,
    workType,
    status,
    priority: text(data.priority, 40) || null,
    dueDate: parseDay(data.dueDateISO),
    data: data as Prisma.InputJsonValue
  }
  const persist = fields
  const row = existing
    ? await prisma.labOrder.update({ where: { id: existing.id }, data: { ...persist, deliveredAt: delivered ? existing.deliveredAt || new Date() : null } })
    : await prisma.labOrder.create({ data: { ...persist, clinicId, tenantId, localId, deliveredAt: delivered ? new Date() : null } })
  if (!existing) {
    await writeAudit({ clinicId, tenantId, actorId, module: 'laboratory', action: 'LAB_ORDER_CREATE', entityType: 'LabOrder', entityId: row.id, summary: `Ordem ${row.trackingCode || localId}: ${workType} — ${patientName}` }).catch((e: unknown) => console.error(e))
  } else if (existing.status !== status) {
    await writeAudit({ clinicId, tenantId, actorId, module: 'laboratory', action: 'LAB_ORDER_STATUS', entityType: 'LabOrder', entityId: row.id, beforeData: { status: existing.status }, afterData: { status }, summary: `Ordem ${row.trackingCode || localId}: ${existing.status} → ${status}` }).catch((e: unknown) => console.error(e))
  }
  if (delivered && row.notifyChannels.length) {
    await prisma.labNotification.updateMany({ where: { clinicId, workRef: localId, status: 'PENDING' }, data: { status: 'CANCELLED', errorMessage: 'Trabalho entregue.' } })
  }
  return { ok: true as const, accepted: true as const, row }
}

function publicRow(r: { localId: string; data: Prisma.JsonValue; status: string; deliveredAt: Date | null; deletedAt: Date | null; updatedAt: Date; createdAt: Date; notifyLabMemberId: string | null; notifyChannels: string[] }) {
  return { localId: r.localId, data: r.data, status: r.status, deliveredAt: r.deliveredAt, deletedAt: r.deletedAt, createdAt: r.createdAt, updatedAt: r.updatedAt, notifyLabMemberId: r.notifyLabMemberId, notifyChannels: r.notifyChannels }
}

// scope=active (padrão): ordens não excluídas. scope=archive: excluídas e entregues/liberadas. scope=all: tudo.
export async function list(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const scope = text(req.query.scope, 20) || 'active'
    const where: Prisma.LabOrderWhereInput = { clinicId, tenantId }
    if (scope === 'active') where.deletedAt = null
    else if (scope === 'archive') where.OR = [{ deletedAt: { not: null } }, { status: { in: DELIVERED } }]
    const rows = await prisma.labOrder.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 5000 })
    return res.json(rows.map(publicRow))
  } catch (error) {
    console.error('Erro ao listar ordens do laboratório:', error)
    return res.status(500).json({ error: 'Erro ao listar ordens do laboratório.' })
  }
}

export async function upsert(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const result = await upsertOne(clinicId, tenantId, actorId, { localId: req.body?.localId, data: req.body?.data })
    if (!result.ok) return res.status(400).json({ error: result.reason })
    return res.json({ accepted: result.accepted, order: publicRow(result.row) })
  } catch (error) {
    console.error('Erro ao gravar ordem do laboratório:', error)
    return res.status(500).json({ error: 'Erro ao gravar ordem do laboratório.' })
  }
}

// Migração/sincronização em lote (até 500 por chamada).
export async function bulk(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const orders: Incoming[] = Array.isArray(req.body?.orders) ? req.body.orders : []
    if (!orders.length) return res.status(400).json({ error: 'Nenhuma ordem enviada.' })
    if (orders.length > 500) return res.status(400).json({ error: 'Máximo de 500 ordens por envio.' })
    let accepted = 0
    const rejected: Array<{ localId: string; reason: string }> = []
    for (const item of orders) {
      const r = await upsertOne(clinicId, tenantId, actorId, item)
      if (!r.ok) rejected.push({ localId: String(item?.localId || ''), reason: r.reason })
      else if (r.accepted) accepted++
    }
    return res.status(201).json({ accepted, rejected })
  } catch (error) {
    console.error('Erro na sincronização das ordens do laboratório:', error)
    return res.status(500).json({ error: 'Erro ao sincronizar ordens do laboratório.' })
  }
}

// "Excluir" = arquivar: a ordem sai da fila, mas continua guardada para sempre (com histórico e auditoria).
export async function remove(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const localId = text(req.params.localId, 60)
    const existing = await prisma.labOrder.findUnique({ where: { clinicId_localId: { clinicId, localId } } })
    if (!existing) return res.status(404).json({ error: 'Ordem não encontrada.' })
    const row = await prisma.labOrder.update({ where: { id: existing.id }, data: { deletedAt: existing.deletedAt || new Date(), deletedById: actorId, notifyChannels: [] } })
    await prisma.labNotification.updateMany({ where: { clinicId, workRef: localId, status: 'PENDING' }, data: { status: 'CANCELLED', errorMessage: 'Ordem excluída (arquivada).' } })
    await writeAudit({ clinicId, tenantId, actorId, module: 'laboratory', action: 'LAB_ORDER_ARCHIVE', entityType: 'LabOrder', entityId: row.id, beforeData: { status: existing.status }, summary: `Ordem ${row.trackingCode || localId} excluída (arquivada): ${row.workType} — ${row.patientName}` }).catch((e: unknown) => console.error(e))
    return res.json(publicRow(row))
  } catch (error) {
    console.error('Erro ao arquivar ordem do laboratório:', error)
    return res.status(500).json({ error: 'Erro ao arquivar ordem do laboratório.' })
  }
}

export async function restore(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const localId = text(req.params.localId, 60)
    const existing = await prisma.labOrder.findUnique({ where: { clinicId_localId: { clinicId, localId } } })
    if (!existing) return res.status(404).json({ error: 'Ordem não encontrada.' })
    const row = await prisma.labOrder.update({ where: { id: existing.id }, data: { deletedAt: null, deletedById: null } })
    await writeAudit({ clinicId, tenantId, actorId, module: 'laboratory', action: 'LAB_ORDER_RESTORE', entityType: 'LabOrder', entityId: row.id, summary: `Ordem ${row.trackingCode || localId} restaurada do arquivo.` }).catch((e: unknown) => console.error(e))
    return res.json(publicRow(row))
  } catch (error) {
    console.error('Erro ao restaurar ordem do laboratório:', error)
    return res.status(500).json({ error: 'Erro ao restaurar ordem do laboratório.' })
  }
}
