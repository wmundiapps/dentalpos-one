import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { PERIODS_DAYS, findCandidates, loadSettings, runForClinic, saveSettings, sentToday } from '../services/absenceRecallService'
import type { RevahChannel } from '../services/revahProviderService'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Não autenticado.')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

export async function show(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const settings = await loadSettings(clinicId)
    const candidates = await findCandidates(clinicId, tenantId, settings.periodDays)
    return res.json({ settings, periods: PERIODS_DAYS, candidatesCount: candidates.length, sample: candidates.slice(0, 10).map(c => ({ name: c.name, daysAway: c.daysAway, hasEmail: Boolean(c.email) })), today: await sentToday(clinicId) })
  } catch (error) {
    console.error('Erro ao carregar retorno de ausentes:', error)
    return res.status(500).json({ error: 'Erro ao carregar o retorno de pacientes ausentes.' })
  }
}

// Apenas o resumo de hoje (alerta da recepção na Agenda).
export async function today(req: AuthRequest, res: Response) {
  try {
    return res.json(await sentToday(ctx(req).clinicId))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar os envios de hoje.' })
  }
}

export async function updateSettings(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const current = await loadSettings(clinicId)
    const b = req.body || {}
    const next = { ...current }
    if (b.periodDays !== undefined) {
      const days = Number(b.periodDays)
      if (!(PERIODS_DAYS as readonly number[]).includes(days)) return res.status(400).json({ error: 'Período inválido.' })
      next.periodDays = days
    }
    if (typeof b.enabled === 'boolean') next.enabled = b.enabled
    if (Array.isArray(b.channels)) {
      const channels = (b.channels as unknown[]).filter((c): c is RevahChannel => c === 'EMAIL' || c === 'WHATSAPP')
      if (!channels.length) return res.status(400).json({ error: 'Escolha ao menos um canal.' })
      next.channels = [...new Set(channels)]
    }
    if (b.dailyLimit !== undefined) next.dailyLimit = Math.min(200, Math.max(1, Math.round(Number(b.dailyLimit) || 30)))
    await saveSettings(clinicId, tenantId, next)
    await writeAudit({ clinicId, tenantId, actorId, module: 'agenda', action: 'ABSENCE_RECALL_SETTINGS', summary: `Retorno de pacientes ausentes: ${next.enabled ? 'automático ligado' : 'automático desligado'}, período ${next.periodDays} dias.` }).catch((e: unknown) => console.error(e))
    return res.json(next)
  } catch (error) {
    console.error('Erro ao salvar retorno de ausentes:', error)
    return res.status(500).json({ error: 'Erro ao salvar a configuração.' })
  }
}

export async function run(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const dryRun = req.body?.dryRun === true
    const result = await runForClinic(clinicId, tenantId, { dryRun })
    if (!dryRun) await writeAudit({ clinicId, tenantId, actorId, module: 'agenda', action: 'ABSENCE_RECALL_RUN', summary: `Retorno de ausentes enviado manualmente: ${result.sent} paciente(s) contatado(s).` }).catch((e: unknown) => console.error(e))
    return res.json(result)
  } catch (error) {
    console.error('Erro ao enviar retorno de ausentes:', error)
    return res.status(500).json({ error: 'Erro ao enviar os contatos de retorno.' })
  }
}
