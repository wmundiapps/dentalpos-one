// Stripe sem SDK (fetch). Checkout de assinatura em BRL + eventos de webhook.
import { cfg } from '../config.js';

async function call(method, path, params) {
  const r = await fetch('https://api.stripe.com/v1' + path, {
    method,
    headers: { authorization: `Bearer ${cfg.stripe.secretKey}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2024-06-20' },
    body: params ? new URLSearchParams(params) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `Stripe HTTP ${r.status}`);
  return d;
}

export const stripeEnabled = () => !!cfg.stripe.secretKey;

export function createCheckoutSession({ salonId, plan, email, successUrl, cancelUrl, trialDays }) {
  const p = cfg.plans[plan];
  const params = {
    mode: 'subscription',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'brl',
    'line_items[0][price_data][unit_amount]': String(p.cents),
    'line_items[0][price_data][recurring][interval]': 'month',
    'line_items[0][price_data][product_data][name]': `Studio Beauty Barber — plano ${p.name}`,
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: salonId,
    'metadata[salon_id]': salonId,
    'metadata[plan]': plan,
    'subscription_data[metadata][salon_id]': salonId,
    'subscription_data[metadata][plan]': plan,
    allow_promotion_codes: 'true',
  };
  if (email) params.customer_email = email;
  if (trialDays > 0) params['subscription_data[trial_period_days]'] = String(trialDays);
  return call('POST', '/checkout/sessions', params);
}

export const createPortalSession = (customer, returnUrl) => call('POST', '/billing_portal/sessions', { customer, return_url: returnUrl });
