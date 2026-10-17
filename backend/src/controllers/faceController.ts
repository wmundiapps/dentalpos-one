import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

// Reconhecimento facial na recepção. O navegador calcula o "código do rosto" (128 números) e o servidor só compara:
// nenhuma foto é enviada ou guardada. Só entra quem deu consentimento e pode ser removido a qualquer momento.
const MATCH_MAX = 0.45 // distância máxima para reconhecer sozinho
const MATCH_GAP = 0.07 // o 2º mais parecido precisa estar pelo menos isto mais longe
const CANDIDATE_MAX = 0.6

const ctx = (req: AuthRequest) => ({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId })
const validVector = (v: unknown): v is number[] => Array.isArray(v) && v.length === 128 && v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10)
const dist = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < 128; i++) { const d = a[i] - b[i]; s += d * d } return Math.sqrt(s) }
const brtDayRange = (now = new Date()) => {
  const day = new Date(now.getTime() - 3 * 3600000).toISOString().slice(0, 10)
  return { from: new Date(`${day}T00:00:00-03:00`), to: new Date(`${day}T23:59:59.999-03:00`) }
}

export async function status(req: AuthRequest, res: Response) {
  const row = await prisma.patientFace.findUnique({ where: { clinicId_patientId: { ...{ clinicId: ctx(req).clinicId }, patientId: String(req.params.patientId) } }, select: { consentAt: true } })
  return res.json({ enrolled: Boolean(row), consentAt: row?.consentAt || null })
}

export async function enroll(req: AuthRequest, res: Response) {
  const { clinicId, tenantId } = ctx(req)
  const patientId = String(req.body?.patientId || '')
  const samples = req.body?.samples
  if (req.body?.consent !== true) return res.status(400).json({ error: 'É preciso registrar o consentimento do paciente.' })
  if (!Array.isArray(samples) || samples.length < 1 || samples.length > 5 || !samples.every(validVector)) return res.status(400).json({ error: 'Captura do rosto inválida. Tente de novo.' })
  const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId, tenantId }, select: { id: true } })
  if (!patient) return res.status(404).json({ error: 'Paciente não encontrado.' })
  const now = new Date()
  await prisma.patientFace.upsert({
    where: { clinicId_patientId: { clinicId, patientId } },
    update: { samples: samples as never, consentAt: now, consentById: req.user!.id },
    create: { clinicId, tenantId, patientId, samples: samples as never, consentAt: now, consentById: req.user!.id },
  })
  await writeAudit({ clinicId, tenantId, actorId: req.user!.id, module: 'patients', action: 'FACE_ENROLL', entityType: 'Patient', entityId: patientId, summary: 'Rosto cadastrado para reconhecimento na recepção (com consentimento).', ipAddress: req.ip, userAgent: req.get('user-agent') }).catch(() => undefined)
  return res.json({ ok: true })
}

export async function remove(req: AuthRequest, res: Response) {
  const { clinicId, tenantId } = ctx(req)
  const patientId = String(req.params.patientId)
  await prisma.patientFace.deleteMany({ where: { clinicId, patientId } })
  await writeAudit({ clinicId, tenantId, actorId: req.user!.id, module: 'patients', action: 'FACE_REMOVE', entityType: 'Patient', entityId: patientId, summary: 'Rosto removido do reconhecimento na recepção.', ipAddress: req.ip, userAgent: req.get('user-agent') }).catch(() => undefined)
  return res.json({ ok: true })
}

export async function identify(req: AuthRequest, res: Response) {
  const { clinicId, tenantId } = ctx(req)
  const vector = req.body?.descriptor
  if (!validVector(vector)) return res.status(400).json({ error: 'Captura do rosto inválida.' })
  const faces = await prisma.patientFace.findMany({ where: { clinicId }, select: { patientId: true, samples: true }, take: 20000 })
  const scored = faces.map((f) => ({ patientId: f.patientId, distance: Math.min(...(f.samples as number[][]).filter(validVector).map((s) => dist(vector, s))) })).filter((s) => Number.isFinite(s.distance)).sort((a, b) => a.distance - b.distance)
  const best = scored[0]
  if (!best || best.distance > CANDIDATE_MAX) return res.json({ status: 'NONE' })
  const confident = best.distance <= MATCH_MAX && (!scored[1] || scored[1].distance - best.distance >= MATCH_GAP)
  const ids = (confident ? [best] : scored.filter((s) => s.distance <= CANDIDATE_MAX).slice(0, 3)).map((s) => s.patientId)
  const { from, to } = brtDayRange()
  const [patients, appts] = await Promise.all([
    prisma.patient.findMany({ where: { id: { in: ids }, clinicId, tenantId }, select: { id: true, fullName: true } }),
    prisma.appointment.findMany({ where: { patientId: { in: ids }, clinicId, tenantId, scheduledAt: { gte: from, lte: to }, status: { notIn: ['CANCELLED'] } }, orderBy: { scheduledAt: 'asc' }, select: { id: true, patientId: true, scheduledAt: true, procedure: true, status: true } }),
  ])
  const name = new Map(patients.map((p) => [p.id, p.fullName]))
  const out = ids.filter((id) => name.has(id)).map((id) => ({ patientId: id, fullName: name.get(id) as string, appointments: appts.filter((a) => a.patientId === id) }))
  if (confident && out[0]) {
    await writeAudit({ clinicId, tenantId, actorId: req.user!.id, module: 'patients', action: 'FACE_MATCH', entityType: 'Patient', entityId: out[0].patientId, summary: 'Paciente reconhecido pelo rosto na recepção.', ipAddress: req.ip, userAgent: req.get('user-agent') }).catch(() => undefined)
  }
  return res.json({ status: confident && out[0] ? 'MATCH' : out.length ? 'CANDIDATES' : 'NONE', matches: out })
}
