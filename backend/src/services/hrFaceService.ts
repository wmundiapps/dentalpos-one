import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { writeAudit } from './auditService'

// Reconhecimento facial para o ponto. O navegador calcula o "código do rosto" (128 números); o servidor só compara.
// Nenhuma foto é enviada ou guardada. Só entra quem deu consentimento, e o cadastro pode ser removido a qualquer momento.
export const FACE_MATCH_MAX = 0.42 // mais rígido que na recepção: aqui o resultado vale como assinatura do ponto
export const FACE_MATCH_GAP = 0.08

export const validVector = (v: unknown): v is number[] => Array.isArray(v) && v.length === 128 && v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10)
const dist = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < 128; i++) { const d = a[i] - b[i]; s += d * d } return Math.sqrt(s) }

export async function faceStatus(clinicId: string, employeeId: string) {
  const row = await prisma.hREmployeeFace.findUnique({ where: { clinicId_employeeId: { clinicId, employeeId } }, select: { consentAt: true } })
  return { enrolled: Boolean(row), consentAt: row?.consentAt || null }
}

export async function enrollFace(c: { clinicId: string; tenantId: string; actorId: string }, employeeId: string, body: any) {
  if (body?.consent !== true) return { error: 'É preciso registrar o consentimento do colaborador.' }
  const samples = body?.samples
  if (!Array.isArray(samples) || samples.length < 1 || samples.length > 5 || !samples.every(validVector)) return { error: 'Captura do rosto inválida. Tente de novo.' }
  const emp = await prisma.hREmployee.findFirst({ where: { id: employeeId, clinicId: c.clinicId, tenantId: c.tenantId }, select: { id: true, name: true } })
  if (!emp) return { error: 'Colaborador não encontrado.', status: 404 }
  const now = new Date()
  await prisma.hREmployeeFace.upsert({
    where: { clinicId_employeeId: { clinicId: c.clinicId, employeeId } },
    update: { samples: samples as never, consentAt: now, consentById: c.actorId },
    create: { id: randomUUID(), clinicId: c.clinicId, tenantId: c.tenantId, employeeId, samples: samples as never, consentAt: now, consentById: c.actorId },
  })
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'hr', action: 'EMPLOYEE_FACE_ENROLL', entityType: 'HREmployee', entityId: employeeId, summary: `Rosto de ${emp.name} cadastrado para o ponto (com consentimento).` }).catch(() => undefined)
  return { ok: true }
}

export async function removeFace(c: { clinicId: string; tenantId: string; actorId: string }, employeeId: string) {
  await prisma.hREmployeeFace.deleteMany({ where: { clinicId: c.clinicId, employeeId } })
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'hr', action: 'EMPLOYEE_FACE_REMOVE', entityType: 'HREmployee', entityId: employeeId, summary: 'Rosto removido do ponto.' }).catch(() => undefined)
  return { ok: true }
}

// Colaborador reconhecido pelo rosto (só se houver um candidato claramente mais parecido que os demais).
export async function matchEmployee(clinicId: string, tenantId: string, descriptor: unknown) {
  if (!validVector(descriptor)) return { status: 'INVALID' as const }
  const faces = await prisma.hREmployeeFace.findMany({ where: { clinicId, tenantId }, select: { employeeId: true, samples: true }, take: 2000 })
  const scored = faces
    .map((f) => ({ employeeId: f.employeeId, distance: Math.min(...(f.samples as number[][]).filter(validVector).map((s) => dist(descriptor, s))) }))
    .filter((s) => Number.isFinite(s.distance)).sort((a, b) => a.distance - b.distance)
  const best = scored[0]
  if (!best || best.distance > FACE_MATCH_MAX) return { status: 'NONE' as const }
  if (scored[1] && scored[1].distance - best.distance < FACE_MATCH_GAP) return { status: 'AMBIGUOUS' as const }
  return { status: 'MATCH' as const, employeeId: best.employeeId, distance: best.distance }
}
