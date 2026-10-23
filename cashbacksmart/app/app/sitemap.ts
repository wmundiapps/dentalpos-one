import type { MetadataRoute } from 'next';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL || 'https://cashbacksmart.com.br';
  const fixed = ['', '/cadastro', '/cadastro/empresa', '/entrar', '/termos'].map((p) => ({ url: `${base}${p}` }));
  // páginas de oferta ativas (captação) para aparecerem no Google
  const pages = await q<{ slug: string }>(`select slug from lead_pages where active order by created_at desc limit 500`).catch(() => []);
  return [...fixed, ...pages.map((p) => ({ url: `${base}/l/${p.slug}` }))];
}
