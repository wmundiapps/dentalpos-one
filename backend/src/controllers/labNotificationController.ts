import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { LAB_CHANNELS, labMessage, planNotifications, processDueLabNotifications } from '../services/labNotificationService'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId }
}

// Programa (ou reprograma) os avisos de uma ordem de serviço do laboratório.
export async function schedule(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const b = req.body || {}
    const workRef = String(b.workRef || '').trim()
    const patientName = String(b.patientName || '').trim()
    const workType = String(b.workType || '').trim()
    const labMemberId = String(b.labMemberId || '').trim()
    const channels = [...new Set((Array.isArray(b.channels) ? b.channels : []).map((c: unknown) => String(c).toUpperCase()))].filter((c): c is string => (LAB_CHANNELS as readonly string[]).includes(c as string))
    if (!workRef || !patientName || !workType) return res.status(400).json({ error: 'Dados da ordem de serviço incompletos.' })
    if (!labMemberId || !channels.length) return res.status(400).json({ error: 'Escolha o laboratório e ao menos um canal de aviso.' })
    const lab = await prisma.teamMember.findFirst({ where: { id: labMemberId, clinicId, tenantId, role: 'LAB_PROTESE', isActive: true } })
    if (!lab) return res.status(404).json({ error: 'Laboratório de prótese não encontrado na equipe da clínica.' })
    const missing = channels.filter(c => (c === 'TELEGRAM' ? !lab.telegramChatId : !lab.phone))
    if (missing.length) return res.status(400).json({ error: `O cadastro do laboratório não tem ${missing.includes('TELEGRAM') ? 'o chat ID do Telegram' : 'o telefone'} para ${missing.join(', ')}.` })

    const clinic = await prisma.clinic.findFirst({ where: { id: clinicId }, select: { name: true } })
    const dueDateISO = b.dueDateISO ? String(b.dueDateISO).slice(0, 10) : null
    const createdAt = b.createdAtISO && !Number.isNaN(new Date(String(b.createdAtISO)).getTime()) ? new Date(String(b.createdAtISO)) : new Date()
    const snapshot = { patientName, workType, teeth: b.teeth ? String(b.teeth) : null, dueDateISO, dentistName: String(b.dentistName || 'o dentista responsável'), clinicName: clinic?.name || 'DentalPos' }

    const plan = planNotifications({ isNew: b.isNew !== false, createdAt, dueDateISO })
    await prisma.$transaction([
      prisma.labNotification.updateMany({ where: { clinicId, workRef, status: 'PENDING' }, data: { status: 'CANCELLED', errorMessage: 'Substituído por nova programação.' } }),
      prisma.labNotification.createMany({
        data: plan.flatMap(item => channels.map(channel => ({ clinicId, tenantId, workRef, labMemberId, type: item.type, channel, message: labMessage(item.type, snapshot), scheduledFor: item.scheduledFor })))
      })
    ])
    // O aviso imediato sai agora; os demais, no horário programado (cron).
    await processDueLabNotifications(clinicId).catch((e: unknown) => console.error(e))
    return res.status(201).json({ scheduled: plan.length * channels.length })
  } catch (error) {
    console.error('Erro ao programar avisos do laboratório:', error)
    return res.status(500).json({ error: 'Erro ao programar avisos do laboratório.' })
  }
}

export async function cancel(req: AuthRequest, res: Response) {
  try {
    const { clinicId } = ctx(req)
    const workRef = String(req.body?.workRef || '').trim()
    if (!workRef) return res.status(400).json({ error: 'Ordem não informada.' })
    const result = await prisma.labNotification.updateMany({ where: { clinicId, workRef, status: 'PENDING' }, data: { status: 'CANCELLED', errorMessage: 'Trabalho entregue ou aviso desativado.' } })
    return res.json({ cancelled: result.count })
  } catch (error) {
    console.error('Erro ao cancelar avisos do laboratório:', error)
    return res.status(500).json({ error: 'Erro ao cancelar avisos.' })
  }
}

export async function list(req: AuthRequest, res: Response) {
  try {
    const { clinicId } = ctx(req)
    const workRef = String(req.query.workRef || '').trim()
    const rows = await prisma.labNotification.findMany({ where: { clinicId, ...(workRef ? { workRef } : {}) }, orderBy: { scheduledFor: 'asc' }, take: 200 })
    return res.json(rows)
  } catch (error) {
    console.error('Erro ao listar avisos do laboratório:', error)
    return res.status(500).json({ error: 'Erro ao listar avisos.' })
  }
}
