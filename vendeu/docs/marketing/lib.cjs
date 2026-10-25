// Biblioteca compartilhada dos geradores de material do Vendeu (CSS da marca, fontes, logo, QR, renderização).
// Uso: veja LEIA-ME.md. Requer: playwright (global), @fontsource/poppins e qrcode numa pasta (VENDEU_FONTS).
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const FONTS = process.env.VENDEU_FONTS || process.argv[2];
if (!FONTS) { console.error('Informe a pasta com node_modules (@fontsource/poppins e qrcode): VENDEU_FONTS=/pasta node gerar-cards.cjs'); process.exit(1); }
const req = createRequire(path.join(FONTS, 'package.json'));
const QRCode = req('qrcode');
const { chromium } = require('playwright');

const BRAND_DIR = path.join(__dirname, '..', '..', 'brand');
const C = { green: '#0B7A4B', dark: '#075735', yellow: '#FFB703', ink: '#102A43', bg: '#F6F8F7', danger: '#C62828' };
const URL_SITE = 'https://vendeu.app';
const SHOW_URL = 'vendeu.app';

const fontFace = (w) => `@font-face{font-family:Poppins;font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(req.resolve(`@fontsource/poppins/files/poppins-latin-${w}-normal.woff2`)).toString('base64')})}`;
const FONT_CSS = [400, 600, 700, 800].map(fontFace).join('');

const raw = (f) => fs.readFileSync(path.join(BRAND_DIR, f), 'utf8');
const sized = (svg, h) => svg.replace('<svg ', `<svg style="height:${h}px;width:auto;display:block" `);
const logo = (h, onDark = false) => sized(onDark ? raw('logo.svg').replace('#102A43', '#FFFFFF') : raw('logo.svg'), h);
const symbol = (h) => sized(raw('symbol.svg'), h);
const qr = (size, dark = C.ink, light = '#FFFFFF') => QRCode.toDataURL(URL_SITE, { margin: 1, width: size, errorCorrectionLevel: 'M', color: { dark, light } });

const BASE_CSS = `${FONT_CSS}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Poppins,'Noto Color Emoji',sans-serif;-webkit-font-smoothing:antialiased}
.c{position:relative;overflow:hidden;display:flex;flex-direction:column;padding:84px 80px;color:#fff;background:linear-gradient(150deg,#053f2a 0%,#075735 38%,#0B7A4B 100%)}
.c.light{background:#F6F8F7;color:#102A43}
.c.yellow{background:#FFB703;color:#102A43}
.c.ink{background:#102A43;color:#fff}
.blob{position:absolute;border-radius:50%;background:#fff;opacity:.07}
.light .blob{background:#0B7A4B;opacity:.07}
.yellow .blob{background:#fff;opacity:.22}
.top{display:flex;justify-content:space-between;align-items:center;position:relative;z-index:2}
.count{font-size:30px;font-weight:600;opacity:.8}
.body{flex:1;display:flex;flex-direction:column;justify-content:center;position:relative;z-index:2;padding:28px 0}
.kicker{font-size:30px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#FFB703;margin-bottom:22px}
.light .kicker{color:#0B7A4B}.yellow .kicker{color:#075735}
h1{font-size:88px;line-height:1.05;font-weight:800;letter-spacing:-.015em}
h1 em{font-style:normal;color:#FFB703}
.light h1 em{color:#0B7A4B}.yellow h1 em{color:#075735}
h2{font-size:72px;line-height:1.08;font-weight:800;letter-spacing:-.01em}
h2 em{font-style:normal;color:#FFB703}.light h2 em{color:#0B7A4B}.yellow h2 em{color:#075735}
p.sub{font-size:40px;line-height:1.35;margin-top:30px;font-weight:400;opacity:.95}
.foot{display:flex;justify-content:space-between;align-items:center;font-size:30px;font-weight:600;position:relative;z-index:2;gap:20px}
.swipe{background:rgba(255,255,255,.18);padding:14px 28px;border-radius:40px;white-space:nowrap}
.light .swipe{background:rgba(11,122,75,.12);color:#0B7A4B}.yellow .swipe{background:rgba(16,42,67,.12)}
.note{font-size:26px;line-height:1.35;opacity:.8;margin-top:26px}
.steps{display:grid;gap:30px;margin-top:44px}
.step{display:flex;gap:28px;align-items:flex-start}
.step .n{flex:none;width:84px;height:84px;border-radius:50%;background:#FFB703;color:#102A43;display:grid;place-items:center;font-weight:800;font-size:46px}
.step b{display:block;font-size:44px;line-height:1.15;font-weight:700}
.step span{display:block;font-size:32px;line-height:1.3;opacity:.9;margin-top:6px}
table.fees{width:100%;border-collapse:separate;border-spacing:0 10px;margin-top:26px}
.fees td{font-size:36px;font-weight:600;padding:11px 28px;background:rgba(255,255,255,.14)}
.fees td:first-child{border-radius:18px 0 0 18px}.fees td:last-child{border-radius:0 18px 18px 0;text-align:right;font-weight:800;color:#FFB703;font-size:40px;white-space:nowrap}
.light .fees td{background:#fff}.light .fees td:last-child{color:#0B7A4B}
.btn{display:inline-block;background:#FFB703;color:#102A43;font-weight:800;font-size:46px;padding:28px 52px;border-radius:24px;box-shadow:0 12px 30px rgba(0,0,0,.25)}
.url{font-size:38px;font-weight:700;margin-top:24px}
.chip{display:inline-block;font-size:30px;font-weight:700;padding:10px 24px;border-radius:40px;background:#FFB703;color:#102A43}
.card{background:#fff;color:#102A43;border-radius:34px;padding:40px 44px;box-shadow:0 14px 36px rgba(0,0,0,.18)}
.list{display:grid;gap:26px;margin-top:40px}
.list div{display:flex;gap:24px;align-items:center;font-size:42px;font-weight:600;line-height:1.2}
.list b{flex:none;width:76px;height:76px;border-radius:20px;background:rgba(255,255,255,.18);display:grid;place-items:center;font-size:40px}
.light .list b{background:rgba(11,122,75,.12)}.yellow .list b{background:rgba(16,42,67,.12)}
.qrbox{background:#fff;padding:18px;border-radius:26px;display:inline-block}
.qrbox img{display:block}
`;

let browser;
async function open() { browser = browser || await chromium.launch(); return browser; }
async function close() { if (browser) await browser.close(); browser = null; }

/** Renderiza html em um PNG. opts: { dsf, transparent, css } */
async function render(html, w, h, file, opts = {}) {
  const b = await open();
  const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: opts.dsf || 1 });
  await page.setContent(`<html><head><meta charset="utf-8"><style>${BASE_CSS}.c{width:${w}px;height:${h}px}${opts.css || ''}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  // Verificação de transbordamento: nenhum filho do .body pode passar da área do cartão.
  const issues = await page.evaluate(() => {
    const out = []; const root = document.querySelector('.c'); if (!root) return out;
    const r = root.getBoundingClientRect();
    root.querySelectorAll('.top,.body,.foot,.body *').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) return;
      if (b.right > r.right - 40 || b.left < r.left + 40 || b.bottom > r.bottom - 40) out.push(`${el.className || el.tagName} ${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}`);
    });
    const body = root.querySelector('.body');
    if (body && body.scrollHeight > body.clientHeight + 2) out.push('body.scroll ' + body.scrollHeight + '>' + body.clientHeight);
    return out;
  });
  if (issues.length && !opts.skipCheck) console.warn('AVISO transbordo', file, issues.slice(0, 4));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: !!opts.transparent });
  await page.close();
}

module.exports = { C, URL_SITE, SHOW_URL, logo, symbol, qr, render, close, BASE_CSS };
