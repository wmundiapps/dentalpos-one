import { NextRequest, NextResponse } from 'next/server';
import { markPaidByProviderRef } from '@/lib/services/billing';
import { verifyStripeSignature } from '@/lib/payments';

export const dynamic = 'force-dynamic';

/** Webhook do Stripe: baixa automática das faturas pagas */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const raw = await req.text();
  if (!secret || !verifyStripeSignature(raw, req.headers.get('stripe-signature'), secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const ev = JSON.parse(raw);
  if (ev?.type === 'invoice.paid' || ev?.type === 'invoice.payment_succeeded') {
    const obj = ev.data?.object;
    const id = await markPaidByProviderRef('stripe', obj?.id, obj?.metadata?.invoice_id);
    return NextResponse.json({ ok: true, invoice: id });
  }
  return NextResponse.json({ ok: true, ignored: ev?.type || null });
}
