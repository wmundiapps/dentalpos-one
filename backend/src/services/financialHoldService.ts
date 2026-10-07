import { prisma } from '../lib/prisma'

// Pendência financeira x agenda: paciente com cobrança vencida pode marcar UM horário; enquanto a pendência não for
// regularizada, novos agendamentos são recusados. A regra é da clínica (gestor liga/desliga) e fica na flag FINANCIAL_HOLD.
export const FLAG_KEY = 'FINANCIAL_HOLD'
const DAY = 86400000
export type HoldSettings = { enabled: boolean; graceDays: number }
export type HoldEntry = {
  id: string; description: string; amount: number; dueDate: string; daysOverdue: number
  charge: { id: string; billingType: string; invoiceUrl: string | null; pixCopyPaste: string | null; digitableLine: string | null } | null
}
export type HoldInfo = { enabled: boolean; hasPending: boolean; blocked: boolean; total: number; futureAppointments: number; entries: HoldEntry[] }

const startOfTodayBrt = (now = new Date()) => new Date(`${new Date(now.getTime() - 3 * 3600000).toISOString().slice(0, 10)}T00:00:00-03:00`)

export async function loadHoldSettings(clinicId: string): Promise<HoldSettings> {
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: FLAG_KEY } } })
  const m = (row?.metadata || {}) as { graceDays?: number }
  // Sem configuração gravada a regra vale (ligada), com carência de 0 dia.
  return { enabled: row ? row.enabled : true, graceDays: Math.min(60, Math.max(0, Math.round(Number(m.graceDays) || 0))) }
}

export async function saveHoldSettings(clinicId: string, tenantId: string, s: HoldSettings) {
  const metadata = { graceDays: s.graceDays }
  await prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId, key: FLAG_KEY } },
    update: { enabled: s.enabled, metadata },
    create: { clinicId, tenantId, key: FLAG_KEY, enabled: s.enabled, rolloutStage: 'GA', metadata },
  })
}

export async function getHold(clinicId: string, tenantId: string, patientId: string, now = new Date()): Promise<HoldInfo> {
  const settings = await loadHoldSettings(clinicId)
  if (!settings.enabled) return { enabled: false, hasPending: false, blocked: false, total: 0, futureAppointments: 0, entries: [] }
  const limit = new Date(startOfTodayBrt(now).getTime() - settings.graceDays * DAY)
  const rows = await prisma.financialEntry.findMany({
    where: { clinicId, tenantId, patientId, type: 'INCOME', status: { notIn: ['PAID', 'CANCELLED'] }, dueDate: { lt: limit } },
    select: { id: true, description: true, amount: true, dueDate: true }, orderBy: { dueDate: 'asc' }, take: 50,
  })
  const charges = rows.length
    ? await prisma.receivableCharge.findMany({
        where: { clinicId, financialEntryId: { in: rows.map(r => r.id) }, status: { notIn: ['PAGO', 'CANCELADO'] } },
        select: { id: true, financialEntryId: true, billingType: true, invoiceUrl: true, pixCopyPaste: true, digitableLine: true }, orderBy: { createdAt: 'desc' },
      }).catch(() => [])
    : []
  const entries: HoldEntry[] = rows.map(r => {
    const c = charges.find(x => x.financialEntryId === r.id)
    return {
      id: r.id, description: r.description, amount: Number(r.amount), dueDate: r.dueDate.toISOString(),
      daysOverdue: Math.max(1, Math.floor((now.getTime() - r.dueDate.getTime()) / DAY)),
      charge: c ? { id: c.id, billingType: c.billingType, invoiceUrl: c.invoiceUrl, pixCopyPaste: c.pixCopyPaste, digitableLine: c.digitableLine } : null,
    }
  })
  const futureAppointments = await prisma.appointment.count({
    where: { clinicId, tenantId, patientId, scheduledAt: { gt: now }, status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] } },
  })
  const hasPending = entries.length > 0
  return { enabled: true, hasPending, blocked: hasPending && futureAppointments >= 1, total: entries.reduce((s, e) => s + e.amount, 0), futureAppointments, entries }
}

export function holdMessage(info: HoldInfo) {
  const total = info.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return info.blocked
    ? `Este paciente tem pendência financeira em aberto (${total}) e já possui um horário marcado. Para marcar outro horário, regularize antes: reemita o boleto, gere o Pix ou receba no cartão.`
    : `Este paciente tem pendência financeira em aberto (${total}). Será permitido apenas este agendamento; novos horários só depois de regularizar.`
}
