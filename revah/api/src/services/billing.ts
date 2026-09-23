import Stripe from 'stripe'
import type { Tenant, User } from '@prisma/client'
import { config } from '../config'
import { prisma } from '../lib/prisma'
import { badRequest, conflict, HttpError } from '../lib/errors'
import { audit } from './audit'

let stripeClient: Stripe.Stripe | null = null
export function stripe() {
  if (!config.stripe.secretKey) throw new HttpError(503, 'Pagamentos ainda não configurados (STRIPE_SECRET_KEY).', 'BILLING_NOT_CONFIGURED')
  if (!stripeClient) stripeClient = new Stripe(config.stripe.secretKey, { maxNetworkRetries: 2, appInfo: { name: 'REVAH' } })
  return stripeClient
}

export type PaidPlan = 'START' | 'PRO'

export function priceForPlan(plan: string): string {
  if (plan === 'ENTERPRISE') throw badRequest('O plano ENTERPRISE é contratado com nosso time comercial.')
  if (plan !== 'START' && plan !== 'PRO') throw badRequest('Plano inválido.')
  const p = config.stripe.prices[plan]
  if (!p) throw new HttpError(503, 'Pagamentos ainda não configurados para este plano.', 'BILLING_NOT_CONFIGURED')
  return p
}

export function planForPrice(priceId: string | null | undefined): PaidPlan | null {
  if (!priceId) return null
  if (priceId === config.stripe.prices.START) return 'START'
  if (priceId === config.stripe.prices.PRO) return 'PRO'
  return null
}

async function ensureCustomer(tenant: Tenant, user: User) {
  if (tenant.stripeCustomerId) return tenant.stripeCustomerId
  const customer = await stripe().customers.create({
    name: tenant.name,
    email: user.email,
    phone: tenant.phone || undefined,
    metadata: { tenantId: tenant.id, product: 'REVAH' },
    preferred_locales: ['pt-BR'],
  })
  await prisma.tenant.update({ where: { id: tenant.id }, data: { stripeCustomerId: customer.id } })
  return customer.id
}

// Checkout hospedado do Stripe: o REVAH nunca vê dados de cartão.
export async function createSubscriptionCheckout(tenant: Tenant, user: User, plan: string, opts: { successUrl?: string; cancelUrl?: string } = {}) {
  const price = priceForPlan(plan)
  const existing = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } })
  if (existing && ['active', 'trialing', 'past_due'].includes(existing.status)) {
    throw conflict('Sua empresa já tem uma assinatura. Use o portal de assinatura para trocar de plano.', 'ALREADY_SUBSCRIBED')
  }
  const customer = await ensureCustomer(tenant, user)
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: tenant.id,
    line_items: [{ price, quantity: 1 }],
    payment_method_types: config.stripe.paymentMethods as any,
    locale: 'pt-BR',
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    metadata: { tenantId: tenant.id, plan, product: 'REVAH' },
    subscription_data: { metadata: { tenantId: tenant.id, plan, product: 'REVAH' } },
    success_url: opts.successUrl || `${config.appUrl}/assinatura?status=sucesso&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: opts.cancelUrl || `${config.appUrl}/assinatura?status=cancelado`,
  })
  await audit(tenant.id, user.id, 'BILLING_CHECKOUT_CREATED', 'Tenant', tenant.id, { plan, sessionId: session.id })
  return { url: session.url, sessionId: session.id }
}

export async function createPortalSession(tenant: Tenant) {
  if (!tenant.stripeCustomerId) throw conflict('Nenhuma assinatura encontrada para esta empresa.')
  const s = await stripe().billingPortal.sessions.create({ customer: tenant.stripeCustomerId, return_url: `${config.appUrl}/assinatura`, locale: 'pt-BR' })
  return { url: s.url }
}

// Add-on REVAH Leads: item extra na assinatura vigente.
export async function addLeadsAddon(tenant: Tenant) {
  if (!config.stripe.prices.LEADS) throw new HttpError(503, 'Add-on de leads sem preço configurado. Fale com o comercial.', 'BILLING_NOT_CONFIGURED')
  const sub = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } })
  if (!sub || !['active', 'trialing'].includes(sub.status)) throw conflict('Assine um plano REVAH antes de contratar o add-on de leads.', 'SUBSCRIPTION_REQUIRED')
  if (sub.hasLeadsAddon) return { alreadyActive: true }
  await stripe().subscriptionItems.create({ subscription: sub.stripeSubscriptionId, price: config.stripe.prices.LEADS, quantity: 1, proration_behavior: 'create_prorations' })
  const fresh = await stripe().subscriptions.retrieve(sub.stripeSubscriptionId)
  await syncSubscription(fresh)
  return { alreadyActive: false }
}

function tenantStatusFor(stripeStatus: string): string | null {
  if (['active', 'trialing'].includes(stripeStatus)) return 'ACTIVE'
  if (['past_due', 'unpaid'].includes(stripeStatus)) return 'PAST_DUE'
  if (['canceled', 'incomplete_expired'].includes(stripeStatus)) return 'CANCELED'
  return null // incomplete / paused: mantém o estado atual até confirmar
}

export async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const tenantId = sub.metadata?.tenantId || (await prisma.tenant.findUnique({ where: { stripeCustomerId: customerId } }))?.id
  if (!tenantId) return false
  const items = sub.items.data
  const planItem = items.find((i) => planForPrice(i.price.id))
  const plan = planForPrice(planItem?.price.id) || (sub.metadata?.plan as PaidPlan) || 'START'
  const hasLeads = Boolean(config.stripe.prices.LEADS && items.some((i) => i.price.id === config.stripe.prices.LEADS))
  const periodEnd = items.reduce((max, i: any) => Math.max(max, Number(i.current_period_end || 0)), 0)
  await prisma.subscription.upsert({
    where: { tenantId },
    create: {
      tenantId,
      stripeSubscriptionId: sub.id,
      stripePriceId: planItem?.price.id,
      plan,
      status: sub.status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      hasLeadsAddon: hasLeads,
    },
    update: {
      stripeSubscriptionId: sub.id,
      stripePriceId: planItem?.price.id,
      plan,
      status: sub.status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      hasLeadsAddon: hasLeads,
    },
  })
  const status = tenantStatusFor(sub.status)
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      stripeCustomerId: customerId,
      ...(status ? { status } : {}),
      ...(status === 'ACTIVE' || status === 'PAST_DUE' ? { plan } : {}),
      leadsAddonActive: hasLeads && status === 'ACTIVE',
    },
  })
  await audit(tenantId, null, 'BILLING_SUBSCRIPTION_SYNC', 'Subscription', sub.id, { status: sub.status, plan, hasLeads })
  return true
}

export function constructStripeEvent(raw: Buffer, signature: string | undefined) {
  if (!config.stripe.webhookSecret) throw new HttpError(503, 'STRIPE_WEBHOOK_SECRET não configurado.')
  if (!signature) throw badRequest('Assinatura Stripe ausente.')
  return stripe().webhooks.constructEvent(raw, signature, config.stripe.webhookSecret)
}

// Processamento idempotente do webhook.
export async function handleStripeEvent(event: Stripe.Event) {
  const prior = await prisma.billingEvent.findUnique({ where: { stripeEventId: event.id } })
  if (prior && ['PROCESSED', 'IGNORED'].includes(prior.status)) return prior.status
  if (!prior) await prisma.billingEvent.create({ data: { stripeEventId: event.id, type: event.type, payload: event as any } })

  let status: 'PROCESSED' | 'IGNORED' = 'IGNORED'
  try {
    const obj: any = event.data.object
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (obj.mode === 'subscription' && obj.subscription) {
        const sub = await stripe().subscriptions.retrieve(typeof obj.subscription === 'string' ? obj.subscription : obj.subscription.id)
        status = (await syncSubscription(sub)) ? 'PROCESSED' : 'IGNORED'
      }
    } else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed'].includes(event.type)) {
      status = (await syncSubscription(obj as Stripe.Subscription)) ? 'PROCESSED' : 'IGNORED'
    } else if (event.type === 'invoice.payment_failed' || event.type === 'invoice.paid') {
      const subId = obj.parent?.subscription_details?.subscription || obj.subscription
      if (subId) {
        const sub = await stripe().subscriptions.retrieve(typeof subId === 'string' ? subId : subId.id)
        status = (await syncSubscription(sub)) ? 'PROCESSED' : 'IGNORED'
      }
    }
    await prisma.billingEvent.update({ where: { stripeEventId: event.id }, data: { status, processedAt: new Date(), error: null } })
    return status
  } catch (e: any) {
    await prisma.billingEvent.update({ where: { stripeEventId: event.id }, data: { status: 'FAILED', error: String(e?.message || e).slice(0, 500) } })
    throw e
  }
}
