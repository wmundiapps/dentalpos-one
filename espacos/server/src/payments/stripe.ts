// Stripe — mercados internacionais. Checkout hospedado; cartão com
// pré-autorização (captura só quando a reserva é confirmada) e meio salvo para
// caução e cobranças posteriores.
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.

import Stripe from 'stripe';
import type { Booking, Listing, Payment, User } from '../../../shared/types';
import { type CheckoutUrls, type Gateway, type PaymentUpdate, PaymentProviderError, fromMinorUnits, toMinorUnits } from './gateway';

// Nosso método → tipo de meio de pagamento da Stripe (ausente = deixa a Stripe escolher)
const STRIPE_TYPES: Record<string, string> = {
  card: 'card', apple_pay: 'card', google_pay: 'card', cartes_bancaires: 'card', jcb: 'card', rupay: 'card', unionpay: 'card',
  paypal: 'paypal', klarna: 'klarna', pix: 'pix', boleto: 'boleto', oxxo: 'oxxo', ach: 'us_bank_account',
  pre_authorized_debit: 'acss_debit', sepa_debit: 'sepa_debit', mb_way: 'mb_way', multibanco: 'multibanco',
  satispay: 'satispay', pay_by_bank: 'pay_by_bank', bacs_debit: 'bacs_debit', alipay: 'alipay', wechat_pay: 'wechat_pay',
  konbini: 'konbini', paypay: 'paypay',
};
// Só cartões aceitam pré-autorização + salvar o meio para uso posterior
const HOLDABLE = new Set(['card']);

export function stripeGateway(secretKey: string, webhookSecret: string | undefined, client?: Stripe): Gateway {
  const stripe = client ?? new Stripe(secretKey, { maxNetworkRetries: 2 });
  const minor = (p: Payment, amount: number) => toMinorUnits(amount, p.currency);
  const fail = (e: unknown): never => {
    const err = e as { message?: string; type?: string };
    throw new PaymentProviderError('stripe', err.message ?? 'erro', err.type === 'StripeConnectionError' || err.type === 'StripeAPIError');
  };

  return {
    id: 'stripe',
    instant: false,
    supportsOffSession: true,

    async createCheckout(p: Payment, b: Booking, l: Listing, payer: User, urls: CheckoutUrls) {
      const type = STRIPE_TYPES[p.method];
      const holdable = !!type && HOLDABLE.has(type);
      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          client_reference_id: p.id,
          customer_email: payer.email,
          customer_creation: 'always',
          locale: 'auto',
          line_items: [{
            quantity: 1,
            price_data: {
              currency: p.currency.toLowerCase(),
              unit_amount: minor(p, p.amount),
              product_data: { name: `SpaceHour — ${l.title}`.slice(0, 250), description: b.occurrences.map((o) => `${o.date} ${o.start}-${o.end}`).join(', ').slice(0, 500) },
            },
          }],
          ...(type ? { payment_method_types: [type as Stripe.Checkout.SessionCreateParams.PaymentMethodType] } : {}),
          payment_intent_data: {
            metadata: { payment_id: p.id, booking_id: b.id },
            ...(holdable ? { capture_method: 'manual' as const, setup_future_usage: 'off_session' as const } : {}),
          },
          metadata: { payment_id: p.id, booking_id: b.id },
          success_url: urls.successUrl,
          cancel_url: urls.cancelUrl,
          expires_at: Math.floor(Date.now() / 1000) + 31 * 60, // mínimo da Stripe: 30 min
        }, { idempotencyKey: `checkout-${p.id}` });
        return { checkoutRef: session.id, checkoutUrl: session.url! };
      } catch (e) { return fail(e); }
    },

    async capture(p) {
      if (!p.providerRef) return;
      try {
        const pi = await stripe.paymentIntents.retrieve(p.providerRef);
        if (pi.status === 'requires_capture') await stripe.paymentIntents.capture(p.providerRef, {}, { idempotencyKey: `capture-${p.id}` });
      } catch (e) { fail(e); }
    },

    async cancel(p) {
      try {
        if (p.providerRef) {
          const pi = await stripe.paymentIntents.retrieve(p.providerRef);
          if (pi.status === 'requires_capture' || pi.status === 'requires_payment_method') await stripe.paymentIntents.cancel(p.providerRef);
        } else if (p.checkoutRef) {
          const s = await stripe.checkout.sessions.retrieve(p.checkoutRef);
          if (s.status === 'open') await stripe.checkout.sessions.expire(p.checkoutRef);
        }
      } catch (e) { fail(e); }
    },

    async refund(p, amount, reason) {
      if (!p.providerRef) return;
      try {
        await stripe.refunds.create(
          { payment_intent: p.providerRef, amount: minor(p, amount), metadata: { payment_id: p.id, reason } },
          { idempotencyKey: `refund-${p.id}-${p.refunded}-${amount}` },
        );
      } catch (e) { fail(e); }
    },

    async chargeExtra(p, amount, reason, payer, urls) {
      try {
        if (p.customerRef && p.paymentMethodRef) {
          const pi = await stripe.paymentIntents.create({
            amount: minor(p, amount), currency: p.currency.toLowerCase(), customer: p.customerRef, payment_method: p.paymentMethodRef,
            off_session: true, confirm: true, metadata: { payment_id: p.id, reason },
          }, { idempotencyKey: `extra-${p.id}-${p.extraCharges.length}` });
          return { ref: pi.id };
        }
        // Sem meio salvo (ex.: Pix/boleto): link de pagamento para o locatário
        const session = await stripe.checkout.sessions.create({
          mode: 'payment', customer_email: payer.email, client_reference_id: `${p.id}:extra`,
          line_items: [{ quantity: 1, price_data: { currency: p.currency.toLowerCase(), unit_amount: minor(p, amount), product_data: { name: `SpaceHour — ${reason}` } } }],
          metadata: { payment_id: p.id, kind: 'extra_charge', reason },
          success_url: urls.successUrl, cancel_url: urls.cancelUrl,
        });
        return { ref: session.id, payLink: session.url ?? undefined };
      } catch (e) { return fail(e); }
    },

    async holdDeposit(p, amount) {
      if (!p.customerRef || !p.paymentMethodRef || amount <= 0) return undefined;
      try {
        const pi = await stripe.paymentIntents.create({
          amount: minor(p, amount), currency: p.currency.toLowerCase(), customer: p.customerRef, payment_method: p.paymentMethodRef,
          capture_method: 'manual', off_session: true, confirm: true, metadata: { payment_id: p.id, kind: 'deposit' },
        }, { idempotencyKey: `deposit-${p.id}` });
        return pi.id;
      } catch (e) { return fail(e); }
    },

    async captureDeposit(p, amount) {
      if (!p.depositRef) return;
      try { await stripe.paymentIntents.capture(p.depositRef, { amount_to_capture: minor(p, amount) }); } catch (e) { fail(e); }
    },

    async releaseDeposit(p) {
      if (!p.depositRef) return;
      try { await stripe.paymentIntents.cancel(p.depositRef); } catch (e) { fail(e); }
    },

    async parseWebhook(rawBody, headers) {
      if (!webhookSecret) throw new PaymentProviderError('stripe', 'STRIPE_WEBHOOK_SECRET ausente');
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, String(headers['stripe-signature'] ?? ''), webhookSecret);
      } catch {
        throw new PaymentProviderError('stripe', 'assinatura do webhook inválida');
      }
      const updates: PaymentUpdate[] = [];
      if (event.type.startsWith('checkout.session.')) {
        const s = event.data.object as Stripe.Checkout.Session;
        const paymentId = s.metadata?.payment_id;
        if (!paymentId || s.metadata?.kind === 'extra_charge') return { eventId: event.id, updates };
        if (event.type === 'checkout.session.expired') {
          updates.push({ paymentId, outcome: 'expired' });
        } else if (event.type === 'checkout.session.async_payment_failed') {
          updates.push({ paymentId, outcome: 'failed' });
        } else if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
          // Confere o estado real do pagamento (não confia só no evento)
          const piId = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id;
          if (piId) {
            const pi = await stripe.paymentIntents.retrieve(piId);
            const outcome = pi.status === 'requires_capture' ? 'authorized' : pi.status === 'succeeded' ? 'captured' : null;
            if (outcome) {
              updates.push({
                paymentId, outcome, providerRef: pi.id, amount: fromMinorUnits(pi.amount, pi.currency.toUpperCase()),
                customerRef: typeof pi.customer === 'string' ? pi.customer : pi.customer?.id,
                paymentMethodRef: typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id,
              });
            }
          }
        }
      } else if (event.type === 'charge.refunded') {
        const ch = event.data.object as Stripe.Charge;
        const paymentId = ch.metadata?.payment_id;
        if (paymentId && ch.refunded) updates.push({ paymentId, outcome: 'refunded', providerRef: typeof ch.payment_intent === 'string' ? ch.payment_intent : undefined });
      }
      return { eventId: event.id, updates };
    },
  };
}
