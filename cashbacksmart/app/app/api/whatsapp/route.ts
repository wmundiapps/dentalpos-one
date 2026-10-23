import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { botReply, userByPhone } from '@/lib/services/bot';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

/** Verificação do webhook (WhatsApp Cloud API da Meta) */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') && p.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) return new NextResponse(p.get('hub.challenge') || '');
  return new NextResponse('forbidden', { status: 403 });
}

async function send(to: string, text: string) {
  const token = process.env.WHATSAPP_TOKEN, phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return;
  await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text.slice(0, 4000) } }),
  });
}

/** Mensagens recebidas: o robô responde com os dados da conta ligada ao celular */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret) {
    const sig = req.headers.get('x-hub-signature-256') || '';
    const good = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return new NextResponse('bad signature', { status: 401 });
  }
  const body = JSON.parse(raw || '{}');
  const msgs = body?.entry?.flatMap((e: any) => e.changes?.flatMap((c: any) => c.value?.messages || []) || []) || [];
  for (const m of msgs) {
    if (m.type !== 'text') {
      await send(m.from, 'Por enquanto eu só entendo mensagens de texto. Escreva sua dúvida, por favor.');
      continue;
    }
    const user = await userByPhone(m.from);
    if (!user) {
      await send(m.from, `Não encontrei uma conta Cashbacksmart com este número. Crie a sua grátis em ${config.appUrl}/cadastro ou, se for loja, em ${config.appUrl}/cadastro/empresa.`);
      continue;
    }
    const r = await botReply({ userId: user.id, role: user.role }, m.text?.body || '', 'whatsapp');
    await send(m.from, r.text);
  }
  return NextResponse.json({ ok: true });
}
