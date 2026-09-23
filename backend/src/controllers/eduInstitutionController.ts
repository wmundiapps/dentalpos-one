import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { campusSchema, institutionProfileSchema } from '../validators/eduInstitutionValidator'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

function audit(input: { clinicId: string; tenantId: string; actorId: string; action: string; entityType: string; entityId: string; summary?: string }) {
  return writeAudit({ ...input, module: 'edu' })
}

const CLINIC_FIELDS = ['name', 'displayName', 'logo', 'email', 'phone', 'cnpj', 'address', 'city', 'state', 'zipCode', 'primaryColor'] as const
const PROFILE_FIELDS = ['site', 'contactUrl', 'ombudsmanEmail', 'ombudsmanPhone'] as const

// ---------------------------------------------------------------
// PERFIL DA INSTITUIÇÃO (identidade/marca reaproveita Clinic;
// contato institucional complementar fica em EduInstitutionProfile)
// ---------------------------------------------------------------

export async function getInstitutionProfile(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const [clinic, profile] = await Promise.all([
      prisma.clinic.findFirst({ where: { id: clinicId, tenantId } }),
      prisma.eduInstitutionProfile.findFirst({ where: { clinicId, tenantId } })
    ])
    if (!clinic) return res.status(404).json({ error: 'Instituição não encontrada.' })

    const merged: Record<string, unknown> = { clinicId }
    for (const field of CLINIC_FIELDS) merged[field] = (clinic as Record<string, unknown>)[field]
    for (const field of PROFILE_FIELDS) merged[field] = profile ? (profile as unknown as Record<string, unknown>)[field] : null

    return res.json(merged)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar perfil da instituição.' })
  }
}

export async function updateInstitutionProfile(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = institutionProfileSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const clinicData: Record<string, unknown> = {}
    for (const field of CLINIC_FIELDS) if (field in parsed.data) clinicData[field] = (parsed.data as Record<string, unknown>)[field]

    const profileData: Record<string, unknown> = {}
    for (const field of PROFILE_FIELDS) if (field in parsed.data) profileData[field] = (parsed.data as Record<string, unknown>)[field]

    if (Object.keys(clinicData).length) await prisma.clinic.update({ where: { id: clinicId }, data: clinicData })
    await prisma.eduInstitutionProfile.upsert({
      where: { clinicId },
      create: { clinicId, tenantId, ...profileData },
      update: profileData
    })

    await audit({ clinicId, tenantId, actorId, action: 'EDU_INSTITUTION_PROFILE_UPDATE', entityType: 'Clinic', entityId: clinicId, summary: 'Personalização institucional atualizada (marca/contato).' })
    return getInstitutionProfile(req, res)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar perfil da instituição.' })
  }
}

// ---------------------------------------------------------------
// POLOS E CAMPI
// ---------------------------------------------------------------

export async function listCampuses(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const rows = await prisma.eduCampus.findMany({ where: { clinicId, tenantId }, orderBy: [{ type: 'asc' }, { name: 'asc' }] })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar polos e campi.' })
  }
}

export async function createCampus(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = campusSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduCampus.create({ data: { clinicId, tenantId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_CAMPUS_CREATE', entityType: 'EduCampus', entityId: row.id, summary: `Unidade "${row.name}" cadastrada.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cadastrar unidade.' })
  }
}

export async function updateCampus(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduCampus.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Unidade não encontrada.' })

    const parsed = campusSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduCampus.update({ where: { id }, data: parsed.data })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_CAMPUS_UPDATE', entityType: 'EduCampus', entityId: row.id, summary: `Unidade "${row.name}" atualizada.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar unidade.' })
  }
}
