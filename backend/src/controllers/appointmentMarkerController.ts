import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

const COLOR_RE = /^#[0-9a-fA-F]{6}$/
const DEFAULTS = [{ name: 'LABORATÓRIO FAZER', color: '#E53935' }, { name: 'LABORATÓRIO FEITO', color: '#43A047' }]

export async function list(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = req.user!
    if ((await prisma.appointmentMarker.count({ where: { clinicId } })) === 0) await prisma.appointmentMarker.createMany({ data: DEFAULTS.map((d) => ({ ...d, clinicId, tenantId })) })
    return res.json(await prisma.appointmentMarker.findMany({ where: { clinicId, isActive: true }, orderBy: { createdAt: 'asc' } }))
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao carregar os marcadores.' }) }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = req.user!
    const name = String(req.body?.name || '').trim().toUpperCase().slice(0, 40)
    const color = String(req.body?.color || '#9E9E9E')
    if (name.length < 2) return res.status(400).json({ error: 'Informe o nome do marcador.' })
    if (!COLOR_RE.test(color)) return res.status(400).json({ error: 'Cor inválida.' })
    const dup = await prisma.appointmentMarker.findFirst({ where: { clinicId, isActive: true, name } })
    if (dup) return res.status(409).json({ error: 'Já existe um marcador com este nome.' })
    return res.status(201).json(await prisma.appointmentMarker.create({ data: { clinicId, tenantId, name, color } }))
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao criar o marcador.' }) }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const { clinicId } = req.user!
    const id = String(req.params.id)
    const cur = await prisma.appointmentMarker.findFirst({ where: { id, clinicId } })
    if (!cur) return res.status(404).json({ error: 'Marcador não encontrado.' })
    const data: { name?: string; color?: string; isActive?: boolean } = {}
    if (req.body?.name !== undefined) { const n = String(req.body.name).trim().toUpperCase().slice(0, 40); if (n.length < 2) return res.status(400).json({ error: 'Informe o nome do marcador.' }); data.name = n }
    if (req.body?.color !== undefined) { if (!COLOR_RE.test(String(req.body.color))) return res.status(400).json({ error: 'Cor inválida.' }); data.color = String(req.body.color) }
    if (req.body?.isActive !== undefined) data.isActive = Boolean(req.body.isActive)
    return res.json(await prisma.appointmentMarker.update({ where: { id }, data }))
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao atualizar o marcador.' }) }
}

// Marcadores de vários agendamentos de uma vez (para pintar a agenda).
export async function links(req: AuthRequest, res: Response) {
  try {
    const { clinicId } = req.user!
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).slice(0, 2000)
    if (!ids.length) return res.json([])
    return res.json(await prisma.appointmentMarkerLink.findMany({ where: { clinicId, appointmentId: { in: ids } }, select: { appointmentId: true, markerId: true } }))
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao carregar os marcadores da agenda.' }) }
}

export async function setForAppointment(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = req.user!
    const appointmentId = String(req.params.id)
    const appt = await prisma.appointment.findFirst({ where: { id: appointmentId, clinicId, tenantId }, select: { id: true } })
    if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado.' })
    const wanted = [...new Set((Array.isArray(req.body?.markerIds) ? req.body.markerIds : []).map(String))] as string[]
    const valid = await prisma.appointmentMarker.findMany({ where: { clinicId, isActive: true, id: { in: wanted } }, select: { id: true } })
    await prisma.$transaction([
      prisma.appointmentMarkerLink.deleteMany({ where: { appointmentId, clinicId } }),
      prisma.appointmentMarkerLink.createMany({ data: valid.map((m) => ({ appointmentId, markerId: m.id, clinicId })) }),
    ])
    return res.json({ ok: true, markerIds: valid.map((m) => m.id) })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao salvar os marcadores.' }) }
}
