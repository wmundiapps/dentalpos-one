import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  if (!req.cookies.get('ct_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/entrar';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/app/:path*', '/painel/:path*', '/admin/:path*'] };
