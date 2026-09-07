import { Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import {
  clinicalFileCategorySchema,
  clinicalFileCompleteSchema,
  clinicalFileCreateSchema,
  clinicalFileUpdateSchema
} from '../validators/clinicalFileValidator'
import {
  buildClinicalStorageKey,
  classifyPreview,
  createDownloadAccess,
  createUploadAccess,
  normalizeExtension
} from '../services/clinicalStorageService'

function context(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return {
    clinicId: req.user.clinicId,
    tenantId: req.user.tenantId,
    actorUserId: req.user.id
  }
}

async function patientExists(patientId: string, clinicId: string, tenantId: string) {
  return prisma.patient.findFirst({ where: { id: patientId, clinicId, tenantId }, select: { id: true } })
}

async function assertLinkedEntities(input: {
  treatmentItemId?: string | null
  clinicalEvolutionId?: string | null
  patientId: string
  clinicId: string
  tenantId: string
}) {
  const { treatmentItemId, clinicalEvolutionId, patientId, clinicId, tenantId } = input
  if (treatmentItemId) {
    const item = await prisma.treatmentItem.findFirst({
      where: { id: treatmentItemId, patientId, clinicId, tenantId },
      select: { id: true }
    })
    if (!item) throw new Error('TREATMENT_NOT_FOUND')
  }
  if (clinicalEvolutionId) {
    const evolution = await prisma.clinicalEvolution.findFirst({
      where: { id: clinicalEvolutionId, patientId, clinicId, tenantId },
      select: { id: true }
    })
    if (!evolution) throw new Error('EVOLUTION_NOT_FOUND')
  }
}

export async function categories(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = context(req)
    let rows = await prisma.clinicalFileCategory.findMany({
      where: { clinicId, tenantId, isActive: true },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }]
    })
    if (!rows.length) {
      await prisma.clinicalFileCategory.createMany({
        data: [
          { clinicId, tenantId, name: 'Fotografias', kind: 'PHOTO', isSystem: true },
          { clinicId, tenantId, name: 'Radiografias', kind: 'RADIOGRAPH', isSystem: true },
          { clinicId, tenantId, name: 'Tomografias / DICOM', kind: 'TOMOGRAPHY', isSystem: true },
          { clinicId, tenantId, name: 'Exames laboratoriais', kind: 'LAB_EXAM', isSystem: true },
          { clinicId, tenantId, name: 'Documentos e PDFs', kind: 'DOCUMENT', isSystem: true },
          { clinicId, tenantId, name: 'Arquivos 3D odontológicos', kind: 'STL', isSystem: true }
        ],
        skipDuplicates: true
      })
      rows = await prisma.clinicalFileCategory.findMany({
        where: { clinicId, tenantId, isActive: true },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }]
      })
    }
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar categorias clínicas.' })
  }
}

export async function createCategory(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = context(req)
    const parsed = clinicalFileCategorySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Categoria inválida.', details: parsed.error.flatten() })

    const duplicate = await prisma.clinicalFileCategory.findFirst({
      where: { clinicId, tenantId, name: { equals: parsed.data.name, mode: 'insensitive' }, isActive: true }
    })
    if (duplicate) return res.status(409).json({ error: 'Já existe uma categoria com este nome.' })

    const row = await prisma.clinicalFileCategory.create({
      data: { clinicId, tenantId, ...parsed.data }
    })
    await writeAudit({
      clinicId, tenantId, actorId: actorUserId, module: 'clinical',
      action: 'CLINICAL_FILE_CATEGORY_CREATE', entityType: 'ClinicalFileCategory', entityId: row.id,
      metadata: { name: row.name, kind: row.kind }
    })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar categoria clínica.' })
  }
}

export async function index(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = context(req)
    const patientId = String(req.params.patientId)
    if (!(await patientExists(patientId, clinicId, tenantId))) {
      return res.status(404).json({ error: 'Paciente não encontrado.' })
    }

    const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined
    const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined

    const rows = await prisma.clinicalFile.findMany({
      where: {
        clinicId, tenantId, patientId, deletedAt: null,
        ...(kind ? { kind } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(search ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { originalName: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { origin: { contains: search, mode: 'insensitive' } },
            { tags: { has: search } }
          ]
        } : {})
      },
      orderBy: [{ examDate: 'desc' }, { createdAt: 'desc' }]
    })

    const categoryIds = [...new Set(rows.map(row => row.categoryId).filter(Boolean))] as string[]
    const categoryRows = categoryIds.length
      ? await prisma.clinicalFileCategory.findMany({ where: { id: { in: categoryIds }, clinicId, tenantId } })
      : []
    const byId = new Map(categoryRows.map(row => [row.id, row]))

    return res.json(rows.map(row => ({
      ...row,
      category: row.categoryId ? byId.get(row.categoryId) || null : null,
      previewKind: classifyPreview(row.extension, row.mimeType, row.kind)
    })))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar arquivos e exames clínicos.' })
  }
}

export async function uploadIntent(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = context(req)
    const patientId = String(req.params.patientId)
    if (!(await patientExists(patientId, clinicId, tenantId))) {
      return res.status(404).json({ error: 'Paciente não encontrado.' })
    }

    const parsed = clinicalFileCreateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados do arquivo inválidos.', details: parsed.error.flatten() })
    await assertLinkedEntities({ ...parsed.data, patientId, clinicId, tenantId })

    if (parsed.data.categoryId) {
      const category = await prisma.clinicalFileCategory.findFirst({
        where: { id: parsed.data.categoryId, clinicId, tenantId, isActive: true },
        select: { id: true }
      })
      if (!category) return res.status(400).json({ error: 'Categoria clínica inválida.' })
    }

    const extension = normalizeExtension(parsed.data.originalName, parsed.data.extension)
    const previewKind = classifyPreview(extension, parsed.data.mimeType, parsed.data.kind)
    const row = await prisma.clinicalFile.create({
      data: {
        clinicId, tenantId, patientId, createdById: actorUserId,
        ...parsed.data,
        metadata: parsed.data.metadata as Prisma.InputJsonValue | undefined,
        extension,
        previewKind,
        storageProvider: parsed.data.externalUrl ? 'EXTERNAL_REFERENCE' : 'PENDING',
        storageKey: '',
        storageStatus: parsed.data.externalUrl ? 'AVAILABLE' : 'PENDING_UPLOAD',
        examDate: parsed.data.examDate ? new Date(parsed.data.examDate) : null
      }
    })

    if (parsed.data.externalUrl) {
      await writeAudit({
        clinicId, tenantId, actorId: actorUserId, module: 'clinical',
        action: 'CLINICAL_FILE_CREATE_REFERENCE', entityType: 'ClinicalFile', entityId: row.id,
        metadata: { patientId, kind: row.kind, originalName: row.originalName }
      })
      return res.status(201).json({ file: row, upload: null })
    }

    const storageKey = buildClinicalStorageKey({
      tenantId, clinicId, patientId, fileId: row.id, originalName: row.originalName
    })
    const upload = await createUploadAccess({
      clinicId, tenantId, storageKey, contentType: row.mimeType
    })

    const updated = await prisma.clinicalFile.update({
      where: { id: row.id },
      data: {
        storageProvider: upload.provider,
        storageKey,
        storageStatus: upload.configured ? 'PENDING_UPLOAD' : 'AWAITING_STORAGE_CONFIGURATION'
      }
    })

    await writeAudit({
      clinicId, tenantId, actorId: actorUserId, module: 'clinical',
      action: 'CLINICAL_FILE_UPLOAD_INTENT', entityType: 'ClinicalFile', entityId: row.id,
      metadata: { patientId, kind: row.kind, originalName: row.originalName, storageConfigured: upload.configured }
    })

    return res.status(201).json({ file: updated, upload })
  } catch (error: any) {
    if (error?.message === 'TREATMENT_NOT_FOUND') return res.status(400).json({ error: 'Item de tratamento não pertence ao paciente.' })
    if (error?.message === 'EVOLUTION_NOT_FOUND') return res.status(400).json({ error: 'Evolução clínica não pertence ao paciente.' })
    console.error(error)
    return res.status(500).json({ error: 'Erro ao preparar upload clínico.' })
  }
}

export async function completeUpload(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = context(req)
    const id = String(req.params.id)
    const parsed = clinicalFileCompleteSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Confirmação de upload inválida.', details: parsed.error.flatten() })

    const existing = await prisma.clinicalFile.findFirst({ where: { id, clinicId, tenantId, deletedAt: null } })
    if (!existing) return res.status(404).json({ error: 'Arquivo clínico não encontrado.' })

    const row = await prisma.clinicalFile.update({
      where: { id },
      data: {
        storageStatus: 'AVAILABLE',
        checksum: parsed.data.checksum || existing.checksum,
        metadata: parsed.data.metadata ? (parsed.data.metadata as Prisma.InputJsonValue) : (existing.metadata ?? Prisma.JsonNull)
      }
    })
    await writeAudit({
      clinicId, tenantId, actorId: actorUserId, module: 'clinical',
      action: 'CLINICAL_FILE_UPLOAD_COMPLETE', entityType: 'ClinicalFile', entityId: row.id,
      metadata: { patientId: row.patientId, storageKey: row.storageKey }
    })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao confirmar upload clínico.' })
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = context(req)
    const id = String(req.params.id)
    const parsed = clinicalFileUpdateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const existing = await prisma.clinicalFile.findFirst({ where: { id, clinicId, tenantId, deletedAt: null } })
    if (!existing) return res.status(404).json({ error: 'Arquivo clínico não encontrado.' })
    await assertLinkedEntities({ ...parsed.data, patientId: existing.patientId, clinicId, tenantId })

    const row = await prisma.clinicalFile.update({
      where: { id },
      data: {
        ...parsed.data,
        examDate: parsed.data.examDate === undefined
          ? undefined
          : parsed.data.examDate ? new Date(parsed.data.examDate) : null,
        metadata: parsed.data.metadata === undefined ? undefined : (parsed.data.metadata as Prisma.InputJsonValue)
      }
    })
    await writeAudit({
      clinicId, tenantId, actorId: actorUserId, module: 'clinical',
      action: 'CLINICAL_FILE_UPDATE', entityType: 'ClinicalFile', entityId: row.id,
      metadata: { patientId: row.patientId }
    })
    return res.json(row)
  } catch (error: any) {
    if (error?.message === 'TREATMENT_NOT_FOUND') return res.status(400).json({ error: 'Item de tratamento não pertence ao paciente.' })
    if (error?.message === 'EVOLUTION_NOT_FOUND') return res.status(400).json({ error: 'Evolução clínica não pertence ao paciente.' })
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar arquivo clínico.' })
  }
}

export async function access(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = context(req)
    const id = String(req.params.id)
    const row = await prisma.clinicalFile.findFirst({ where: { id, clinicId, tenantId, deletedAt: null } })
    if (!row) return res.status(404).json({ error: 'Arquivo clínico não encontrado.' })
    if (row.externalUrl) return res.json({ configured: true, provider: 'EXTERNAL_REFERENCE', url: row.externalUrl, expiresAt: null })
    if (row.storageStatus !== 'AVAILABLE') return res.status(409).json({ error: 'Arquivo ainda não está disponível.', storageStatus: row.storageStatus })

    const download = await createDownloadAccess({
      clinicId, tenantId, storageKey: row.storageKey, fileName: row.originalName
    })
    if (!download.configured) return res.status(503).json({
      error: 'Storage clínico ainda não possui credenciais/provedor configurados.',
      code: 'CLINICAL_STORAGE_NOT_CONFIGURED'
    })
    return res.json(download)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao gerar acesso ao arquivo clínico.' })
  }
}

export async function designHandoff(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = context(req)
    const id = String(req.params.id)
    const row = await prisma.clinicalFile.findFirst({ where: { id, clinicId, tenantId, deletedAt: null } })
    if (!row) return res.status(404).json({ error: 'Arquivo clínico não encontrado.' })

    const ext = row.extension.toLowerCase()
    if (!['stl', 'ply', 'obj'].includes(ext)) {
      return res.status(400).json({ error: 'A integração com DentalPos Design está disponível para STL, PLY e OBJ.' })
    }

    const fileAccess = row.externalUrl
      ? { configured: true, provider: 'EXTERNAL_REFERENCE', url: row.externalUrl, expiresAt: null }
      : await createDownloadAccess({ clinicId, tenantId, storageKey: row.storageKey, fileName: row.originalName })

    if (!fileAccess.configured) return res.status(503).json({
      error: 'Configure o storage clínico para abrir este arquivo no DentalPos Design.',
      code: 'CLINICAL_STORAGE_NOT_CONFIGURED'
    })

    return res.json({
      designPath: `/design?clinicalFileId=${encodeURIComponent(row.id)}`,
      source: {
        clinicalFileId: row.id,
        patientId: row.patientId,
        fileName: row.originalName,
        extension: row.extension,
        url: fileAccess.url,
        tooth: row.tooth,
        region: row.region
      }
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao preparar integração com DentalPos Design.' })
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = context(req)
    const id = String(req.params.id)
    const existing = await prisma.clinicalFile.findFirst({ where: { id, clinicId, tenantId, deletedAt: null } })
    if (!existing) return res.status(404).json({ error: 'Arquivo clínico não encontrado.' })
    const reason = String(req.body?.reason || '').trim()
    if (reason.length < 3) return res.status(400).json({ error: 'Motivo do arquivamento é obrigatório.' })

    await prisma.clinicalFile.update({ where: { id }, data: { deletedAt: new Date(), storageStatus: 'ARCHIVED' } })
    await writeAudit({
      clinicId, tenantId, actorId: actorUserId, module: 'clinical',
      action: 'CLINICAL_FILE_ARCHIVE', entityType: 'ClinicalFile', entityId: id,
      metadata: { patientId: existing.patientId, storageKey: existing.storageKey, reason }
    })
    return res.status(204).send()
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao arquivar arquivo clínico.' })
  }
}
