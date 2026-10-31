// Monta dist-app/ para publicar o app na Vercel: arquivos estáticos do painel em public/, servidor na função api/index.js.
// Uso: node scripts/build-app.mjs
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-app');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'api'), { recursive: true });

cpSync(join(root, 'server'), join(out, 'server'), { recursive: true });
cpSync(join(root, 'web'), join(out, 'public'), { recursive: true });
cpSync(join(root, 'deploy-vercel', 'api-index.js'), join(out, 'api', 'index.js'));

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
writeFileSync(join(out, 'package.json'), JSON.stringify({
  name: pkg.name, version: pkg.version, private: true, type: 'module', engines: { node: '22.x' }, dependencies: { pg: (pkg.dependencies || pkg.optionalDependencies).pg },
}, null, 2));

const security = [
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];
writeFileSync(join(out, 'vercel.json'), JSON.stringify({
  functions: { 'api/index.js': { maxDuration: 30 } },
  // Agendador: lembretes, recall, cobranças do clube e convites. A Vercel envia o CRON_SECRET no cabeçalho Authorization.
  crons: [{ path: '/api/cron/tick', schedule: '*/5 * * * *' }],
  rewrites: [
    { source: '/s/:slug', destination: '/booking.html' },
    { source: '/profissionais', destination: '/profissionais.html' },
    { source: '/api/:path*', destination: '/api/index' },
    { source: '/webhooks/:path*', destination: '/api/index' },
    { source: '/healthz', destination: '/api/index' },
    { source: '/uploads/:path*', destination: '/api/index' },
  ],
  headers: [
    { source: '/(.*)', headers: security },
    { source: '/fonts/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
  ],
}, null, 2));
console.log('dist-app/ pronto');
