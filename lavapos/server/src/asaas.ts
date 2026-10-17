// Cobrança via Asaas com repasse automático (split) da comissão da plataforma.
// Cada lava-rápido conecta a própria conta Asaas (chave digitada na tela, guardada cifrada). A comissão (PLATFORM_FEE_PCT, padrão 10%)
// vai direto para a carteira da plataforma (PLATFORM_ASAAS_WALLET_ID) no momento do pagamento.
import { z } from 'zod';

export const platformFeePct = () => Number(process.env.PLATFORM_FEE_PCT ?? 10);
export const feeOf = (amountCents: number) => Math.round((amountCents * platformFeePct()) / 100);

const base = (sandbox: boolean) => (sandbox ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3');

async function call(apiKey: string, sandbox: boolean, method: string, path: string, body?: unknown) {
  const r = await fetch(base(sandbox) + path, {
    method, headers: { 'content-type': 'application/json', access_token: apiKey, 'user-agent': 'LavaPos' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  });
  const j = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) throw new Error(`Asaas ${r.status}: ${j?.errors?.[0]?.description ?? 'erro'}`);
  return j;
}

export interface AsaasCreds { apiKey: string; sandbox: boolean }

export async function ensureCustomer(c: AsaasCreds, p: { name: string; cpfCnpj?: string; email?: string; phone?: string; externalReference: string }): Promise<string> {
  const found = await call(c.apiKey, c.sandbox, 'GET', `/customers?externalReference=${encodeURIComponent(p.externalReference)}`);
  if (found?.data?.[0]?.id) return found.data[0].id;
  const made = await call(c.apiKey, c.sandbox, 'POST', '/customers', { name: p.name, cpfCnpj: p.cpfCnpj || undefined, email: p.email || undefined, mobilePhone: p.phone?.replace(/^55/, '') || undefined, externalReference: p.externalReference, notificationDisabled: false });
  return made.id;
}

/** Cobrança com split: a plataforma recebe `platformFeePct` do valor direto na carteira dela. */
export async function createCharge(c: AsaasCreds, p: { customerId: string; billingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED'; valueCents: number; dueDate: string; description: string; externalReference: string; platformWalletId?: string }) {
  const split = p.platformWalletId ? [{ walletId: p.platformWalletId, percentualValue: platformFeePct() }] : undefined;
  const j = await call(c.apiKey, c.sandbox, 'POST', '/payments', {
    customer: p.customerId, billingType: p.billingType, value: p.valueCents / 100, dueDate: p.dueDate,
    description: p.description.slice(0, 500), externalReference: p.externalReference, split,
  });
  return z.object({ id: z.string(), invoiceUrl: z.string().optional(), status: z.string().optional() }).parse(j);
}

export async function validateKey(c: AsaasCreds): Promise<boolean> {
  try { await call(c.apiKey, c.sandbox, 'GET', '/myAccount/commercialInfo'); return true; } catch { return false; }
}

/** Mensalidade do próprio sistema (R$ 119 após 30 dias grátis), cobrada na conta Asaas da plataforma. */
export async function createPlatformSubscription(p: { name: string; email: string; cpfCnpj?: string; tenantId: string; valueCents: number; nextDueDate: string }) {
  const key = process.env.PLATFORM_ASAAS_API_KEY;
  if (!key) throw new Error('PLATFORM_ASAAS_API_KEY não configurada');
  const c = { apiKey: key, sandbox: process.env.ASAAS_SANDBOX !== 'false' };
  const customerId = await ensureCustomer(c, { name: p.name, cpfCnpj: p.cpfCnpj, email: p.email, externalReference: `tenant:${p.tenantId}` });
  return call(c.apiKey, c.sandbox, 'POST', '/subscriptions', { customer: customerId, billingType: 'UNDEFINED', value: p.valueCents / 100, nextDueDate: p.nextDueDate, cycle: 'MONTHLY', description: 'Mensalidade LavaPos', externalReference: `tenant:${p.tenantId}` });
}
