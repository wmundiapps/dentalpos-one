import path from 'path';
import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));

// Medição de anúncios: só libera os domínios dos pixels que estiverem configurados
const metaPixel = !!process.env.NEXT_PUBLIC_META_PIXEL_ID;
const tiktokPixel = !!process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
const scriptExtra = [metaPixel && 'https://connect.facebook.net', tiktokPixel && 'https://analytics.tiktok.com'].filter(Boolean).join(' ');
const imgExtra = [metaPixel && 'https://www.facebook.com', tiktokPixel && 'https://analytics.tiktok.com'].filter(Boolean).join(' ');
const connectExtra = [metaPixel && 'https://www.facebook.com https://connect.facebook.net', tiktokPixel && 'https://analytics.tiktok.com https://analytics-ipv6.tiktokw.us'].filter(Boolean).join(' ');

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com ${scriptExtra}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${imgExtra}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${connectExtra}`.trim(),
  "frame-src https://challenges.cloudflare.com",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...((process.env.APP_URL || '').startsWith('https://') ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['pg', 'bcryptjs'],
  experimental: { serverActions: { bodySizeLimit: '7mb' } },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  webpack(config) {
    config.resolve.alias['@'] = dir;
    return config;
  },
};
export default nextConfig;
