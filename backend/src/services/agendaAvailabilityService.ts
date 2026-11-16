import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { nationalHolidays } from '../lib/holidays'

const BLOCK_FLAG = 'AGENDA_BLOCKS'
const RECURRING_BREAK_FLAG = 'AGENDA_RECURRING_BREAKS'
const FIXED_INTERVALS = [10, 15, 30, 45, 60]

export type WorkBlock = {
  startTime: string
  endTime: string
  step: number
}

export type AgendaBlock = {
  id: string
  doctorId: string | null
  startAt: string
  endAt: string
  reason: string
}

export type RecurringBreak = {
  id: string
  doctorId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  reason: string
}

export const DEFAULT_WORK_BLOCKS: WorkBlock[] = [
  { startTime: '08:00', endTime: '18:00', step: 30 },
]

export function clockMinutes(value: string) {
  const [hour, minute] = String(value).split(':').map(Number)
  return hour * 60 + minute
}

export function validClock(value: unknown) {
  const text = String(value || '')
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(text)
}

export function validateScheduleConfig(input: {
  dayOfWeek: unknown
  startTime: unknown
  endTime: unknown
  slotDuration: unknown
}) {
  const dayOfWeek = Number(input.dayOfWeek)
  const startTime = String(input.startTime || '')
  const endTime = String(input.endTime || '')
  const slotDuration = Number(input.slotDuration)

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return { error: 'Dia da semana inválido.' as const }
  }
  if (!validClock(startTime) || !validClock(endTime)) {
    return { error: 'Horário inválido.' as const }
  }

  const start = clockMinutes(startTime)
  const end = clockMinutes(endTime)
  if (end <= start) {
    return { error: 'O final da jornada deve ser posterior ao início.' as const }
  }

  const blockMinutes = end - start
  const validDuration =
    Number.isInteger(slotDuration) &&
    slotDuration >= 10 &&
    slotDuration <= blockMinutes &&
    (FIXED_INTERVALS.includes(slotDuration) || slotDuration === blockMinutes)

  if (!validDuration) {
    return {
      error: 'Intervalo deve ser 10, 15, 30, 45, 60 minutos ou o período inteiro.' as const,
    }
  }

  return { dayOfWeek, startTime, endTime, slotDuration, start, end, blockMinutes }
}

export async function getWorkBlocks(
  clinicId: string,
  tenantId: string,
  doctorId: string,
  dayOfWeek: number,
): Promise<WorkBlock[]> {
  const rows = await prisma.schedule.findMany({
    where: { clinicId, tenantId, doctorId, dayOfWeek },
    orderBy: { startTime: 'asc' },
  })

  if (!rows.length) return DEFAULT_WORK_BLOCKS

  return rows.map(row => ({
    startTime: row.startTime,
    endTime: row.endTime,
    step: Math.max(10, row.slotDuration || 30),
  }))
}

export function fitsWorkBlocks(
  blocks: WorkBlock[],
  minuteOfDay: number,
  durationMinutes: number,
) {
  return blocks.some(block => {
    const start = clockMinutes(block.startTime)
    const end = clockMinutes(block.endTime)
    const step = Math.max(10, block.step || 30)
    return (
      minuteOfDay >= start &&
      minuteOfDay + durationMinutes <= end &&
      (minuteOfDay - start) % step === 0
    )
  })
}

function saoPauloClock(date: Date) {
  const weekdayText = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  }).format(date)
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0)
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0)

  return {
    dayOfWeek: weekdayMap[weekdayText] ?? 0,
    minuteOfDay: hour * 60 + minute,
  }
}

export async function fitsWorkSchedule(
  clinicId: string,
  tenantId: string,
  doctorId: string,
  scheduledAt: Date,
  durationMinutes: number,
) {
  const local = saoPauloClock(scheduledAt)
  const blocks = await getWorkBlocks(clinicId, tenantId, doctorId, local.dayOfWeek)
  return fitsWorkBlocks(blocks, local.minuteOfDay, durationMinutes)
}

function normalizeAgendaBlock(value: unknown): AgendaBlock | undefined {
  if (!value || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  const start = new Date(String(row.startAt || ''))
  const end = new Date(String(row.endAt || ''))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return undefined
  }

  return {
    id: String(row.id || randomUUID()),
    doctorId: row.doctorId ? String(row.doctorId) : null,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    reason: String(row.reason || 'Agenda bloqueada').trim() || 'Agenda bloqueada',
  }
}

const holidayYearsOf = (metadata: Record<string, unknown>) =>
  Array.isArray(metadata.holidayYears) ? metadata.holidayYears.map(Number).filter(Number.isFinite) : []

// Feriados nacionais entram sozinhos como dias fechados (agenda toda, todos os profissionais) do ano atual e do próximo.
// Cada ano entra uma única vez: se a clínica abrir num feriado e remover o bloqueio, ele não volta.
async function seedHolidayBlocks(clinicId: string, row: { tenantId: string; metadata: unknown } | null) {
  const year = Number(new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 4))
  const metadata = (row?.metadata || {}) as Record<string, unknown>
  const done = holidayYearsOf(metadata)
  const missing = [year, year + 1].filter(y => !done.includes(y))
  if (!missing.length) return
  const tenantId = row?.tenantId || (await prisma.clinic.findUnique({ where: { id: clinicId }, select: { tenantId: true } }))?.tenantId
  if (!tenantId) return
  const current = (Array.isArray(metadata.blocks) ? metadata.blocks : [])
    .map(normalizeAgendaBlock)
    .filter((item): item is AgendaBlock => Boolean(item))
  const known = new Set(current.map(b => b.id))
  const next = new Date(0)
  for (const y of missing) {
    for (const h of nationalHolidays(y)) {
      const id = `feriado-${h.date}`
      if (known.has(id)) continue
      next.setTime(new Date(`${h.date}T00:00:00-03:00`).getTime() + 86400000)
      current.push({ id, doctorId: null, startAt: new Date(`${h.date}T00:00:00-03:00`).toISOString(), endAt: next.toISOString(), reason: `Feriado nacional: ${h.name}` })
    }
  }
  await persistAgendaBlocks(clinicId, tenantId, current, [...done, ...missing])
}

export async function listAgendaBlocks(clinicId: string): Promise<AgendaBlock[]> {
  let row = await prisma.tenantFeatureFlag.findUnique({
    where: { clinicId_key: { clinicId, key: BLOCK_FLAG } },
  })
  try {
    const year = Number(new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 4))
    const done = holidayYearsOf((row?.metadata || {}) as Record<string, unknown>)
    if (![year, year + 1].every(y => done.includes(y))) {
      await seedHolidayBlocks(clinicId, row)
      row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: BLOCK_FLAG } } })
    }
  } catch (error) {
    console.error('Falha ao incluir feriados na agenda:', error instanceof Error ? error.message : error)
  }
  const metadata = (row?.metadata || {}) as Record<string, unknown>
  const raw = Array.isArray(metadata.blocks) ? metadata.blocks : []
  return raw
    .map(normalizeAgendaBlock)
    .filter((item): item is AgendaBlock => Boolean(item))
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
}

async function persistAgendaBlocks(
  clinicId: string,
  tenantId: string,
  blocks: AgendaBlock[],
  holidayYears?: number[],
) {
  // Mantém a lista de anos de feriados já incluídos (senão um feriado removido pela clínica voltaria).
  const years = holidayYears ?? holidayYearsOf(((await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: BLOCK_FLAG } } }))?.metadata || {}) as Record<string, unknown>)
  const metadata = { version: 1, blocks, holidayYears: years } as unknown as Parameters<typeof prisma.tenantFeatureFlag.upsert>[0]['create']['metadata']
  await prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId, key: BLOCK_FLAG } },
    update: {
      enabled: true,
      rolloutStage: 'PILOT',
      metadata,
    },
    create: {
      clinicId,
      tenantId,
      key: BLOCK_FLAG,
      enabled: true,
      rolloutStage: 'PILOT',
      metadata,
    },
  })
}

export async function addAgendaBlock(input: {
  clinicId: string
  tenantId: string
  doctorId?: string | null
  startAt: unknown
  endAt: unknown
  reason?: unknown
}) {
  const start = new Date(String(input.startAt || ''))
  const end = new Date(String(input.endAt || ''))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new Error('Período de bloqueio inválido.')
  }

  const block: AgendaBlock = {
    id: randomUUID(),
    doctorId: input.doctorId ? String(input.doctorId) : null,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    reason: String(input.reason || 'Compromisso / indisponibilidade').trim() || 'Compromisso / indisponibilidade',
  }

  const blocks = await listAgendaBlocks(input.clinicId)
  blocks.push(block)
  await persistAgendaBlocks(input.clinicId, input.tenantId, blocks)
  return block
}

export async function removeAgendaBlock(
  clinicId: string,
  tenantId: string,
  blockId: string,
) {
  const blocks = await listAgendaBlocks(clinicId)
  const next = blocks.filter(block => block.id !== blockId)
  if (next.length === blocks.length) return false
  await persistAgendaBlocks(clinicId, tenantId, next)
  return true
}

export function isAgendaBlocked(
  blocks: AgendaBlock[],
  doctorId: string,
  start: Date,
  end: Date,
) {
  const incomingStart = start.getTime()
  const incomingEnd = end.getTime()
  return blocks.some(block => {
    if (block.doctorId && block.doctorId !== doctorId) return false
    const blockStart = new Date(block.startAt).getTime()
    const blockEnd = new Date(block.endAt).getTime()
    return blockStart < incomingEnd && blockEnd > incomingStart
  })
}

function normalizeRecurringBreak(value: unknown): RecurringBreak | undefined {
  if (!value || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  const doctorId = String(row.doctorId || '')
  const dayOfWeek = Number(row.dayOfWeek)
  const startTime = String(row.startTime || '')
  const endTime = String(row.endTime || '')
  if (
    !doctorId ||
    !Number.isInteger(dayOfWeek) ||
    dayOfWeek < 0 ||
    dayOfWeek > 6 ||
    !validClock(startTime) ||
    !validClock(endTime) ||
    clockMinutes(endTime) <= clockMinutes(startTime)
  ) {
    return undefined
  }

  return {
    id: String(row.id || randomUUID()),
    doctorId,
    dayOfWeek,
    startTime,
    endTime,
    reason: String(row.reason || 'Intervalo').trim() || 'Intervalo',
  }
}

const seededDoctorsOf = (metadata: Record<string, unknown>) =>
  Array.isArray(metadata.lunchSeeded) ? metadata.lunchSeeded.map(String) : []

// Almoço fechado por padrão para TODOS os profissionais (12:00 às 13:59, nos dias em que atendem).
// Cada profissional entra uma única vez: se a clínica remover o almoço dele, não volta. Profissional novo ganha o almoço sozinho.
async function seedLunchBreaks(clinicId: string, row: { tenantId: string; metadata: unknown } | null) {
  const metadata = (row?.metadata || {}) as Record<string, unknown>
  const seeded = seededDoctorsOf(metadata)
  const doctors = await prisma.doctor.findMany({ where: { clinicId, isActive: true }, select: { id: true, tenantId: true } })
  const pending = doctors.filter(d => !seeded.includes(d.id))
  if (!pending.length) return
  const tenantId = row?.tenantId || pending[0].tenantId
  const schedules = await prisma.schedule.findMany({ where: { clinicId, doctorId: { in: pending.map(d => d.id) } }, select: { doctorId: true, dayOfWeek: true } })
  const current = (Array.isArray(metadata.breaks) ? metadata.breaks : [])
    .map(normalizeRecurringBreak)
    .filter((item): item is RecurringBreak => Boolean(item))
  for (const doctor of pending) {
    const days = [...new Set(schedules.filter(x => x.doctorId === doctor.id).map(x => x.dayOfWeek))]
    for (const day of days.length ? days : [1, 2, 3, 4, 5]) {
      const covered = current.some(b => b.doctorId === doctor.id && b.dayOfWeek === day && clockMinutes(b.startTime) < 14 * 60 && clockMinutes(b.endTime) > 12 * 60)
      if (!covered) current.push({ id: randomUUID(), doctorId: doctor.id, dayOfWeek: day, startTime: '12:00', endTime: '14:00', reason: 'Almoço' })
    }
  }
  await persistRecurringBreaks(clinicId, tenantId, current, [...seeded, ...pending.map(d => d.id)])
}

export async function listRecurringBreaks(clinicId: string): Promise<RecurringBreak[]> {
  let row = await prisma.tenantFeatureFlag.findUnique({
    where: { clinicId_key: { clinicId, key: RECURRING_BREAK_FLAG } },
  })
  try {
    await seedLunchBreaks(clinicId, row)
    row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: RECURRING_BREAK_FLAG } } })
  } catch (error) {
    console.error('Falha ao incluir almoço na agenda:', error instanceof Error ? error.message : error)
  }
  const metadata = (row?.metadata || {}) as Record<string, unknown>
  const raw = Array.isArray(metadata.breaks) ? metadata.breaks : []
  return raw
    .map(normalizeRecurringBreak)
    .filter((item): item is RecurringBreak => Boolean(item))
    .sort((a, b) =>
      `${a.doctorId}-${a.dayOfWeek}-${a.startTime}`.localeCompare(
        `${b.doctorId}-${b.dayOfWeek}-${b.startTime}`,
      ),
    )
}

async function persistRecurringBreaks(
  clinicId: string,
  tenantId: string,
  breaks: RecurringBreak[],
  lunchSeeded?: string[],
) {
  // Mantém a lista de profissionais que já receberam o almoço padrão (senão um almoço removido voltaria).
  const seeded = lunchSeeded ?? seededDoctorsOf(((await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: RECURRING_BREAK_FLAG } } }))?.metadata || {}) as Record<string, unknown>)
  const metadata = { version: 1, breaks, lunchSeeded: seeded } as unknown as Parameters<typeof prisma.tenantFeatureFlag.upsert>[0]['create']['metadata']
  await prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId, key: RECURRING_BREAK_FLAG } },
    update: {
      enabled: true,
      rolloutStage: 'PILOT',
      metadata,
    },
    create: {
      clinicId,
      tenantId,
      key: RECURRING_BREAK_FLAG,
      enabled: true,
      rolloutStage: 'PILOT',
      metadata,
    },
  })
}

export async function addRecurringBreaks(input: {
  clinicId: string
  tenantId: string
  doctorId: string
  dayOfWeeks: unknown[]
  startTime: unknown
  endTime: unknown
  reason?: unknown
}) {
  const dayOfWeeks = Array.from(
    new Set((Array.isArray(input.dayOfWeeks) ? input.dayOfWeeks : []).map(Number)),
  ).sort((a, b) => a - b)
  const startTime = String(input.startTime || '')
  const endTime = String(input.endTime || '')

  if (
    !input.doctorId ||
    !dayOfWeeks.length ||
    dayOfWeeks.some(day => !Number.isInteger(day) || day < 0 || day > 6) ||
    !validClock(startTime) ||
    !validClock(endTime) ||
    clockMinutes(endTime) <= clockMinutes(startTime)
  ) {
    throw new Error('Intervalo fixo inválido.')
  }

  const current = await listRecurringBreaks(input.clinicId)
  const start = clockMinutes(startTime)
  const end = clockMinutes(endTime)

  for (const dayOfWeek of dayOfWeeks) {
    const overlap = current.find(item => {
      if (item.doctorId !== input.doctorId || item.dayOfWeek !== dayOfWeek) return false
      const itemStart = clockMinutes(item.startTime)
      const itemEnd = clockMinutes(item.endTime)
      return itemStart < end && itemEnd > start
    })
    if (overlap) {
      throw new Error(
        `Já existe intervalo fixo sobreposto no dia ${dayOfWeek}: ${overlap.startTime}–${overlap.endTime}.`,
      )
    }
  }

  const reason = String(input.reason || 'Intervalo').trim() || 'Intervalo'
  const created = dayOfWeeks.map(dayOfWeek => ({
    id: randomUUID(),
    doctorId: input.doctorId,
    dayOfWeek,
    startTime,
    endTime,
    reason,
  }))

  await persistRecurringBreaks(
    input.clinicId,
    input.tenantId,
    [...current, ...created],
  )
  return created
}

export async function addRecurringBreak(input: {
  clinicId: string
  tenantId: string
  doctorId: string
  dayOfWeek: unknown
  startTime: unknown
  endTime: unknown
  reason?: unknown
}) {
  const created = await addRecurringBreaks({
    clinicId: input.clinicId,
    tenantId: input.tenantId,
    doctorId: input.doctorId,
    dayOfWeeks: [input.dayOfWeek],
    startTime: input.startTime,
    endTime: input.endTime,
    reason: input.reason,
  })
  return created[0]
}

export async function removeRecurringBreak(
  clinicId: string,
  tenantId: string,
  breakId: string,
) {
  const current = await listRecurringBreaks(clinicId)
  const next = current.filter(item => item.id !== breakId)
  if (next.length === current.length) return false
  await persistRecurringBreaks(clinicId, tenantId, next)
  return true
}

export function isRecurringBreakBlockedByClock(
  breaks: RecurringBreak[],
  doctorId: string,
  dayOfWeek: number,
  startMinute: number,
  endMinute: number,
) {
  return breaks.some(item => {
    if (item.doctorId !== doctorId || item.dayOfWeek !== dayOfWeek) return false
    const breakStart = clockMinutes(item.startTime)
    const breakEnd = clockMinutes(item.endTime)
    return breakStart < endMinute && breakEnd > startMinute
  })
}

export function isRecurringBreakBlocked(
  breaks: RecurringBreak[],
  doctorId: string,
  scheduledAt: Date,
  durationMinutes: number,
) {
  const local = saoPauloClock(scheduledAt)
  return isRecurringBreakBlockedByClock(
    breaks,
    doctorId,
    local.dayOfWeek,
    local.minuteOfDay,
    local.minuteOfDay + durationMinutes,
  )
}
