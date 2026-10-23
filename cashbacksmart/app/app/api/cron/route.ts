import { NextRequest, NextResponse } from 'next/server';
import { runBilling } from '@/lib/services/billing';
import { expireCredits } from '@/lib/services/cashback';
import { processOutbox } from '@/lib/services/campaigns';
import { runFraudScan } from '@/lib/services/fraud';
import { dailyReminders } from '@/lib/services/notify';
import { monitorTick } from '@/lib/services/monitor';
import { autoApproveClaims } from '@/lib/services/nfce';
import { processMessages, expiringNotices } from '@/lib/services/messages';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Agendador: cobrança, vencimento de saldo e fila de e-mails. Protegido por CRON_SECRET. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const job = req.nextUrl.searchParams.get('job') || 'all';
  const out: Record<string, unknown> = {};
  if (job === 'all' || job === 'billing') out.billing = await runBilling();
  if (job === 'all' || job === 'expire') out.expired = await expireCredits();
  if (job === 'all' || job === 'fraud') out.fraud = await runFraudScan();
  if (job === 'all' || job === 'reminders') out.reminders = await dailyReminders();
  if (job === 'all' || job === 'emails' || job === 'claims') out.claims = await autoApproveClaims();
  if (job === 'all' || job === 'reminders') out.expiring = await expiringNotices();
  if (job === 'all' || job === 'emails') out.emails = await processOutbox(Number(process.env.EMAILS_PER_RUN || 5000));
  if (job === 'all' || job === 'emails' || job === 'messages') out.messages = await processMessages(Number(process.env.MESSAGES_PER_RUN || 2000));
  if (job === 'all' || job === 'monitor') out.monitor = await monitorTick();
  await q(`insert into audit_log (action, data) values ('cron_run', $1)`, [{ job }]);
  return NextResponse.json({ ok: true, ...out });
}
