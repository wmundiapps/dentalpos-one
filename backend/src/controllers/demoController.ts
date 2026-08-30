import { randomUUID } from 'crypto'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { hashPassword } from '../services/userService'
import {
  createDemoMetadata,
  demoOptions,
  getDemoAccess,
} from '../services/demoAccessService'

function normalizedText(value: unknown) {
  return String(value || '').trim()
}

function normalizedEmail(value: unknown) {
  return normalizedText(value).toLowerCase()
}

function defaultOnlineTimes() {
  const values: string[] = []
  const lunchStart = 12 * 60
  const lunchEnd = 14 * 60

  for (let cursor = 8 * 60; cursor + 30 <= 18 * 60; cursor += 30) {
    const slotEnd = cursor + 30
    if (cursor < lunchEnd && slotEnd > lunchStart) continue
    values.push(
      `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`,
    )
  }

  return values
}

export async function config(_req: Request, res: Response) {
  const options = demoOptions()
  return res.json({
    enabled: options.enabled,
    durationDays: options.durationDays,
    graceDays: options.graceDays,
    modules: options.modules,
    termsVersion: options.termsVersion,
    temporary: true,
    message:
      'A demonstração é gratuita e temporária. Após o prazo informado, a continuidade dependerá de contratação.',
  })
}

export async function register(req: Request, res: Response) {
  try {
    const options = demoOptions()
    if (!options.enabled) {
      return res.status(403).json({
        code: 'DEMO_REGISTRATION_DISABLED',
        error: 'O cadastro de novas demonstrações não está habilitado neste ambiente.',
      })
    }

    const clinicName = normalizedText(req.body?.clinicName)
    const firstName = normalizedText(req.body?.firstName)
    const lastName = normalizedText(req.body?.lastName)
    const phone = normalizedText(req.body?.phone)
    const email = normalizedEmail(req.body?.email)
    const password = String(req.body?.password || '')
    const cro = normalizedText(req.body?.cro)
    const specialty = normalizedText(req.body?.specialty) || 'Clínica geral'
    const acceptTerms = req.body?.acceptTerms === true

    if (!clinicName || !firstName || !lastName || !phone || !email || !password) {
      return res.status(400).json({
        error: 'Clínica, nome, sobrenome, WhatsApp, e-mail e senha são obrigatórios.',
      })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' })
    }

    if (password.length < 10) {
      return res.status(400).json({ error: 'A senha deve possuir pelo menos 10 caracteres.' })
    }

    if (!acceptTerms) {
      return res.status(400).json({
        error: 'É necessário aceitar os termos da demonstração gratuita e temporária.',
      })
    }

    const duplicate = await prisma.user.findFirst({
      where: { email, isActive: true },
      select: { id: true },
    })
    if (duplicate) {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_IN_USE',
        error:
          'Este e-mail já possui acesso ao DentalPos One. Use outro e-mail ou entre com a conta existente.',
      })
    }

    const tenantId = `demo-${randomUUID()}`
    const cnpj = `DEMO-${randomUUID().replace(/-/g, '').slice(0, 14).toUpperCase()}`
    const passwordHash = await hashPassword(password)
    const metadata = createDemoMetadata({
      durationDays: options.durationDays,
      graceDays: options.graceDays,
      modules: options.modules,
      termsVersion: options.termsVersion,
    })
    const onlineTimes = defaultOnlineTimes()

    const created = await prisma.$transaction(async tx => {
      const clinic = await tx.clinic.create({
        data: {
          tenantId,
          name: clinicName,
          displayName: clinicName,
          email,
          phone,
          cnpj,
          plan: 'DEMO',
          language: 'pt-BR',
          timezone: 'America/Sao_Paulo',
          maxDoctors: 1,
          maxPatients: 500,
          isActive: true,
        },
      })

      const user = await tx.user.create({
        data: {
          clinicId: clinic.id,
          tenantId,
          email,
          password: passwordHash,
          firstName,
          lastName,
          phone,
          role: 'ADMIN',
          isActive: true,
        },
      })

      const doctor = await tx.doctor.create({
        data: {
          clinicId: clinic.id,
          tenantId,
          userId: user.id,
          cro: cro || `DEMO-${randomUUID().slice(0, 8).toUpperCase()}`,
          specialty,
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

      await tx.tenantFeatureFlag.create({
        data: {
          clinicId: clinic.id,
          tenantId,
          key: 'DEMO_ACCESS',
          enabled: true,
          rolloutStage: 'PILOT',
          metadata,
        },
      })

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

      const slots = Object.fromEntries(
        [1, 2, 3, 4, 5].map(day => [String(day), onlineTimes]),
      )

      await tx.tenantFeatureFlag.create({
        data: {
          clinicId: clinic.id,
          tenantId,
          key: 'ONLINE_BOOKING_SLOTS',
          enabled: true,
          rolloutStage: 'PILOT',
          metadata: {
            version: 1,
            slots: {
              [doctor.id]: slots,
            },
          },
        },
      })

      return {
        clinicId: clinic.id,
        tenantId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        doctorId: doctor.id,
      }
    })

    const demo = await getDemoAccess(created.clinicId)

    return res.status(201).json({
      clinicId: created.clinicId,
      email: created.email,
      user: {
        firstName: created.firstName,
        lastName: created.lastName,
      },
      demo,
      message:
        'Demo criada com sucesso. Guarde o ID da clínica, o e-mail e a senha escolhida.',
    })
  } catch (error) {
    console.error('Erro ao provisionar demonstração:', error)
    return res.status(500).json({
      error: 'Não foi possível criar a demonstração neste momento.',
    })
  }
}
