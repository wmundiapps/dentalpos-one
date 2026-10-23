import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/services/campaigns';
import { setEmailOptin } from '@/lib/services/accounts';

export const dynamic = 'force-dynamic';

const page = (msg: string) =>
  new NextResponse(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cashbacksmart</title>
<body style="font-family:Arial,sans-serif;background:#F6F8FE;color:#1B2A6B;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px">
<div style="background:#fff;border-radius:16px;padding:28px;max-width:440px;text-align:center"><p style="font-size:18px">${msg}</p><a href="/app" style="color:#12A150;font-weight:bold">Abrir o Cashbacksmart</a></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

async function handle(req: NextRequest) {
  const id = verifyUnsubscribeToken(req.nextUrl.searchParams.get('t') || '');
  if (!id) return page('Link inválido ou expirado.');
  await setEmailOptin(id, false);
  return page('Pronto, você não vai mais receber ofertas por e-mail. Elas continuam disponíveis no app.');
}

export const GET = handle;
export const POST = handle; // descadastro com um clique (List-Unsubscribe-Post)
