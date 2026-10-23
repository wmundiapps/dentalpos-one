import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL || 'https://cashbacksmart.com.br';
  return {
    rules: [{ userAgent: '*', allow: ['/', '/l/', '/termos'], disallow: ['/app', '/painel', '/admin', '/api', '/n/', '/seguranca', '/redefinir-senha'] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
