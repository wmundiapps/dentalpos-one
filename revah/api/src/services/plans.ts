import type { Tenant } from '@prisma/client'
import { planLimits, TRIAL_RULES, type Plan } from '../config'
import { prisma } from '../lib/prisma'
import { paymentRequired, forbidden } from '../lib/errors'

export function limitsFor(tenant: Pick<Tenant, 'plan'>) {
  return planLimits[(tenant.plan as Plan) || 'TRIAL'] || planLimits.TRIAL
}

function monthStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export async function monthlyUsage(tenantId: string, since = monthStart()) {
  const [messages, calls] = await Promise.all([
    prisma.message.count({ where: { tenantId, direction: 'OUT', createdAt: { gte: since }, status: { in: ['SENT', 'DELIVERED', 'READ', 'QUEUED'] } } }),
    prisma.call.count({ where: { tenantId, direction: 'OUTBOUND', createdAt: { gte: since }, status: { notIn: ['BLOCKED', 'CANCELED'] } } }),
  ])
  return { messages, calls, since }
}

export function trialStatus(tenant: Pick<Tenant, 'plan' | 'status' | 'trialEndsAt' | 'trialEligible'>) {
  const isTrial = tenant.status === 'TRIAL'
  const endsAt = tenant.trialEndsAt
  const daysLeft = isTrial && endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000)) : null
  return {
    isTrial,
    days: TRIAL_RULES.days,
    endsAt,
    daysLeft,
    maxRecipientsPerCampaign: TRIAL_RULES.maxRecipientsPerCampaign,
    maxMessages: TRIAL_RULES.maxMessages,
    // Conta criada sem forma de pagamento: pode explorar o painel, mas ainda não envia.
    paymentMethodRequired: tenant.status === 'PENDING_PAYMENT',
    trialAvailable: tenant.trialEligible,
    exhausted: tenant.status === 'PENDING_PAYMENT' && !tenant.trialEligible,
  }
}

// Bloqueia envios quando a conta não está em dia.
export function assertAccountActive(tenant: Pick<Tenant, 'status' | 'plan' | 'trialEligible'>) {
  if (tenant.status === 'SUSPENDED') throw forbidden('Conta suspensa. Fale com o suporte REVAH.')
  if (tenant.status === 'PENDING_PAYMENT') {
    throw paymentRequired(
      tenant.trialEligible
        ? 'Cadastre a forma de pagamento para começar seus 14 dias grátis. Se cancelar antes do fim do teste, não há cobrança.'
        : 'Escolha um plano para começar a enviar.',
      'PAYMENT_METHOD_REQUIRED',
    )
  }
  if (tenant.status === 'CANCELED') throw paymentRequired('Sua assinatura foi cancelada. Reative um plano para voltar a enviar.', 'SUBSCRIPTION_CANCELED')
  if (tenant.status === 'PAST_DUE') throw paymentRequired('Há uma cobrança pendente na sua assinatura. Regularize para continuar enviando.', 'PAYMENT_PAST_DUE')
}

// Envio individual (inbox, automações, API).
export async function assertCanSend(tenant: Tenant, count = 1) {
  assertAccountActive(tenant)
  if (tenant.status === 'TRIAL') {
    const since = tenant.trialEndsAt ? new Date(tenant.trialEndsAt.getTime() - TRIAL_RULES.days * 86_400_000) : monthStart()
    const usage = await monthlyUsage(tenant.id, since)
    if (usage.messages + count > TRIAL_RULES.maxMessages) {
      throw paymentRequired('Você atingiu o limite de mensagens do período de teste. A assinatura libera a franquia completa do plano.', 'TRIAL_MESSAGE_LIMIT', {
        used: usage.messages,
        limit: TRIAL_RULES.maxMessages,
      })
    }
  }
  const limits = limitsFor(tenant)
  if (limits.monthlyMessages === null) return
  const usage = await monthlyUsage(tenant.id)
  if (usage.messages + count > limits.monthlyMessages) {
    throw paymentRequired('A franquia mensal de mensagens do seu plano foi atingida. Faça upgrade para continuar.', 'MONTHLY_LIMIT', {
      used: usage.messages,
      limit: limits.monthlyMessages,
    })
  }
}

// Teste de 14 dias: até 20 contatos por campanha, validado no servidor.
export async function assertCanLaunchCampaign(tenant: Tenant, recipients: number, channel: string) {
  assertAccountActive(tenant)
  if (tenant.status === 'TRIAL' && recipients > TRIAL_RULES.maxRecipientsPerCampaign) {
    throw paymentRequired(
      `Durante o teste de ${TRIAL_RULES.days} dias cada campanha pode ter até ${TRIAL_RULES.maxRecipientsPerCampaign} contatos.`,
      'TRIAL_RECIPIENT_LIMIT',
      trialStatus(tenant),
    )
  }
  if (channel === 'VOICE' && !limitsFor(tenant).voice) {
    throw paymentRequired('Ligações automáticas estão disponíveis a partir do plano PRO.', 'PLAN_FEATURE')
  }
  if (channel !== 'VOICE') await assertCanSend(tenant, recipients)
}

export async function assertCanAddUser(tenant: Tenant) {
  const limit = limitsFor(tenant).users
  if (limit === null) return
  const count = await prisma.user.count({ where: { tenantId: tenant.id, isActive: true } })
  if (count >= limit) throw paymentRequired(`Seu plano permite até ${limit} usuário(s).`, 'PLAN_LIMIT')
}

export async function assertCanAddChannel(tenant: Tenant) {
  const limit = limitsFor(tenant).channels
  if (limit === null) return
  const count = await prisma.channelAccount.count({ where: { tenantId: tenant.id, isActive: true } })
  if (count >= limit) throw paymentRequired(`Seu plano permite até ${limit} canal(is) conectado(s).`, 'PLAN_LIMIT')
}

export async function assertCanAddTemplate(tenant: Tenant) {
  const limit = limitsFor(tenant).templates
  if (limit === null) return
  const count = await prisma.messageTemplate.count({ where: { tenantId: tenant.id } })
  if (count >= limit) throw paymentRequired(`Seu plano permite até ${limit} templates. No PRO os templates são ilimitados.`, 'PLAN_LIMIT')
}

export async function assertCanAddIntegration(tenant: Tenant) {
  const limit = limitsFor(tenant).integrations
  if (limit === null) return
  const count = await prisma.apiKey.count({ where: { tenantId: tenant.id, revokedAt: null } })
  if (count >= limit) {
    throw paymentRequired(limit === 0 ? 'Integrações ficam disponíveis após ativar o plano.' : `Seu plano permite ${limit} integração de CRM. No PRO as integrações são ilimitadas.`, 'PLAN_LIMIT')
  }
}

export function assertCanImportCsv(tenant: Tenant) {
  if (!limitsFor(tenant).csvImport) throw paymentRequired('Importação de listas externas (CSV) está disponível no plano PRO.', 'PLAN_FEATURE')
}
