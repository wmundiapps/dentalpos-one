import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { claimPhoto } from '@/lib/services/nfce';

export const dynamic = 'force-dynamic';

/** Foto da nota: só para a loja da compra e para o cliente que enviou */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sess = await getSession();
  const { id } = await params;
  if (!sess || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('não autorizado', { status: 401 });
  const p = await claimPhoto(id, sess.userId);
  if (!p) return new NextResponse('não encontrada', { status: 404 });
  return new NextResponse(new Uint8Array(p.bytes), {
    headers: { 'Content-Type': p.mime, 'Cache-Control': 'private, max-age=600', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' },
  });
}
