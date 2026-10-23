import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { exportUserData } from '@/lib/services/privacy';
import { rateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';

/** Cópia dos dados do próprio cliente (LGPD art. 18). Só a pessoa logada baixa os seus. */
export async function GET() {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: 'Entre na sua conta' }, { status: 401 });
  try {
    await rateLimit(`export:${sess.userId}`, 5, 3600);
  } catch {
    return NextResponse.json({ error: 'Muitos pedidos seguidos. Tente mais tarde.' }, { status: 429 });
  }
  const data = await exportUserData(sess.userId);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="meus-dados-cashbacksmart.json"', 'Cache-Control': 'no-store' },
  });
}
