import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AcademicRole } from '../academico/middleware'
import { scheduleReminder, ReminderInput } from '../core/reminders'
import { dateISO } from '../core/crud'

export const MOD = 'governanca'

// Papéis. ADMIN/OWNER/RECTOR/BOARD sempre têm acesso total (requireRole).
export const READ: AcademicRole[] = ['COORDINATOR', 'TEACHER', 'SECRETARY', 'STAFF', 'FINANCE', 'FACILITIES']
export const WRITE: AcademicRole[] = ['COORDINATOR', 'SECRETARY']
export const WRITE_CIPA: AcademicRole[] = ['FACILITIES', 'STAFF', 'SECRETARY']
export const READ_RH: AcademicRole[] = ['SECRETARY', 'FINANCE']       // carreira/salários: dado sensível
export const WRITE_RH: AcademicRole[] = ['SECRETARY']

export const DAY = 86_400_000
export const optDate = () => dateISO().optional()
export const optDateNull = () => z.preprocess((v) => (v === '' ? undefined : v), dateISO().optional())

export function fail(status: number, msg: string): never {
  throw Object.assign(new Error(msg), { status })
}

export const fmtData = (d?: Date | null) => (d ? d.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—')
export const ymd = (d: Date) => d.toISOString().slice(0, 10)

// Agenda lembrete e, se já existia concluído/cancelado com a mesma chave, reativa.
export async function ensureReminder(input: ReminderInput) {
  const r = await scheduleReminder({ ...input, modulo: input.modulo || MOD })
  if (input.dedupeKey && (r.status === 'CANCELADO' || r.status === 'CONCLUIDO')) {
    await prisma.eduReminder.update({ where: { id: r.id }, data: { status: 'PENDENTE', concluidoEm: null } })
  }
  return r
}

// Cancela lembretes de um registro cujo dedupeKey comece com prefixo e não esteja entre os mantidos.
export async function cancelStaleReminders(tenantId: string, prefix: string, keep: string[]) {
  return prisma.eduReminder.updateMany({
    where: { tenantId, dedupeKey: { startsWith: prefix, notIn: keep.length ? keep : ['__none__'] }, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } },
    data: { status: 'CANCELADO' },
  })
}

export async function cancelByKey(tenantId: string, dedupeKey: string) {
  return prisma.eduReminder.updateMany({
    where: { tenantId, dedupeKey, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } },
    data: { status: 'CANCELADO' },
  })
}

export async function proximoNumero(tenantId: string, chave: string, ano: number): Promise<number> {
  const row = await prisma.govSequencia.upsert({
    where: { tenantId_chave_ano: { tenantId, chave, ano } },
    create: { tenantId, chave, ano, ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  })
  return row.ultimo
}

export async function assertProgram(tenantId: string, programId?: string | null) {
  if (!programId) return
  const p = await prisma.academicProgram.findFirst({ where: { id: programId, tenantId }, select: { id: true } })
  if (!p) fail(400, 'Curso (programId) não encontrado neste tenant.')
}

export const STATUS_ACAO = ['PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'] as const
export const SEGMENTOS = ['DOCENTE', 'DISCENTE', 'TECNICO_ADMINISTRATIVO', 'SOCIEDADE_CIVIL'] as const
export const TITULACOES = ['GRADUADO', 'ESPECIALISTA', 'MESTRE', 'DOUTOR'] as const
