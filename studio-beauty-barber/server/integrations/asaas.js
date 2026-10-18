// Asaas (Pix, boleto, cartão). Docs: https://docs.asaas.com
// Autenticação: header "access_token". Webhook: header "asaas-access-token" com o authToken configurado.
import { cfg } from '../config.js';

const base = (sandbox) => (sandbox ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3');

// conf = { apiKey, sandbox } — chave da plataforma (cobrar assinantes) ou do salão (cobrar clientes).
export function platformConf() {
  return cfg.asaas.apiKey ? { apiKey: cfg.asaas.apiKey, sandbox: cfg.asaas.sandbox } : null;
}

async function call(conf, method, path, body) {
  const r = await fetch(base(conf.sandbox !== false && conf.sandbox !== 'false') + path, {
    method,
    headers: { access_token: conf.apiKey, 'content-type': 'application/json', 'user-agent': 'StudioBeautyBarber/1.0' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.errors?.[0]?.description || `Asaas HTTP ${r.status}`);
  return d;
}

export const createCustomer = (conf, { name, email, cpfCnpj, phone }) =>
  call(conf, 'POST', '/customers', { name, email, cpfCnpj, mobilePhone: phone ? phone.replace(/^55/, '') : undefined, notificationDisabled: false });

// billingType: PIX | BOLETO | CREDIT_CARD | UNDEFINED (cliente escolhe na fatura)
export const createPayment = (conf, { customer, billingType = 'PIX', valueCents, dueDate, description, externalReference }) =>
  call(conf, 'POST', '/payments', { customer, billingType, value: valueCents / 100, dueDate, description, externalReference });

export const createSubscription = (conf, { customer, billingType = 'UNDEFINED', valueCents, nextDueDate, description, externalReference }) =>
  call(conf, 'POST', '/subscriptions', { customer, billingType, value: valueCents / 100, nextDueDate, cycle: 'MONTHLY', description, externalReference });

// Estorno total ou parcial (value em centavos). Pix e cartão aceitam estorno; confira prazos e taxas no Asaas.
export const refundPayment = (conf, id, { valueCents, description }) =>
  call(conf, 'POST', `/payments/${encodeURIComponent(id)}/refund`, { value: valueCents / 100, description });
export const deletePayment = (conf, id) => call(conf, 'DELETE', `/payments/${encodeURIComponent(id)}`);

export const getPayment = (conf, id) => call(conf, 'GET', `/payments/${encodeURIComponent(id)}`);
export const getPixQr = (conf, id) => call(conf, 'GET', `/payments/${encodeURIComponent(id)}/pixQrCode`);
export const cancelSubscription = (conf, id) => call(conf, 'DELETE', `/subscriptions/${encodeURIComponent(id)}`);

export const PAID_EVENTS = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']);
export const FAIL_EVENTS = new Set(['PAYMENT_OVERDUE', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_DELETED']);
