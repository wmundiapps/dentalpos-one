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

export async function stripe(req: Request, res: Response) {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '')
  if (!secret) return res.status(503).json({ error: 'Webhook Stripe ainda não configurado.' })
  if (!verifyStripeSignature(req as ContextRequest, secret)) {
    return res.status(401).json({ error: 'Assinatura Stripe inválida.' })
  }

  const body = req.body || {}
  const id = eventId(body, `stripe-${Date.now()}`)
  const type = String(body.type || 'UNKNOWN')

  try {
    await prisma.integrationWebhookEvent.create({
      data: { provider: 'STRIPE', externalEventId: id, eventType: type, payload: body }
    })
  } catch (error: any) {
    if (String(error?.code) === 'P2002') return res.json({ ok: true, duplicate: true })
    throw error
  }

  const obj = body?.data?.object
  const externalId = obj?.id
  if (externalId) {
    const status = type === 'payment_intent.succeeded'
      ? 'PAID'
      : type === 'payment_intent.payment_failed'
        ? 'FAILED'
        : undefined

    if (status) {
      await prisma.payment.updateMany({
        where: { externalId },
        data: {
          status,
          paidDate: status === 'PAID' ? new Date() : undefined,
          transactionStatus: String(obj?.status || status)
        }
      })
      await prisma.financialEntry.updateMany({
        where: { externalId },
        data: { status: status === 'PAID' ? 'PAID' : status, paidAt: status === 'PAID' ? new Date() : undefined }
      })
    }
  }

  await prisma.integrationWebhookEvent.update({
    where: { provider_externalEventId: { provider: 'STRIPE', externalEventId: id } },
    data: { status: 'PROCESSED', processedAt: new Date() }
  })
  return res.json({ ok: true })
}
