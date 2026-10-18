// Mini-framework HTTP sem dependências: roteador, corpo, cookies, CORS, estáticos.
import { createReadStream, readFileSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { cfg } from './config.js';
import { HttpError } from './util.js';
import { securityHeaders } from './security.js';

export class Router {
  constructor() { this.routes = []; }
  add(method, path, ...chain) {
    const keys = [];
    const rx = new RegExp('^' + path.replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, rx, keys, chain, path });
    return this;
  }
  get(p, ...c) { return this.add('GET', p, ...c); }
  post(p, ...c) { return this.add('POST', p, ...c); }
  put(p, ...c) { return this.add('PUT', p, ...c); }
  patch(p, ...c) { return this.add('PATCH', p, ...c); }
  delete(p, ...c) { return this.add('DELETE', p, ...c); }
  match(method, pathname) {
    let pathExists = false;
    for (const r of this.routes) {
      const m = r.rx.exec(pathname);
      if (!m) continue;
      pathExists = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
    return { route: null, pathExists };
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function clientIp(req) {
  const trust = process.env.TRUST_PROXY ? process.env.TRUST_PROXY === 'true' : cfg.isProd;
  if (trust) {
    const cf = req.headers['cf-connecting-ip'];
    if (cf) return String(cf);
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

export function readBody(req, limit = cfg.maxBodyBytes) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        // descarta o excedente (sem guardar em memória) e responde 413 no fim; corta conexões absurdas
        tooBig = true;
        chunks.length = 0;
        if (size > limit + 25_000_000) req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => (tooBig ? reject(new HttpError(413, 'Corpo da requisição grande demais.')) : resolveBody(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

export function cookieString(name, value, { maxAgeSec, httpOnly = true, sameSite = 'Lax', path = '/' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (httpOnly) c += '; HttpOnly';
  if (cfg.isProd) c += '; Secure';
  if (maxAgeSec !== undefined) c += `; Max-Age=${maxAgeSec}`;
  return c;
}

export function corsHeaders(req) {
  const origin = req.headers.origin;
  if (origin && cfg.allowedOrigins.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    };
  }
  return { Vary: 'Origin' };
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
};

export function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...securityHeaders(),
    ...headers,
  });
  res.end(body);
}

export function sendText(res, status, text, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, ...securityHeaders(), ...headers });
  res.end(text);
}

// Serve arquivos de uma pasta raiz, sem sair dela (anti path traversal).
export function serveStatic(req, res, rootDir, relPath, { cache = 'no-cache' } = {}) {
  const root = resolve(rootDir);
  const target = resolve(join(root, normalize(relPath).replace(/^(\.\.[/\\])+/, '')));
  if (target !== root && !target.startsWith(root + sep)) return false;
  if (!existsSync(target)) return false;
  const st = statSync(target);
  if (!st.isFile()) return false;
  const ext = extname(target).toLowerCase();
  const type = MIME[ext];
  if (!type) return false;
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const immutable = ext === '.otf' || ext === '.ttf' || ext === '.woff2';
  const headers = {
    'Content-Type': type,
    ETag: etag,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : cache,
    ...securityHeaders(),
  };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
  const compressible = /html|javascript|css|json|svg|xml|text/.test(type) && st.size > 512 && /gzip/.test(req.headers['accept-encoding'] || '');
  if (compressible) {
    const gz = gzipSync(readFileSync(target));
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': gz.length });
    res.end(gz);
    return true;
  }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  if (req.method === 'HEAD') { res.end(); return true; }
  createReadStream(target).pipe(res);
  return true;
}

