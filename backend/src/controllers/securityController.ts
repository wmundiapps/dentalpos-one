import { createHmac } from 'crypto'
import { Response, Request } from 'express'
import jwt from 'jsonwebtoken'
import { AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { comparePassword } from '../services/userService'
import { writeAudit } from '../services/auditService'
import { otpauthUri } from '../services/totpService'
import { beginSetup, checkSecondFactor, disableTotp, enableTotp, getSecurity } from '../services/userSecurityService'

// Express 4 não captura rejeições de handlers async: converte em resposta 500 limpa.
const safe = <T extends (req: any, res: Response) => Promise<unknown>>(fn: T) => (req: any, res: Response) =>
  fn(req, res).catch((e) => {
    console.error('[security]', e)
    if (!res.headersSent) res.status(500).json({ error: 'Erro interno do servidor.' })
  })

async function audit(req: AuthRequest, action: string, summary: string) {
  try {
    await writeAudit({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id, module: 'security', action, entityType: 'User', entityId: req.user!.id, summary, ipAddress: req.ip, userAgent: req.get('user-agent') || undefined })
  } catch (e) {
    console.warn('auditoria falhou', e)
  }
}

export const twoFactorStatus = safe(async (req: AuthRequest, res: Response) => {
  const s = await getSecurity(req.user!.id)
  return res.json({ enabled: s.totpEnabled, backupCodesLeft: s.backupCodes.length, pendingSetup: !s.totpEnabled && !!s.totpSecret })
})

export const twoFactorSetup = safe(async (req: AuthRequest, res: Response) => {
  try {
    const secret = await beginSetup(req.user!.id)
    return res.json({ secret, otpauthUri: otpauthUri(secret, req.user!.email) })
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message })
  }
})

export const twoFactorEnable = safe(async (req: AuthRequest, res: Response) => {
  const codes = await enableTotp(req.user!.id, String(req.body?.code || ''))
  if (!codes) return res.status(400).json({ error: 'Código inválido. Confira o horário do celular e tente de novo.' })
  await audit(req, '2FA_ENABLED', 'Verificação em 2 etapas ativada.')
  return res.json({ enabled: true, backupCodes: codes })
})

/** Desativar exige senha + código atual (impede que uma sessão roubada remova a proteção). */
export const twoFactorDisable = safe(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
  if (!user || !(await comparePassword(String(req.body?.password || ''), user.password))) return res.status(401).json({ error: 'Senha incorreta.' })
  if (!(await checkSecondFactor(user.id, String(req.body?.code || '')))) return res.status(401).json({ error: 'Código inválido.' })
  await disableTotp(user.id)
  await audit(req, '2FA_DISABLED', 'Verificação em 2 etapas desativada.')
  return res.json({ enabled: false })
})

// ── DentalPod Design: token curto de host (impede abrir o app fora do Dentalpos One) ──
const dpdKey = () => {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET não configurado')
  return createHmac('sha256', s).update('dentalpoddesign-host-token').digest('hex')
}

export const dpdToken = safe(async (req: AuthRequest, res: Response) => {
  const token = jwt.sign({ uid: req.user!.id, cid: req.user!.clinicId, aud: 'dpd' }, dpdKey(), { expiresIn: '20m', algorithm: 'HS256' })
  return res.json({ token, expiresIn: 1200 })
})

export async function dpdVerify(req: Request, res: Response) {
  try {
    const d = jwt.verify(String(req.body?.token || ''), dpdKey(), { algorithms: ['HS256'], audience: 'dpd' }) as { uid?: string }
    return res.json({ ok: !!d.uid })
  } catch {
    return res.status(401).json({ ok: false })
  }
}
