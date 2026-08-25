import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

const safeUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  phone: true,
  avatar: true,
  isActive: true
}

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

export async function index(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const doctors = await prisma.doctor.findMany({
      where: { clinicId, tenantId, isActive: true },
      include: { user: { select: safeUserSelect } },
      orderBy: { createdAt: 'desc' }
    })
    return res.status(200).json(doctors)
  } catch (error) {
    console.error('Erro ao listar profissionais:', error)
    return res.status(500).json({ error: 'Erro ao listar profissionais.' })
  }
}

export async function show(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const id = String(req.params.id)
    const doctor = await prisma.doctor.findFirst({
      where: { id, clinicId, tenantId },
      include: { user: { select: safeUserSelect } }
    })

    if (!doctor) return res.status(404).json({ error: 'Profissional não encontrado.' })
    return res.status(200).json(doctor)
  } catch (error) {
    console.error('Erro ao buscar profissional:', error)
    return res.status(500).json({ error: 'Erro ao buscar profissional.' })
  }
}

export async function store(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const userId = String(req.body.userId || '')
    const cro = String(req.body.cro || '').trim()
    const specialty = String(req.body.specialty || '').trim()

    if (!userId || !cro || !specialty) {
      return res.status(400).json({ error: 'Usuário, CRO e especialidade são obrigatórios.' })
    }

    const linkedUser = await prisma.user.findFirst({ where: { id: userId, clinicId, tenantId, isActive: true } })
    if (!linkedUser) return res.status(400).json({ error: 'Usuário não pertence à clínica atual.' })

    const doctor = await prisma.doctor.create({
      data: {
        clinicId,
        tenantId,
        userId,
        cro,
        specialty,
        bio: req.body.bio ? String(req.body.bio) : undefined,
        photo: req.body.photo ? String(req.body.photo) : undefined,
        isActive: req.body.isActive !== false
      }
    })

    await writeAudit({
      clinicId,
      tenantId,
      actorId,
      module: 'doctors',
      action: 'DOCTOR_CREATE',
      entityType: 'Doctor',
      entityId: doctor.id,
      summary: `Profissional ${cro} cadastrado.`
    })

    return res.status(201).json(doctor)
  } catch (error) {
    console.error('Erro ao cadastrar profissional:', error)
    return res.status(500).json({ error: 'Erro ao cadastrar profissional.' })
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.doctor.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Profissional não encontrado.' })

    const allowed = ['cro', 'specialty', 'bio', 'photo', 'isActive']
    const data = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)))
    const doctor = await prisma.doctor.update({ where: { id }, data })

    await writeAudit({
      clinicId,
      tenantId,
      actorId,
      module: 'doctors',
      action: 'DOCTOR_UPDATE',
      entityType: 'Doctor',
      entityId: id,
      beforeData: existing,
      afterData: doctor
    })

    return res.status(200).json(doctor)
  } catch (error) {
    console.error('Erro ao atualizar profissional:', error)
    return res.status(500).json({ error: 'Erro ao atualizar profissional.' })
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.doctor.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Profissional não encontrado.' })

    await prisma.doctor.update({ where: { id }, data: { isActive: false } })
    await writeAudit({
      clinicId,
      tenantId,
      actorId,
      module: 'doctors',
      action: 'DOCTOR_DEACTIVATE',
      entityType: 'Doctor',
      entityId: id,
      summary: `Profissional ${existing.cro} inativado.`
    })

    return res.status(200).json({ message: 'Profissional inativado com sucesso.' })
  } catch (error) {
    console.error('Erro ao remover profissional:', error)
    return res.status(500).json({ error: 'Erro ao remover profissional.' })
  }
}
