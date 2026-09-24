import type { Request, Response } from 'express'
import crypto from 'crypto'
import { AuthRequest } from '../middleware/auth'
import { ContextRequest } from '../middleware/requestContext'
import { prisma } from '../lib/prisma'
import { writeAudit } from '../services/auditService'
import { getRevahFlag, revahConfigured, revahSsoUrl, setRevahLicense, syncAllClinics, syncClinicWithRevah, verifyWebhookForClinic } from '../services/revahBridge'

// Estado do Marketing (REVAH) para a clínica logada.
export async function status(req: AuthRequest, res: Response) {
  const { row, meta } = await getRevahFlag(req.user!.clinicId)
  res.json({ configured: revahConfigured(), enabled: Boolean(row?.enabled), plan: meta.plan || null, provisioned: Boolean(meta.revahTenantId), lastSyncAt: meta.lastSyncAt || null, lastSyncResult: meta.lastSyncResult || null })
}

// URL de acesso único (SSO) para abrir o Marketing embutido.
export async function sso(req: AuthRequest, res: Response) {
  try {
    if (!revahConfigured()) return res.status(503).json({ error: 'Marketing indisponível: integração não configurada.' })
    const url = await revahSsoUrl(req.user!)
    if (!url) return res.status(403).json({ error: 'O Marketing não está ativo para esta clínica.', code: 'LICENSE_INACTIVE' })
    res.json({ url })
  } catch (e: any) {
    console.error('[revah-bridge] sso', e)
    res.status(502).json({ error: e?.message || 'Falha ao abrir o Marketing.' })
  }
}

// Licença por clínica (somente equipe WMundi).
export async function license(req: AuthRequest, res: Response) {
  try {
    const clinicId = String(req.body.clinicId || req.user!.clinicId)
    const plan = ['TRIAL', 'START', 'PRO', 'ENTERPRISE'].includes(req.body.plan) ? req.body.plan : undefined
    const row = await setRevahLicense(clinicId, Boolean(req.body.active), plan)
    await writeAudit({ clinicId, tenantId: row.tenantId, actorId: req.user!.id, module: 'revah', action: req.body.active ? 'REVAH_LICENSE_ON' : 'REVAH_LICENSE_OFF', entityType: 'TenantFeatureFlag', entityId: row.id })
    res.json({ enabled: row.enabled, metadata: { plan: (row.metadata as any)?.plan } })
  } catch (e: any) {
    console.error('[revah-bridge] license', e)
    res.status(502).json({ error: e?.message || 'Falha ao atualizar licença.' })
  }
}

export async function syncNow(req: AuthRequest, res: Response) {
  try {
    res.json(await syncClinicWithRevah(req.user!.clinicId))
  } catch (e: any) {
    res.status(502).json({ error: e?.message || 'Falha ao sincronizar.' })
  }
}

function cronAuthorized(req: Request) {
  const expected = process.env.CRON_SECRET || ''
  const header = req.header('authorization') || ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!expected || provided.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

export async function cronSync(req: Request, res: Response) {
  if (!cronAuthorized(req)) return res.status(401).json({ error: 'Não autorizado.' })
  if (!revahConfigured()) return res.json({ skipped: 'integração REVAH não configurada' })
  res.json(await syncAllClinics())
}

// Notificações do REVAH: opt-out, pedido de agendamento pelo chatbot, ligação concluída.
export async function webhook(req: Request, res: Response) {
  const clinicId = String(req.params.clinicId)
  const raw = (req as ContextRequest).rawBody
  const ok = await verifyWebhookForClinic(clinicId, raw, req.header('x-revah-timestamp'), req.header('x-revah-signature')).catch(() => false)
  if (!ok) return res.status(401).json({ error: 'Assinatura inválida.' })
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { tenantId: true } })
  if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })
  const body = req.body || {}
  const data = body.data || {}
  const patientId = typeof data.externalRef === 'string' && data.externalRef.startsWith('dentalpos:patient:') ? data.externalRef.slice('dentalpos:patient:'.length) : undefined
  const summaries: Record<string, string> = {
    'revah.opt_out': `Paciente pediu para não receber mensagens (${data.channel || 'canal'}).`,
    'revah.appointment_requested': `Pedido de agendamento pelo ${data.channel || 'chatbot'}: ${[data.preferredDate, data.preferredTime].filter(Boolean).join(' ') || 'data a combinar'}${data.notes ? ` — ${data.notes}` : ''}`,
    'revah.call_completed': `Ligação automática concluída: ${data.outcome || data.status || ''} ${data.summary || ''}`.trim(),
  }
  await writeAudit({
    clinicId,
    tenantId: clinic.tenantId,
    module: 'revah',
    action: String(body.type || 'revah.event').toUpperCase().replace(/\./g, '_'),
    entityType: patientId ? 'Patient' : undefined,
    entityId: patientId,
    summary: summaries[body.type] || 'Evento do Marketing',
    metadata: data,
  })
  res.json({ ok: true })
}
