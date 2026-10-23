import { NextResponse } from 'next/server';

/** Versões do app de loja: abaixo de "min" o app pede para atualizar (bloqueante); abaixo de "latest", sugere */
export async function GET() {
  return NextResponse.json({
    min: process.env.APP_MIN_VERSION || '1.0.0',
    latest: process.env.APP_LATEST_VERSION || '1.0.0',
    ios: process.env.APP_STORE_URL || 'https://apps.apple.com/br/app/cashbacksmart',
    android: process.env.PLAY_STORE_URL || 'https://play.google.com/store/apps/details?id=br.com.cashbacksmart.app',
  });
}
