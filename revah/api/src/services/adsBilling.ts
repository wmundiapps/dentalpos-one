// Cobrança do REVAH Ads (vendido à parte, em dólar pela Stripe):
// - assinatura mensal (STRIPE_PRICE_ADS, US$ 29);
// - saldo de gestão pré-pago: o cliente informa quanto vai investir em anúncios e paga 5% antes.
//   A verba em si o cliente paga direto ao Meta/Google/TikTok, com o cartão dele na conta de anúncios.
//   O REVAH desconta 5% do gasto real e, sem saldo, bloqueia (e, com as integrações, pausa) os anúncios.
import type Stripe from 'stripe'
import type { Tenant, User } from '@prisma/client'
import { config } from '../config'
import { prisma } from '../lib/prisma'
import { badRequest, conflict, HttpError } from '../lib/errors'
import { audit } from './audit'
import { ensureStripeCustomer, stripe } from './billing'

export const AD_PLATFORMS = ['META', 'GOOGLE', 'TIKTOK'] as const
export type AdPlatform = (typeof AD_PLATFORMS)[number]

export const feeForSpend = (spendCents: number) => Math.ceil((spendCents * config.ai.adsFeePercent) / 100)

export function isAdsSubscription(sub: Pick<Stripe.Subscription, 'metadata' | 'items'>) {
  if (sub.metadata?.product === 'REVAH_ADS') return true
  return Boolean(config.stripe.prices.ADS && sub.items?.data?.some((i) => i.price.id === config.stripe.prices.ADS))
}

export async function adsSubscriptionCheckout(tenant: Tenant, user: User) {
  if (!config.stripe.prices.ADS) throw new HttpError(503, 'A assinatura do REVAH Ads ainda não está configurada. Fale com o suporte.', 'BILLING_NOT_CONFIGURED')
  if (tenant.adsStripeSubscriptionId && ['active', 'trialing', 'past_due'].includes(tenant.adsSubscriptionStatus || '')) throw conflict('O REVAH Ads já está assinado.', 'ADS_ALREADY_ACTIVE')
  const customer = await ensureStripeCustomer(tenant, user)
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: tenant.id,
    line_items: [{ price: config.stripe.prices.ADS, quantity: 1 }],
    payment_method_collection: 'always',
    billing_address_collection: 'required',
    metadata: { tenantId: tenant.id, product: 'REVAH_ADS' },
    subscription_data: { metadata: { tenantId: tenant.id, product: 'REVAH_ADS' } },
    success_url: `${config.appUrl}/ads?assinatura=ok`,
    cancel_url: `${config.appUrl}/ads?assinatura=cancelada`,
  })
  return { url: session.url }
}

// Recarga do saldo de gestão: o cliente diz quanto pretende investir (US$) e paga 5% disso.
export async function adsCreditCheckout(tenant: Tenant, user: User, plannedSpendUsd: number) {
  if (!tenant.adsAddonActive) throw new HttpError(402, 'Assine o REVAH Ads antes de recarregar o saldo.', 'ADS_ADDON_REQUIRED')
  const spendCents = Math.round(plannedSpendUsd * 100)
  const credit = feeForSpend(spendCents)
  if (credit < config.ai.adsMinTopupUsd * 100) {
    throw badRequest(`A recarga mínima é de US$ ${config.ai.adsMinTopupUsd.toFixed(2)} (investimento de US$ ${((config.ai.adsMinTopupUsd * 100) / config.ai.adsFeePercent).toFixed(0)}).`)
  }
  const customer = await ensureStripeCustomer(tenant, user)
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    customer,
    client_reference_id: tenant.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: credit,
          product_data: {
            name: 'REVAH Ads — saldo de gestão',
            description: `${config.ai.adsFeePercent}% sobre US$ ${(spendCents / 100).toFixed(2)} de investimento em anúncios`,
          },
        },
      },
    ],
    metadata: { tenantId: tenant.id, product: 'REVAH_ADS', kind: 'ads_credit', creditCents: String(credit), spendCents: String(spendCents) },
    payment_intent_data: { metadata: { tenantId: tenant.id, product: 'REVAH_ADS', kind: 'ads_credit' } },
    success_url: `${config.appUrl}/ads?recarga=ok`,
    cancel_url: `${config.appUrl}/ads?recarga=cancelada`,
  })
  return { url: session.url, creditCents: credit }
}

async function addEntry(tenantId: string, e: { kind: 'TOPUP' | 'FEE' | 'ADJUST'; amountCents: number; ref: string; spendCents?: number; platform?: string; note?: string }) {
  const exists = await prisma.adsCreditEntry.findUnique({ where: { ref: e.ref } })
  if (exists) return { duplicated: true, entry: exists }
  const [entry, tenant] = await prisma.$transaction([
    prisma.adsCreditEntry.create({ data: { tenantId, ...e } }),
    prisma.tenant.update({ where: { id: tenantId }, data: { adsCreditCents: { increment: e.amountCents } } }),
  ])
  const blocked = tenant.adsCreditCents <= 0
  if (blocked !== tenant.adsSpendBlocked) await prisma.tenant.update({ where: { id: tenantId }, data: { adsSpendBlocked: blocked } })
  return { duplicated: false, entry, balanceCents: tenant.adsCreditCents, blocked }
}

// Webhook: pagamento da recarga confirmado. O valor vem da própria Stripe (amount_total), não do pedido.
export async function creditFromCheckout(session: Stripe.Checkout.Session) {
  if (session.metadata?.kind !== 'ads_credit' || session.payment_status !== 'paid') return false
  const tenantId = session.metadata.tenantId || session.client_reference_id
  if (!tenantId || !session.amount_total || session.currency !== 'usd') return false
  await addEntry(tenantId, { kind: 'TOPUP', amountCents: session.amount_total, ref: `stripe:${session.id}`, spendCents: Number(session.metadata.spendCents) || undefined, note: 'Recarga pela Stripe' })
  await audit(tenantId, null, 'ADS_CREDIT_TOPUP', 'AdsCreditEntry', session.id, { cents: session.amount_total })
  return true
}

// Gasto real numa plataforma (vem da integração ou é lançado pelo admin): desconta 5% do saldo.
export async function recordAdSpend(tenantId: string, platform: AdPlatform, spendCents: number, ref: string, note?: string) {
  if (spendCents <= 0) throw badRequest('Informe o gasto em anúncios.')
  return addEntry(tenantId, { kind: 'FEE', amountCents: -feeForSpend(spendCents), spendCents, platform, ref: `spend:${platform}:${ref}`, note })
}

export async function syncAdsSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const tenantId = sub.metadata?.tenantId || (await prisma.tenant.findUnique({ where: { stripeCustomerId: customerId } }))?.id
  if (!tenantId) return false
  const active = ['active', 'trialing'].includes(sub.status)
  await prisma.tenant.update({ where: { id: tenantId }, data: { adsStripeSubscriptionId: sub.id, adsSubscriptionStatus: sub.status, adsAddonActive: active, stripeCustomerId: customerId } })
  await audit(tenantId, null, 'ADS_SUBSCRIPTION_SYNC', 'Tenant', tenantId, { status: sub.status })
  return true
}

export async function adsWallet(tenantId: string) {
  const [t, entries] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { adsCreditCents: true, adsSpendBlocked: true, adsSubscriptionStatus: true } }),
    prisma.adsCreditEntry.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ])
  return { balanceCents: t.adsCreditCents, blocked: t.adsSpendBlocked, subscriptionStatus: t.adsSubscriptionStatus, feePercent: config.ai.adsFeePercent, minTopupUsd: config.ai.adsMinTopupUsd, entries }
}
