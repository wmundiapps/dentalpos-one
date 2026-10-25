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

// ---- conta Mercado Pago do vendedor (OAuth de marketplace) ----
export function mpAuthUrl(state: string): string {
  const redirect = `${process.env.API_URL ?? config.appUrl}/api/payment-method/mp/callback`;
  return `https://auth.mercadopago.com.br/authorization?client_id=${encodeURIComponent(config.payments.mpClientId)}&response_type=code&platform_id=mp&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirect)}`;
}
export async function mpExchangeCode(code: string): Promise<{ userId: string; accessToken: string; refreshToken: string }> {
  const redirect = `${process.env.API_URL ?? config.appUrl}/api/payment-method/mp/callback`;
  const r = await fetch(`${MP}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: config.payments.mpClientId, client_secret: config.payments.mpClientSecret, grant_type: 'authorization_code', code, redirect_uri: redirect }) });
  const b: any = await r.json().catch(() => ({}));
  if (!r.ok || !b.access_token) throw new HttpError(502, 'payment_provider_error');
  return { userId: String(b.user_id), accessToken: b.access_token, refreshToken: b.refresh_token };
}

// ---- compra com dinheiro retido ----
// Mercado Pago "Pagamentos avançados": o comprador paga (Pix), o valor fica retido no Mercado Pago (não passa
// por conta do Vendeu), a comissão é nossa (application_fee) e a liberação ao vendedor é feita só quando o prazo acaba.
// ATENÇÃO: o Pagamentos Avançados exige habilitação do Mercado Pago na conta do marketplace e deve ser validado no sandbox.
export interface EscrowInput { orderId: string; priceCents: number; commissionCents: number; description: string; sellerMpUserId: string; payerEmail: string; payerName: string; dueAt: Date }
export interface EscrowCharge { provider: string; ref: string; pixCopyPaste?: string; pixQrBase64?: string }

export async function createEscrowCharge(c: EscrowInput): Promise<EscrowCharge> {
  if (config.payments.provider === 'mock') {
    return { provider: 'mock', ref: `mock_${c.orderId}`, pixCopyPaste: `00020126MOCKPIX${c.orderId}5204000053039865406${(c.priceCents / 100).toFixed(2)}6304ABCD`, pixQrBase64: '' };
  }
  const [first, ...rest] = c.payerName.split(' ');
  const p = await mp('/v1/advanced_payments', {
    method: 'POST', idem: `ord-${c.orderId}`,
    body: JSON.stringify({
      description: c.description, external_reference: c.orderId, binary_mode: true,
      payer: { email: c.payerEmail, first_name: first, last_name: rest.join(' ') || first },
      payments: [{ payment_method_id: 'pix', payment_type_id: 'bank_transfer', transaction_amount: c.priceCents / 100, date_of_expiration: c.dueAt.toISOString().replace('Z', '-00:00') }],
      disbursements: [{ amount: c.priceCents / 100, external_reference: c.orderId, collector_id: Number(c.sellerMpUserId), application_fee: c.commissionCents / 100, money_release_days: 60 }],
    }),
  });
  const pay = p.payments?.[0];
  return { provider: 'mercadopago', ref: String(p.id), pixCopyPaste: pay?.point_of_interaction?.transaction_data?.qr_code, pixQrBase64: pay?.point_of_interaction?.transaction_data?.qr_code_base64 };
}

/** Consulta o pagamento avançado (fonte da verdade do webhook). */
export async function fetchAdvancedPayment(id: string): Promise<{ status: string; orderId: string | null; amountCents: number }> {
  const p = await mp(`/v1/advanced_payments/${encodeURIComponent(id)}`);
  const amount = (p.payments ?? []).reduce((a: number, x: any) => a + Math.round(Number(x.transaction_amount) * 100), 0);
  return { status: p.status, orderId: p.external_reference ?? null, amountCents: amount };
}

/** Libera o dinheiro retido ao vendedor (a comissão fica com o Vendeu). */
export async function releaseEscrow(o: { orderId: string; ref: string | null; provider: string | null }): Promise<string> {
  if (o.provider === 'mock' || config.payments.provider === 'mock') return `mockrelease_${o.orderId}`;
  const r = await mp(`/v1/advanced_payments/${o.ref}/disburses`, { method: 'PUT', body: JSON.stringify({ money_release_date: new Date().toISOString().replace('Z', '-00:00') }) });
  return String(r.id ?? o.ref);
}

/** Devolve o valor INTEGRAL ao comprador (comissão incluída: ninguém fica com nada). */
export async function refundEscrow(o: { orderId: string; ref: string | null; provider: string | null }): Promise<string> {
  if (o.provider === 'mock' || config.payments.provider === 'mock') return `mockrefund_${o.orderId}`;
  const r = await mp(`/v1/advanced_payments/${o.ref}/refund`, { method: 'POST', idem: `refund-${o.orderId}` });
  return String(r.id ?? o.ref);
}
