import crypto from 'crypto'
import { randomUUID } from 'crypto'
import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { cleanDataUrl } from '../lib/uploadSafety'

const clientIp = (req: AuthRequest) => String((req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] || req.ip || '').trim()

const hashOf = (e: { id: string; patientId: string; procedure: string; notes: string; teeth: string[]; createdAt: Date }) =>
  crypto.createHash('sha256').update([e.id, e.patientId, e.procedure, e.notes, e.teeth.join(','), e.createdAt.toISOString()].join('|')).digest('hex')

// Registra a assinatura (desenhada na tela) do paciente ou do dentista no procedimento realizado.
export async function sign(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, id: actorId } = req.user!
    const evolutionId = String(req.params.id)
    const role = String(req.body?.role || '').toUpperCase()
    if (role !== 'PATIENT' && role !== 'DENTIST') return res.status(400).json({ error: 'Informe quem está assinando (paciente ou dentista).' })
    const signerName = String(req.body?.signerName || '').trim().slice(0, 120)
    if (signerName.length < 3) return res.status(400).json({ error: 'Informe o nome de quem assina.' })
    const raw = String(req.body?.signature || '')
    if (!raw.startsWith('data:image/') || raw.length > 400_000) return res.status(400).json({ error: 'Assinatura inválida.' })
    let signature: string
    try { signature = (await cleanDataUrl({ name: 'assinatura.png', dataUrl: raw })).dataUrl } catch { return res.status(400).json({ error: 'Assinatura inválida.' }) }
    const evo = await prisma.clinicalEvolution.findFirst({ where: { id: evolutionId, clinicId, tenantId }, select: { id: true, patientId: true, procedure: true, notes: true, teeth: true, createdAt: true } })
    if (!evo) return res.status(404).json({ error: 'Procedimento não encontrado.' })
    const now = new Date()
    const existing = await prisma.clinicalEvolutionSignature.findUnique({ where: { evolutionId } })
    if (existing && ((role === 'PATIENT' && existing.patientSignature) || (role === 'DENTIST' && existing.dentistSignature))) return res.status(409).json({ error: 'Este procedimento já foi assinado por esta pessoa. A assinatura não pode ser trocada.' })
    const data = role === 'PATIENT'
      ? { patientSignature: signature, patientSignerName: signerName, patientSignedAt: now, patientIp: clientIp(req), patientUserAgent: String(req.headers['user-agent'] || '').slice(0, 200) }
      : { dentistSignature: signature, dentistSignerName: signerName, dentistSignedAt: now, dentistIp: clientIp(req) }
    const row = existing
      ? await prisma.clinicalEvolutionSignature.update({ where: { evolutionId }, data })
      : await prisma.clinicalEvolutionSignature.create({ data: { id: randomUUID(), clinicId, tenantId, patientId: evo.patientId, evolutionId, contentHash: hashOf(evo), ...data } })
    await writeAudit({ clinicId, tenantId, actorId, module: 'clinical', action: role === 'PATIENT' ? 'PROCEDURE_PATIENT_SIGNED' : 'PROCEDURE_DENTIST_SIGNED', entityType: 'ClinicalEvolution', entityId: evolutionId, summary: `${role === 'PATIENT' ? 'Paciente' : 'Dentista'} ${signerName} assinou o procedimento "${evo.procedure}".` }).catch(() => undefined)
    return res.json({ ok: true, patientSignedAt: row.patientSignedAt, dentistSignedAt: row.dentistSignedAt })
  } catch (error) {
    console.error('Erro ao registrar assinatura:', error)
    return res.status(500).json({ error: 'Não foi possível registrar a assinatura.' })
  }
}

// Assinaturas do paciente (com imagens, para o relatório) — o hash confirma que o texto do procedimento não mudou.
export async function list(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = req.user!
    const patientId = String(req.params.patientId)
    const rows = await prisma.clinicalEvolutionSignature.findMany({ where: { clinicId, tenantId, patientId } })
    const evos = await prisma.clinicalEvolution.findMany({ where: { clinicId, tenantId, patientId, id: { in: rows.map((r) => r.evolutionId) } }, select: { id: true, patientId: true, procedure: true, notes: true, teeth: true, createdAt: true } })
    const byId = new Map(evos.map((e) => [e.id, e]))
    return res.json(rows.map((r) => ({ ...r, patientUserAgent: undefined, intact: byId.has(r.evolutionId) ? hashOf(byId.get(r.evolutionId)!) === r.contentHash : false })))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar as assinaturas.' })
  }
}
