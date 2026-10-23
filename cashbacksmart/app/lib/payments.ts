/**
 * Cobrança automática. PAYMENT_PROVIDER escolhe o meio:
 *  - asaas  (padrão quando ASAAS_API_KEY existe): Pix, boleto ou cartão; o Asaas envia a cobrança e lembra o pagador
 *  - stripe (quando STRIPE_SECRET_KEY existe): fatura Stripe (cartão, boleto ou Pix, conforme ativado na conta)
 * Sem chave, as faturas ficam "manuais" (baixa pelo painel admin).
 */
import crypto from 'crypto';
export type ChargeRequest = {
  invoiceId: string;
  amountCents: number;
  dueDate: string; // AAAA-MM-DD
  description: string;
  customer: { name: string; email: string; cpfCnpj: string | null; phone?: string | null; externalId: string };
};
export type ChargeResult = { provider: string; ref: string | null; url: string | null };

export interface PaymentProvider {
  name: string;
  createCharge(req: ChargeRequest): Promise<ChargeResult>;
}

export const manualProvider: PaymentProvider = {
  name: 'manual',
  async createCharge() {
    return { provider: 'manual', ref: null, url: null };
  },
};

export function asaasProvider(apiKey: string, baseUrl = process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3', fetchFn: typeof fetch = fetch): PaymentProvider {
  async function call(path: string, init: RequestInit = {}) {
    const r = await fetchFn(baseUrl + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', access_token: apiKey, 'User-Agent': 'Cashbacksmart', ...(init.headers || {}) },
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Asaas ${r.status}: ${JSON.stringify((body as any).errors || body)}`);
    return body as any;
  }
  return {
    name: 'asaas',
    async createCharge(req) {
      const found = await call(`/customers?externalReference=${encodeURIComponent(req.customer.externalId)}`);
      let customerId: string = found?.data?.[0]?.id;
      if (!customerId) {
        const created = await call('/customers', {
          method: 'POST',
          body: JSON.stringify({
            name: req.customer.name,
            email: req.customer.email,
            cpfCnpj: req.customer.cpfCnpj || undefined,
            mobilePhone: req.customer.phone || undefined,
            externalReference: req.customer.externalId,
            notificationDisabled: false,
          }),
        });
        customerId = created.id;
      }
      const pay = await call('/payments', {
        method: 'POST',
        body: JSON.stringify({
          customer: customerId,
          billingType: 'UNDEFINED',
          value: req.amountCents / 100,
          dueDate: req.dueDate,
          description: req.description,
          externalReference: req.invoiceId,
        }),
      });
      return { provider: 'asaas', ref: pay.id, url: pay.invoiceUrl || null };
    },
  };
}

/** Stripe Invoicing: cria cliente, item e fatura com vencimento; devolve o link da fatura hospedada */
export function stripeProvider(secretKey: string, fetchFn: typeof fetch = fetch): PaymentProvider {
  async function call(path: string, params?: Record<string, string>, method = 'POST') {
    const r = await fetchFn('https://api.stripe.com/v1' + path, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params ? new URLSearchParams(params).toString() : undefined,
    });
    const body: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Stripe ${r.status}: ${body?.error?.message || 'erro'}`);
    return body;
  }
  return {
    name: 'stripe',
    async createCharge(req) {
      const found = await call(`/customers/search?query=${encodeURIComponent(`metadata['external_id']:'${req.customer.externalId}'`)}`, undefined, 'GET');
      let customerId: string = found?.data?.[0]?.id;
      if (!customerId) {
        const created = await call('/customers', {
          name: req.customer.name,
          email: req.customer.email,
          ...(req.customer.phone ? { phone: req.customer.phone } : {}),
          'metadata[external_id]': req.customer.externalId,
          ...(req.customer.cpfCnpj ? { 'metadata[cpf_cnpj]': req.customer.cpfCnpj } : {}),
        });
        customerId = created.id;
      }
      const days = Math.max(1, Math.round((new Date(req.dueDate + 'T12:00:00Z').getTime() - Date.now()) / 86400000));
      const inv = await call('/invoices', {
        customer: customerId,
        collection_method: 'send_invoice',
        days_until_due: String(days),
        currency: 'brl',
        description: req.description.slice(0, 480),
        'metadata[invoice_id]': req.invoiceId,
        auto_advance: 'true',
      });
      await call('/invoiceitems', { customer: customerId, invoice: inv.id, amount: String(req.amountCents), currency: 'brl', description: req.description.slice(0, 480) });
      const fin = await call(`/invoices/${inv.id}/finalize`, {});
      return { provider: 'stripe', ref: fin.id, url: fin.hosted_invoice_url || null };
    },
  };
}

/** Confere a assinatura do webhook do Stripe (cabeçalho Stripe-Signature) */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]).filter((p) => p.length === 2));
  const t = Number(parts.t);
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

export function paymentProvider(): PaymentProvider {
  const choice = process.env.PAYMENT_PROVIDER;
  if ((choice === 'stripe' || !process.env.ASAAS_API_KEY) && process.env.STRIPE_SECRET_KEY) return stripeProvider(process.env.STRIPE_SECRET_KEY);
  if (process.env.ASAAS_API_KEY) return asaasProvider(process.env.ASAAS_API_KEY);
  return manualProvider;
}
