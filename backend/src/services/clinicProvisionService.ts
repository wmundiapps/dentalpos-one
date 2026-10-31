import { randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'

// Cria a clinica inicial (clinica, administrador, medico, agenda de segunda a sexta, almoco e horarios
// do agendamento online). Usada pelo EXPERIENCE (demo) e pelo cadastro com teste de 30 dias.

export function defaultOnlineTimes() {
  const values: string[] = []
  const lunchStart = 12 * 60
  const lunchEnd = 14 * 60
  for (let cursor = 8 * 60; cursor + 30 <= 18 * 60; cursor += 30) {
    const slotEnd = cursor + 30
    if (cursor < lunchEnd && slotEnd > lunchStart) continue
    values.push(`${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`)
  }
  return values
}

export interface StarterClinicInput {
  tenantId: string
  clinicName: string
  firstName: string
  lastName: string
  phone: string
  email: string
  passwordHash: string
  cnpj: string
  cro?: string
  specialty: string
  plan: string
  maxPatients: number
  // false = clinica e usuario nascem inativos (cadastro pago so ativa depois do cartao aceito).
  active?: boolean
  // Quando informado, liga o acesso temporario do EXPERIENCE (so demo).
  demoMetadata?: Prisma.InputJsonValue
}

export async function createStarterClinic(tx: Prisma.TransactionClient, input: StarterClinicInput) {
  const active = input.active !== false
  const { tenantId } = input
  const clinic = await tx.clinic.create({
    data: {
      tenantId,
      name: input.clinicName,
      displayName: input.clinicName,
      email: input.email,
      phone: input.phone,
      cnpj: input.cnpj,
      plan: input.plan,
      language: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      maxDoctors: 1,
      maxPatients: input.maxPatients,
      isActive: active,
    },
  })

  const user = await tx.user.create({
    data: {
      clinicId: clinic.id,
      tenantId,
      email: input.email,
      password: input.passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      role: 'ADMIN',
      isActive: active,
    },
  })

  const doctor = await tx.doctor.create({
    data: {
      clinicId: clinic.id,
      tenantId,
      userId: user.id,
      cro: input.cro || `NOVO-${randomUUID().slice(0, 8).toUpperCase()}`,
      specialty: input.specialty,
      isActive: true,
    },
  })

  await tx.schedule.createMany({
    data: [1, 2, 3, 4, 5].map(dayOfWeek => ({
      clinicId: clinic.id,
      tenantId,
      userId: user.id,
      doctorId: doctor.id,
      dayOfWeek,
      startTime: '08:00',
      endTime: '18:00',
      slotDuration: 30,
    })),
  })

  if (input.demoMetadata) {
    await tx.tenantFeatureFlag.create({
      data: { clinicId: clinic.id, tenantId, key: 'DEMO_ACCESS', enabled: true, rolloutStage: 'PILOT', metadata: input.demoMetadata },
    })
  }

  await tx.tenantFeatureFlag.create({
    data: {
      clinicId: clinic.id,
      tenantId,
      key: 'AGENDA_RECURRING_BREAKS',
      enabled: true,
      rolloutStage: 'PILOT',
      metadata: {
        version: 1,
        breaks: [1, 2, 3, 4, 5].map(dayOfWeek => ({
          id: randomUUID(),
          doctorId: doctor.id,
          dayOfWeek,
          startTime: '12:00',
          endTime: '14:00',
          reason: 'Almoço',
        })),
      },
    },
  })

  const onlineTimes = defaultOnlineTimes()
  await tx.tenantFeatureFlag.create({
    data: {
      clinicId: clinic.id,
      tenantId,
      key: 'ONLINE_BOOKING_SLOTS',
      enabled: true,
      rolloutStage: 'PILOT',
      metadata: {
        version: 1,
        slots: { [doctor.id]: Object.fromEntries([1, 2, 3, 4, 5].map(day => [String(day), onlineTimes])) },
      },
    },
  })

  return {
    clinicId: clinic.id,
    tenantId,
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    doctorId: doctor.id,
  }
}
