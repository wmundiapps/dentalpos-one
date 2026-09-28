// Servidor local: arquivos de public/ (com URLs limpas, como na Vercel) + API em /api.
// Uso: DATABASE_URL=... SESSION_SECRET=... node scripts/dev.js
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../lib/app.js';
import { migrate } from './migrate.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.xml': 'application/xml' };

async function tryFile(p) {
  try { const s = await stat(p); return s.isFile() ? p : null; } catch { return null; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handler(req, res);
  const safe = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const base = path.join(root, safe);
  const file = (await tryFile(base)) || (await tryFile(base + '.html')) || (await tryFile(path.join(base, 'index.html')));
  if (!file || !file.startsWith(root)) {
    res.statusCode = 404;
    return res.end(await readFile(path.join(root, '404.html')).catch(() => 'não encontrado'));
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.end(await readFile(file));
});

await migrate();
const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`AlignSystem em http://localhost:${port}`));
