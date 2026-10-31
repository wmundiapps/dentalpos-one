import { randomUUID } from 'crypto'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { hashPassword } from '../services/userService'
import { createStarterClinic } from '../services/clinicProvisionService'
import { dispatchRevah } from '../services/revahProviderService'
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

function resendCredentials() {
  const apiKey = process.env.RESEND_API_KEY || ''
  return {
    apiKey,
    from: 'DentalPos <contato@dentalpos.com.br>',
  }
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
          'Este e-mail já possui acesso ao DentalPos. Use outro e-mail ou entre com a conta existente.',
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
    const created = await prisma.$transaction(tx =>
      createStarterClinic(tx, {
        tenantId,
        clinicName,
        firstName,
        lastName,
        phone,
        email,
        passwordHash,
        cnpj,
        cro: cro || `DEMO-${randomUUID().slice(0, 8).toUpperCase()}`,
        specialty,
        plan: 'DEMO',
        maxPatients: 500,
        demoMetadata: metadata,
      }),
    )

    const demo = await getDemoAccess(created.clinicId)

    try {
      const credentials = resendCredentials()
      if (credentials.apiKey) {
        const validUntil = demo.endAt
          ? new Date(demo.endAt).toLocaleDateString('pt-BR')
          : null
        const welcomeContent = [
          `Olá ${created.firstName},`,
          '',
          `Sua demonstração gratuita do DentalPos para a clínica "${clinicName}" está pronta.`,
          '',
          `Acesse: https://app.dentalpos.com.br/`,
          `E-mail de login: ${created.email}`,
          `Senha: a que você cadastrou agora`,
          validUntil ? `Demo gratuita válida até: ${validUntil}` : null,
          '',
          'Dentro do sistema, na última página do menu, tem um espaço dedicado para sugestões, elogios ou reclamações — fique à vontade para nos contar o que achou.',
          '',
          'Qualquer dúvida, estamos à disposição pelo WhatsApp: (44) 98453-5069.',
          '',
          'Equipe DentalPos',
          'Você só precisa atender.',
        ].filter((line): line is string => line !== null).join('\n')

        await dispatchRevah('EMAIL', created.email, welcomeContent, {
          ...credentials,
          subject: 'Seu acesso à demonstração do DentalPos está pronto',
        })

        const adminContent = [
          'Novo demo criado no DentalPos:',
          '',
          `Clínica: ${clinicName}`,
          `Responsável: ${created.firstName} ${created.lastName}`,
          `Telefone: ${phone}`,
          `E-mail: ${created.email}`,
          validUntil ? `Demo válida até: ${validUntil}` : null,
        ].filter((line): line is string => line !== null).join('\n')

        await dispatchRevah('EMAIL', 'contato@dentalpos.com.br', adminContent, {
          ...credentials,
          subject: `Novo demo criado — ${clinicName}`,
        })
      } else {
        console.error('RESEND_API_KEY não configurada — e-mail de boas-vindas do demo não enviado.')
      }
    } catch (emailError) {
      console.error('Falha ao enviar e-mail de boas-vindas do demo:', emailError)
    }

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
