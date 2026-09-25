// Mercado Pago — América Latina (BR, AR, CL, CO, MX, PE, UY). Checkout Pro
// hospedado (Pix, boleto, cartões, OXXO, PSE...). Cada país tem conta e token
// próprios: MP_ACCESS_TOKEN_BR, MP_ACCESS_TOKEN_MX... (MP_ACCESS_TOKEN vale para o BR).
// Webhook assinado com MP_WEBHOOK_SECRET. Checkout Pro captura na hora: "cancelar"
// depois de aprovado vira estorno integral; sem cobrança posterior automática
// (penalidades geram link de pagamento).

import crypto from 'node:crypto';
import type { Booking, Listing, Payment, User } from '../../../shared/types.js';
import { type CheckoutUrls, type Gateway, type PaymentUpdate, PaymentProviderError } from './gateway.js';

const API = 'https://api.mercadopago.com';

export const MERCADOPAGO_COUNTRIES = ['BR', 'AR', 'CL', 'CO', 'MX', 'PE', 'UY'] as const;

type Fetch = typeof fetch;

export function mercadoPagoToken(countryCode: string): string | undefined {
  return process.env[`MP_ACCESS_TOKEN_${countryCode}`] ?? (countryCode === 'BR' ? process.env.MP_ACCESS_TOKEN : undefined);
}

/** marketplace: pagamento criado com o token do anfitrião; a comissão da plataforma vai em marketplace_fee. */
export function mercadoPagoGateway(countryCode: string, accessToken: string, webhookSecret: string | undefined, http: Fetch = fetch, opts: { marketplace?: boolean } = {}): Gateway {
  async function call<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    let res: Response;
    try {
      res = await http(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new PaymentProviderError('mercadopago', `falha de rede: ${(e as Error).message}`, true);
    }
    const data = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) throw new PaymentProviderError('mercadopago', `${res.status} ${data.message ?? ''}`.trim(), res.status >= 500);
    return data;
  }

  const sandbox = process.env.MP_SANDBOX === 'true';

  return {
    id: 'mercadopago',
    instant: false,
    supportsOffSession: false,

    async createCheckout(p: Payment, b: Booking, l: Listing, payer: User, urls: CheckoutUrls) {
      const pref = await call<{ id: string; init_point: string; sandbox_init_point: string }>('POST', '/checkout/preferences', {
        items: [{
          id: b.id, title: `SpaceHour — ${l.title}`.slice(0, 250), quantity: 1, currency_id: p.currency, unit_price: p.amount,
          description: b.occurrences.map((o) => `${o.date} ${o.start}-${o.end}`).join(', ').slice(0, 250),
        }],
        payer: { email: payer.email, name: payer.name },
        external_reference: p.id,
        metadata: { payment_id: p.id, booking_id: b.id, country: countryCode },
        ...(opts.marketplace ? { marketplace_fee: Math.max(0, Math.round((b.price.total - b.price.hostPayout) * 100) / 100) } : {}),
        back_urls: { success: urls.successUrl, failure: urls.cancelUrl, pending: urls.successUrl },
        auto_return: 'approved',
        notification_url: urls.notificationUrl,
        statement_descriptor: 'SPACEHOUR',
        expires: true,
        expiration_date_to: new Date(Date.now() + 30 * 60000).toISOString(),
        ...(p.method === 'pix' ? { payment_methods: { default_payment_method_id: 'pix' } } : {}),
      }, `pref-${p.id}`);
      return { checkoutRef: pref.id, checkoutUrl: sandbox ? pref.sandbox_init_point : pref.init_point };
    },

    // Checkout Pro já captura no momento da aprovação
    async capture() {},

    async cancel(p) {
      if (!p.providerRef) return; // checkout não pago expira sozinho
      const pay = await call<{ status: string }>('GET', `/v1/payments/${p.providerRef}`);
      if (pay.status === 'approved') await call('POST', `/v1/payments/${p.providerRef}/refunds`, {}, `cancel-${p.id}`);
      else if (pay.status === 'pending' || pay.status === 'in_process') await call('PUT', `/v1/payments/${p.providerRef}`, { status: 'cancelled' });
    },

    async refund(p, amount) {
      if (!p.providerRef) return;
      await call('POST', `/v1/payments/${p.providerRef}/refunds`, { amount }, `refund-${p.id}-${p.refunded}-${amount}`);
    },

    async chargeExtra(p, amount, reason, payer, urls) {
      const pref = await call<{ id: string; init_point: string; sandbox_init_point: string }>('POST', '/checkout/preferences', {
        items: [{ id: `${p.id}-extra-${p.extraCharges.length}`, title: `SpaceHour — ${reason}`, quantity: 1, currency_id: p.currency, unit_price: amount }],
        payer: { email: payer.email },
        external_reference: `${p.id}:extra:${p.extraCharges.length}`,
        metadata: { payment_id: p.id, kind: 'extra_charge', reason },
        back_urls: { success: urls.successUrl, failure: urls.cancelUrl, pending: urls.successUrl },
        notification_url: urls.notificationUrl,
      }, `extra-${p.id}-${p.extraCharges.length}`);
      return { ref: pref.id, payLink: sandbox ? pref.sandbox_init_point : pref.init_point };
    },

    // Sem pré-autorização de caução no Checkout Pro: a caução é substituída por avalista
    async holdDeposit() { return undefined; },
    async captureDeposit() {},
    async releaseDeposit() {},

    async parseWebhook(_raw, headers, query) {
      const q = query as { 'data.id'?: string; type?: string; topic?: string; id?: string };
      const body = JSON.parse(_raw.toString('utf8') || '{}') as { type?: string; action?: string; data?: { id?: string }; id?: string | number };
      const type = body.type ?? q.type ?? q.topic;
      const dataId = String(body.data?.id ?? q['data.id'] ?? q.id ?? '');
      if (type !== 'payment' || !dataId) return { eventId: `${type}:${dataId}:${body.id ?? ''}`, updates: [] };

      // Assinatura: HMAC-SHA256 de "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
      if (!webhookSecret) throw new PaymentProviderError('mercadopago', 'MP_WEBHOOK_SECRET ausente');
      const sig = String(headers['x-signature'] ?? '');
      const parts = Object.fromEntries(sig.split(',').map((kv) => kv.trim().split('=') as [string, string]));
      const manifest = `id:${dataId.toLowerCase()};request-id:${String(headers['x-request-id'] ?? '')};ts:${parts.ts};`;
      const expected = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');
      const given = parts.v1 ?? '';
      if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
        throw new PaymentProviderError('mercadopago', 'assinatura do webhook inválida');
      }

      // Estado real consultado na API (o aviso só diz "algo mudou")
      const pay = await call<{ id: number; status: string; external_reference?: string; transaction_amount: number }>('GET', `/v1/payments/${dataId}`);
      const ref = pay.external_reference ?? '';
      const updates: PaymentUpdate[] = [];
      if (ref && !ref.includes(':extra')) {
        const outcome = pay.status === 'approved' ? 'captured'
          : pay.status === 'rejected' || pay.status === 'cancelled' ? 'failed'
            : pay.status === 'refunded' || pay.status === 'charged_back' ? 'refunded' : null;
        if (outcome) updates.push({ paymentId: ref, outcome, providerRef: String(pay.id), amount: pay.transaction_amount });
      }
      return { eventId: `payment:${dataId}:${pay.status}`, updates };
    },
  };
}
