import { prisma } from '../lib/prisma'
import { decryptSecret } from './secretVault'

// Integração Asaas da CLÍNICA (cada clínica usa a própria conta/chave). Não confundir com platformBillingService,
// que é a cobrança da própria WMundi aos assinantes.

export type AsaasConn = { base: string; headers: Record<string, string>; environment: string }

export function asaasBase(environment: string) {
  // ASAAS_API_BASE_OVERRIDE existe só para testes automatizados com um Asaas simulado.
  const override = process.env.ASAAS_API_BASE_OVERRIDE
  if (override) return override.replace(/\/$/, '')
  return String(environment).toUpperCase() === 'PRODUCTION' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3'
}

export function connFromKey(apiKey: string, environment: string): AsaasConn {
  return {
    base: asaasBase(environment),
    environment,
    headers: { 'Content-Type': 'application/json', access_token: apiKey, 'User-Agent': 'DentalPosOne' }
  }
}

export async function loadAsaasConn(clinicId: string): Promise<AsaasConn | null> {
  const config = await prisma.paymentProviderConfig.findUnique({ where: { clinicId_provider: { clinicId, provider: 'ASAAS' } } })
  if (!config?.isActive || !config.credentialsConfigured) return null
  const creds = decryptSecret<{ apiKey?: string; accessToken?: string }>(config.encryptedCredentials)
  const apiKey = creds?.apiKey || creds?.accessToken
  if (!apiKey) return null
  return connFromKey(String(apiKey), config.environment)
}

export class AsaasError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export async function asaasCall(conn: AsaasConn, path: string, init: RequestInit = {}) {
  const response = await fetch(`${conn.base}${path}`, { ...init, headers: { ...conn.headers, ...(init.headers || {}) } })
  const text = await response.text()
  let data: any
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
  if (!response.ok) throw new AsaasError(data?.errors?.[0]?.description || data?.message || `Asaas HTTP ${response.status}`, response.status)
  return data
}

export type CustomerInput = { externalReference: string; name: string; email?: string | null; phone?: string | null; cpfCnpj?: string | null }
const digits = (v?: string | null) => String(v || '').replace(/\D/g, '')

// Um cliente Asaas por paciente (reaproveitado pela referência externa), em vez de criar um novo a cada cobrança.
export async function ensureAsaasCustomer(conn: AsaasConn, c: CustomerInput) {
  const found = await asaasCall(conn, `/customers?externalReference=${encodeURIComponent(c.externalReference)}&limit=1`)
  if (found?.data?.[0]?.id) return String(found.data[0].id)
  const created = await asaasCall(conn, '/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: c.name,
      ...(c.email ? { email: c.email } : {}),
      ...(digits(c.phone) ? { mobilePhone: digits(c.phone) } : {}),
      ...(digits(c.cpfCnpj) ? { cpfCnpj: digits(c.cpfCnpj) } : {}),
      externalReference: c.externalReference,
      notificationDisabled: false
    })
  })
  return String(created.id)
}

export type SplitInput = { walletId: string; percentualValue?: number; fixedValue?: number; totalFixedValue?: number }

export type CreateChargeInput = {
  customerId: string
  billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED'
  value: number
  dueDate: string
  description: string
  externalReference: string
  installmentCount?: number
  split?: SplitInput[]
}

export async function createAsaasPayment(conn: AsaasConn, input: CreateChargeInput) {
  const installments = Math.max(1, Math.floor(input.installmentCount || 1))
  const body: Record<string, unknown> = {
    customer: input.customerId,
    billingType: input.billingType,
    dueDate: input.dueDate,
    description: input.description,
    externalReference: input.externalReference
  }
  if (installments > 1) { body.installmentCount = installments; body.totalValue = input.value } else body.value = input.value
  if (input.split?.length) body.split = input.split
  const payment = await asaasCall(conn, '/payments', { method: 'POST', body: JSON.stringify(body) })

  let pixCopyPaste: string | undefined
  let barcode: string | undefined
  let digitableLine: string | undefined
  if (input.billingType === 'PIX') {
    try { pixCopyPaste = (await asaasCall(conn, `/payments/${payment.id}/pixQrCode`))?.payload } catch { /* o link da fatura também mostra o PIX */ }
  }
  if (input.billingType === 'BOLETO') {
    try {
      const id = await asaasCall(conn, `/payments/${payment.id}/identificationField`)
      barcode = id?.barCode
      digitableLine = id?.identificationField
    } catch { /* o link da fatura também mostra o boleto */ }
  }
  return {
    externalId: String(payment.id),
    installmentId: payment.installment ? String(payment.installment) : undefined,
    status: String(payment.status || 'PENDING'),
    invoiceUrl: payment.invoiceUrl as string | undefined,
    pixCopyPaste, barcode, digitableLine,
    raw: payment
  }
}

export async function cancelAsaasPayment(conn: AsaasConn, externalId: string, installmentId?: string | null) {
  if (installmentId) return asaasCall(conn, `/installments/${encodeURIComponent(installmentId)}`, { method: 'DELETE' })
  return asaasCall(conn, `/payments/${encodeURIComponent(externalId)}`, { method: 'DELETE' })
}

const WEBHOOK_EVENTS = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_REFUNDED', 'PAYMENT_DELETED']

// Tenta cadastrar o webhook no Asaas da clínica automaticamente; se falhar, a tela mostra o passo a passo manual.
export async function registerAsaasWebhook(conn: AsaasConn, url: string, authToken: string, email?: string) {
  await asaasCall(conn, '/webhooks', {
    method: 'POST',
    body: JSON.stringify({ name: 'DentalPos One', url, ...(email ? { email } : {}), enabled: true, interrupted: false, apiVersion: 3, authToken, sendType: 'SEQUENTIALLY', events: WEBHOOK_EVENTS })
  })
}
