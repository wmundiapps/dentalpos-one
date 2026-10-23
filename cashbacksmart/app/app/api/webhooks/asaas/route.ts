import { NextRequest, NextResponse } from 'next/server';
import { markPaidByProviderRef } from '@/lib/services/billing';

export const dynamic = 'force-dynamic';

/** Webhook do Asaas: baixa automática das faturas pagas */
export async function POST(req: NextRequest) {
  const token = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!token || req.headers.get('asaas-access-token') !== token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const event = body?.event as string | undefined;
  const payment = body?.payment;
  if (payment?.id && (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED')) {
    const id = await markPaidByProviderRef('asaas', payment.id, payment.externalReference);
    return NextResponse.json({ ok: true, invoice: id });
  }
  return NextResponse.json({ ok: true, ignored: event || null });
}
