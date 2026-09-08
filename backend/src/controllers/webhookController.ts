import { createHmac, timingSafeEqual } from 'crypto'
import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { ContextRequest } from '../middleware/requestContext'

function eventId(body: any, fallback: string) {
  return String(body?.id || body?.event?.id || body?.data?.object?.id || fallback)
}

function secureEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function verifyStripeSignature(req: ContextRequest, secret: string) {
  const signatureHeader = String(req.headers['stripe-signature'] || '')
  const rawBody = req.rawBody
  if (!signatureHeader || !rawBody) return false

  const parts = signatureHeader.split(',').map(part => part.trim())
  const timestamp = parts.find(part => part.startsWith('t='))?.slice(2)
  const signatures = parts.filter(part => part.startsWith('v1=')).map(part => part.slice(3))
  if (!timestamp || signatures.length === 0) return false

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false

  const tolerance = Number(process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS || 300)
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) return false

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex')

  return signatures.some(signature => secureEqual(signature, expected))
}

export async function asaas(req: Request, res: Response) {
  const expected = String(process.env.ASAAS_WEBHOOK_TOKEN || '')
  if (!expected) return res.status(503).json({ error: 'Webhook Asaas ainda não configurado.' })

  const received = String(req.headers['asaas-access-token'] || req.headers['access-token'] || '')
  if (!received || !secureEqual(received, expected)) {
    return res.status(401).json({ error: 'Webhook não autorizado.' })
  }

  const body = req.body || {}
  const id = eventId(body, `asaas-${Date.now()}`)
  const type = String(body.event || 'UNKNOWN')

  try {
    await prisma.integrationWebhookEvent.create({
      data: { provider: 'ASAAS', externalEventId: id, eventType: type, payload: body }
    })
  } catch (error: any) {
    if (String(error?.code) === 'P2002') return res.json({ ok: true, duplicate: true })
    throw error
  }

  const paymentId = body?.payment?.id
  if (paymentId) {
    const statusMap: Record<string, string> = {
      PAYMENT_RECEIVED: 'PAID',
      PAYMENT_CONFIRMED: 'PAID',
      PAYMENT_OVERDUE: 'OVERDUE',
      PAYMENT_REFUNDED: 'REFUNDED',
      PAYMENT_DELETED: 'CANCELLED'
    }
    const status = statusMap[type]
    if (status) {
      const rows = await prisma.payment.findMany({ where: { externalId: paymentId } })
      for (const row of rows) {
        await prisma.payment.update({
          where: { id: row.id },
          data: {
            status,
            paidDate: status === 'PAID' ? new Date() : row.paidDate,
            transactionStatus: String(body?.payment?.status || status),
            grossAmount: Number(body?.payment?.value || row.grossAmount || row.amount),
            netAmount: Number(body?.payment?.netValue || row.netAmount || row.amount)
          }
        })
        await prisma.financialEntry.updateMany({
          where: { originId: row.budgetId, installment: row.installment },
          data: {
            status: status === 'PAID' ? 'PAID' : status,
            paidAt: status === 'PAID' ? new Date() : undefined,
            externalId: paymentId
          }
        })
      }
    }
  }

  await prisma.integrationWebhookEvent.update({
    where: { provider_externalEventId: { provider: 'ASAAS', externalEventId: id } },
    data: { status: 'PROCESSED', processedAt: new Date() }
  })
  return res.json({ ok: true })
}

type StripeIdentity = {
  clinicId?: string
  tenantId?: string
  product?: string
  paymentId?: string
  financialEntryId?: string
}

function metadataValue(metadata: any, key: string) {
  const value = metadata?.[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function extractStripeIdentity(obj: any): StripeIdentity {
  const metadata = obj?.metadata || {}
  return {
    clinicId: metadataValue(metadata, 'clinicId'),
    tenantId: metadataValue(metadata, 'tenantId'),
    product: metadataValue(metadata, 'product'),
    paymentId: metadataValue(metadata, 'paymentId'),
    financialEntryId: metadataValue(metadata, 'financialEntryId')
  }
}

const HANDLED_STRIPE_EVENT_TYPES = new Set([
  'payment_intent.succeeded',
  'payment_intent.payment_failed'
])

function stripeEventWhere(externalEventId: string) {
  return {
    provider_externalEventId: {
      provider: 'STRIPE',
      externalEventId
    }
  }
}

export async function stripe(req: Request, res: Response) {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '')
  if (!secret) return res.status(503).json({ error: 'Webhook Stripe ainda não configurado.' })
  if (!verifyStripeSignature(req as ContextRequest, secret)) {
    return res.status(401).json({ error: 'Assinatura Stripe inválida.' })
  }

  const body = req.body || {}
  const id = String(body?.id || '').trim()
  const type = String(body?.type || '').trim()
  const obj = body?.data?.object

  if (!id || !type) {
    return res.status(400).json({ error: 'Evento Stripe inválido.' })
  }

  const identity = extractStripeIdentity(obj)

  try {
    await prisma.integrationWebhookEvent.create({
      data: {
        provider: 'STRIPE',
        externalEventId: id,
        eventType: type,
        payload: body,
        clinicId: identity.clinicId,
        tenantId: identity.tenantId
      }
    })
  } catch (error: any) {
    if (String(error?.code) !== 'P2002') throw error

    const existing = await prisma.integrationWebhookEvent.findUnique({
      where: stripeEventWhere(id)
    })

    if (existing?.status === 'PROCESSED' || existing?.status === 'IGNORED') {
      return res.json({ ok: true, duplicate: true, status: existing.status })
    }

    // Se uma tentativa anterior ficou RECEIVED/FAILED, deixa o Stripe tentar
    // processar novamente em vez de transformar a unicidade em bloqueio permanente.
    await prisma.integrationWebhookEvent.update({
      where: stripeEventWhere(id),
      data: {
        payload: body,
        eventType: type,
        status: 'RECEIVED',
        processedAt: null,
        error: null,
        ...(identity.clinicId ? { clinicId: identity.clinicId } : {}),
        ...(identity.tenantId ? { tenantId: identity.tenantId } : {})
      }
    })
  }

  if (identity.product && identity.product !== 'DENTALPOS') {
    await prisma.integrationWebhookEvent.update({
      where: stripeEventWhere(id),
      data: {
        status: 'IGNORED',
        processedAt: new Date(),
        error: `Evento destinado ao produto ${identity.product}; sem handler DentalPos para este produto.`
      }
    })
    return res.json({ ok: true, ignored: true, type })
  }

  if (!HANDLED_STRIPE_EVENT_TYPES.has(type)) {
    await prisma.integrationWebhookEvent.update({
      where: stripeEventWhere(id),
      data: {
        status: 'IGNORED',
        processedAt: new Date(),
        error: 'Sem lógica de negócio implementada para este tipo de evento na versão atual.'
      }
    })
    return res.json({ ok: true, ignored: true, type })
  }

  const externalId = String(obj?.id || '').trim()
  if (!externalId) {
    await prisma.integrationWebhookEvent.update({
      where: stripeEventWhere(id),
      data: {
        status: 'IGNORED',
        processedAt: new Date(),
        error: 'PaymentIntent sem identificador externo.'
      }
    })
    return res.json({ ok: true, ignored: true, type })
  }

  const status = type === 'payment_intent.succeeded' ? 'PAID' : 'FAILED'
  const failureEvent = type === 'payment_intent.payment_failed'

  try {
    let paymentsUpdated = await prisma.payment.updateMany({
      where: {
        externalId,
        ...(identity.clinicId ? { clinicId: identity.clinicId } : {}),
        ...(identity.tenantId ? { tenantId: identity.tenantId } : {}),
        ...(failureEvent ? { NOT: { status: 'PAID' } } : {})
      },
      data: {
        status,
        paidDate: status === 'PAID' ? new Date() : null,
        transactionStatus: String(obj?.status || status)
      }
    })

    // Fallback para eliminar a corrida entre a criação do PaymentIntent no Stripe
    // e a gravação do pi_... no registro local.
    if (paymentsUpdated.count === 0 && identity.paymentId && identity.clinicId) {
      paymentsUpdated = await prisma.payment.updateMany({
        where: {
          id: identity.paymentId,
          clinicId: identity.clinicId,
          ...(identity.tenantId ? { tenantId: identity.tenantId } : {}),
          ...(failureEvent ? { NOT: { status: 'PAID' } } : {})
        },
        data: {
          externalId,
          provider: 'STRIPE',
          status,
          paidDate: status === 'PAID' ? new Date() : null,
          transactionStatus: String(obj?.status || status)
        }
      })
    }

    let financialEntriesUpdated = await prisma.financialEntry.updateMany({
      where: {
        externalId,
        ...(identity.clinicId ? { clinicId: identity.clinicId } : {}),
        ...(identity.tenantId ? { tenantId: identity.tenantId } : {}),
        ...(failureEvent ? { NOT: { status: 'PAID' } } : {})
      },
      data: {
        status: status === 'PAID' ? 'PAID' : status,
        paidAt: status === 'PAID' ? new Date() : null
      }
    })

    if (financialEntriesUpdated.count === 0 && identity.financialEntryId && identity.clinicId) {
      financialEntriesUpdated = await prisma.financialEntry.updateMany({
        where: {
          id: identity.financialEntryId,
          clinicId: identity.clinicId,
          ...(identity.tenantId ? { tenantId: identity.tenantId } : {}),
          ...(failureEvent ? { NOT: { status: 'PAID' } } : {})
        },
        data: {
          externalId,
          provider: 'STRIPE',
          status: status === 'PAID' ? 'PAID' : status,
          paidAt: status === 'PAID' ? new Date() : null
        }
      })
    }

    let resolvedClinicId = identity.clinicId
    let resolvedTenantId = identity.tenantId

    if (!resolvedClinicId || !resolvedTenantId) {
      const payment = await prisma.payment.findFirst({
        where: { externalId },
        select: { clinicId: true, tenantId: true }
      })
      if (payment) {
        resolvedClinicId = resolvedClinicId || payment.clinicId
        resolvedTenantId = resolvedTenantId || payment.tenantId
      }
    }

    if (!resolvedClinicId || !resolvedTenantId) {
      const entry = await prisma.financialEntry.findFirst({
        where: { externalId },
        select: { clinicId: true, tenantId: true }
      })
      if (entry) {
        resolvedClinicId = resolvedClinicId || entry.clinicId
        resolvedTenantId = resolvedTenantId || entry.tenantId
      }
    }

    const handled = paymentsUpdated.count > 0 || financialEntriesUpdated.count > 0

    if (!handled && failureEvent) {
      const [paidPayment, paidEntry] = await Promise.all([
        prisma.payment.findFirst({
          where: {
            externalId,
            status: 'PAID',
            ...(identity.clinicId ? { clinicId: identity.clinicId } : {}),
            ...(identity.tenantId ? { tenantId: identity.tenantId } : {})
          },
          select: { id: true, clinicId: true, tenantId: true }
        }),
        prisma.financialEntry.findFirst({
          where: {
            externalId,
            status: 'PAID',
            ...(identity.clinicId ? { clinicId: identity.clinicId } : {}),
            ...(identity.tenantId ? { tenantId: identity.tenantId } : {})
          },
          select: { id: true, clinicId: true, tenantId: true }
        })
      ])

      const paid = paidPayment || paidEntry
      if (paid) {
        await prisma.integrationWebhookEvent.update({
          where: stripeEventWhere(id),
          data: {
            status: 'IGNORED',
            processedAt: new Date(),
            error: 'Evento payment_intent.payment_failed ignorado porque o registro local ja esta pago.',
            clinicId: paid.clinicId,
            tenantId: paid.tenantId
          }
        })
        return res.json({ ok: true, ignored: true, stale: true, type })
      }
    }

    if (handled) {
      await prisma.integrationWebhookEvent.update({
        where: stripeEventWhere(id),
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          error: null,
          ...(resolvedClinicId ? { clinicId: resolvedClinicId } : {}),
          ...(resolvedTenantId ? { tenantId: resolvedTenantId } : {})
        }
      })
      return res.json({
        ok: true,
        processed: true,
        type,
        paymentsUpdated: paymentsUpdated.count,
        financialEntriesUpdated: financialEntriesUpdated.count
      })
    }

    // Quando o PaymentIntent foi criado com IDs internos, ausência de match pode ser
    // apenas uma corrida de persistência. Responder 500 permite retry do Stripe.
    if (identity.paymentId || identity.financialEntryId) {
      await prisma.integrationWebhookEvent.update({
        where: stripeEventWhere(id),
        data: {
          status: 'FAILED',
          processedAt: new Date(),
          error: 'PaymentIntent DentalPos sem correspondência local; aguardando retry do Stripe.',
          ...(resolvedClinicId ? { clinicId: resolvedClinicId } : {}),
          ...(resolvedTenantId ? { tenantId: resolvedTenantId } : {})
        }
      })
      return res.status(500).json({ error: 'Evento Stripe aguardando correspondência local.' })
    }

    await prisma.integrationWebhookEvent.update({
      where: stripeEventWhere(id),
      data: {
        status: 'IGNORED',
        processedAt: new Date(),
        error: 'Nenhum Payment ou FinancialEntry encontrado para este PaymentIntent.',
        ...(resolvedClinicId ? { clinicId: resolvedClinicId } : {}),
        ...(resolvedTenantId ? { tenantId: resolvedTenantId } : {})
      }
    })
    return res.json({ ok: true, ignored: true, type })
  } catch (error: any) {
    const message = String(error?.message || 'Falha ao processar webhook Stripe.').slice(0, 1500)
    try {
      await prisma.integrationWebhookEvent.update({
        where: stripeEventWhere(id),
        data: {
          status: 'FAILED',
          processedAt: new Date(),
          error: message,
          ...(identity.clinicId ? { clinicId: identity.clinicId } : {}),
          ...(identity.tenantId ? { tenantId: identity.tenantId } : {})
        }
      })
    } catch {}

    // 5xx é proposital: o Stripe deve tentar novamente em falha transitória.
    return res.status(500).json({ error: 'Falha ao processar webhook Stripe.' })
  }
}
