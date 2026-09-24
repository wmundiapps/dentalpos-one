// Pagamentos: escolha do provedor por país e operações sobre o registro
// Payment (as funções alteram o objeto; quem chama grava com repo.savePayment
// na mesma transação). Mercado Pago na América Latina, Stripe no resto do mundo.
// Sem chaves configuradas (desenvolvimento/testes) usa um provedor simulado que
// aprova na hora.

import { id, nowIso } from '../db';
import type { Booking, Payment, User } from '../../../shared/types';
import { ASYNC_PAYMENT_METHODS, type PaymentMethodId } from '../../../shared/countries';
import { roundMoney } from '../../../shared/rules';
import { type CheckoutUrls, type Gateway, type GatewayId, PaymentProviderError } from './gateway';
import { stripeGateway } from './stripe';
import { MERCADOPAGO_COUNTRIES, mercadoPagoGateway, mercadoPagoToken } from './mercadopago';

export { type Gateway, type PaymentUpdate, PaymentProviderError } from './gateway';

const simulated: Gateway = {
  id: 'simulated', instant: true, supportsOffSession: true,
  async createCheckout() { throw new Error('simulated gateway has no checkout'); },
  async capture() {}, async cancel() {}, async refund() {},
  async chargeExtra() { return {}; },
  async holdDeposit(p) { return `sim_dep_${p.id}`; },
  async captureDeposit() {}, async releaseDeposit() {},
  async parseWebhook() { return { eventId: 'simulated', updates: [] }; },
};

let override: ((countryCode: string, provider?: string) => Gateway) | undefined;
/** Para testes: substitui a escolha de provedor. */
export function setGatewayOverride(fn?: (countryCode: string, provider?: string) => Gateway) { override = fn; }

function stripeConfigured() { return !!process.env.STRIPE_SECRET_KEY; }

/** Provedor para um novo pagamento no país do espaço. */
export function gatewayFor(countryCode: string): Gateway {
  if (override) return override(countryCode);
  if (process.env.PAYMENTS_PROVIDER === 'simulated') return simulated;
  const mpToken = (MERCADOPAGO_COUNTRIES as readonly string[]).includes(countryCode) ? mercadoPagoToken(countryCode) : undefined;
  if (mpToken) return mercadoPagoGateway(countryCode, mpToken, process.env.MP_WEBHOOK_SECRET);
  if (stripeConfigured()) return stripeGateway(process.env.STRIPE_SECRET_KEY!, process.env.STRIPE_WEBHOOK_SECRET);
  if (process.env.NODE_ENV === 'production') throw new PaymentProviderError('simulated', 'nenhum provedor de pagamento configurado');
  return simulated;
}

/** Provedor de um pagamento já existente (o registrado nele). */
export function gatewayOf(p: Pick<Payment, 'provider'>, countryCode: string): Gateway {
  if (override) return override(countryCode, p.provider);
  switch (p.provider as GatewayId) {
    case 'stripe': return stripeGateway(process.env.STRIPE_SECRET_KEY ?? '', process.env.STRIPE_WEBHOOK_SECRET);
    case 'mercadopago': {
      const token = mercadoPagoToken(countryCode);
      if (!token) throw new PaymentProviderError('mercadopago', `MP_ACCESS_TOKEN_${countryCode} ausente`);
      return mercadoPagoGateway(countryCode, token, process.env.MP_WEBHOOK_SECRET);
    }
    default: return simulated;
  }
}

/** Caução pode ser pré-autorizada? (cartão num provedor que cobra sem o locatário presente) */
export function supportsHold(method: string, gw: Gateway): boolean {
  return gw.supportsOffSession && !ASYNC_PAYMENT_METHODS.includes(method as PaymentMethodId);
}

function log(p: Payment, event: string, amount?: number) {
  p.history.push({ at: nowIso(), event, amount });
}

export function newPayment(b: Booking, gw: Gateway): Payment {
  const p: Payment = {
    id: id('pay'), bookingId: b.id, provider: gw.id, method: b.paymentMethod, currency: b.price.currency, amount: b.price.total,
    refunded: 0, extraCharges: [], depositHold: 0, depositStatus: 'none', status: 'pending',
    payoutStatus: 'scheduled', payoutAmount: b.price.hostPayout, createdAt: nowIso(), history: [],
  };
  log(p, 'created', p.amount);
  return p;
}

export async function startCheckout(gw: Gateway, p: Payment, b: Booking, l: Parameters<Gateway['createCheckout']>[2], payer: User, urls: CheckoutUrls) {
  const c = await gw.createCheckout(p, b, l, payer, urls);
  p.checkoutRef = c.checkoutRef;
  p.checkoutUrl = c.checkoutUrl;
  log(p, 'checkout_created');
}

/** Pagamento aprovado pelo provedor (ou na hora, no simulado). */
export function markPaid(p: Payment, captured: boolean, refs: { providerRef?: string; customerRef?: string; paymentMethodRef?: string } = {}) {
  if (p.status !== 'pending') return false;
  p.status = captured ? 'captured' : 'authorized';
  p.providerRef = refs.providerRef ?? p.providerRef;
  p.customerRef = refs.customerRef ?? p.customerRef;
  p.paymentMethodRef = refs.paymentMethodRef ?? p.paymentMethodRef;
  p.checkoutUrl = undefined;
  log(p, captured ? 'captured' : 'authorized', p.amount);
  return true;
}

export function markFailed(p: Payment, reason: 'failed' | 'expired') {
  if (p.status !== 'pending') return false;
  p.status = reason === 'failed' ? 'failed' : 'voided';
  p.payoutStatus = 'cancelled';
  p.checkoutUrl = undefined;
  log(p, reason);
  return true;
}

export async function holdDeposit(gw: Gateway, p: Payment, amount: number) {
  if (amount <= 0 || p.depositStatus !== 'none') return;
  const ref = await gw.holdDeposit(p, amount);
  if (!ref) return;
  p.depositRef = ref;
  p.depositHold = amount;
  p.depositStatus = 'held';
  log(p, 'deposit_hold', amount);
}

export async function capturePayment(gw: Gateway, p: Payment) {
  if (p.status !== 'authorized') return;
  await gw.capture(p);
  p.status = 'captured';
  log(p, 'captured', p.amount);
}

export async function releaseDeposit(gw: Gateway, p: Payment) {
  if (p.depositStatus !== 'held') return;
  await gw.releaseDeposit(p);
  p.depositStatus = 'released';
  log(p, 'deposit_released', p.depositHold);
}

/** Desfaz o pagamento inteiro: cancela checkout/pré-autorização ou estorna o que foi capturado. */
export async function voidPayment(gw: Gateway, p: Payment) {
  if (p.status === 'pending' || p.status === 'authorized') {
    await gw.cancel(p);
    p.status = 'voided';
    log(p, 'voided');
  } else if (p.status === 'captured' || p.status === 'partially_refunded') {
    await refundPayment(gw, p, p.amount - p.refunded, 'void');
  }
  await releaseDeposit(gw, p);
  p.payoutStatus = 'cancelled';
}

export async function refundPayment(gw: Gateway, p: Payment, amount: number, reason: string) {
  amount = roundMoney(Math.min(amount, p.amount - p.refunded), p.currency);
  if (amount <= 0 || p.status === 'pending' || p.status === 'failed' || p.status === 'voided') return 0;
  if (p.status === 'authorized' && amount >= p.amount) {
    await gw.cancel(p);
    p.status = 'voided';
    p.refunded = p.amount;
    log(p, `refund:${reason}`, amount);
    return amount;
  }
  if (p.status === 'authorized') await capturePayment(gw, p);
  await gw.refund(p, amount, reason);
  p.refunded = roundMoney(p.refunded + amount, p.currency);
  p.status = p.refunded >= p.amount ? 'refunded' : 'partially_refunded';
  log(p, `refund:${reason}`, amount);
  return amount;
}

/**
 * Cobrança adicional (penalidade/dano). Ordem: caução → meio salvo → link de
 * pagamento enviado ao locatário (o avalista é acionado se não for pago).
 */
export async function chargeExtra(gw: Gateway, p: Payment, amount: number, reason: string, payer: User, urls: CheckoutUrls) {
  amount = roundMoney(amount, p.currency);
  if (p.depositStatus === 'held' && p.depositHold >= amount) {
    await gw.captureDeposit(p, amount);
    p.depositStatus = 'captured';
    p.extraCharges.push({ at: nowIso(), amount, reason });
    log(p, `deposit_capture:${reason}`, amount);
    return { from: 'deposit' as const };
  }
  const r = await gw.chargeExtra(p, amount, reason, payer, urls);
  p.extraCharges.push({ at: nowIso(), amount, reason });
  log(p, r.payLink ? `extra_charge_link:${reason}` : `extra_charge:${reason}`, amount);
  return { from: 'payment' as const, payLink: r.payLink };
}

/** Repasse ao anfitrião (transferência feita pela operadora; ver README). */
export function payHost(p: Payment, amount?: number) {
  if (p.payoutStatus !== 'scheduled') return;
  if (amount !== undefined) p.payoutAmount = roundMoney(amount, p.currency);
  p.payoutStatus = 'paid';
  log(p, 'payout', p.payoutAmount);
}
