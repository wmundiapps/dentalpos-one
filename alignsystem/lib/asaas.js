// Integração Asaas (API v3): clientes, cobranças com split para o dentista parceiro,
// assinaturas mensais e subcontas dos dentistas.
import { fail } from './http.js';

const BASES = {
  production: 'https://api.asaas.com/v3',
  sandbox: 'https://api-sandbox.asaas.com/v3',
};

export const asaasConfigured = () => Boolean(process.env.ASAAS_API_KEY);
export const asaasEnv = () => (process.env.ASAAS_ENV === 'production' ? 'production' : 'sandbox');

async function call(method, path, body) {
  if (!asaasConfigured()) fail(503, 'Asaas ainda não configurado (ASAAS_API_KEY).');
  const r = await fetch(BASES[asaasEnv()] + path, {
    method,
    headers: {
      access_token: process.env.ASAAS_API_KEY,
      'Content-Type': 'application/json',
      'User-Agent': 'AlignSystem/1.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!r.ok) {
    const msg = data?.errors?.map((e) => e.description).join(' ') || `Asaas respondeu ${r.status}`;
    fail(502, `Asaas: ${msg}`);
  }
  return data;
}

// Cliente (paciente) — reaproveita se já existir para o CPF
export async function ensureCustomer({ name, cpfCnpj, email, mobilePhone, externalReference }) {
  const found = await call('GET', `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}`);
  if (found?.data?.length) return found.data[0].id;
  const c = await call('POST', '/customers', {
    name, cpfCnpj, email: email || undefined, mobilePhone: mobilePhone || undefined,
    externalReference, notificationDisabled: false,
  });
  return c.id;
}

// split: { walletId, type: 'fixed'|'percent', value }
function splitArray(split, installments) {
  if (!split?.walletId || !(Number(split.value) > 0)) return undefined;
  if (split.type === 'percent') return [{ walletId: split.walletId, percentualValue: Number(split.value) }];
  // valor fixo informado é o total do repasse; no parcelamento o Asaas divide entre as parcelas
  if (installments > 1) return [{ walletId: split.walletId, totalFixedValue: Number(split.value) }];
  return [{ walletId: split.walletId, fixedValue: Number(split.value) }];
}

// Cobrança à vista (Pix) ou parcelada no cartão de crédito (valor total comprometido no limite do cartão)
export async function createPayment({ customer, billingType, value, dueDate, description, installmentCount, split, externalReference }) {
  const n = Number(installmentCount || 1);
  const body = {
    customer,
    billingType,
    dueDate,
    description,
    externalReference,
    split: splitArray(split, n),
  };
  if (n > 1) {
    body.installmentCount = n;
    body.totalValue = Number(value);
  } else {
    body.value = Number(value);
  }
  return call('POST', '/payments', body);
}

// Mensalidades do tratamento
export async function createSubscription({ customer, billingType, value, nextDueDate, description, maxPayments, split, externalReference }) {
  return call('POST', '/subscriptions', {
    customer,
    billingType,
    value: Number(value),
    nextDueDate,
    cycle: 'MONTHLY',
    description,
    maxPayments: maxPayments ? Number(maxPayments) : undefined,
    externalReference,
    split: split?.walletId && Number(split.value) > 0
      ? [split.type === 'percent'
        ? { walletId: split.walletId, percentualValue: Number(split.value) }
        : { walletId: split.walletId, fixedValue: Number(split.value) }]
      : undefined,
  });
}

export const getPayment = (id) => call('GET', `/payments/${encodeURIComponent(id)}`);
export const listInstallmentPayments = (id) => call('GET', `/installments/${encodeURIComponent(id)}/payments`);
export const listSubscriptionPayments = (id) => call('GET', `/subscriptions/${encodeURIComponent(id)}/payments`);
export const cancelPayment = (id) => call('DELETE', `/payments/${encodeURIComponent(id)}`);
export const cancelInstallment = (id) => call('DELETE', `/installments/${encodeURIComponent(id)}`);
export const cancelSubscription = (id) => call('DELETE', `/subscriptions/${encodeURIComponent(id)}`);

// Subconta do dentista parceiro (recebe o repasse via split). Retorna { id, walletId }.
export async function createSubaccount(d) {
  const pj = String(d.cpf_cnpj || '').replace(/\D/g, '').length === 14;
  const acc = await call('POST', '/accounts', {
    name: d.name,
    email: d.email,
    cpfCnpj: String(d.cpf_cnpj).replace(/\D/g, ''),
    birthDate: pj ? undefined : d.birth_date,
    companyType: pj ? d.company_type || 'LIMITED' : undefined,
    mobilePhone: String(d.phone || '').replace(/\D/g, ''),
    incomeValue: Number(d.income_value || 0) || 10000,
    address: d.address,
    addressNumber: d.address_number,
    province: d.province,
    postalCode: String(d.postal_code || '').replace(/\D/g, ''),
  });
  return { id: acc.id, walletId: acc.walletId };
}

// Status do Asaas → texto em português
export const STATUS_PT = {
  PENDING: 'pendente',
  RECEIVED: 'recebido',
  CONFIRMED: 'confirmado',
  OVERDUE: 'vencido',
  REFUNDED: 'estornado',
  RECEIVED_IN_CASH: 'recebido em dinheiro',
  REFUND_REQUESTED: 'estorno solicitado',
  REFUND_IN_PROGRESS: 'estorno em andamento',
  CHARGEBACK_REQUESTED: 'contestação',
  CHARGEBACK_DISPUTE: 'contestação em disputa',
  AWAITING_CHARGEBACK_REVERSAL: 'aguardando reversão',
  DUNNING_REQUESTED: 'negativação solicitada',
  DUNNING_RECEIVED: 'recebido (negativação)',
  AWAITING_RISK_ANALYSIS: 'em análise',
  DELETED: 'cancelado',
  aguardando_escolha: 'aguardando o paciente escolher Pix ou cartão',
};

export const PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED']);
