import { Response } from 'express'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { getUserPermissionCodes } from '../services/permissionService'
import { dispatchRevah } from '../services/revahProviderService'
import { deliverWithCode } from '../services/labDeliveryCode'
import { writeAudit } from '../services/auditService'

const FLAG_KEY = 'PENDING_ALERTS'
const OPEN_APPOINTMENT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'WAITING', 'ROOM_PREPARATION', 'IN_PROGRESS']
const DAY = 86400000
const MAX_KEY_FAILURES = 5
const KEY_LOCK_MS = 15 * 60 * 1000

type Mode = 'ALERT' | 'BLOCK'
type Visibility = Record<string, string[]>
type Settings = { enabled: boolean; mode: Mode; lastDigest: string | null; lockDepartments: string[]; lockedUserIds: string[]; keyHash: string | null; unlocks: Record<string, string>; visibility: Visibility; lockEvents: Record<string, { day: string; resolved: boolean }> }
type Item = { key: string; label: string; count: number; path: string; blocks?: number; lines?: string[] }

// Quem enxerga cada tipo de pendência, por departamento (código do perfil de acesso). Admin vê tudo sempre.
// Se o gestor não configurou nada, vale este padrão: cobrança vai para recepção, financeiro e clínico; laboratório não vê cobrança.
export const ALERT_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'appointments', label: 'Agendamentos sem desfecho' },
  { key: 'receivables', label: 'Recebimentos vencidos / pacientes em atraso' },
  { key: 'laboratory', label: 'Fila de trabalhos do laboratório (até a entrega)' },
  { key: 'budget', label: 'Procedimentos novos para passar orçamento ao paciente' }
]
const DEFAULT_VISIBILITY: Visibility = {
  appointments: ['GESTOR', 'RECEPCAO', 'DENTISTA', 'AUXILIAR', 'ADMINISTRACAO'],
  receivables: ['GESTOR', 'RECEPCAO', 'FINANCEIRO', 'DENTISTA', 'ADMINISTRACAO'],
  laboratory: ['GESTOR', 'LABORATORIO', 'DENTISTA', 'RECEPCAO', 'ADMINISTRACAO'],
  budget: ['GESTOR', 'RECEPCAO', 'FINANCEIRO', 'ADMINISTRACAO']
}

// Tentativas erradas de chave (em memória, por usuário): 5 erros trava novas tentativas por 15 minutos.
const keyFailures = new Map<string, { count: number; until: number }>()

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Não autenticado.')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, userId: req.user.id, role: req.user.role }
}

async function loadSettings(clinicId: string): Promise<Settings> {
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: FLAG_KEY } } })
  const meta = (row?.metadata || {}) as { lastDigest?: string; lockDepartments?: unknown; mode?: string; lockedUserIds?: unknown; keyHash?: string; unlocks?: Record<string, string>; visibility?: Record<string, unknown>; lockEvents?: Record<string, { day: string; resolved: boolean }> }
  return {
    lockEvents: meta.lockEvents && typeof meta.lockEvents === 'object' ? meta.lockEvents : {},
    // Sem configuração gravada o aviso fica ligado no modo "só alerta".
    enabled: row ? row.enabled : true,
    // Travamento diário: só vale para os departamentos marcados pelo gestor; sem departamentos o modo é só alerta.
    lastDigest: meta.lastDigest || null,
    lockDepartments: Array.isArray(meta.lockDepartments) ? meta.lockDepartments.map(v => String(v).toUpperCase().slice(0, 40)) : [],
    mode: Array.isArray(meta.lockDepartments) && meta.lockDepartments.length ? 'BLOCK' : 'ALERT',
    lockedUserIds: Array.isArray(meta.lockedUserIds) ? meta.lockedUserIds.map(String) : [],
    keyHash: meta.keyHash || null,
    unlocks: meta.unlocks && typeof meta.unlocks === 'object' ? meta.unlocks : {},
    visibility: Object.fromEntries(ALERT_CATEGORIES.map(c => {
      const configured = meta.visibility && Array.isArray(meta.visibility[c.key]) ? (meta.visibility[c.key] as unknown[]).map(String) : null
      return [c.key, configured ?? DEFAULT_VISIBILITY[c.key]]
    }))
  }
}

function pruneLockEvents(events: Settings['lockEvents']) {
  const limit = new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10)
  return Object.fromEntries(Object.entries(events).filter(([, e]) => e.day >= limit))
}

// Avisa gestores e administradores por e-mail (conta da plataforma) e registra na auditoria. Nunca derruba o aviso de pendências.
async function notifyManagers(clinicId: string, tenantId: string, subject: string, message: string) {
  try {
    const apiKey = String(process.env.RESEND_API_KEY || '').trim()
    if (!apiKey) return
    const managers = await prisma.user.findMany({
      where: { clinicId, tenantId, isActive: true, OR: [{ role: 'ADMIN' }, { accessProfiles: { some: { profile: { code: 'GESTOR', isActive: true } } } }] },
      select: { email: true }, take: 10
    })
    const to = [...new Set(managers.map(m => m.email).filter(Boolean))]
    for (const address of to) {
      await dispatchRevah('EMAIL', address, message, { apiKey, subject }, 'CompletoDonto <contato@dentalpos.com.br>').catch((e: unknown) => console.error('Aviso ao gestor falhou:', e))
    }
  } catch (error) {
    console.error('Erro ao avisar gestores:', error)
  }
}

async function actorName(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, email: true } })
  return u ? `${u.firstName} ${u.lastName}`.trim() || u.email : 'um gestor'
}

async function trackLockEvent(settings: Settings, clinicId: string, tenantId: string, userId: string, blocked: boolean, pendingGone: boolean, lines: string[]) {
  const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
  const prev = settings.lockEvents[userId]
  const user = await prisma.user.findFirst({ where: { id: userId, clinicId }, select: { firstName: true, lastName: true, email: true } })
  const name = user ? `${user.firstName} ${user.lastName}`.trim() || user.email : 'Usuário'
  if (blocked && (!prev || prev.day !== today)) {
    settings.lockEvents[userId] = { day: today, resolved: false }
    await saveSettings(clinicId, tenantId, settings)
    await writeAudit({ clinicId, tenantId, actorId: userId, module: 'settings', action: 'PENDING_LOCK_TRIGGERED', entityType: 'User', entityId: userId, summary: `Tela de ${name} travada por pendências não resolvidas.` }).catch((e: unknown) => console.error(e))
    await notifyManagers(clinicId, tenantId, 'Falha: tela travada por pendências', `A tela de ${name} foi travada porque pendências não foram resolvidas a tempo.\n\n${lines.join('\n') || 'Veja o detalhe em Pendências.'}\n\nO usuário destrava resolvendo a pendência ou com a chave de desbloqueio; você também pode destravar pelo sistema.`)
  } else if (pendingGone && prev && !prev.resolved) {
    settings.lockEvents[userId] = { ...prev, resolved: true }
    await saveSettings(clinicId, tenantId, settings)
    await writeAudit({ clinicId, tenantId, actorId: userId, module: 'settings', action: 'PENDING_LOCK_RESOLVED', entityType: 'User', entityId: userId, summary: `Pendências de ${name} resolvidas; tela liberada.` }).catch((e: unknown) => console.error(e))
    await notifyManagers(clinicId, tenantId, 'Pendências resolvidas: tela liberada', `${name} resolveu as pendências que travaram a tela e o acesso foi liberado automaticamente. A falha ficou registrada na auditoria.`)
  }
}

async function saveSettings(clinicId: string, tenantId: string, s: Settings) {
  // Limpa liberações vencidas para o registro não crescer.
  const unlocks = Object.fromEntries(Object.entries(s.unlocks).filter(([, until]) => new Date(until).getTime() > Date.now()))
  const metadata = { lastDigest: s.lastDigest, lockDepartments: s.lockDepartments, mode: s.mode, lockedUserIds: s.lockedUserIds, keyHash: s.keyHash, unlocks, visibility: s.visibility, lockEvents: pruneLockEvents(s.lockEvents) }
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

// Ferramentas de travamento são exclusivas do gestor e do administrador (master), não de qualquer usuário com permissão de configurações.
const MANAGER_PROFILES = ['GESTOR', 'ADMIN']
async function isManager(userId: string, role: string) {
  if (role === 'ADMIN') return true
  return (await getUserProfileCodes(userId)).some(code => MANAGER_PROFILES.includes(code))
}

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
  if (can('finance.view', 'budget')) {
    // Procedimento feito fora do plano: some da lista quando o paciente ganha um orçamento novo depois do lançamento. Só aviso (não trava a tela).
    const fresh = await prisma.treatmentItem.findMany({
      where: { clinicId, tenantId, origin: 'ODONTOGRAM_NAO_PLANEJADO', createdAt: { gte: new Date(today.getTime() - 90 * DAY) } },
      select: { patientId: true, tooth: true, procedure: true, createdAt: true, patient: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' }, take: 200
    }).catch(() => [])
    let open = fresh
    if (fresh.length) {
      const budgets = await prisma.budget.findMany({ where: { clinicId, tenantId, patientId: { in: [...new Set(fresh.map(f => f.patientId))] } }, select: { patientId: true, createdAt: true } }).catch(() => [])
      open = fresh.filter(f => !budgets.some(b => b.patientId === f.patientId && b.createdAt >= f.createdAt))
    }
    if (open.length) {
      const byPatient = new Map<string, string[]>()
      for (const f of open) byPatient.set(f.patient.fullName, [...(byPatient.get(f.patient.fullName) || []), `dente ${f.tooth ?? '—'} ${f.procedure}`])
      const lines = [...byPatient.entries()].slice(0, 8).map(([name, procs]) => `${name}: ${procs.join(', ')}`)
      items.push({ key: 'budget', label: `${open.length} procedimento(s) novo(s) fora do plano: passar orçamento ao paciente`, count: open.length, blocks: 0, lines, path: '/orcamentos-tratamentos' })
    }
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
    // Ordens de serviço enviadas ao laboratório: recebimento pendente, recusas, erros em aberto e entregas atrasadas (só aviso, não travam).
    const orders = await prisma.labServiceOrder.findMany({
      where: { clinicId, tenantId, createdAt: { gte: new Date(today.getTime() - 120 * DAY) } },
      select: { protocol: true, patientName: true, laboratoryName: true, status: true, dueAt: true, refusalReason: true, errors: true },
      orderBy: { createdAt: 'desc' }, take: 400
    }).catch(() => [])
    const line = (o: { protocol: string; patientName: string; laboratoryName: string }, extra = '') => `${o.protocol} · ${o.patientName} · ${o.laboratoryName}${extra}`
    const unreceived = orders.filter(o => o.status === 'SENT')
    if (unreceived.length) items.push({ key: 'lab-os-receipt', label: `${unreceived.length} ordem(ns) de serviço enviada(s) ao laboratório sem confirmação de recebimento`, count: unreceived.length, blocks: 0, lines: unreceived.slice(0, 6).map(o => line(o)), path: '/ordens-laboratorio' })
    const refused = orders.filter(o => o.status === 'REFUSED')
    if (refused.length) items.push({ key: 'lab-os-refused', label: `${refused.length} ordem(ns) de serviço RECUSADA(S) pelo laboratório: resolver o motivo e reenviar`, count: refused.length, blocks: 0, lines: refused.slice(0, 6).map(o => line(o, ` · motivo: ${o.refusalReason || 'não informado'}`)), path: '/ordens-laboratorio' })
    const withErrors = orders.filter(o => Array.isArray(o.errors) && (o.errors as Array<{ resolved?: boolean }>).some(e => !e.resolved))
    if (withErrors.length) items.push({ key: 'lab-os-errors', label: `${withErrors.length} ordem(ns) de serviço com erro em aberto (tratar com o responsável)`, count: withErrors.length, blocks: 0, lines: withErrors.slice(0, 6).map(o => line(o)), path: '/ordens-laboratorio' })
    const late = orders.filter(o => o.status === 'RECEIVED' && o.dueAt < today)
    if (late.length) items.push({ key: 'lab-os-late', label: `${late.length} ordem(ns) de serviço com entrega do laboratório atrasada`, count: late.length, blocks: 0, lines: late.slice(0, 6).map(o => line(o)), path: '/ordens-laboratorio' })
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
    const canManage = await isManager(userId, role)
    const profileCodes = role === 'ADMIN' ? null : await getUserProfileCodes(userId)
    const visibleKeys = visibleCategories(settings, profileCodes)

    const items = settings.enabled ? await computeItems(clinicId, tenantId, codes, visibleKeys, settings.mode === 'BLOCK') : []
    const total = items.reduce((sum, item) => sum + item.count, 0)
    const blockingTotal = items.reduce((sum, item) => sum + (item.blocks ?? item.count), 0)
    // Quem gerencia nunca é travado (precisa conseguir destravar os outros e mexer na configuração).
    const configured = (settings.lockedUserIds.includes(userId) || (profileCodes !== null && profileCodes.some(c => settings.lockDepartments.includes(c)))) && !canManage
    const blocked = settings.enabled && settings.mode === 'BLOCK' && configured && blockingTotal > 0 && !isUnlocked(settings, userId)

    if (configured && settings.enabled && settings.mode === 'BLOCK') {
      const lines = items.filter(i => (i.blocks ?? i.count) > 0).map(i => `• ${i.label}`)
      await trackLockEvent(settings, clinicId, tenantId, userId, blocked, blockingTotal === 0, lines).catch((e: unknown) => console.error('Falha ao registrar travamento:', e))
    }

    // Para quem está travado: trabalhos atrasados que podem ser resolvidos informando a comprovação da entrega.
    const blockingLabOrders = blocked && items.some(i => i.key === 'laboratory')
      ? (await prisma.labOrder.findMany({
          where: { clinicId, tenantId, deletedAt: null, deliveredAt: null, dueDate: { lt: startOfTodayBrt() } },
          select: { localId: true, patientName: true, workType: true, dentistName: true, dueDate: true },
          orderBy: { dueDate: 'asc' }, take: 20
        }).catch(() => []))
      : []

    // Para admin/gestor: quais telas estão travadas agora (cada usuário configurado, com as pendências que ele enxerga).
    let lockedUsers: Array<{ id: string; name: string; count: number }> = []
    if (canManage && settings.enabled && settings.mode === 'BLOCK') {
      const users = await prisma.user.findMany({
        where: { clinicId, tenantId, isActive: true, OR: [{ id: { in: settings.lockedUserIds } }, { accessProfiles: { some: { profile: { code: { in: settings.lockDepartments }, isActive: true } } } }] }, take: 200,
        select: { id: true, firstName: true, lastName: true, email: true, role: true }
      })
      for (const user of users) {
        if (user.role === 'ADMIN' || isUnlocked(settings, user.id)) continue
        const userCodes = await getUserPermissionCodes(user.id)
        if (await isManager(user.id, user.role)) continue
        const userItems = await computeItems(clinicId, tenantId, userCodes, visibleCategories(settings, await getUserProfileCodes(user.id)), true)
        const count = userItems.reduce((sum, item) => sum + (item.blocks ?? item.count), 0)
        if (count > 0) lockedUsers.push({ id: user.id, name: `${user.firstName} ${user.lastName}`.trim() || user.email, count })
      }
    }
    if (!canManage) lockedUsers = []

    return res.json({
      enabled: settings.enabled, mode: settings.mode, blocked, canManage, total, items, lockedUsers, visibleKeys, blockingLabOrders,
      settings: canManage ? { lockDepartments: settings.lockDepartments, lockedUserIds: settings.lockedUserIds, hasKey: Boolean(settings.keyHash), visibility: settings.visibility, categories: ALERT_CATEGORIES, profiles: await prisma.accessProfile.findMany({ where: { clinicId, isActive: true, code: { not: 'ADMIN' } }, select: { code: true, name: true }, orderBy: { code: 'asc' } }) } : undefined
    })
  } catch (error) {
    console.error('Erro ao carregar pendências:', error)
    return res.status(500).json({ error: 'Erro ao carregar pendências.' })
  }
}

export async function updateSettings(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, userId, role } = ctx(req)
    if (!(await isManager(userId, role))) return res.status(403).json({ error: 'Apenas o gestor ou o administrador podem alterar o travamento e os avisos.' })
    const current = await loadSettings(clinicId)
    const b = req.body || {}
    const next: Settings = { ...current, visibility: { ...current.visibility } }
    if (typeof b.enabled === 'boolean') next.enabled = b.enabled
    if (Array.isArray(b.lockDepartments)) {
      const codes = [...new Set((b.lockDepartments as unknown[]).map(v => String(v).toUpperCase().slice(0, 40)))]
      const valid = await prisma.accessProfile.findMany({ where: { clinicId, isActive: true, code: { in: codes, notIn: ['ADMIN', 'GESTOR'] } }, select: { code: true } })
      next.lockDepartments = valid.map(p => p.code)
      next.mode = next.lockDepartments.length ? 'BLOCK' : 'ALERT'
      await writeAudit({ clinicId, tenantId, actorId: userId, module: 'settings', action: 'PENDING_LOCK_DEPARTMENTS', summary: next.lockDepartments.length ? `Travamento diário ligado para: ${next.lockDepartments.join(', ')}.` : 'Travamento diário desligado.' }).catch((e: unknown) => console.error(e))
    }
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
    const { clinicId, tenantId, userId, role } = ctx(req)
    if (!(await isManager(userId, role))) return res.status(403).json({ error: 'Apenas o gestor ou o administrador podem destravar usuários.' })
    const target = String(req.body?.userId || '')
    const user = await prisma.user.findFirst({ where: { id: target, clinicId, tenantId }, select: { id: true, firstName: true, lastName: true } })
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
    // Novo prazo obrigatório: a tela fica liberada até o fim do dia escolhido (máx. 30 dias) e volta a travar se a pendência persistir.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(req.body?.deadline || ''))
    if (!m) return res.status(400).json({ error: 'Informe o novo prazo para resolver a pendência.' })
    const deadlineEnd = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999) + 3 * 3600000)
    if (Number.isNaN(deadlineEnd.getTime()) || deadlineEnd.getTime() < endOfTodayBrt().getTime()) return res.status(400).json({ error: 'O novo prazo não pode ser anterior a hoje.' })
    if (deadlineEnd.getTime() > endOfTodayBrt().getTime() + 30 * DAY) return res.status(400).json({ error: 'O prazo máximo é de 30 dias.' })
    const reason = String(req.body?.reason || '').trim().slice(0, 300)
    const settings = await loadSettings(clinicId)
    settings.unlocks[target] = deadlineEnd.toISOString()
    await saveSettings(clinicId, tenantId, settings)
    const deadlineLabel = `${m[3]}/${m[2]}/${m[1]}`
    await writeAudit({ clinicId, tenantId, actorId: userId, module: 'settings', action: 'PENDING_UNLOCK_BY_MANAGER', entityType: 'User', entityId: target, afterData: { deadline: m[0], reason }, summary: `Tela de ${user.firstName} ${user.lastName} destravada pelo gestor com novo prazo até ${deadlineLabel}${reason ? ` (${reason})` : ''}.` }).catch((e: unknown) => console.error(e))
    await notifyManagers(clinicId, tenantId, 'Pendência prorrogada', `A pendência de ${user.firstName} ${user.lastName} foi PROTELADA por ${await actorName(userId)}.\n\nNovo prazo: ${deadlineLabel}${reason ? `\nMotivo: ${reason}` : ''}\n\nSe a pendência persistir depois do prazo, a tela volta a travar.`)
    return res.json({ ok: true })
  } catch (error) {
    console.error('Erro ao destravar usuário:', error)
    return res.status(500).json({ error: 'Erro ao destravar.' })
  }
}


// Destrava resolvendo a pendência: dá baixa no trabalho com o código de entrega (nome de quem recebeu + data/hora).
export async function resolveLabDelivery(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, userId, role } = ctx(req)
    const localId = String(req.body?.localId || '').slice(0, 60)
    const code = String(req.body?.code || '')
    if (!localId) return res.status(400).json({ error: 'Trabalho não informado.' })
    if (!code.trim()) return res.status(400).json({ error: 'Informe o código de entrega.' })
    const codes = role === 'ADMIN' ? null : await getUserPermissionCodes(userId)
    if (codes !== null && !codes.includes('laboratory.view')) return res.status(403).json({ error: 'Sem permissão para resolver trabalhos do laboratório.' })
    const result = await deliverWithCode({ clinicId, tenantId, actorId: userId, localId, code, via: 'PENDING_UNLOCK' })
    if (!result.ok) return res.status(result.status).json({ error: result.error })
    return res.json({ ok: true })
  } catch (error) {
    console.error('Erro ao dar baixa com código:', error)
    return res.status(500).json({ error: 'Erro ao registrar a entrega.' })
  }
}


// O departamento trava e não consegue resolver: justifica por escrito. A tela é liberada até o fim do dia e o gestor recebe a justificativa por e-mail.
export async function justify(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, userId, role } = ctx(req)
    const text = String(req.body?.text || '').trim().slice(0, 1000)
    if (text.length < 20) return res.status(400).json({ error: 'Escreva a justificativa (pelo menos 20 caracteres).' })
    const settings = await loadSettings(clinicId)
    const codes = role === 'ADMIN' ? null : await getUserPermissionCodes(userId)
    const profileCodes = role === 'ADMIN' ? null : await getUserProfileCodes(userId)
    const items = await computeItems(clinicId, tenantId, codes, visibleCategories(settings, profileCodes), true)
    const lines = items.map(i => `• ${i.label}`)
    settings.unlocks[userId] = endOfTodayBrt().toISOString()
    await saveSettings(clinicId, tenantId, settings)
    const name = await actorName(userId)
    await writeAudit({ clinicId, tenantId, actorId: userId, module: 'settings', action: 'PENDING_JUSTIFIED', entityType: 'User', entityId: userId, afterData: { text }, summary: `Pendências justificadas por ${name}: ${text}` }).catch((e: unknown) => console.error(e))
    await notifyManagers(clinicId, tenantId, 'Pendência justificada', `${name} JUSTIFICOU a pendência e a tela foi liberada até o fim do dia.\n\nJustificativa: ${text}\n\n${lines.join('\n') || 'Sem pendências abertas no momento.'}\n\nSe não for resolvida, a tela volta a travar amanhã.`)
    return res.json({ ok: true })
  } catch (error) {
    console.error('Erro ao justificar pendência:', error)
    return res.status(500).json({ error: 'Erro ao registrar a justificativa.' })
  }
}


// Todo dia, depois das 9h (Brasília), o gestor recebe por e-mail o que ainda está sem resolver na clínica, por área.
// É o que cumpre o aviso mostrado aos departamentos: "se as pendências não forem resolvidas, seu gestor será notificado".
export async function sendManagerDigest(clinicId: string, tenantId: string, now = new Date()) {
  const settings = await loadSettings(clinicId)
  const brt = new Date(now.getTime() - 3 * 3600000)
  const today = brt.toISOString().slice(0, 10)
  if (!settings.enabled || brt.getUTCHours() < 9 || settings.lastDigest === today) return { skipped: true }
  const items = await computeItems(clinicId, tenantId, null, ALERT_CATEGORIES.map(c => c.key), false)
  if (!items.length) return { skipped: true }
  const lines = items.flatMap(i => [`• ${i.label}`, ...(i.lines || []).slice(0, 5).map(l => `    - ${l}`)])
  await notifyManagers(clinicId, tenantId, 'Pendências não resolvidas na clínica', `Estas pendências continuam sem resolução:\n\n${lines.join('\n')}\n\nOs departamentos foram avisados de que você é notificado. Acompanhe em Configurações > Avisos de pendências.`)
  await saveSettings(clinicId, tenantId, { ...settings, lastDigest: today })
  return { skipped: false, items: items.length }
}
