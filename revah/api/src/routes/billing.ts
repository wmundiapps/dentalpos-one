import { Router } from 'express'
import { z } from 'zod'
import { LEADS_PRICE_BRL, PLAN_PRICES_BRL, planLimits, TRIAL_RULES } from '../config'
import { prisma } from '../lib/prisma'
import { ah } from '../lib/errors'
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth'
import { addLeadsAddon, cancelSubscription, changePlan, createPortalSession, createSubscriptionCheckout, providersAvailable } from '../services/billing'
import { limitsFor, monthlyUsage, trialStatus } from '../services/plans'

const r = Router()

// Mesmo conteúdo da página de planos de revah.com.br.
export const PLANS_INFO = [
  {
    plan: 'START',
    priceBRL: PLAN_PRICES_BRL.START,
    limits: planLimits.START,
    features: ['5.000 mensagens/mês*', 'Bot com IA básico', '1 integração CRM', '5 templates', 'Dashboard básico', 'Suporte por e-mail'],
  },
  {
    plan: 'PRO',
    priceBRL: PLAN_PRICES_BRL.PRO,
    limits: planLimits.PRO,
    highlight: true,
    features: ['25.000 mensagens/mês*', 'Bot com IA avançado', 'Integrações ilimitadas', 'Templates ilimitados', 'Dashboard completo', 'Listas externas (CSV)', 'Suporte prioritário'],
  },
  {
    plan: 'ENTERPRISE',
    priceBRL: null,
    limits: planLimits.ENTERPRISE,
    contactSales: true,
    features: ['White-label completo', 'Infraestrutura dedicada', 'SLA garantido', 'Integração customizada', 'Gerente de conta', 'Suporte 24/7'],
  },
]

r.get('/plans', (_req, res) =>
  res.json({
    plans: PLANS_INFO,
    trial: TRIAL_RULES,
    leadsPriceBRL: LEADS_PRICE_BRL || null,
    providers: providersAvailable(),
    note: '14 dias grátis com forma de pagamento cadastrada · depois cobrança mensal automática · cancele a qualquer momento · *franquias sujeitas ao canal/provedor',
  }),
)

const CheckoutSchema = z.object({
  plan: z.string().optional(),
  priceId: z.string().optional(),
  provider: z.enum(['ASAAS', 'STRIPE']).optional(),
  cpfCnpj: z.string().optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
})

async function checkout(req: AuthedRequest, res: any) {
  const b = CheckoutSchema.parse(req.body || {})
  let plan = String(b.plan || '').toUpperCase()
  // Compatibilidade com o site estático, que envia o identificador do price.
  if (!plan && b.priceId) plan = /pro/i.test(b.priceId) ? 'PRO' : 'START'
  const out = await createSubscriptionCheckout(req.tenant, req.user, plan || 'START', b)
  res.json({ ...out, checkoutUrl: out.url })
}

// Rota usada pelo site revah.com.br.
r.post('/payments/create-subscription', requireAuth, requireRole('OWNER', 'ADMIN'), ah(checkout))
r.post('/billing/checkout', requireAuth, requireRole('OWNER', 'ADMIN'), ah(checkout))

r.post(
  '/billing/portal',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  ah(async (req: AuthedRequest, res) => res.json(await createPortalSession(req.tenant))),
)

r.post(
  '/billing/cancel',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  ah(async (req: AuthedRequest, res) => res.json(await cancelSubscription(req.tenant, req.user.id))),
)

r.post(
  '/billing/change-plan',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  ah(async (req: AuthedRequest, res) => res.json(await changePlan(req.tenant, String(req.body?.plan || '')))),
)

r.post(
  '/billing/leads-addon',
  requireAuth,
  requireRole('OWNER', 'ADMIN'),
  ah(async (req: AuthedRequest, res) => res.json(await addLeadsAddon(req.tenant))),
)

r.get(
  '/billing/status',
  requireAuth,
  ah(async (req: AuthedRequest, res) => {
    const [subscription, usage] = await Promise.all([prisma.subscription.findUnique({ where: { tenantId: req.tenant.id } }), monthlyUsage(req.tenant.id)])
    res.json({
      plan: req.tenant.plan,
      status: req.tenant.status,
      leadsAddonActive: req.tenant.leadsAddonActive,
      subscription,
      usage,
      limits: limitsFor(req.tenant),
      trial: trialStatus(req.tenant),
      plans: PLANS_INFO,
    })
  }),
)

// Status do teste grátis validado no servidor (substitui o localStorage do site).
r.get('/trial/status', requireAuth, (req, res) => res.json(trialStatus((req as AuthedRequest).tenant)))

// Contato comercial para o plano ENTERPRISE (público).
r.post(
  '/sales/enterprise',
  ah(async (req, res) => {
    const b = z
      .object({ name: z.string().min(2), email: z.string().email(), phone: z.string().optional(), company: z.string().optional(), message: z.string().max(2000).optional() })
      .parse(req.body)
    await prisma.salesInquiry.create({ data: b })
    res.status(201).json({ ok: true, message: 'Recebemos seu contato. Nosso time comercial vai falar com você em breve.' })
  }),
)

export default r
