import { Response } from 'express'
import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

// Ordem de serviço do laboratório: todos os campos são obrigatórios e geram um protocolo impresso nas moldeiras e na OS.
const RESPONSIBLES = ['AUXILIAR', 'DENTISTA', 'RECEPCAO', 'LABORATORIO']

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Não autenticado.')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, userId: req.user.id }
}
const text = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max)
const parseDay = (v: unknown) => {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`) : null
}
const phoneOk = (v: string) => v.replace(/\D/g, '').length >= 10

async function userName(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, email: true } })
  return u ? `${u.firstName} ${u.lastName}`.trim() || u.email : null
}

export async function list(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const status = text(req.query.status, 20).toUpperCase()
    const rows = await prisma.labServiceOrder.findMany({
      where: { clinicId, tenantId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' }, take: 500
    })
    return res.json(rows)
  } catch (error) {
    console.error('Erro ao listar ordens do laboratório:', error)
    return res.status(500).json({ error: 'Erro ao listar as ordens de serviço.' })
  }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, userId } = ctx(req)
    const b = req.body || {}
    const data = {
      patientName: text(b.patientName), patientContact: text(b.patientContact, 60), dentistName: text(b.dentistName),
      dentistContact: text(b.dentistContact, 60), assistantName: text(b.assistantName), laboratoryName: text(b.laboratoryName),
      service: text(b.service), shade: text(b.shade, 60), elements: text(b.elements, 120)
    }
    const labels: Record<keyof typeof data, string> = {
      patientName: 'nome e sobrenome do paciente', patientContact: 'contato do paciente', dentistName: 'dentista responsável', dentistContact: 'contato do dentista',
      assistantName: 'auxiliar responsável', laboratoryName: 'laboratório', service: 'serviço a ser executado', shade: 'cor do elemento', elements: 'elementos a fazer'
    }
    const missing = (Object.keys(data) as Array<keyof typeof data>).filter(k => !data[k]).map(k => labels[k])
    if (missing.length) return res.status(400).json({ error: `Preencha todos os campos. Falta: ${missing.join(', ')}.` })
    if (data.patientName.split(' ').filter(Boolean).length < 2) return res.status(400).json({ error: 'Informe nome e sobrenome do paciente.' })
    if (!phoneOk(data.patientContact) || !phoneOk(data.dentistContact)) return res.status(400).json({ error: 'Informe o contato do paciente e do dentista com DDD.' })
    const sentAt = parseDay(b.sentAt)
    const dueAt = parseDay(b.dueAt)
    if (!sentAt || !dueAt) return res.status(400).json({ error: 'Informe a data do envio e a data de entrega.' })
    if (dueAt < sentAt) return res.status(400).json({ error: 'A data de entrega não pode ser anterior à data do envio.' })
    const flags = {
      scanUpper: b.scanUpper === true, scanLower: b.scanLower === true, scanBite: b.scanBite === true,
      impressionUpper: b.impressionUpper === true, impressionLower: b.impressionLower === true, waxBite: b.waxBite === true
    }
    if (!Object.values(flags).some(Boolean)) return res.status(400).json({ error: 'Marque o que acompanha o trabalho (escaneamento ou moldagem/mordida).' })
    const patientId = b.patientId ? text(b.patientId, 60) : null
    if (patientId) {
      const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId, tenantId }, select: { id: true } })
      if (!patient) return res.status(404).json({ error: 'Paciente não encontrado.' })
    }

    const year = new Date(Date.now() - 3 * 3600000).getUTCFullYear()
    const createdByName = await userName(userId)
    let order: Awaited<ReturnType<typeof prisma.labServiceOrder.create>> | null = null
    for (let attempt = 0; attempt < 6 && !order; attempt++) {
      const count = await prisma.labServiceOrder.count({ where: { clinicId, protocol: { startsWith: `OS-${year}-` } } })
      const protocol = `OS-${year}-${String(count + 1 + attempt).padStart(4, '0')}`
      try {
        order = await prisma.labServiceOrder.create({
          data: { clinicId, tenantId, protocol, patientId, appointmentId: b.appointmentId ? text(b.appointmentId, 60) : null, ...data, sentAt, dueAt, ...flags, createdById: userId, createdByName }
        })
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error
      }
    }
    if (!order) return res.status(409).json({ error: 'Não foi possível gerar o número de protocolo. Tente novamente.' })
    await writeAudit({ clinicId, tenantId, actorId: userId, module: 'laboratory', action: 'LAB_ORDER_CREATE', entityType: 'LabServiceOrder', entityId: order.id, summary: `Ordem ${order.protocol} enviada a ${order.laboratoryName} (${order.patientName}).` }).catch((e: unknown) => console.error(e))
    return res.status(201).json(order)
  } catch (error) {
    console.error('Erro ao criar ordem do laboratório:', error)
    return res.status(500).json({ error: 'Erro ao criar a ordem de serviço.' })
  }
}

async function loadOrder(req: AuthRequest) {
  const { clinicId, tenantId } = ctx(req)
  return prisma.labServiceOrder.findFirst({ where: { id: String(req.params.id), clinicId, tenantId } })
}

// Recebido ou recusado pelo laboratório: exige o nome de quem recebeu/recusou e, na recusa, o motivo.
export async function receipt(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, userId } = ctx(req)
    const order = await loadOrder(req)
    if (!order) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' })
    if (order.status !== 'SENT') return res.status(409).json({ error: 'Esta ordem já teve o recebimento registrado.' })
    const outcome = String(req.body?.outcome || '').toUpperCase()
    if (!['RECEIVED', 'REFUSED'].includes(outcome)) return res.status(400).json({ error: 'Informe se o laboratório recebeu ou recusou.' })
    const name = text(req.body?.receivedByName, 120)
    if (!name) return res.status(400).json({ error: 'Informe o nome de quem recebeu ou recusou no laboratório.' })
    const reason = text(req.body?.reason, 500)
    if (outcome === 'REFUSED' && !reason) return res.status(400).json({ error: 'Informe o motivo da recusa.' })
    const updated = await prisma.labServiceOrder.update({
      where: { id: order.id },
      data: { status: outcome, receivedAt: new Date(), receivedByName: name, refusalReason: outcome === 'REFUSED' ? reason : null }
    })
    await writeAudit({ clinicId, tenantId, actorId: userId, module: 'laboratory', action: outcome === 'RECEIVED' ? 'LAB_ORDER_RECEIVED' : 'LAB_ORDER_REFUSED', entityType: 'LabServiceOrder', entityId: order.id, summary: `${order.protocol}: ${outcome === 'RECEIVED' ? 'recebido' : 'recusado'} por ${name}${reason ? ` — ${reason}` : ''}.` }).catch((e: unknown) => console.error(e))
    return res.json(updated)
  } catch (error) {
    console.error('Erro ao registrar recebimento:', error)
    return res.status(500).json({ error: 'Erro ao registrar o recebimento.' })
  }
}

type ErrorItem = { id: string; at: string; byName: string | null; responsibleType: string; responsibleName: string; description: string; resolved: boolean; resolvedAt?: string; resolution?: string }

export async function reportError(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, userId } = ctx(req)
    const order = await loadOrder(req)
    if (!order) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' })
    const responsibleType = String(req.body?.responsibleType || '').toUpperCase()
    if (!RESPONSIBLES.includes(responsibleType)) return res.status(400).json({ error: 'Escolha o responsável pelo erro: auxiliar, dentista, recepção ou laboratório.' })
    const description = text(req.body?.description, 1000)
    if (description.length < 5) return res.status(400).json({ error: 'Relate o erro ocorrido.' })
    const item: ErrorItem = { id: randomUUID(), at: new Date().toISOString(), byName: await userName(userId), responsibleType, responsibleName: text(req.body?.responsibleName, 120), description, resolved: false }
    const errors = [...((order.errors as unknown as ErrorItem[]) || []), item]
    const updated = await prisma.labServiceOrder.update({ where: { id: order.id }, data: { errors: errors as unknown as Prisma.InputJsonValue } })
    await writeAudit({ clinicId, tenantId, actorId: userId, module: 'laboratory', action: 'LAB_ORDER_ERROR', entityType: 'LabServiceOrder', entityId: order.id, summary: `${order.protocol}: erro atribuído a ${responsibleType}${item.responsibleName ? ` (${item.responsibleName})` : ''} — ${description.slice(0, 120)}` }).catch((e: unknown) => console.error(e))
    return res.status(201).json(updated)
  } catch (error) {
    console.error('Erro ao registrar erro da ordem:', error)
    return res.status(500).json({ error: 'Erro ao registrar o erro.' })
  }
}

export async function resolveError(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, userId } = ctx(req)
    const order = await loadOrder(req)
    if (!order) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' })
    const resolution = text(req.body?.resolution, 1000)
    if (resolution.length < 5) return res.status(400).json({ error: 'Descreva como o erro foi tratado.' })
    const errors = ((order.errors as unknown as ErrorItem[]) || []).map(e => e.id === String(req.params.errorId) ? { ...e, resolved: true, resolvedAt: new Date().toISOString(), resolution } : e)
    const updated = await prisma.labServiceOrder.update({ where: { id: order.id }, data: { errors: errors as unknown as Prisma.InputJsonValue } })
    await writeAudit({ clinicId, tenantId, actorId: userId, module: 'laboratory', action: 'LAB_ORDER_ERROR_RESOLVED', entityType: 'LabServiceOrder', entityId: order.id, summary: `${order.protocol}: erro tratado — ${resolution.slice(0, 120)}` }).catch((e: unknown) => console.error(e))
    return res.json(updated)
  } catch (error) {
    console.error('Erro ao tratar erro da ordem:', error)
    return res.status(500).json({ error: 'Erro ao tratar o erro.' })
  }
}

export async function deliver(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, userId } = ctx(req)
    const order = await loadOrder(req)
    if (!order) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' })
    if (order.status === 'SENT') return res.status(409).json({ error: 'Registre antes o recebimento pelo laboratório.' })
    if (order.status !== 'RECEIVED') return res.status(409).json({ error: 'Só dá para registrar a entrega de uma ordem recebida pelo laboratório.' })
    const updated = await prisma.labServiceOrder.update({ where: { id: order.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } })
    await writeAudit({ clinicId, tenantId, actorId: userId, module: 'laboratory', action: 'LAB_ORDER_DELIVERED', entityType: 'LabServiceOrder', entityId: order.id, summary: `${order.protocol}: trabalho entregue à clínica.` }).catch((e: unknown) => console.error(e))
    return res.json(updated)
  } catch (error) {
    console.error('Erro ao registrar entrega:', error)
    return res.status(500).json({ error: 'Erro ao registrar a entrega.' })
  }
}
