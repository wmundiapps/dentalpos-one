import { randomUUID } from 'crypto'
import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

const FDI_ADULT = [
  18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28,
  48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38
]
const FDI_CHILD = [
  55,54,53,52,51,61,62,63,64,65,
  85,84,83,82,81,71,72,73,74,75
]
const SITES = ['MB','B','DB','ML','L','DL']
const SURFACES = ['M','D','O','V','L']

const DEFAULT_FINDINGS = [
  ['HEALTHY','Hígido','CURRENT','#2e7d32'],
  ['CARIES','Cárie','DISEASE','#d32f2f'],
  ['RESTORATION','Restauração','RESTORATIVE','#1976d2'],
  ['TEMPORARY','Provisório','RESTORATIVE','#ed6c02'],
  ['CROWN','Coroa','PROSTHETIC','#7b1fa2'],
  ['IMPLANT','Implante','IMPLANT','#455a64'],
  ['PONTIC','Pôntico','PROSTHETIC','#6d4c41'],
  ['ENDODONTICS','Endodontia','ENDODONTIC','#00838f'],
  ['EXTRACTION_INDICATED','Extração indicada','SURGICAL','#c62828'],
  ['EXTRACTION_DONE','Extração realizada','SURGICAL','#546e7a'],
  ['PROSTHESIS','Prótese','PROSTHETIC','#5e35b1'],
  ['LESION','Lesão','PATHOLOGY','#ad1457'],
  ['MISSING','Ausente','CURRENT','#616161'],
] as const

function context(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return {
    clinicId: req.user.clinicId,
    tenantId: req.user.tenantId,
    actorUserId: req.user.id
  }
}

async function ensurePatient(patientId: string, clinicId: string, tenantId: string) {
  return prisma.patient.findFirst({ where: { id: patientId, clinicId, tenantId } })
}

function validTooth(tooth: number, dentition: string) {
  return (dentition === 'CHILD' ? FDI_CHILD : FDI_ADULT).includes(tooth)
}

function normalizeState(value: unknown) {
  const state = String(value || 'CURRENT').toUpperCase()
  if (!['CURRENT','PLANNED','COMPLETED'].includes(state)) throw new Error('Estado clínico inválido.')
  return state
}

export async function chart(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = context(req)
    const patientId = String(req.params.patientId)
    if (!await ensurePatient(patientId, clinicId, tenantId)) {
      return res.status(404).json({ error: 'Paciente não encontrado.' })
    }
    const entries = await prisma.$queryRaw<any[]>`
      SELECT * FROM "DentalChartEntry"
      WHERE "clinicId"=${clinicId} AND "tenantId"=${tenantId} AND "patientId"=${patientId}
      ORDER BY "tooth" ASC, "createdAt" ASC
    `
    return res.json({ entries, adultTeeth: FDI_ADULT, childTeeth: FDI_CHILD, surfaces: SURFACES })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar odontograma.' })
  }
}

export async function saveEntry(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = context(req)
    const patientId = String(req.params.patientId)
    if (!await ensurePatient(patientId, clinicId, tenantId)) {
      return res.status(404).json({ error: 'Paciente não encontrado.' })
    }

    const id = String(req.body.id || randomUUID())
    const dentition = String(req.body.dentition || 'ADULT').toUpperCase()
    const tooth = Number(req.body.tooth)
    const surface = req.body.surface ? String(req.body.surface).toUpperCase() : null
    const findingCode = String(req.body.findingCode || '').trim().toUpperCase()
    const findingLabel = String(req.body.findingLabel || '').trim()
    const clinicalState = normalizeState(req.body.clinicalState)
    const notes = req.body.notes ? String(req.body.notes) : null

    if (!validTooth(tooth, dentition)) return res.status(400).json({ error: 'Dente FDI inválido para a dentição selecionada.' })
    if (surface && !SURFACES.includes(surface)) return res.status(400).json({ error: 'Face dentária inválida.' })
    if (!findingCode || !findingLabel) return res.status(400).json({ error: 'Achado clínico obrigatório.' })

    const completedAt = clinicalState === 'COMPLETED' ? new Date() : null
    await prisma.$executeRaw`
      INSERT INTO "DentalChartEntry"
        ("id","clinicId","tenantId","patientId","dentition","tooth","surface","findingCode","findingLabel","clinicalState","status","notes","completedAt","createdBy","createdAt","updatedAt")
      VALUES
        (${id},${clinicId},${tenantId},${patientId},${dentition},${tooth},${surface},${findingCode},${findingLabel},${clinicalState},'ACTIVE',${notes},${completedAt},${actorUserId},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO UPDATE SET
        "dentition"=EXCLUDED."dentition",
        "tooth"=EXCLUDED."tooth",
        "surface"=EXCLUDED."surface",
        "findingCode"=EXCLUDED."findingCode",
        "findingLabel"=EXCLUDED."findingLabel",
        "clinicalState"=EXCLUDED."clinicalState",
        "notes"=EXCLUDED."notes",
        "completedAt"=EXCLUDED."completedAt",
        "updatedAt"=CURRENT_TIMESTAMP
      WHERE "DentalChartEntry"."clinicId"=${clinicId}
        AND "DentalChartEntry"."tenantId"=${tenantId}
        AND "DentalChartEntry"."patientId"=${patientId}
    `

    if (clinicalState === 'PLANNED' || clinicalState === 'COMPLETED') {
      const legacyMark = await prisma.odontogramMark.create({
        data: {
          clinicId, tenantId, patientId, tooth,
          surface,
          finding: findingLabel,
          state: clinicalState === 'COMPLETED' ? 'DONE' : 'PENDING',
          completedAt
        }
      })
      await prisma.treatmentItem.upsert({
        where: { odontogramMarkId: legacyMark.id },
        update: {},
        create: {
          clinicId, tenantId, patientId, tooth,
          surfaces: surface ? [surface] : [],
          procedure: findingLabel,
          status: clinicalState === 'COMPLETED' ? 'COMPLETED' : 'PLANNED',
          origin: 'ODONTOGRAM',
          odontogramMarkId: legacyMark.id,
          completedAt
        }
      })
    }

    if (clinicalState === 'COMPLETED' && req.body.evolutionNotes) {
      const professionalName = String(req.body.professionalName || 'Profissional responsável')
      await prisma.clinicalEvolution.create({
        data: {
          clinicId, tenantId, patientId,
          professionalId: req.body.professionalId ? String(req.body.professionalId) : null,
          professionalName,
          procedure: findingLabel,
          notes: String(req.body.evolutionNotes),
          nextProcedure: String(req.body.nextProcedure || 'Reavaliar conforme plano de tratamento'),
          nextAppointmentCreated: false
        }
      })
    }

    await writeAudit({
      clinicId, tenantId, actorId: actorUserId, module: 'clinical',
      action: 'DENTAL_CHART_ENTRY_UPSERT', entityType: 'DentalChartEntry', entityId: id,
      metadata: { patientId, dentition, tooth, surface, findingCode, clinicalState }
    })
    return res.status(200).json({ id })
  } catch (error: any) {
    console.error(error)
    return res.status(400).json({ error: error?.message || 'Erro ao salvar odontograma.' })
  }
}

export async function removeEntry(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = context(req)
    const patientId = String(req.params.patientId)
    const id = String(req.params.id)
    const count = await prisma.$executeRaw`
      UPDATE "DentalChartEntry"
      SET "status"='REMOVED',"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id} AND "patientId"=${patientId}
        AND "clinicId"=${clinicId} AND "tenantId"=${tenantId}
    `
    if (!count) return res.status(404).json({ error: 'Marcação não encontrada.' })
    await writeAudit({
      clinicId, tenantId, actorId: actorUserId, module: 'clinical',
      action: 'DENTAL_CHART_ENTRY_REMOVE', entityType: 'DentalChartEntry', entityId: id,
      metadata: { patientId }
    })
    return res.status(204).send()
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao remover marcação.' })
  }
}

export async function findings(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = context(req)
    const custom = await prisma.$queryRaw<any[]>`
      SELECT "id","code","label","category","color","isActive"
      FROM "DentalFindingDefinition"
      WHERE "clinicId"=${clinicId} AND "tenantId"=${tenantId} AND "isActive"=TRUE
      ORDER BY "label"
    `
    const defaults = DEFAULT_FINDINGS.map(([code,label,category,color]) => ({ id: code, code, label, category, color, isActive: true, system: true }))
    return res.json([...defaults, ...custom])
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar achados configuráveis.' })
  }
}

export async function createFinding(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = context(req)
    const id = randomUUID()
    const code = String(req.body.code || '').trim().toUpperCase().replace(/\s+/g, '_')
    const label = String(req.body.label || '').trim()
    const category = String(req.body.category || 'OTHER').trim().toUpperCase()
    const color = req.body.color ? String(req.body.color) : null
    if (!code || !label) return res.status(400).json({ error: 'Código e descrição são obrigatórios.' })
    await prisma.$executeRaw`
      INSERT INTO "DentalFindingDefinition"
      ("id","clinicId","tenantId","code","label","category","color","isActive","createdBy","createdAt","updatedAt")
      VALUES (${id},${clinicId},${tenantId},${code},${label},${category},${color},TRUE,${actorUserId},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `
    await writeAudit({
      clinicId, tenantId, actorId: actorUserId, module: 'clinical',
      action: 'DENTAL_FINDING_CREATE', entityType: 'DentalFindingDefinition', entityId: id,
      metadata: { code, label, category }
    })
    return res.status(201).json({ id, code, label, category, color })
  } catch (error) {
    console.error(error)
    return res.status(409).json({ error: 'Não foi possível criar o achado. Verifique se o código já existe.' })
  }
}

export async function periodontalHistory(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = context(req)
    const patientId = String(req.params.patientId)
    if (!await ensurePatient(patientId, clinicId, tenantId)) {
      return res.status(404).json({ error: 'Paciente não encontrado.' })
    }
    const exams = await prisma.$queryRaw<any[]>`
      SELECT * FROM "PeriodontalExam"
      WHERE "clinicId"=${clinicId} AND "tenantId"=${tenantId} AND "patientId"=${patientId}
      ORDER BY "examinedAt" DESC
    `
    for (const exam of exams) {
      exam.sites = await prisma.$queryRaw<any[]>`
        SELECT * FROM "PeriodontalSiteRecord"
        WHERE "examId"=${exam.id} AND "clinicId"=${clinicId} AND "tenantId"=${tenantId}
        ORDER BY "tooth","site"
      `
    }
    return res.json({ exams, sites: SITES, adultTeeth: FDI_ADULT, childTeeth: FDI_CHILD })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar histórico periodontal.' })
  }
}

export async function createPeriodontalExam(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = context(req)
    const patientId = String(req.params.patientId)
    if (!await ensurePatient(patientId, clinicId, tenantId)) {
      return res.status(404).json({ error: 'Paciente não encontrado.' })
    }
    const dentition = String(req.body.dentition || 'ADULT').toUpperCase()
    const records = Array.isArray(req.body.records) ? req.body.records : []
    if (!records.length) return res.status(400).json({ error: 'Informe ao menos um sítio periodontal.' })

    const examId = randomUUID()
    const examinedAt = req.body.examinedAt ? new Date(req.body.examinedAt) : new Date()
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`
        INSERT INTO "PeriodontalExam"
        ("id","clinicId","tenantId","patientId","dentition","examinedAt","professionalId","professionalName","notes","createdBy","createdAt")
        VALUES (${examId},${clinicId},${tenantId},${patientId},${dentition},${examinedAt},
          ${req.body.professionalId ? String(req.body.professionalId) : null},
          ${req.body.professionalName ? String(req.body.professionalName) : null},
          ${req.body.notes ? String(req.body.notes) : null},
          ${actorUserId},CURRENT_TIMESTAMP)
      `
      for (const record of records) {
        const tooth = Number(record.tooth)
        const site = String(record.site || '').toUpperCase()
        if (!validTooth(tooth, dentition) || !SITES.includes(site)) throw new Error(`Sítio periodontal inválido: ${tooth}/${site}`)
        const probingDepth = Math.max(0, Number(record.probingDepth || 0))
        const recession = Number(record.recession || 0)
        const clinicalAttachmentLevel = record.clinicalAttachmentLevel === undefined
          ? probingDepth + recession
          : Number(record.clinicalAttachmentLevel)
        const mobility = record.mobility === '' || record.mobility == null ? null : Number(record.mobility)
        const furcation = record.furcation === '' || record.furcation == null ? null : Number(record.furcation)
        await tx.$executeRaw`
          INSERT INTO "PeriodontalSiteRecord"
          ("id","examId","clinicId","tenantId","patientId","tooth","site","probingDepth","recession","clinicalAttachmentLevel","bleeding","plaque","suppuration","mobility","furcation","notes","createdAt")
          VALUES (${randomUUID()},${examId},${clinicId},${tenantId},${patientId},${tooth},${site},
            ${probingDepth},${recession},${clinicalAttachmentLevel},
            ${Boolean(record.bleeding)},${Boolean(record.plaque)},${Boolean(record.suppuration)},
            ${mobility},${furcation},${record.notes ? String(record.notes) : null},CURRENT_TIMESTAMP)
        `
      }
    })
    await writeAudit({
      clinicId, tenantId, actorId: actorUserId, module: 'clinical',
      action: 'PERIODONTAL_EXAM_CREATE', entityType: 'PeriodontalExam', entityId: examId,
      metadata: { patientId, dentition, records: records.length, examinedAt: examinedAt.toISOString() }
    })
    return res.status(201).json({ id: examId })
  } catch (error: any) {
    console.error(error)
    return res.status(400).json({ error: error?.message || 'Erro ao salvar periodontograma.' })
  }
}

export async function comparePeriodontal(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = context(req)
    const patientId = String(req.params.patientId)
    const examA = String(req.query.examA || '')
    const examB = String(req.query.examB || '')
    if (!examA || !examB) return res.status(400).json({ error: 'Informe examA e examB.' })
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        a."tooth", a."site",
        a."probingDepth" AS "probingDepthA", b."probingDepth" AS "probingDepthB",
        a."clinicalAttachmentLevel" AS "calA", b."clinicalAttachmentLevel" AS "calB",
        a."bleeding" AS "bleedingA", b."bleeding" AS "bleedingB",
        a."plaque" AS "plaqueA", b."plaque" AS "plaqueB",
        (b."probingDepth" - a."probingDepth") AS "probingDepthDelta",
        (b."clinicalAttachmentLevel" - a."clinicalAttachmentLevel") AS "calDelta"
      FROM "PeriodontalSiteRecord" a
      JOIN "PeriodontalSiteRecord" b ON b."tooth"=a."tooth" AND b."site"=a."site"
      WHERE a."examId"=${examA} AND b."examId"=${examB}
        AND a."patientId"=${patientId} AND b."patientId"=${patientId}
        AND a."clinicId"=${clinicId} AND b."clinicId"=${clinicId}
        AND a."tenantId"=${tenantId} AND b."tenantId"=${tenantId}
      ORDER BY a."tooth", a."site"
    `
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao comparar periodontogramas.' })
  }
}
