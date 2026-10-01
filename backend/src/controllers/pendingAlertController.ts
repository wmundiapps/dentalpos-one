import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { getUserPermissionCodes } from '../services/permissionService'

const FLAG_KEY = 'PENDING_ALERTS'
const OPEN_APPOINTMENT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'WAITING', 'ROOM_PREPARATION', 'IN_PROGRESS']
const LAB_DONE = ['Entregue', 'Liberado']
const DAY = 86400000

type Mode = 'ALERT' | 'BLOCK'
type Settings = { enabled: boolean; mode: Mode; unlockedUntil: string | null }

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Não autenticado.')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, userId: req.user.id, role: req.user.role }
}

async function loadSettings(clinicId: string): Promise<Settings> {
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: FLAG_KEY } } })
  const meta = (row?.metadata || {}) as { mode?: string; unlockedUntil?: string }
  return {
    // Sem configuração gravada o aviso fica ligado no modo "só alerta".
    enabled: row ? row.enabled : true,
    mode: meta.mode === 'BLOCK' ? 'BLOCK' : 'ALERT',
    unlockedUntil: meta.unlockedUntil || null
  }
}

async function saveSettings(clinicId: string, tenantId: string, next: Settings) {
  await prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId, key: FLAG_KEY } },
    update: { enabled: next.enabled, metadata: { mode: next.mode, unlockedUntil: next.unlockedUntil } },
    create: { clinicId, tenantId, key: FLAG_KEY, enabled: next.enabled, rolloutStage: 'GA', metadata: { mode: next.mode, unlockedUntil: next.unlockedUntil } }
  })
}

// Fim do dia de hoje no horário de Brasília (UTC-3).
function endOfTodayBrt() {
  const brt = new Date(Date.now() - 3 * 3600000)
  const y = brt.getUTCFullYear(), m = brt.getUTCMonth(), d = brt.getUTCDate()
  return new Date(Date.UTC(y, m, d, 23, 59, 59, 999) + 3 * 3600000)
}

function startOfTodayBrt() {
  return new Date(endOfTodayBrt().getTime() - DAY + 1)
}

export async function show(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, userId, role } = ctx(req)
    const settings = await loadSettings(clinicId)
    const codes = role === 'ADMIN' ? null : await getUserPermissionCodes(userId)
    const can = (code: string) => codes === null || codes.includes(code)
    const canManage = can('settings.edit')

    const items: Array<{ key: string; label: string; count: number; path: string }> = []
    if (settings.enabled) {
      const today = startOfTodayBrt()
      if (can('agenda.view')) {
        const count = await prisma.appointment.count({
          where: { clinicId, tenantId, status: { in: OPEN_APPOINTMENT_STATUSES }, scheduledAt: { lt: today, gte: new Date(today.getTime() - 30 * DAY) } }
        })
        if (count) items.push({ key: 'appointments', label: `${count} agendamento(s) de dias anteriores sem desfecho (finalizar, remarcar ou marcar falta)`, count, path: '/agenda' })
      }
      if (can('finance.view')) {
        const count = await prisma.financialEntry.count({
          where: { clinicId, tenantId, type: 'INCOME', status: { notIn: ['PAID', 'CANCELLED'] }, dueDate: { lt: new Date(today.getTime() - 3 * DAY) } }
        })
        if (count) items.push({ key: 'receivables', label: `${count} recebimento(s) vencido(s) há mais de 3 dias`, count, path: '/financeiro' })
      }
      if (can('laboratory.view')) {
        const count = await prisma.laboratoryWork.count({
          where: { clinicId, tenantId, status: { notIn: LAB_DONE }, dueDate: { lt: today } }
        })
        if (count) items.push({ key: 'laboratory', label: `${count} trabalho(s) de laboratório com prazo vencido`, count, path: '/laboratorio' })
      }
    }

    const total = items.reduce((sum, item) => sum + item.count, 0)
    const unlocked = settings.unlockedUntil ? new Date(settings.unlockedUntil).getTime() > Date.now() : false
    const blocked = settings.enabled && settings.mode === 'BLOCK' && total > 0 && !unlocked
    return res.json({ enabled: settings.enabled, mode: settings.mode, blocked, unlocked, canManage, total, items })
  } catch (error) {
    console.error('Erro ao carregar pendências:', error)
    return res.status(500).json({ error: 'Erro ao carregar pendências.' })
  }
}

export async function updateSettings(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const current = await loadSettings(clinicId)
    const next: Settings = {
      enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : current.enabled,
      mode: req.body?.mode === 'BLOCK' ? 'BLOCK' : req.body?.mode === 'ALERT' ? 'ALERT' : current.mode,
      unlockedUntil: current.unlockedUntil
    }
    await saveSettings(clinicId, tenantId, next)
    return res.json(next)
  } catch (error) {
    console.error('Erro ao salvar configuração de pendências:', error)
    return res.status(500).json({ error: 'Erro ao salvar configuração.' })
  }
}

// Só o gestor destrava; vale até o fim do dia.
export async function unlock(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const current = await loadSettings(clinicId)
    await saveSettings(clinicId, tenantId, { ...current, unlockedUntil: endOfTodayBrt().toISOString() })
    return res.json({ ok: true })
  } catch (error) {
    console.error('Erro ao destravar o sistema:', error)
    return res.status(500).json({ error: 'Erro ao destravar.' })
  }
}
