import type { Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import { dismissOperationalAlert, listOperationalResolutions } from '../services/operationalAlertResolutionService'

const areas = new Set(['Laboratório','Agenda','Financeiro','RH','Pacientes','Estoque'])
function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Não autenticado')
  return { clinicId:req.user.clinicId, tenantId:req.user.tenantId, actorId:req.user.id, ipAddress:req.ip, userAgent:req.get('user-agent') }
}

export async function index(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const ids = typeof req.query.sourceEntityIds === 'string' ? req.query.sourceEntityIds.split(',').map(v=>v.trim()).filter(Boolean) : undefined
    return res.json(await listOperationalResolutions(c, ids))
  } catch (error) {
    console.error('[operational-alerts:index]', error)
    return res.status(500).json({ error:'Erro ao consultar protocolos de resolução.' })
  }
}

export async function dismiss(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const area = String(req.body?.area || '')
    if (!areas.has(area)) return res.status(400).json({ error:'Área de alerta inválida.' })
    const reason = String(req.body?.reason || '').trim()
    if (!reason) return res.status(400).json({ error:'Informe o motivo para dispensar o aviso.' })
    const row = await dismissOperationalAlert(c, {
      alertKey: typeof req.body?.alertKey === 'string' ? req.body.alertKey : null,
      area: area as any,
      sourceEntityType: typeof req.body?.sourceEntityType === 'string' ? req.body.sourceEntityType : null,
      sourceEntityId: typeof req.body?.sourceEntityId === 'string' ? req.body.sourceEntityId : null,
      action: 'DISMISSAL',
      reason,
      note: typeof req.body?.note === 'string' ? req.body.note : null,
      metadata: req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : undefined,
    })
    return res.json(row)
  } catch (error:any) {
    return res.status(400).json({ error:error?.message || 'Erro ao dispensar aviso.' })
  }
}
