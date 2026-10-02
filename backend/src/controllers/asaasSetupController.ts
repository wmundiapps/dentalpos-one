import { randomBytes } from 'crypto'
import { Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { encryptSecret } from '../services/secretVault'
import { asaasCall, connFromKey, registerAsaasWebhook, AsaasError } from '../services/asaasService'
import { writeAudit } from '../services/auditService'

const publicApi = () => String(process.env.PUBLIC_API_URL || 'https://api.dentalpos.com.br').replace(/\/$/, '')
const webhookUrl = () => `${publicApi()}/api/webhooks/asaas`

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

function view(config: { credentialsConfigured: boolean; isActive: boolean; environment: string; webhookConfigured: boolean; settings: Prisma.JsonValue } | null) {
  const settings = ((config?.settings || {}) as { webhookToken?: string })
  return {
    connected: Boolean(config?.credentialsConfigured),
    active: Boolean(config?.isActive),
    environment: config?.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX',
    webhookConfigured: Boolean(config?.webhookConfigured),
    webhookUrl: webhookUrl(),
    webhookToken: settings.webhookToken || null
  }
}

export async function status(req: AuthRequest, res: Response) {
  try {
    const { clinicId } = ctx(req)
    const config = await prisma.paymentProviderConfig.findUnique({ where: { clinicId_provider: { clinicId, provider: 'ASAAS' } } })
    return res.json(view(config))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar a conta de recebimento.' })
  }
}

// Conecta (ou ajusta) a conta Asaas da clínica: valida a chave, guarda criptografada e prepara o webhook.
export async function connect(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const b = req.body || {}
    const environment = String(b.environment || '').toUpperCase() === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX'
    const apiKey = typeof b.apiKey === 'string' ? b.apiKey.trim() : ''
    const before = await prisma.paymentProviderConfig.findUnique({ where: { clinicId_provider: { clinicId, provider: 'ASAAS' } } })

    if (!apiKey && before && before.environment !== environment) {
      return res.status(400).json({ error: 'Ao trocar entre teste e produção é preciso informar a chave do novo ambiente.' })
    }
    if (!apiKey && !before?.credentialsConfigured) return res.status(400).json({ error: 'Informe a chave de API do Asaas.' })
    if (apiKey && apiKey.length < 20) return res.status(400).json({ error: 'A chave de API do Asaas parece incompleta.' })

    if (apiKey) {
      try { await asaasCall(connFromKey(apiKey, environment), '/customers?limit=1') }
      catch (error) {
        const unauthorized = error instanceof AsaasError && (error.status === 401 || error.status === 403)
        return res.status(unauthorized ? 400 : 502).json({ error: unauthorized ? `Chave inválida para o ambiente ${environment === 'PRODUCTION' ? 'de produção' : 'de teste (sandbox)'}. Confira se a chave é do mesmo ambiente.` : (error instanceof Error ? error.message : 'Não foi possível validar a chave no Asaas.') })
      }
    }

    const prevSettings = ((before?.settings || {}) as Record<string, unknown>)
    const webhookToken = typeof prevSettings.webhookToken === 'string' && prevSettings.webhookToken ? prevSettings.webhookToken : randomBytes(24).toString('hex')
    const settings = { ...prevSettings, webhookToken } as Prisma.InputJsonValue
    const encryptedCredentials = apiKey ? encryptSecret({ apiKey }) : undefined

    // Webhook automático (melhor esforço): se falhar, a tela mostra o passo a passo manual.
    let webhookConfigured = Boolean(before?.webhookConfigured) && !apiKey
    if (apiKey) {
      try {
        const clinic = await prisma.clinic.findFirst({ where: { id: clinicId }, select: { email: true } })
        await registerAsaasWebhook(connFromKey(apiKey, environment), webhookUrl(), webhookToken, clinic?.email || undefined)
        webhookConfigured = true
      } catch (error) { console.error('Webhook Asaas não cadastrado automaticamente:', error instanceof Error ? error.message : error) }
    }

    const isActive = typeof b.isActive === 'boolean' ? b.isActive : true
    const config = await prisma.paymentProviderConfig.upsert({
      where: { clinicId_provider: { clinicId, provider: 'ASAAS' } },
      update: { environment, isActive, credentialsConfigured: true, webhookConfigured, settings, ...(encryptedCredentials ? { encryptedCredentials } : {}) },
      create: { clinicId, tenantId, provider: 'ASAAS', environment, isActive, credentialsConfigured: true, webhookConfigured, settings, encryptedCredentials }
    })
    await writeAudit({ clinicId, tenantId, actorId, module: 'finance', action: 'ASAAS_CONNECT', entityType: 'PaymentProviderConfig', entityId: config.id, summary: `Conta Asaas ${apiKey ? 'conectada/atualizada' : 'ajustada'} (${environment}, ${isActive ? 'ativa' : 'desativada'}).` }).catch((e: unknown) => console.error(e))
    return res.json(view(config))
  } catch (error) {
    console.error('Erro ao conectar a conta Asaas:', error)
    return res.status(500).json({ error: 'Erro ao conectar a conta Asaas.' })
  }
}
