import { Response } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { getUserPermissionCodes } from '../services/permissionService'
import { writeAudit } from '../services/auditService'

const FLAG_KEY = 'PENDING_ALERTS'
const OPEN_APPOINTMENT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'WAITING', 'ROOM_PREPARATION', 'IN_PROGRESS']
const DAY = 86400000
const MAX_KEY_FAILURES = 5
const KEY_LOCK_MS = 15 * 60 * 1000

type Mode = 'ALERT' | 'BLOCK'
type Settings = { enabled: boolean; mode: Mode; lockedUserIds: string[]; keyHash: string | null; unlocks: Record<string, string> }
type Item = { key: string; label: string; count: number; path: string }

// Tentativas erradas de chave (em memória, por usuário): 5 erros trava novas tentativas por 15 minutos.
const keyFailures = new Map<string, { count: number; until: number }>()

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Não autenticado.')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, userId: req.user.id, role: req.user.role }
}

async function loadSettings(clinicId: string): Promise<Settings> {
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: FLAG_KEY } } })
  const meta = (row?.metadata || {}) as { mode?: string; lockedUserIds?: unknown; keyHash?: string; unlocks?: Record<string, string> }
  return {
    // Sem configuração gravada o aviso fica ligado no modo "só alerta".
    enabled: row ? row.enabled : true,
    mode: meta.mode === 'BLOCK' ? 'BLOCK' : 'ALERT',
    lockedUserIds: Array.isArray(meta.lockedUserIds) ? meta.lockedUserIds.map(String) : [],
    keyHash: meta.keyHash || null,
    unlocks: meta.unlocks && typeof meta.unlocks === 'object' ? meta.unlocks : {}
  }
}

async function saveSettings(clinicId: string, tenantId: string, s: Settings) {
  // Limpa liberações vencidas para o registro não crescer.
  const unlocks = Object.fromEntries(Object.entries(s.unlocks).filter(([, until]) => new Date(until).getTime() > Date.now()))
  const metadata = { mode: s.mode, lockedUserIds: s.lockedUserIds, keyHash: s.keyHash, unlocks }
  await prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId, key: FLAG_KEY } },
    update: { enabled: s.enabled, metadata },
    create: { clinicId, tenantId, key: FLAG_KEY, enabled: s.enabled, rolloutStage: 'GA', metadata }
  })
}

// Fim do dia de hoje no horário de Brasília (UTC-3).
function endOfTodayBrt() {
  const brt = new Date(Date.now() - 3 * 3600000)
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 23, 59, 59, 999) + 3 * 3600000)
}
const startOfTodayBrt = () => new Date(endOfTodayBrt().getTime() - DAY + 1)

// Pendências visíveis para quem tem estas permissões (null = todas, caso do ADMIN).
async function computeItems(clinicId: string, tenantId: string, codes: string[] | null): Promise<Item[]> {
  const can = (code: string) => codes === null || codes.includes(code)
  const today = startOfTodayBrt()
  const items: Item[] = []
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
    // Ordens do laboratório (banco): não excluídas, não entregues e com prazo vencido.
    // Tolerante: se a tabela ainda não foi criada no banco, o contador de laboratório fica zerado em vez de derrubar os avisos.
    const count = await prisma.labOrder.count({ where: { clinicId, tenantId, deletedAt: null, deliveredAt: null, dueDate: { lt: today } } }).catch(() => 0)
    if (count) items.push({ key: 'laboratory', label: `${count} trabalho(s) de laboratório com prazo vencido`, count, path: '/laboratorio' })
  }
  return items
}

const isUnlocked = (s: Settings, userId: string) => {
  const until = s.unlocks[userId]
  return Boolean(until && new Date(until).getTime() > Date.now())
}

export async function show(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, userId, role } = ctx(req)
    const settings = await loadSettings(clinicId)
    const codes = role === 'ADMIN' ? null : await getUserPermissionCodes(userId)
    const canManage = codes === null || codes.includes('settings.edit')

    const items = settings.enabled ? await computeItems(clinicId, tenantId, codes) : []
    const total = items.reduce((sum, item) => sum + item.count, 0)
    // Quem gerencia nunca é travado (precisa conseguir destravar os outros e mexer na configuração).
    const configured = settings.lockedUserIds.includes(userId) && !canManage
    const blocked = settings.enabled && settings.mode === 'BLOCK' && configured && total > 0 && !isUnlocked(settings, userId)

    // Para admin/gestor: quais telas estão travadas agora (cada usuário configurado, com as pendências que ele enxerga).
    let lockedUsers: Array<{ id: string; name: string; count: number }> = []
    if (canManage && settings.enabled && settings.mode === 'BLOCK' && settings.lockedUserIds.length) {
      const users = await prisma.user.findMany({
        where: { id: { in: settings.lockedUserIds }, clinicId, tenantId, isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true, role: true }
      })
      for (const user of users) {
        if (user.role === 'ADMIN' || isUnlocked(settings, user.id)) continue
        const userCodes = await getUserPermissionCodes(user.id)
        if (userCodes.includes('settings.edit')) continue
        const userItems = await computeItems(clinicId, tenantId, userCodes)
        const count = userItems.reduce((sum, item) => sum + item.count, 0)
        if (count > 0) lockedUsers.push({ id: user.id, name: `${user.firstName} ${user.lastName}`.trim() || user.email, count })
      }
    }
    if (!canManage) lockedUsers = []

    return res.json({
      enabled: settings.enabled, mode: settings.mode, blocked, canManage, total, items, lockedUsers,
      settings: canManage ? { lockedUserIds: settings.lockedUserIds, hasKey: Boolean(settings.keyHash) } : undefined
    })
  } catch (error) {
    console.error('Erro ao carregar pendências:', error)
    return res.status(500).json({ error: 'Erro ao carregar pendências.' })
  }
}

export async function updateSettings(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, userId } = ctx(req)
    const current = await loadSettings(clinicId)
    const b = req.body || {}
    const next: Settings = { ...current }
    if (typeof b.enabled === 'boolean') next.enabled = b.enabled
    if (b.mode === 'BLOCK' || b.mode === 'ALERT') next.mode = b.mode
    if (Array.isArray(b.lockedUserIds)) {
      const ids = [...new Set((b.lockedUserIds as unknown[]).map(String))]
      const valid = await prisma.user.findMany({ where: { id: { in: ids }, clinicId, tenantId, isActive: true, role: { not: 'ADMIN' } }, select: { id: true } })
      next.lockedUserIds = valid.map(u => u.id)
    }
    if (typeof b.unlockKey === 'string' && b.unlockKey.length) {
      const key = b.unlockKey.trim()
      if (key.length < 4 || key.length > 64) return res.status(400).json({ error: 'A chave de desbloqueio deve ter de 4 a 64 caracteres.' })
      next.keyHash = await bcrypt.hash(key, 10)
      await writeAudit({ clinicId, tenantId, actorId: userId, module: 'settings', action: 'PENDING_LOCK_KEY_CHANGED', summary: 'Chave de desbloqueio das pendências foi definida/alterada.' }).catch((e: unknown) => console.error(e))
    }
    if (next.mode === 'BLOCK' && !next.keyHash) return res.status(400).json({ error: 'Defina uma chave de desbloqueio antes de ativar o bloqueio.' })
    await saveSettings(clinicId, tenantId, next)
    return res.json({ enabled: next.enabled, mode: next.mode, lockedUserIds: next.lockedUserIds, hasKey: Boolean(next.keyHash) })
  } catch (error) {
    console.error('Erro ao salvar configuração de pendências:', error)
    return res.status(500).json({ error: 'Erro ao salvar configuração.' })
  }
}

// O próprio usuário travado destrava a sua tela digitando a chave (vale até o fim do dia).
export async function unlock(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, userId } = ctx(req)
    const attempt = keyFailures.get(userId)
    if (attempt && attempt.count >= MAX_KEY_FAILURES && attempt.until > Date.now()) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos ou peça ao gestor para destravar.' })
    }
    const settings = await loadSettings(clinicId)
    if (!settings.keyHash) return res.status(400).json({ error: 'Nenhuma chave de desbloqueio foi definida. Peça ao gestor para destravar.' })
    const key = String(req.body?.key || '')
    if (!key || !(await bcrypt.compare(key, settings.keyHash))) {
      const count = (attempt && attempt.until > Date.now() ? attempt.count : 0) + 1
      keyFailures.set(userId, { count, until: Date.now() + KEY_LOCK_MS })
      await writeAudit({ clinicId, tenantId, actorId: userId, module: 'settings', action: 'PENDING_UNLOCK_FAILED', summary: 'Tentativa de desbloqueio com chave incorreta.' }).catch((e: unknown) => console.error(e))
      return res.status(403).json({ error: 'Chave incorreta.' })
    }
    keyFailures.delete(userId)
    settings.unlocks[userId] = endOfTodayBrt().toISOString()
    await saveSettings(clinicId, tenantId, settings)
    await writeAudit({ clinicId, tenantId, actorId: userId, module: 'settings', action: 'PENDING_UNLOCK_SELF', summary: 'Tela destravada com a chave de desbloqueio.' }).catch((e: unknown) => console.error(e))
    return res.json({ ok: true })
  } catch (error) {
    console.error('Erro ao destravar a tela:', error)
    return res.status(500).json({ error: 'Erro ao destravar.' })
  }
}

// Admin/gestor destrava a tela de um usuário (até o fim do dia).
export async function unlockUser(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, userId } = ctx(req)
    const target = String(req.body?.userId || '')
    const user = await prisma.user.findFirst({ where: { id: target, clinicId, tenantId }, select: { id: true, firstName: true, lastName: true } })
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
    const settings = await loadSettings(clinicId)
    settings.unlocks[target] = endOfTodayBrt().toISOString()
    await saveSettings(clinicId, tenantId, settings)
    await writeAudit({ clinicId, tenantId, actorId: userId, module: 'settings', action: 'PENDING_UNLOCK_BY_MANAGER', entityType: 'User', entityId: target, summary: `Tela de ${user.firstName} ${user.lastName} destravada pelo gestor.` }).catch((e: unknown) => console.error(e))
    return res.json({ ok: true })
  } catch (error) {
    console.error('Erro ao destravar usuário:', error)
    return res.status(500).json({ error: 'Erro ao destravar.' })
  }
}
