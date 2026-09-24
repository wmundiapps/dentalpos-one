import Stripe from 'stripe'
import type { Tenant, User } from '@prisma/client'
import { config, LEADS_PRICE_BRL, PLAN_PRICES_BRL, TRIAL_RULES } from '../config'
import { prisma } from '../lib/prisma'
import { badRequest, conflict, HttpError } from '../lib/errors'
import { audit } from './audit'

// Cobrança recorrente mensal com 14 dias grátis:
//  - ASAAS: clientes no Brasil (Pix, boleto, cartão). Primeira cobrança no fim do teste.
//  - STRIPE: vendas internacionais (cartão). trial_period_days com cartão cadastrado.

export type PaidPlan = 'START' | 'PRO'
export type BillingProvider = 'ASAAS' | 'STRIPE'

function assertPaidPlan(plan: string): asserts plan is PaidPlan {
  if (plan === 'ENTERPRISE') throw badRequest('O plano ENTERPRISE é contratado com nosso time comercial.')
  if (plan !== 'START' && plan !== 'PRO') throw badRequest('Plano inválido.')
}

function notConfigured(what: string) {
  return new HttpError(503, `Pagamentos ${what} ainda não configurados.`, 'BILLING_NOT_CONFIGURED')
}

export function providersAvailable() {
  return {
    ASAAS: Boolean(config.asaas.apiKey),
    STRIPE: Boolean(config.stripe.secretKey && config.stripe.prices.START && config.stripe.prices.PRO),
  }
}

async function assertNoActiveSubscription(tenantId: string) {
  const existing = await prisma.subscription.findUnique({ where: { tenantId } })
  if (existing && ['active', 'trialing', 'past_due'].includes(existing.status)) {
    throw conflict('Sua empresa já tem uma assinatura. Para trocar de plano, use "Gerenciar assinatura".', 'ALREADY_SUBSCRIBED')
  }
}

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000)
const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

// ---------------------------------------------------------------------------
// Stripe (internacional)
// ---------------------------------------------------------------------------

let stripeClient: Stripe.Stripe | null = null
export function stripe() {
  if (!config.stripe.secretKey) throw notConfigured('internacionais (Stripe)')
  if (!stripeClient) stripeClient = new Stripe(config.stripe.secretKey, { maxNetworkRetries: 2, appInfo: { name: 'REVAH' } })
  return stripeClient
}

export function planForPrice(priceId: string | null | undefined): PaidPlan | null {
  if (!priceId) return null
  if (priceId === config.stripe.prices.START) return 'START'
  if (priceId === config.stripe.prices.PRO) return 'PRO'
  return null
}

async function ensureStripeCustomer(tenant: Tenant, user: User) {
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

async function stripeCheckout(tenant: Tenant, user: User, plan: PaidPlan, opts: { successUrl?: string; cancelUrl?: string }) {
  const price = config.stripe.prices[plan]
  if (!price) throw notConfigured('internacionais (Stripe)')
  const customer = await ensureStripeCustomer(tenant, user)
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: tenant.id,
    line_items: [{ price, quantity: 1 }],
    payment_method_types: config.stripe.paymentMethods as any,
    payment_method_collection: 'always',
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    metadata: { tenantId: tenant.id, plan, product: 'REVAH' },
    subscription_data: {
      metadata: { tenantId: tenant.id, plan, product: 'REVAH' },
      ...(tenant.trialEligible ? { trial_period_days: TRIAL_RULES.days } : {}),
    },
    success_url: opts.successUrl || `${config.appUrl}/assinatura?status=sucesso`,
    cancel_url: opts.cancelUrl || `${config.appUrl}/assinatura?status=cancelado`,
  })
  return { url: session.url, provider: 'STRIPE' as const }
}

// ---------------------------------------------------------------------------
// Asaas (Brasil)
// ---------------------------------------------------------------------------

async function asaas<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!config.asaas.apiKey) throw notConfigured('no Brasil (Asaas)')
  const res = await fetch(`${config.asaas.baseUrl}${path}`, {
    method: init.method || (init.body ? 'POST' : 'GET'),
    headers: { access_token: config.asaas.apiKey, 'Content-Type': 'application/json', 'User-Agent': 'REVAH' },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || `Asaas respondeu HTTP ${res.status}`
    throw new HttpError(res.status >= 500 ? 502 : 400, msg, 'ASAAS_ERROR')
  }
  return data as T
}

async function ensureAsaasCustomer(tenant: Tenant, user: User, cpfCnpj: string) {
  if (tenant.asaasCustomerId) return tenant.asaasCustomerId
  const c = await asaas<{ id: string }>('/customers', {
    body: { name: tenant.name, cpfCnpj, email: user.email, mobilePhone: tenant.phone || undefined, externalReference: tenant.id },
  })
  await prisma.tenant.update({ where: { id: tenant.id }, data: { asaasCustomerId: c.id, document: cpfCnpj } })
  return c.id
}

async function asaasCheckout(tenant: Tenant, user: User, plan: PaidPlan, cpfCnpjRaw?: string) {
  const cpfCnpj = String(cpfCnpjRaw || tenant.document || '').replace(/\D/g, '')
  if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) throw badRequest('Informe o CPF ou CNPJ para emitir as cobranças.')
  const customer = await ensureAsaasCustomer(tenant, user, cpfCnpj)
  const withTrial = tenant.trialEligible
  const trialEndsAt = withTrial ? addDays(new Date(), TRIAL_RULES.days) : null
  const sub = await asaas<{ id: string }>('/subscriptions', {
    body: {
      customer,
      billingType: 'UNDEFINED', // o cliente escolhe Pix, boleto ou cartão na fatura
      value: PLAN_PRICES_BRL[plan],
      nextDueDate: ymd(trialEndsAt || new Date()),
      cycle: 'MONTHLY',
      description: `REVAH ${plan} — assinatura mensal`,
      externalReference: tenant.id,
    },
  })
  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, provider: 'ASAAS', asaasSubscriptionId: sub.id, plan, status: withTrial ? 'trialing' : 'incomplete', trialEndsAt },
    update: { provider: 'ASAAS', asaasSubscriptionId: sub.id, stripeSubscriptionId: null, plan, status: withTrial ? 'trialing' : 'incomplete', trialEndsAt, cancelAtPeriodEnd: false },
  })
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { plan, billingProvider: 'ASAAS', trialEligible: false, ...(withTrial ? { status: 'TRIAL', trialEndsAt } : {}) },
  })
  // Sem teste (já usado): leva direto para a primeira fatura.
  let url = `${config.appUrl}/assinatura?status=sucesso`
  if (!withTrial) {
    const payments = await asaas<{ data: { invoiceUrl: string }[] }>(`/subscriptions/${sub.id}/payments`)
    url = payments.data?.[0]?.invoiceUrl || url
  }
  return { url, provider: 'ASAAS' as const, trialEndsAt }
}

// ---------------------------------------------------------------------------
// API comum
// ---------------------------------------------------------------------------

export async function createSubscriptionCheckout(
  tenant: Tenant,
  user: User,
  planRaw: string,
  opts: { provider?: string; cpfCnpj?: string; successUrl?: string; cancelUrl?: string } = {},
) {
  const plan = String(planRaw || '').toUpperCase()
  assertPaidPlan(plan)
  await assertNoActiveSubscription(tenant.id)
  const available = providersAvailable()
  const provider: BillingProvider = opts.provider === 'STRIPE' ? 'STRIPE' : opts.provider === 'ASAAS' ? 'ASAAS' : available.ASAAS ? 'ASAAS' : 'STRIPE'
  const out = provider === 'ASAAS' ? await asaasCheckout(tenant, user, plan, opts.cpfCnpj) : await stripeCheckout(tenant, user, plan, opts)
  await audit(tenant.id, user.id, 'BILLING_CHECKOUT_CREATED', 'Tenant', tenant.id, { plan, provider })
  return out
}

export async function createPortalSession(tenant: Tenant) {
  const sub = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } })
  if (sub?.provider === 'ASAAS') {
    // Asaas não tem portal: devolve a próxima fatura (Pix, boleto ou cartão).
    const payments = await asaas<{ data: { invoiceUrl: string; status: string }[] }>(`/subscriptions/${sub.asaasSubscriptionId}/payments`)
    const open = payments.data?.find((p) => ['PENDING', 'OVERDUE'].includes(p.status)) || payments.data?.[0]
    if (!open) throw conflict('Nenhuma fatura disponível no momento.')
    return { url: open.invoiceUrl }
  }
  if (!tenant.stripeCustomerId) throw conflict('Nenhuma assinatura encontrada para esta empresa.')
  const s = await stripe().billingPortal.sessions.create({ customer: tenant.stripeCustomerId, return_url: `${config.appUrl}/assinatura`, locale: 'pt-BR' })
  return { url: s.url }
}

// Cancelamento: no teste, sem cobrança; depois, o ciclo pago continua até o fim.
export async function cancelSubscription(tenant: Tenant, userId: string) {
  const sub = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } })
  if (!sub || sub.status === 'canceled') throw conflict('Nenhuma assinatura ativa.')
  if (sub.provider === 'STRIPE' && sub.stripeSubscriptionId) {
    const s = await stripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true })
    await syncSubscription(s)
  } else if (sub.asaasSubscriptionId) {
    await asaas(`/subscriptions/${sub.asaasSubscriptionId}`, { method: 'DELETE' })
    if (sub.asaasLeadsSubscriptionId) await asaas(`/subscriptions/${sub.asaasLeadsSubscriptionId}`, { method: 'DELETE' }).catch(() => null)
    const inTrial = sub.status === 'trialing'
    const periodOver = !sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() <= Date.now()
    await prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true, ...(inTrial || periodOver ? { status: 'canceled' } : {}) } })
    if (inTrial || periodOver) await prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'CANCELED', leadsAddonActive: false } })
  }
  await audit(tenant.id, userId, 'BILLING_CANCEL', 'Subscription', sub.id)
  return prisma.subscription.findUnique({ where: { tenantId: tenant.id } })
}

// Troca de plano (Asaas). No Stripe a troca é feita pelo portal.
export async function changePlan(tenant: Tenant, planRaw: string) {
  const plan = String(planRaw || '').toUpperCase()
  assertPaidPlan(plan)
  const sub = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } })
  if (!sub || !['active', 'trialing', 'past_due'].includes(sub.status)) throw conflict('Nenhuma assinatura ativa.')
  if (sub.provider !== 'ASAAS') return createPortalSession(tenant)
  await asaas(`/subscriptions/${sub.asaasSubscriptionId}`, { method: 'PUT', body: { value: PLAN_PRICES_BRL[plan], description: `REVAH ${plan} — assinatura mensal`, updatePendingPayments: true } })
  await prisma.subscription.update({ where: { id: sub.id }, data: { plan } })
  await prisma.tenant.update({ where: { id: tenant.id }, data: { plan } })
  return { url: null, plan }
}

// Add-on REVAH Leads.
export async function addLeadsAddon(tenant: Tenant) {
  const sub = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } })
  if (!sub || !['active', 'trialing'].includes(sub.status)) throw conflict('Assine um plano REVAH antes de contratar o add-on de leads.', 'SUBSCRIPTION_REQUIRED')
  if (sub.hasLeadsAddon) return { alreadyActive: true }
  if (sub.provider === 'ASAAS') {
    if (!LEADS_PRICE_BRL) throw notConfigured('do add-on de leads')
    const s = await asaas<{ id: string }>('/subscriptions', {
      body: {
        customer: tenant.asaasCustomerId,
        billingType: 'UNDEFINED',
        value: LEADS_PRICE_BRL,
        nextDueDate: ymd(sub.trialEndsAt && sub.trialEndsAt > new Date() ? sub.trialEndsAt : new Date()),
        cycle: 'MONTHLY',
        description: 'REVAH Leads — add-on mensal',
        externalReference: `${tenant.id}:LEADS`,
      },
    })
    await prisma.subscription.update({ where: { id: sub.id }, data: { asaasLeadsSubscriptionId: s.id, hasLeadsAddon: true } })
    await prisma.tenant.update({ where: { id: tenant.id }, data: { leadsAddonActive: true } })
    return { alreadyActive: false }
  }
  if (!config.stripe.prices.LEADS || !sub.stripeSubscriptionId) throw notConfigured('do add-on de leads')
  await stripe().subscriptionItems.create({ subscription: sub.stripeSubscriptionId, price: config.stripe.prices.LEADS, quantity: 1, proration_behavior: 'create_prorations' })
  await syncSubscription(await stripe().subscriptions.retrieve(sub.stripeSubscriptionId))
  return { alreadyActive: false }
}

function tenantStatusFor(status: string): string | null {
  if (status === 'trialing') return 'TRIAL'
  if (status === 'active') return 'ACTIVE'
  if (['past_due', 'unpaid'].includes(status)) return 'PAST_DUE'
  if (['canceled', 'incomplete_expired'].includes(status)) return 'CANCELED'
  return null // incomplete / paused: mantém o estado atual
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
  const trialEnd = (sub as any).trial_end ? new Date(Number((sub as any).trial_end) * 1000) : null
  const data = {
    provider: 'STRIPE',
    stripeSubscriptionId: sub.id,
    stripePriceId: planItem?.price.id,
    plan,
    status: sub.status,
    trialEndsAt: trialEnd,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    hasLeadsAddon: hasLeads,
  }
  await prisma.subscription.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data })
  const status = tenantStatusFor(sub.status)
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      stripeCustomerId: customerId,
      billingProvider: 'STRIPE',
      trialEligible: false,
      ...(status ? { status } : {}),
      ...(status && status !== 'CANCELED' ? { plan } : {}),
      ...(sub.status === 'trialing' && trialEnd ? { trialEndsAt: trialEnd } : {}),
      leadsAddonActive: hasLeads && (status === 'ACTIVE' || status === 'TRIAL'),
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

async function recordEvent(provider: string, eventId: string, type: string, payload: unknown, run: () => Promise<'PROCESSED' | 'IGNORED'>) {
  const prior = await prisma.billingEvent.findUnique({ where: { stripeEventId: eventId } })
  if (prior && ['PROCESSED', 'IGNORED'].includes(prior.status)) return prior.status
  if (!prior) await prisma.billingEvent.create({ data: { provider, stripeEventId: eventId, type, payload: payload as any } })
  try {
    const status = await run()
    await prisma.billingEvent.update({ where: { stripeEventId: eventId }, data: { status, processedAt: new Date(), error: null } })
    return status
  } catch (e: any) {
    await prisma.billingEvent.update({ where: { stripeEventId: eventId }, data: { status: 'FAILED', error: String(e?.message || e).slice(0, 500) } })
    throw e
  }
}

// Webhook Stripe (idempotente).
export async function handleStripeEvent(event: Stripe.Event) {
  return recordEvent('STRIPE', event.id, event.type, event, async () => {
    const obj: any = event.data.object
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (obj.mode === 'subscription' && obj.subscription) {
        const sub = await stripe().subscriptions.retrieve(typeof obj.subscription === 'string' ? obj.subscription : obj.subscription.id)
        return (await syncSubscription(sub)) ? 'PROCESSED' : 'IGNORED'
      }
    } else if (event.type.startsWith('customer.subscription.')) {
      return (await syncSubscription(obj as Stripe.Subscription)) ? 'PROCESSED' : 'IGNORED'
    } else if (event.type === 'invoice.payment_failed' || event.type === 'invoice.paid') {
      const subId = obj.parent?.subscription_details?.subscription || obj.subscription
      if (subId) {
        const sub = await stripe().subscriptions.retrieve(typeof subId === 'string' ? subId : subId.id)
        return (await syncSubscription(sub)) ? 'PROCESSED' : 'IGNORED'
      }
    }
    return 'IGNORED'
  })
}

// Webhook Asaas (header asaas-access-token = ASAAS_WEBHOOK_TOKEN).
export async function handleAsaasEvent(body: any) {
  const eventId = `asaas:${body?.id || `${body?.event}:${body?.payment?.id || body?.subscription?.id}`}`
  return recordEvent('ASAAS', eventId, String(body?.event || ''), body, async () => {
    const event = String(body?.event || '')
    const subId: string | undefined = body?.payment?.subscription || body?.subscription?.id
    if (!subId) return 'IGNORED'

    // Add-on de leads
    const leadsSub = await prisma.subscription.findUnique({ where: { asaasLeadsSubscriptionId: subId } })
    if (leadsSub) {
      const active = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event)
      const off = ['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED', 'PAYMENT_OVERDUE'].includes(event)
      if (!active && !off) return 'IGNORED'
      await prisma.subscription.update({ where: { id: leadsSub.id }, data: { hasLeadsAddon: active } })
      await prisma.tenant.update({ where: { id: leadsSub.tenantId }, data: { leadsAddonActive: active } })
      return 'PROCESSED'
    }

    const sub = await prisma.subscription.findUnique({ where: { asaasSubscriptionId: subId } })
    if (!sub) return 'IGNORED'
    let status: string | null = null
    let periodEnd: Date | undefined
    if (['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event)) {
      status = 'active'
      const due = body.payment?.dueDate ? new Date(`${body.payment.dueDate}T12:00:00-03:00`) : new Date()
      periodEnd = new Date(due)
      periodEnd.setMonth(periodEnd.getMonth() + 1)
    } else if (event === 'PAYMENT_OVERDUE') status = 'past_due'
    else if (['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'].includes(event)) {
      // Cancelou: se ainda há ciclo pago, mantém até o fim (tratado na manutenção diária).
      const stillPaid = sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now()
      status = stillPaid ? sub.status : 'canceled'
      await prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } })
    }
    if (!status) return 'IGNORED'
    await prisma.subscription.update({ where: { id: sub.id }, data: { status, ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}) } })
    const tStatus = tenantStatusFor(status)
    if (tStatus) await prisma.tenant.update({ where: { id: sub.tenantId }, data: { status: tStatus, ...(tStatus === 'CANCELED' ? { leadsAddonActive: false } : {}) } })
    await audit(sub.tenantId, null, 'BILLING_ASAAS_EVENT', 'Subscription', sub.id, { event, status })
    return 'PROCESSED'
  })
}

// Manutenção diária: teste vencido sem pagamento e cancelamentos no fim do ciclo (Asaas).
export async function billingMaintenance(now = new Date()) {
  const graceDays = 3
  const expiredTrials = await prisma.tenant.updateMany({
    where: { status: 'TRIAL', trialEndsAt: { lt: addDays(now, -graceDays) }, source: 'DIRECT' },
    data: { status: 'PAST_DUE' },
  })
  const ended = await prisma.subscription.findMany({ where: { provider: 'ASAAS', cancelAtPeriodEnd: true, status: { not: 'canceled' }, currentPeriodEnd: { lt: now } } })
  for (const s of ended) {
    await prisma.subscription.update({ where: { id: s.id }, data: { status: 'canceled' } })
    await prisma.tenant.update({ where: { id: s.tenantId }, data: { status: 'CANCELED', leadsAddonActive: false } })
  }
  return { expiredTrials: expiredTrials.count, canceledAtPeriodEnd: ended.length }
}
