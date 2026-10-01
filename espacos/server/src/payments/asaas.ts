// Asaas — segunda opção de pagamento no Brasil (Pix, cartão e boleto, sem o
// locatário precisar ter conta). A cobrança é emitida na conta da plataforma
// (ASAAS_API_KEY) e a parte do anfitrião vai por split para a carteira dele
// (walletId, em sellerRef). O split é percentual sobre o valor líquido, então a
// tarifa do Asaas é dividida na mesma proporção entre anfitrião e plataforma.
// Webhook autenticado pelo cabeçalho asaas-access-token (asaasWebhookToken()).
// Env: ASAAS_API_KEY; ASAAS_ENV=sandbox para testes (ou ASAAS_API_URL).

import crypto from 'node:crypto';
import type { Booking, Listing, Payment, User } from '../../../shared/types.js';
import { type CheckoutUrls, type Gateway, type PaymentUpdate, PaymentProviderError } from './gateway.js';

type Fetch = typeof fetch;
let http: Fetch = (...a) => fetch(...a);
/** Para testes: substitui as chamadas HTTP ao Asaas. */
export function setAsaasHttp(fn?: Fetch) { http = fn ?? ((...a) => fetch(...a)); }

export const asaasEnabled = () => !!process.env.ASAAS_API_KEY;
export const asaasApi = () => process.env.ASAAS_API_URL ?? (process.env.ASAAS_ENV === 'sandbox' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3');

/** Token que o Asaas manda em cada aviso (derivado do segredo do servidor; ASAAS_WEBHOOK_TOKEN se definido). */
export function asaasWebhookToken() {
  return process.env.ASAAS_WEBHOOK_TOKEN ?? crypto.createHmac('sha256', process.env.JWT_SECRET ?? 'dev-secret-change-me').update('asaas-webhook').digest('hex');
}

export class AsaasError extends PaymentProviderError {
  constructor(public status: number, public description: string, public code?: string) {
    super('asaas', `${status} ${description}`.trim(), status >= 500);
  }
}

export async function asaasCall<T>(method: string, path: string, body?: unknown, apiKey = process.env.ASAAS_API_KEY ?? ''): Promise<T> {
  let res: Response;
  try {
    res = await http(`${asaasApi()}${path}`, {
      method,
      headers: { access_token: apiKey, 'Content-Type': 'application/json', 'User-Agent': 'SpaceHour' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new PaymentProviderError('asaas', `falha de rede: ${(e as Error).message}`, true);
  }
  const data = (await res.json().catch(() => ({}))) as T & { errors?: Array<{ code?: string; description?: string }> };
  if (!res.ok) throw new AsaasError(res.status, data.errors?.map((e) => e.description).join('; ') ?? '', data.errors?.[0]?.code);
  return data;
}

const BILLING: Record<string, string> = { pix: 'PIX', card: 'CREDIT_CARD', boleto: 'BOLETO' };
const today = (days = 0) => new Date(Date.now() + days * 86400000 - 3 * 3600000).toISOString().slice(0, 10); // horário de Brasília

/** Cliente do locatário no Asaas (um por usuário; CPF/CNPJ é obrigatório para cobrar). */
async function customerFor(payer: User): Promise<string> {
  const taxId = (payer.documentNumber ?? '').replace(/\D/g, '');
  const found = await asaasCall<{ data: Array<{ id: string; cpfCnpj?: string }> }>('GET', `/customers?externalReference=${encodeURIComponent(payer.id)}&limit=1`);
  const c = found.data?.[0];
  if (c) {
    if (taxId && c.cpfCnpj !== taxId) await asaasCall('PUT', `/customers/${c.id}`, { cpfCnpj: taxId });
    return c.id;
  }
  const created = await asaasCall<{ id: string }>('POST', '/customers', {
    name: payer.name, email: payer.email, cpfCnpj: taxId || undefined, mobilePhone: payer.phone?.replace(/\D/g, '') || undefined,
    externalReference: payer.id, notificationDisabled: true,
  });
  return created.id;
}

export function asaasGateway(): Gateway {
  async function charge(p: Payment, payer: User, value: number, description: string, ref: string, urls: CheckoutUrls, split?: { walletId: string; percent: number }) {
    const customer = await customerFor(payer);
    return asaasCall<{ id: string; invoiceUrl: string }>('POST', '/payments', {
      customer, billingType: BILLING[p.method] ?? 'UNDEFINED', value, dueDate: today(1), description: description.slice(0, 500),
      externalReference: ref,
      ...(split && split.percent > 0 ? { split: [{ walletId: split.walletId, percentualValue: split.percent }] } : {}),
      callback: { successUrl: urls.successUrl, autoRedirect: true },
    });
  }

  return {
    id: 'asaas',
    instant: false,
    supportsOffSession: false,

    async createCheckout(p: Payment, b: Booking, l: Listing, payer: User, urls: CheckoutUrls) {
      if (!p.sellerRef) throw new PaymentProviderError('asaas', 'carteira do anfitrião ausente');
      const percent = Math.floor((b.price.hostPayout / b.price.total) * 10000) / 100; // 2 casas, arredondado para baixo
      const desc = `SpaceHour — ${l.title} — ${b.occurrences.map((o) => `${o.date} ${o.start}-${o.end}`).join(', ')}`;
      const pay = await charge(p, payer, p.amount, desc, p.id, urls, { walletId: p.sellerRef, percent });
      return { checkoutRef: pay.id, checkoutUrl: pay.invoiceUrl };
    },

    // Pix/boleto/cartão à vista: confirmado = capturado
    async capture() {},

    async cancel(p) {
      const ref = p.providerRef ?? p.checkoutRef;
      if (!ref) return;
      const pay = await asaasCall<{ status: string }>('GET', `/payments/${ref}`);
      if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(pay.status)) await asaasCall('POST', `/payments/${ref}/refund`, {});
      else if (pay.status === 'PENDING' || pay.status === 'OVERDUE') await asaasCall('DELETE', `/payments/${ref}`);
    },

    async refund(p, amount, reason) {
      const ref = p.providerRef ?? p.checkoutRef;
      if (!ref) return;
      await asaasCall('POST', `/payments/${ref}/refund`, { value: amount, description: reason.slice(0, 200) });
    },

    async chargeExtra(p, amount, reason, payer, urls) {
      const pay = await charge({ ...p, method: 'pix' }, payer, amount, `SpaceHour — ${reason}`, `${p.id}:extra:${p.extraCharges.length}`, urls);
      return { ref: pay.id, payLink: pay.invoiceUrl };
    },

    // Sem pré-autorização de caução: a caução é substituída por avalista
    async holdDeposit() { return undefined; },
    async captureDeposit() {},
    async releaseDeposit() {},

    async parseWebhook(raw, headers) {
      const given = String(headers['asaas-access-token'] ?? '');
      const expected = asaasWebhookToken();
      if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
        throw new PaymentProviderError('asaas', 'token do webhook inválido');
      }
      const body = JSON.parse(raw.toString('utf8') || '{}') as { id?: string; event?: string; payment?: { id: string; status: string; externalReference?: string; value?: number } };
      const pay = body.payment;
      const eventId = body.id ?? `${body.event}:${pay?.id}:${pay?.status}`;
      if (!pay?.externalReference || pay.externalReference.includes(':extra')) return { eventId, updates: [] };
      const outcome = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(body.event ?? '') ? 'captured'
        : body.event === 'PAYMENT_DELETED' ? 'expired'
          : ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'].includes(body.event ?? '') ? 'refunded'
            : body.event === 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED' || body.event === 'PAYMENT_REPROVED_BY_RISK_ANALYSIS' ? 'failed' : null;
      const updates: PaymentUpdate[] = outcome ? [{ paymentId: pay.externalReference, outcome, providerRef: pay.id, amount: pay.value }] : [];
      return { eventId, updates };
    },
  };
}

/** Cadastra (ou atualiza) o aviso de pagamentos na conta da plataforma. */
export async function registerAsaasWebhook(url: string, email: string) {
  const list = await asaasCall<{ data: Array<{ id: string; url: string }> }>('GET', '/webhooks?limit=100');
  const body = {
    name: 'SpaceHour', url, email, enabled: true, interrupted: false, apiVersion: 3, sendType: 'SEQUENTIALLY', authToken: asaasWebhookToken(),
    events: ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED',
      'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', 'PAYMENT_REPROVED_BY_RISK_ANALYSIS'],
  };
  const existing = list.data?.find((w) => w.url === url);
  return existing ? asaasCall('PUT', `/webhooks/${existing.id}`, body) : asaasCall('POST', '/webhooks', body);
}
