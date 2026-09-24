// Camada de pagamentos. As funções só alteram o objeto Payment; quem chama
// grava com repo.savePayment dentro da transação da operação.
// Em desenvolvimento usa um provedor simulado; em
// produção cada método é roteado para um adquirente real (ver PROVIDER_ROUTING).
// Nenhum dado de cartão trafega por este servidor: a captura acontece nos
// campos hospedados do provedor (tokenização), e aqui só chegam referências.

import { id, nowIso } from './db';
import type { Booking, Payment } from '../../shared/types';
import { ASYNC_PAYMENT_METHODS, type PaymentMethodId } from '../../shared/countries';
import { roundMoney } from '../../shared/rules';

export const PROVIDER_ROUTING: Record<PaymentMethodId, string> = {
  card: 'stripe', apple_pay: 'stripe', google_pay: 'stripe', paypal: 'paypal', klarna: 'stripe',
  pix: 'stripe', boleto: 'stripe', oxxo: 'stripe', spei: 'mercado_pago', mercado_pago: 'mercado_pago', pse: 'mercado_pago',
  webpay: 'transbank', yape: 'mercado_pago', bank_transfer: 'adyen', interac: 'adyen', ach: 'stripe', pre_authorized_debit: 'stripe',
  sepa_debit: 'stripe', mb_way: 'stripe', multibanco: 'stripe', bizum: 'adyen', satispay: 'stripe', cartes_bancaires: 'stripe',
  giropay_wero: 'adyen', pay_by_bank: 'stripe', bacs_debit: 'stripe', alipay: 'stripe', wechat_pay: 'stripe', unionpay: 'adyen',
  konbini: 'stripe', paypay: 'stripe', jcb: 'stripe', upi: 'razorpay', rupay: 'razorpay', netbanking: 'razorpay', bit: 'adyen',
  payid: 'stripe', bpay: 'adyen',
};

export function supportsHold(method: string): boolean {
  return !ASYNC_PAYMENT_METHODS.includes(method as PaymentMethodId);
}

function log(p: Payment, event: string, amount?: number) {
  p.history.push({ at: nowIso(), event, amount });
}

export function authorizePayment(booking: Booking): Payment {
  const method = booking.paymentMethod as PaymentMethodId;
  const hold = supportsHold(method) ? booking.price.securityDeposit : 0;
  const p: Payment = {
    id: id('pay'), bookingId: booking.id, provider: process.env.PAYMENTS_MODE === 'live' ? PROVIDER_ROUTING[method] : 'simulated',
    method, currency: booking.price.currency, amount: booking.price.total, refunded: 0, extraCharges: [],
    depositHold: hold, depositStatus: hold > 0 ? 'held' : 'none', status: 'authorized',
    payoutStatus: 'scheduled', payoutAmount: booking.price.hostPayout, createdAt: nowIso(), history: [],
  };
  log(p, 'authorized', p.amount);
  if (hold) log(p, 'deposit_hold', hold);
  return p;
}

export function capturePayment(p: Payment) {
  if (p.status !== 'authorized') return;
  p.status = 'captured';
  log(p, 'captured', p.amount);
}

export function voidPayment(p: Payment) {
  if (p.status === 'authorized') {
    p.status = 'voided';
    log(p, 'voided');
  }
  releaseDeposit(p);
  p.payoutStatus = 'cancelled';
}

export function refundPayment(p: Payment, amount: number, reason: string) {
  amount = roundMoney(Math.min(amount, p.amount - p.refunded), p.currency);
  if (amount <= 0) return 0;
  if (p.status === 'authorized' && amount >= p.amount) {
    voidPayment(p);
    p.refunded = p.amount;
    return amount;
  }
  if (p.status === 'authorized') capturePayment(p);
  p.refunded = roundMoney(p.refunded + amount, p.currency);
  p.status = p.refunded >= p.amount ? 'refunded' : 'partially_refunded';
  log(p, `refund:${reason}`, amount);
  return amount;
}

export function chargeExtra(p: Payment, amount: number, reason: string): 'deposit' | 'payment' {
  amount = roundMoney(amount, p.currency);
  // Ordem de cobrança: caução → método de pagamento salvo (o avalista é acionado
  // pela Central de Resolução quando estas duas não forem suficientes).
  if (p.depositStatus === 'held' && p.depositHold >= amount) {
    p.depositStatus = 'captured';
    log(p, `deposit_capture:${reason}`, amount);
    p.extraCharges.push({ at: nowIso(), amount, reason });
    return 'deposit';
  }
  p.extraCharges.push({ at: nowIso(), amount, reason });
  log(p, `extra_charge:${reason}`, amount);
  return 'payment';
}

export function releaseDeposit(p: Payment) {
  if (p.depositStatus === 'held') {
    p.depositStatus = 'released';
    log(p, 'deposit_released', p.depositHold);
  }
}

export function payHost(p: Payment, amount?: number) {
  if (p.payoutStatus !== 'scheduled') return;
  if (amount !== undefined) p.payoutAmount = roundMoney(amount, p.currency);
  p.payoutStatus = 'paid';
  log(p, 'payout', p.payoutAmount);
}
