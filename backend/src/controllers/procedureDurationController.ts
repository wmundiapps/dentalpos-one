import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

const FLAG_KEY = 'PROCEDURE_DURATIONS'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId }
}

// Tempo de agendamento por procedimento, valendo para toda a clínica (nome normalizado -> minutos).
export async function show(req: AuthRequest, res: Response) {
  try {
    const { clinicId } = ctx(req)
    const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: FLAG_KEY } } })
    const durations = ((row?.metadata || {}) as { durations?: Record<string, number> }).durations || {}
    return res.json({ durations })
  } catch (error) {
    console.error('Erro ao carregar tempos por procedimento:', error)
    return res.status(500).json({ error: 'Erro ao carregar tempos por procedimento.' })
  }
}

export async function save(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const input = req.body?.durations && typeof req.body.durations === 'object' ? req.body.durations as Record<string, unknown> : {}
    const durations: Record<string, number> = {}
    for (const [name, value] of Object.entries(input)) {
      const key = String(name).trim().toLowerCase().slice(0, 120)
      const minutes = Math.round(Number(value))
      if (key && Number.isFinite(minutes) && minutes >= 5 && minutes <= 480) durations[key] = minutes
    }
    await prisma.tenantFeatureFlag.upsert({
      where: { clinicId_key: { clinicId, key: FLAG_KEY } },
      update: { enabled: true, metadata: { durations } },
      create: { clinicId, tenantId, key: FLAG_KEY, enabled: true, rolloutStage: 'GA', metadata: { durations } }
    })
    return res.json({ durations })
  } catch (error) {
    console.error('Erro ao salvar tempos por procedimento:', error)
    return res.status(500).json({ error: 'Erro ao salvar tempos por procedimento.' })
  }
}
