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

export async function monthlyUsage(tenantId: string) {
  const since = monthStart()
  const [messages, calls] = await Promise.all([
    prisma.message.count({ where: { tenantId, direction: 'OUT', createdAt: { gte: since }, status: { in: ['SENT', 'DELIVERED', 'READ', 'QUEUED'] } } }),
    prisma.call.count({ where: { tenantId, direction: 'OUTBOUND', createdAt: { gte: since }, status: { notIn: ['BLOCKED', 'CANCELED'] } } }),
  ])
  return { messages, calls, since }
}

export function trialStatus(tenant: Pick<Tenant, 'plan' | 'trialCampaignsUsed'>) {
  const isTrial = tenant.plan === 'TRIAL'
  const remaining = Math.max(0, TRIAL_RULES.maxCampaigns - tenant.trialCampaignsUsed)
  return {
    isTrial,
    campaignsUsed: tenant.trialCampaignsUsed,
    campaignsRemaining: isTrial ? remaining : null,
    maxCampaigns: TRIAL_RULES.maxCampaigns,
    maxRecipientsPerCampaign: TRIAL_RULES.maxRecipientsPerCampaign,
    exhausted: isTrial && remaining === 0,
  }
}

// Bloqueia envios quando a conta não está em dia.
export function assertAccountActive(tenant: Pick<Tenant, 'status' | 'plan'>) {
  if (tenant.status === 'SUSPENDED') throw forbidden('Conta suspensa. Fale com o suporte REVAH.')
  if (tenant.status === 'CANCELED') throw paymentRequired('Sua assinatura foi cancelada. Reative um plano para voltar a enviar.', 'SUBSCRIPTION_CANCELED')
  if (tenant.status === 'PAST_DUE') throw paymentRequired('Há uma cobrança pendente na sua assinatura. Regularize para continuar enviando.', 'PAYMENT_PAST_DUE')
}

// Envio individual (inbox, automações, API). No teste grátis, disparo em massa só por campanha.
export async function assertCanSend(tenant: Tenant, count = 1) {
  assertAccountActive(tenant)
  const limits = limitsFor(tenant)
  if (limits.monthlyMessages === null) return
  const usage = await monthlyUsage(tenant.id)
  if (usage.messages + count > limits.monthlyMessages) {
    throw paymentRequired(
      tenant.plan === 'TRIAL'
        ? 'O teste grátis chegou ao limite. Escolha um plano para continuar.'
        : 'O volume mensal do seu plano foi atingido. Faça upgrade para continuar.',
      'MONTHLY_LIMIT',
      { used: usage.messages, limit: limits.monthlyMessages },
    )
  }
}

// Validação real do teste 2×20, no servidor e por empresa.
export async function assertCanLaunchCampaign(tenant: Tenant, recipients: number, channel: string) {
  assertAccountActive(tenant)
  if (tenant.plan === 'TRIAL') {
    const t = trialStatus(tenant)
    if (t.exhausted) throw paymentRequired('Você já usou as 2 campanhas grátis. Escolha um plano para continuar disparando.', 'TRIAL_EXHAUSTED', t)
    if (recipients > TRIAL_RULES.maxRecipientsPerCampaign) {
      throw paymentRequired(`No teste grátis cada campanha pode ter até ${TRIAL_RULES.maxRecipientsPerCampaign} contatos.`, 'TRIAL_RECIPIENT_LIMIT', t)
    }
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
