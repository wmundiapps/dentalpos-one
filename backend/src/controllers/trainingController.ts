import { Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import {
  CAREER_LEVELS,
  JOB_ROTATION_SECTORS,
  getTrainingAccess,
  getTrainingSettings,
  isTrainingModule,
  prizeCode,
  reachedTop,
  trainingDay,
} from '../services/trainingService'

const MAX_STATE_BYTES = 400_000
const MAX_BEAT_SECONDS = 20

async function audit(data: Parameters<typeof writeAudit>[0]) {
  try { await writeAudit(data) } catch (e) { console.error(e) }
}

function publicSettings(s: { prize: string; minLevel: string; dailyLimitMinutes: number; jobRotationSectors: string[] }) {
  return { prize: s.prize, minLevel: s.minLevel, dailyLimitMinutes: s.dailyLimitMinutes, jobRotationSectors: s.jobRotationSectors }
}

function usageView(seconds: number, limitMinutes: number, day: string) {
  const limitSeconds = limitMinutes * 60
  return { day, usedSeconds: seconds, limitSeconds, remainingSeconds: Math.max(0, limitSeconds - seconds), locked: seconds >= limitSeconds }
}

export async function me(req: AuthRequest, res: Response) {
  try {
    const { id: userId, clinicId, tenantId } = req.user!
    const settings = await getTrainingSettings(clinicId, tenantId)
    const access = await getTrainingAccess(req.user!)
    const day = trainingDay()
    const [usage, progress, prizes, user] = await Promise.all([
      prisma.trainingUsage.findUnique({ where: { userId_day: { userId, day } } }),
      prisma.trainingProgress.findMany({ where: { userId } }),
      prisma.trainingPrize.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } }),
    ])
    const states: Record<string, unknown> = {}
    for (const p of progress) if (access[p.module as keyof typeof access]) states[p.module] = p.state
    return res.json({
      userName: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Você',
      access,
      settings: publicSettings(settings),
      usage: usageView(usage?.seconds || 0, settings.dailyLimitMinutes, day),
      states,
      prizes: prizes.map((p) => ({ module: p.module, level: p.level, prize: p.prize, code: p.code, deliveredAt: p.deliveredAt, createdAt: p.createdAt })),
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Não foi possível carregar o treinamento.' })
  }
}

export async function saveProgress(req: AuthRequest, res: Response) {
  try {
    const { id: userId, clinicId, tenantId } = req.user!
    const module = req.params.module
    if (!isTrainingModule(module)) return res.status(400).json({ error: 'Módulo inválido.' })
    const access = await getTrainingAccess(req.user!)
    if (!access[module]) return res.status(403).json({ error: 'Seu perfil não tem acesso a este módulo.' })
    const state = req.body?.state
    if (!state || typeof state !== 'object') return res.status(400).json({ error: 'Progresso inválido.' })
    if (JSON.stringify(state).length > MAX_STATE_BYTES) return res.status(413).json({ error: 'Progresso grande demais.' })
    await prisma.trainingProgress.upsert({
      where: { userId_module: { userId, module } },
      create: { userId, clinicId, tenantId, module, state: state as Prisma.InputJsonValue },
      update: { state: state as Prisma.InputJsonValue },
    })
    return res.json({ ok: true })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Não foi possível salvar o progresso.' })
  }
}

/** Conta o tempo de jogo do dia. O navegador avisa a cada ~15 s enquanto o jogo está aberto na tela. */
export async function heartbeat(req: AuthRequest, res: Response) {
  try {
    const { id: userId, clinicId, tenantId } = req.user!
    const access = await getTrainingAccess(req.user!)
    if (!access.carreira && !access.jobrotation) return res.status(403).json({ error: 'Seu perfil não tem acesso ao treinamento.' })
    const settings = await getTrainingSettings(clinicId, tenantId)
    const day = trainingDay()
    const now = new Date()
    const current = await prisma.trainingUsage.findUnique({ where: { userId_day: { userId, day } } })
    let seconds = 0
    if (!current) {
      await prisma.trainingUsage.create({ data: { userId, clinicId, tenantId, day, seconds: 0, lastBeatAt: now } }).catch(() => null)
    } else {
      const elapsed = Math.max(0, Math.min(MAX_BEAT_SECONDS, Math.round((now.getTime() - current.lastBeatAt.getTime()) / 1000)))
      const updated = await prisma.trainingUsage.update({ where: { id: current.id }, data: { seconds: { increment: elapsed }, lastBeatAt: now } })
      seconds = updated.seconds
    }
    return res.json(usageView(seconds, settings.dailyLimitMinutes, day))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Não foi possível registrar o tempo de jogo.' })
  }
}

export async function claimPrize(req: AuthRequest, res: Response) {
  try {
    const { id: userId, clinicId, tenantId } = req.user!
    const module = req.body?.module
    if (!isTrainingModule(module)) return res.status(400).json({ error: 'Módulo inválido.' })
    const access = await getTrainingAccess(req.user!)
    if (!access[module]) return res.status(403).json({ error: 'Seu perfil não tem acesso a este módulo.' })
    const existing = await prisma.trainingPrize.findUnique({ where: { userId_module: { userId, module } } })
    if (existing) return res.json({ prize: existing.prize, code: existing.code, alreadyClaimed: true })
    const settings = await getTrainingSettings(clinicId, tenantId)
    if (!settings.prize.trim()) return res.status(409).json({ error: 'O gestor ainda não configurou um prêmio.' })
    const progress = await prisma.trainingProgress.findUnique({ where: { userId_module: { userId, module } } })
    const level = reachedTop(module, progress?.state, settings.minLevel)
    if (!level) return res.status(409).json({ error: 'O progresso salvo ainda não chegou ao topo exigido.' })
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } })
    const userName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || req.user!.email
    const prize = await prisma.trainingPrize.create({
      data: { userId, clinicId, tenantId, userName, module, level, prize: settings.prize, code: prizeCode(module) },
    })
    await audit({ clinicId, tenantId, actorId: userId, module: 'training', action: 'prize.claim', entityType: 'TrainingPrize', entityId: prize.id, summary: `${userName} chegou ao topo (${module}) e ganhou: ${prize.prize}` })
    return res.status(201).json({ prize: prize.prize, code: prize.code, alreadyClaimed: false })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Não foi possível registrar o prêmio.' })
  }
}

export async function getSettings(req: AuthRequest, res: Response) {
  const settings = await getTrainingSettings(req.user!.clinicId, req.user!.tenantId)
  return res.json(publicSettings(settings))
}

export async function updateSettings(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, id: actorId } = req.user!
    const b = req.body || {}
    const prize = typeof b.prize === 'string' ? b.prize.trim().slice(0, 120) : ''
    const minLevel = String(b.minLevel || '')
    const dailyLimitMinutes = Math.round(Number(b.dailyLimitMinutes))
    const sectors = Array.isArray(b.jobRotationSectors) ? b.jobRotationSectors.filter((x: unknown) => typeof x === 'string' && JOB_ROTATION_SECTORS.includes(x)) : []
    if (!CAREER_LEVELS.includes(minLevel)) return res.status(400).json({ error: 'Nível mínimo inválido.' })
    if (!Number.isFinite(dailyLimitMinutes) || dailyLimitMinutes < 1 || dailyLimitMinutes > 60) return res.status(400).json({ error: 'O limite diário deve ficar entre 1 e 60 minutos.' })
    if (!sectors.length) return res.status(400).json({ error: 'Escolha pelo menos um setor para o Job Rotation.' })
    const before = await getTrainingSettings(clinicId, tenantId)
    const settings = await prisma.trainingSettings.update({
      where: { clinicId },
      data: { prize, minLevel, dailyLimitMinutes, jobRotationSectors: [...new Set<string>(sectors)] },
    })
    await audit({ clinicId, tenantId, actorId, module: 'training', action: 'settings.update', entityType: 'TrainingSettings', entityId: settings.id, beforeData: publicSettings(before), afterData: publicSettings(settings) })
    return res.json(publicSettings(settings))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Não foi possível salvar as configurações.' })
  }
}

export async function listPrizes(req: AuthRequest, res: Response) {
  const prizes = await prisma.trainingPrize.findMany({ where: { clinicId: req.user!.clinicId }, orderBy: { createdAt: 'desc' }, take: 200 })
  return res.json(prizes)
}

export async function markDelivered(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, id: actorId } = req.user!
    const prize = await prisma.trainingPrize.findFirst({ where: { id: String(req.params.id), clinicId } })
    if (!prize) return res.status(404).json({ error: 'Prêmio não encontrado.' })
    const delivered = req.body?.delivered !== false
    const updated = await prisma.trainingPrize.update({ where: { id: prize.id }, data: { deliveredAt: delivered ? new Date() : null } })
    await audit({ clinicId, tenantId, actorId, module: 'training', action: delivered ? 'prize.deliver' : 'prize.undeliver', entityType: 'TrainingPrize', entityId: prize.id, summary: `${prize.userName}: ${prize.prize}` })
    return res.json(updated)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Não foi possível atualizar o prêmio.' })
  }
}

/** Visão do gestor: quem está jogando, em que ponto e quanto tempo usou hoje. */
export async function overview(req: AuthRequest, res: Response) {
  const { clinicId } = req.user!
  const day = trainingDay()
  const [progress, usage] = await Promise.all([
    prisma.trainingProgress.findMany({ where: { clinicId }, orderBy: { updatedAt: 'desc' }, take: 500 }),
    prisma.trainingUsage.findMany({ where: { clinicId, day } }),
  ])
  const userIds = [...new Set(progress.map((p) => p.userId))]
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
  const names = new Map(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ')]))
  const todaySeconds = new Map(usage.map((u) => [u.userId, u.seconds]))
  return res.json(progress.map((p) => {
    const s = (p.state || {}) as Record<string, unknown>
    const summary = p.module === 'carreira'
      ? { level: typeof s.diff === 'string' ? s.diff : null, reachedTop: s.won === true }
      : { level: Number(s.level) > 5 ? 'topo' : String(s.level ?? 1), reachedTop: Number(s.level) > 5 }
    return { userId: p.userId, userName: names.get(p.userId) || 'Usuário', module: p.module, updatedAt: p.updatedAt, todaySeconds: todaySeconds.get(p.userId) || 0, ...summary }
  }))
}

