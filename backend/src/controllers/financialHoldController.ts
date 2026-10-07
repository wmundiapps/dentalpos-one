import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { getHold, holdMessage, loadHoldSettings, saveHoldSettings } from '../services/financialHoldService'

export async function patientHold(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const info = await getHold(req.user.clinicId, req.user.tenantId, String(req.params.id))
    return res.json({ ...info, message: info.hasPending ? holdMessage(info) : '' })
  } catch (error) {
    console.error('Erro ao consultar pendência do paciente:', error)
    return res.status(500).json({ error: 'Erro ao consultar a pendência financeira.' })
  }
}

export async function settings(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    return res.json(await loadHoldSettings(req.user.clinicId))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar a configuração.' })
  }
}

export async function updateSettings(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const current = await loadHoldSettings(req.user.clinicId)
    const next = { ...current }
    if (typeof req.body?.enabled === 'boolean') next.enabled = req.body.enabled
    if (req.body?.graceDays !== undefined) next.graceDays = Math.min(60, Math.max(0, Math.round(Number(req.body.graceDays) || 0)))
    await saveHoldSettings(req.user.clinicId, req.user.tenantId, next)
    await writeAudit({ clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id, module: 'agenda', action: 'FINANCIAL_HOLD_SETTINGS', summary: `Bloqueio de agenda por pendência financeira: ${next.enabled ? 'ligado' : 'desligado'} (carência ${next.graceDays} dia(s)).` }).catch((e: unknown) => console.error(e))
    return res.json(next)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao salvar a configuração.' })
  }
}
