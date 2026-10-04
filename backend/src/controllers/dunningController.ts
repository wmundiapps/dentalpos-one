import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { brtDay, dunningCandidates, dunningMessage, DUNNING_CHANNELS, effectiveChannels, loadDunningSettings, multiChannelReady, saveDunningSettings } from '../services/dunningService'

const ctx = (req: AuthRequest) => {
  if (!req.user) throw new Error('Não autenticado.')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, userId: req.user.id }
}

// Configuração, prévia do que sairia hoje e últimos avisos. Tolerante: sem a tabela criada no banco, avisa em vez de falhar.
export async function show(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const settings = await loadDunningSettings(clinicId)
    let ready = true
    let preview: Array<{ patientName: string; stage: string; daysOverdue: number; amount: number; channels: string[]; missingContact: string[] }> = []
    const multiReady = await multiChannelReady().catch(() => false)
    const active = effectiveChannels(settings, multiReady)
    let recent: unknown[] = []
    try {
      const candidates = await dunningCandidates(clinicId, tenantId, { ...settings, enabled: true, since: settings.since || brtDay(new Date()) }, new Date(), active, multiReady)
      preview = candidates.slice(0, 200).map(c => ({ patientName: c.patientName, stage: c.stage, daysOverdue: c.daysOverdue, amount: c.amount, channels: c.channels, missingContact: c.channels.filter(ch => (ch === 'EMAIL' ? !c.email : !c.phone)) }))
      recent = await prisma.dunningNotice.findMany({ where: { clinicId }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, stage: true, channel: true, status: true, sentAt: true, errorMessage: true, createdAt: true, patientId: true } })
    } catch { ready = false }
    return res.json({
      ...settings, ready, multiReady, activeChannels: active, channelOptions: DUNNING_CHANNELS, preview, recent,
      example: dunningMessage('D3', { patientName: 'Maria Souza', clinicName: 'Sua Clínica', amount: 350, dueISO: brtDay(new Date(Date.now() - 3 * 86400000)), daysOverdue: 3 }),
      exampleLegal: dunningMessage('LEGAL', { patientName: 'Maria Souza', clinicName: 'Sua Clínica', amount: 350, dueISO: brtDay(new Date(Date.now() - 31 * 86400000)), daysOverdue: 31 })
    })
  } catch (error) {
    console.error('Erro ao carregar a régua de cobrança:', error)
    return res.status(500).json({ error: 'Erro ao carregar a régua de cobrança.' })
  }
}

export async function updateSettings(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, userId } = ctx(req)
    const current = await loadDunningSettings(clinicId)
    const b = req.body || {}
    const next = { ...current }
    if (typeof b.includeOlder === 'boolean') next.includeOlder = b.includeOlder
    if (Array.isArray(b.channels)) {
      const picked = [...new Set((b.channels as unknown[]).map(String))].filter(c => (DUNNING_CHANNELS as readonly string[]).includes(c)) as typeof next.channels
      if (!picked.length) return res.status(400).json({ error: 'Escolha pelo menos um canal de envio.' })
      next.channels = picked
    }
    if (typeof b.enabled === 'boolean') {
      next.enabled = b.enabled
      // Ao ligar, só entram cobranças que vencem a partir de hoje (não dispara aviso para dívidas antigas), salvo se o gestor pedir.
      if (b.enabled && !current.enabled) next.since = brtDay(new Date())
    }
    await saveDunningSettings(clinicId, tenantId, next)
    await writeAudit({ clinicId, tenantId, actorId: userId, module: 'finance', action: 'DUNNING_SETTINGS', summary: `Régua de cobrança: ${next.enabled ? 'ligada' : 'desligada'} (canais ${next.channels.join(', ')}${next.includeOlder ? ', inclui dívidas antigas' : ''}).` }).catch((e: unknown) => console.error(e))
    return res.json(next)
  } catch (error) {
    console.error('Erro ao salvar a régua de cobrança:', error)
    return res.status(500).json({ error: 'Erro ao salvar a régua de cobrança.' })
  }
}
