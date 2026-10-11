import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { comparePassword } from '../services/userService'
import { writeAudit } from '../services/auditService'
import { disableTwoFactor, finishSetup, regenerateBackupCodes, startSetup, twoFactorEnabled, verifySecondFactor } from '../services/twoFactorService'

const audit = (req: AuthRequest, action: string, summary: string) =>
  writeAudit({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id, module: 'auth', action, entityType: 'User', entityId: req.user!.id, summary, ipAddress: req.ip, userAgent: req.get('user-agent') || undefined }).catch(() => undefined)

export async function status(req: AuthRequest, res: Response) {
  return res.json({ enabled: await twoFactorEnabled(req.user!.id) })
}

export async function setup(req: AuthRequest, res: Response) {
  if (await twoFactorEnabled(req.user!.id)) return res.status(409).json({ error: 'A verificação em 2 etapas já está ativa.' })
  try {
    return res.json(await startSetup(req.user!.id, req.user!.email))
  } catch (error) {
    console.error('Falha ao iniciar 2 etapas:', error)
    return res.status(500).json({ error: 'Não foi possível iniciar. Confirme com a equipe que o banco foi atualizado.' })
  }
}

export async function enable(req: AuthRequest, res: Response) {
  const code = String(req.body?.code || '').trim()
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'O código tem 6 números.' })
  if (await twoFactorEnabled(req.user!.id)) return res.status(409).json({ error: 'A verificação em 2 etapas já está ativa.' })
  const done = await finishSetup(req.user!.id, code)
  if (!done) return res.status(400).json({ error: 'Código não confere. Confira a hora do celular e digite o código que aparece agora (ou clique em Ativar de novo).' })
  await audit(req, 'TWO_FACTOR_ENABLED', 'Verificação em 2 etapas ativada.')
  return res.json(done)
}

export async function disable(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { password: true } })
  const code = String(req.body?.code || '')
  if (!user || !(await comparePassword(String(req.body?.password || ''), user.password)) || !(await verifySecondFactor(req.user!.id, code))) {
    return res.status(400).json({ error: 'Senha ou código não conferem.' })
  }
  await disableTwoFactor(req.user!.id)
  await audit(req, 'TWO_FACTOR_DISABLED', 'Verificação em 2 etapas desativada.')
  return res.json({ ok: true })
}

export async function backupCodes(req: AuthRequest, res: Response) {
  const code = String(req.body?.code || '').trim()
  if (!/^\d{6}$/.test(code) || (await verifySecondFactor(req.user!.id, code)) !== 'totp') return res.status(400).json({ error: 'Código não confere.' })
  const codes = await regenerateBackupCodes(req.user!.id)
  await audit(req, 'TWO_FACTOR_BACKUP_REGENERATED', 'Códigos reserva de 2 etapas gerados de novo.')
  return res.json({ backupCodes: codes })
}
