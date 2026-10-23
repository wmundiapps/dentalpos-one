import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { registerPushToken } from '@/lib/push';

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  await registerPushToken(s.userId, String(b.token || ''), String(b.platform || ''));
  return NextResponse.json({ ok: true });
}
