import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [S, OUT] = process.argv.slice(2);
const f = fs.readFileSync(`${S}/node_modules/@fontsource/poppins/files/poppins-latin-800-normal.woff2`).toString('base64');
const font = `@font-face{font-family:P;font-weight:800;src:url(data:font/woff2;base64,${f})}*{margin:0}body{font-family:P}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function shot(name, size, html, transparent = false) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<html><head><style>${font}</style></head><body style="width:${size}px;height:${size}px;${transparent ? 'background:transparent' : ''}">${html}</body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${OUT}/${name}.png`, omitBackground: transparent });
  await p.close();
}
const grad = 'background:linear-gradient(145deg,#073f3e 0%,#0a5f5e 35%,#0e7c7b 70%,#17a8a5 100%)';
const letter = (px) => `<div style="color:#fff;font-weight:800;font-size:${px}px;line-height:1;transform:translateY(-${px * 0.005}px)">S</div>`;
const center = 'display:grid;place-items:center;width:100%;height:100%';
// Ícone completo (iOS e fallback): fundo verde + S branco
await shot('icon-only', 1024, `<div style="${center};${grad}">${letter(640)}</div>`);
// Android adaptativo: primeiro plano (S dentro da zona segura de 66%) e fundo
await shot('icon-foreground', 1024, `<div style="${center}">${letter(420)}</div>`, true);
await shot('icon-background', 1024, `<div style="${center};${grad}"></div>`);
// Tela de abertura: marca centralizada
const splash = (bg) => `<div style="${center};background:${bg}"><div style="display:flex;flex-direction:column;align-items:center;gap:60px">
<div style="width:520px;height:520px;border-radius:130px;background:#fff;display:grid;place-items:center;color:#0a5f5e;font-weight:800;font-size:360px;line-height:1">S</div>
<div style="color:#fff;font-weight:800;font-size:150px">SpaceHour</div></div></div>`;
await shot('splash', 2732, splash('#0e7c7b'));
await shot('splash-dark', 2732, splash('#0a5f5e'));
await b.close();
