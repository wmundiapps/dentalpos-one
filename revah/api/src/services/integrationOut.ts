import type { Tenant } from '@prisma/client'
import { hmacHex } from '../lib/crypto'

// Notifica o sistema integrado (ex.: DentalPos One) sobre fatos do REVAH.
// Assinatura: X-Revah-Signature = HMAC-SHA256(integrationSecret, `${timestamp}.${corpo}`).
export async function notifyIntegration(tenant: Pick<Tenant, 'id' | 'integrationWebhookUrl' | 'integrationSecret'>, type: string, data: Record<string, unknown>) {
  if (!tenant.integrationWebhookUrl || !tenant.integrationSecret) return false
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const body = JSON.stringify({ type, tenantId: tenant.id, occurredAt: new Date().toISOString(), data })
  try {
    const res = await fetch(tenant.integrationWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Revah-Timestamp': timestamp,
        'X-Revah-Signature': hmacHex(tenant.integrationSecret, `${timestamp}.${body}`),
      },
      body,
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch (e) {
    console.error('[revah] falha ao notificar integração', type, (e as Error).message)
    return false
  }
}
