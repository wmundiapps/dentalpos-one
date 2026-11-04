import type { Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { managerResetUrl, resetAllowedEmails, resetEnabled, signManagerResetToken } from '../services/managerResetService'
import { writeAudit } from '../services/auditService'

const tries = new Map<string, number[]>()

// Só o e-mail autorizado, logado, recebe o link. O e-mail vem do banco, nunca do corpo da requisição.
export async function link(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const user = await prisma.user.findFirst({ where: { id: req.user.id, isActive: true }, select: { email: true, clinicId: true, tenantId: true } })
    const email = String(user?.email || '').trim().toLowerCase()
    if (!email || !resetAllowedEmails().includes(email)) return res.status(403).json({ error: 'Acesso não autorizado.' })
    if (!resetEnabled()) return res.status(503).json({ error: 'A redefinição do Manager ainda não está ativada neste ambiente.' })

    const now = Date.now()
    const recent = (tries.get(email) || []).filter(t => now - t < 3_600_000)
    if (recent.length >= 5) return res.status(429).json({ error: 'Muitos links gerados. Tente de novo mais tarde.' })
    recent.push(now)
    tries.set(email, recent)

    const url = managerResetUrl(signManagerResetToken(email))
    await writeAudit({ clinicId: user!.clinicId, tenantId: user!.tenantId, actorId: req.user.id, module: 'security', action: 'MANAGER_RESET_LINK', summary: 'Link de redefinição de senha do Manager gerado.', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined }).catch(() => undefined)
    return res.json({ url, expiresInMinutes: 10 })
  } catch (error) {
    console.error('Link do Manager:', error instanceof Error ? error.message : 'erro')
    return res.status(500).json({ error: 'Não foi possível gerar o link agora.' })
  }
}
