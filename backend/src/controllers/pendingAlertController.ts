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
type Visibility = Record<string, string[]>
type Settings = { enabled: boolean; mode: Mode; lockedUserIds: string[]; keyHash: string | null; unlocks: Record<string, string>; visibility: Visibility }
type Item = { key: string; label: string; count: number; path: string; blocks?: number; lines?: string[] }

// Quem enxerga cada tipo de pendência, por departamento (código do perfil de acesso). Admin vê tudo sempre.
// Se o gestor não configurou nada, vale este padrão: cobrança vai para recepção, financeiro e clínico; laboratório não vê cobrança.
export const ALERT_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'appointments', label: 'Agendamentos sem desfecho' },
  { key: 'receivables', label: 'Recebimentos vencidos / pacientes em atraso' },
  { key: 'laboratory', label: 'Fila de trabalhos do laboratório (até a entrega)' }
]
const DEFAULT_VISIBILITY: Visibility = {
  appointments: ['GESTOR', 'RECEPCAO', 'DENTISTA', 'AUXILIAR', 'ADMINISTRACAO'],
  receivables: ['GESTOR', 'RECEPCAO', 'FINANCEIRO', 'DENTISTA', 'ADMINISTRACAO'],
  laboratory: ['GESTOR', 'LABORATORIO', 'DENTISTA', 'RECEPCAO', 'ADMINISTRACAO']
}

// Tentativas erradas de chave (em memória, por usuário): 5 erros trava novas tentativas por 15 minutos.
const keyFailures = new Map<string, { count: number; until: number }>()

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Não autenticado.')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, userId: req.user.id, role: req.user.role }
}

async function loadSettings(clinicId: string): Promise<Settings> {
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: FLAG_KEY } } })
  const meta = (row?.metadata || {}) as { mode?: string; lockedUserIds?: unknown; keyHash?: string; unlocks?: Record<string, string>; visibility?: Record<string, unknown> }
  return {
    // Sem configuração gravada o aviso fica ligado no modo "só alerta".
    enabled: row ? row.enabled : true,
    mode: meta.mode === 'BLOCK' ? 'BLOCK' : 'ALERT',
    lockedUserIds: Array.isArray(meta.lockedUserIds) ? meta.lockedUserIds.map(String) : [],
    keyHash: meta.keyHash || null,
    unlocks: meta.unlocks && typeof meta.unlocks === 'object' ? meta.unlocks : {},
    visibility: Object.fromEntries(ALERT_CATEGORIES.map(c => {
      const configured = meta.visibility && Array.isArray(meta.visibility[c.key]) ? (meta.visibility[c.key] as unknown[]).map(String) : null
      return [c.key, configured ?? DEFAULT_VISIBILITY[c.key]]
    }))
  }
}

async function saveSettings(clinicId: string, tenantId: string, s: Settings) {
  // Limpa liberações vencidas para o registro não crescer.
  const unlocks = Object.fromEntries(Object.entries(s.unlocks).filter(([, until]) => new Date(until).getTime() > Date.now()))
  const metadata = { mode: s.mode, lockedUserIds: s.lockedUserIds, keyHash: s.keyHash, unlocks, visibility: s.visibility }
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

async function getUserProfileCodes(userId: string): Promise<string[]> {
  const rows = await prisma.userAccessProfile.findMany({ where: { userId, profile: { isActive: true } }, select: { profile: { select: { code: true } } } })
  return [...new Set(rows.map(r => r.profile.code))]
}

// Categorias que o usuário pode ver (null = admin: todas).
const visibleCategories = (settings: Settings, profileCodes: string[] | null) =>
  ALERT_CATEGORIES.map(c => c.key).filter(key => profileCodes === null || profileCodes.some(code => settings.visibility[key]?.includes(code)))

// Pendências visíveis para quem tem estas permissões (null = todas, caso do ADMIN).
async function computeItems(clinicId: string, tenantId: string, codes: string[] | null, visible: string[], blockMode = false): Promise<Item[]> {
  const can = (code: string, category: string) => visible.includes(category) && (codes === null || codes.includes(code))
  const today = startOfTodayBrt()
  const items: Item[] = []
  if (can('agenda.view', 'appointments')) {
    const count = await prisma.appointment.count({
      where: { clinicId, tenantId, status: { in: OPEN_APPOINTMENT_STATUSES }, scheduledAt: { lt: today, gte: new Date(today.getTime() - 30 * DAY) } }
    })
    if (count) items.push({ key: 'appointments', label: `${count} agendamento(s) de dias anteriores sem desfecho (finalizar, remarcar ou marcar falta)`, count, path: '/agenda' })
  }
  if (can('finance.view', 'receivables')) {
    const count = await prisma.financialEntry.count({
      where: { clinicId, tenantId, type: 'INCOME', status: { notIn: ['PAID', 'CANCELLED'] }, dueDate: { lt: today } }
    })
    if (count) items.push({ key: 'receivables', label: `${count} recebimento(s) vencido(s) (paciente em atraso: a régua de cobrança acompanha)`, count, path: '/financeiro' })
  }
  if (can('laboratory.view', 'laboratory')) {
    // Fila diária do laboratório: todo trabalho não excluído e ainda não entregue ao dentista/clínica.
    // Só sai da fila quando o status vira Entregue/Liberado (deliveredAt). Apenas os vencidos contam para o bloqueio.
    // Tolerante: se a tabela ainda não foi criada no banco, a fila fica vazia em vez de derrubar os avisos.
    const queue = await prisma.labOrder.findMany({
      where: { clinicId, tenantId, deletedAt: null, deliveredAt: null },
      select: { patientName: true, workType: true, dentistName: true, status: true, dueDate: true },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 300
    }).catch(() => [])
    if (queue.length) {
      const tomorrow = new Date(today.getTime() + DAY)
      const overdue = queue.filter(o => o.dueDate && o.dueDate < today).length
      const dueToday = queue.filter(o => o.dueDate && o.dueDate >= today && o.dueDate < tomorrow).length
      const fmt = (d: Date | null) => (d ? new Date(d.getTime() - 3 * 3600000).toISOString().slice(8, 10) + '/' + new Date(d.getTime() - 3 * 3600000).toISOString().slice(5, 7) : 'sem prazo')
      const lines = queue.slice(0, 8).map(o => `${o.patientName} · ${o.workType}${o.dentistName ? ` (${o.dentistName})` : ''} · ${o.status} · prazo ${fmt(o.dueDate)}${o.dueDate && o.dueDate < today ? ' · ATRASADO' : ''}`)
      if (queue.length > lines.length) lines.push(`+ ${queue.length - lines.length} trabalho(s) na fila`)
      let label = `Fila do laboratório: ${queue.length} trabalho(s) (${overdue} atrasado(s), ${dueToday} vencem hoje). Só saem da fila quando concluídos e entregues ao dentista/clínica.`
      if (blockMode && overdue) label += ' Se os atrasados não forem resolvidos, o sistema será bloqueado.'
      items.push({ key: 'laboratory', label, count: queue.length, blocks: overdue, lines, path: '/laboratorio' })
    }
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
    const profileCodes = role === 'ADMIN' ? null : await getUserProfileCodes(userId)
    const visibleKeys = visibleCategories(settings, profileCodes)

    const items = settings.enabled ? await computeItems(clinicId, tenantId, codes, visibleKeys, settings.mode === 'BLOCK') : []
    const total = items.reduce((sum, item) => sum + item.count, 0)
    const blockingTotal = items.reduce((sum, item) => sum + (item.blocks ?? item.count), 0)
    // Quem gerencia nunca é travado (precisa conseguir destravar os outros e mexer na configuração).
    const configured = settings.lockedUserIds.includes(userId) && !canManage
    const blocked = settings.enabled && settings.mode === 'BLOCK' && configured && blockingTotal > 0 && !isUnlocked(settings, userId)

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
        const userItems = await computeItems(clinicId, tenantId, userCodes, visibleCategories(settings, await getUserProfileCodes(user.id)), true)
        const count = userItems.reduce((sum, item) => sum + (item.blocks ?? item.count), 0)
        if (count > 0) lockedUsers.push({ id: user.id, name: `${user.firstName} ${user.lastName}`.trim() || user.email, count })
      }
    }
    if (!canManage) lockedUsers = []

    return res.json({
      enabled: settings.enabled, mode: settings.mode, blocked, canManage, total, items, lockedUsers, visibleKeys,
      settings: canManage ? { lockedUserIds: settings.lockedUserIds, hasKey: Boolean(settings.keyHash), visibility: settings.visibility, categories: ALERT_CATEGORIES, profiles: await prisma.accessProfile.findMany({ where: { clinicId, isActive: true, code: { not: 'ADMIN' } }, select: { code: true, name: true }, orderBy: { code: 'asc' } }) } : undefined
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
    const next: Settings = { ...current, visibility: { ...current.visibility } }
    if (typeof b.enabled === 'boolean') next.enabled = b.enabled
    if (b.mode === 'BLOCK' || b.mode === 'ALERT') next.mode = b.mode
    if (Array.isArray(b.lockedUserIds)) {
      const ids = [...new Set((b.lockedUserIds as unknown[]).map(String))]
      const valid = await prisma.user.findMany({ where: { id: { in: ids }, clinicId, tenantId, isActive: true, role: { not: 'ADMIN' } }, select: { id: true } })
      next.lockedUserIds = valid.map(u => u.id)
    }
    if (b.visibility && typeof b.visibility === 'object') {
      const incoming = b.visibility as Record<string, unknown>
      for (const c of ALERT_CATEGORIES) {
        if (Array.isArray(incoming[c.key])) next.visibility[c.key] = [...new Set((incoming[c.key] as unknown[]).map(v => String(v).toUpperCase().slice(0, 40)))]
      }
    }
    if (typeof b.unlockKey === 'string' && b.unlockKey.length) {
      const key = b.unlockKey.trim()
      if (key.length < 4 || key.length > 64) return res.status(400).json({ error: 'A chave de desbloqueio deve ter de 4 a 64 caracteres.' })
      next.keyHash = await bcrypt.hash(key, 10)
      await writeAudit({ clinicId, tenantId, actorId: userId, module: 'settings', action: 'PENDING_LOCK_KEY_CHANGED', summary: 'Chave de desbloqueio das pendências foi definida/alterada.' }).catch((e: unknown) => console.error(e))
    }
    if (next.mode === 'BLOCK' && !next.keyHash) return res.status(400).json({ error: 'Defina uma chave de desbloqueio antes de ativar o bloqueio.' })
    await saveSettings(clinicId, tenantId, next)
    return res.json({ enabled: next.enabled, mode: next.mode, lockedUserIds: next.lockedUserIds, hasKey: Boolean(next.keyHash), visibility: next.visibility })
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
