import type { Request } from 'express'
import type { AuthRequest } from '../middleware/auth'
import { writeAudit } from './auditService'

/**
 * Auditoria de LEITURA de dados pessoais/sensíveis (LGPD art. 37): quem abriu qual paciente/prontuário/arquivo.
 * Aberturas repetidas do mesmo item pelo mesmo usuário em 10 min viram um único registro (evita inundar o log).
 */
const recent = new Map<string, number>()
const WINDOW_MS = 10 * 60 * 1000

export function auditRead(req: Request, action: string, entityType: string, entityId: string, summary: string, patientId?: string) {
  const u = (req as AuthRequest).user
  if (!u) return
  const key = `${u.id}|${action}|${entityId}`
  const now = Date.now()
  if ((recent.get(key) ?? 0) > now - WINDOW_MS) return
  recent.set(key, now)
  if (recent.size > 5000) for (const [k, t] of recent) if (t < now - WINDOW_MS) recent.delete(k)
  void writeAudit({
    clinicId: u.clinicId, tenantId: u.tenantId, actorId: u.id, module: 'lgpd-acesso', action, entityType, entityId, summary,
    metadata: patientId ? { patientId } : undefined, ipAddress: req.ip, userAgent: req.get('user-agent') || undefined,
  }).catch((e: unknown) => console.warn('auditoria de leitura falhou', e))
}
