import { NextResponse } from 'next/server';
import { healthCheck } from '@/lib/services/monitor';

export const dynamic = 'force-dynamic';

/** Saúde do sistema, usado pelo monitor externo (GitHub Actions) e por serviços de uptime */
export async function GET() {
  const h = await healthCheck().catch(() => ({ ok: false, db: false, checks: {}, time: new Date().toISOString() }));
  return NextResponse.json({ ok: h.ok, db: h.db, checks: h.checks, time: h.time }, { status: h.db ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
