// Cobrança da taxa de sucesso. Provedores: "mock" (desenvolvimento/testes, nunca em produção) e
// Mercado Pago (Pix e Checkout Pro para cartão) por chamadas REST diretas, sem SDK.
import crypto from 'node:crypto';
import { config } from './config.js';
import { HttpError } from './http.js';

export interface ChargeInput { saleId: string; amountCents: number; description: string; payer: { email: string; name: string; docType: 'cpf' | 'cnpj' | null; docNumber: string | null }; method: 'pix' | 'cartao'; dueAt: Date }
export interface Charge { provider: string; ref: string; pixCopyPaste?: string; pixQrBase64?: string; checkoutUrl?: string }

const MP = 'https://api.mercadopago.com';
async function mp(path: string, init: RequestInit & { idem?: string } = {}) {
  const res = await fetch(`${MP}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.payments.mpToken}`, 'Content-Type': 'application/json', ...(init.idem ? { 'X-Idempotency-Key': init.idem } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { console.error('Mercado Pago erro', res.status, JSON.stringify(body).slice(0, 500)); throw new HttpError(502, 'payment_provider_error'); }
  return body as any;
}

export async function createCharge(c: ChargeInput): Promise<Charge> {
  const amount = c.amountCents / 100;
  if (config.payments.provider === 'mock') {
    return c.method === 'pix'
      ? { provider: 'mock', ref: `mock_${c.saleId}`, pixCopyPaste: `00020126MOCKPIX${c.saleId}5204000053039865406${amount.toFixed(2)}6304ABCD`, pixQrBase64: '' }
      : { provider: 'mock', ref: `mock_${c.saleId}`, checkoutUrl: `${config.appUrl}/pagamento-simulado/${c.saleId}` };
  }
  const [first, ...rest] = c.payer.name.split(' ');
  if (c.method === 'pix') {
    const p = await mp('/v1/payments', {
      method: 'POST', idem: `pix-${c.saleId}`,
      body: JSON.stringify({
        transaction_amount: amount, description: c.description, payment_method_id: 'pix', external_reference: c.saleId,
        date_of_expiration: c.dueAt.toISOString().replace('Z', '-00:00'),
        notification_url: `${process.env.API_URL ?? config.appUrl}/api/webhooks/mercadopago`,
        payer: { email: c.payer.email, first_name: first, last_name: rest.join(' ') || first, ...(c.payer.docNumber ? { identification: { type: c.payer.docType === 'cnpj' ? 'CNPJ' : 'CPF', number: c.payer.docNumber } } : {}) },
      }),
    });
    return { provider: 'mercadopago', ref: String(p.id), pixCopyPaste: p.point_of_interaction?.transaction_data?.qr_code, pixQrBase64: p.point_of_interaction?.transaction_data?.qr_code_base64 };
  }
  const pref = await mp('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ title: c.description, quantity: 1, unit_price: amount, currency_id: 'BRL' }],
      external_reference: c.saleId, payer: { email: c.payer.email },
      back_urls: { success: `${config.appUrl}/venda?pago=${c.saleId}`, failure: `${config.appUrl}/venda`, pending: `${config.appUrl}/venda` },
      auto_return: 'approved', notification_url: `${process.env.API_URL ?? config.appUrl}/api/webhooks/mercadopago`,
    }),
  });
  return { provider: 'mercadopago', ref: String(pref.id), checkoutUrl: pref.init_point };
}

/** Consulta o pagamento no provedor (fonte da verdade — o corpo do webhook nunca é confiado). */
export async function fetchPayment(paymentId: string): Promise<{ status: string; saleId: string | null; amountCents: number }> {
  const p = await mp(`/v1/payments/${encodeURIComponent(paymentId)}`);
  return { status: p.status, saleId: p.external_reference ?? null, amountCents: Math.round(Number(p.transaction_amount) * 100) };
}

/** Confere x-signature do Mercado Pago (quando MP_WEBHOOK_SECRET está definido). */
export function verifyMpSignature(headers: Record<string, unknown>, dataId: string): boolean {
  const secret = config.payments.mpWebhookSecret;
  if (!secret) return true;
  const sig = String(headers['x-signature'] ?? '');
  const ts = sig.match(/ts=([^,]+)/)?.[1], v1 = sig.match(/v1=([^,]+)/)?.[1];
  if (!ts || !v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${headers['x-request-id'] ?? ''};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return expected.length === v1.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
