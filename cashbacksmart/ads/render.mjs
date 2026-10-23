import { chromium } from '../app/node_modules/playwright/index.mjs';
import fs from 'fs';
const sizes = [
  ['meta-feed-quadrado', 1080, 1080], ['meta-feed-retrato', 1080, 1350], ['stories-reels-tiktok', 1080, 1920],
  ['google-paisagem', 1200, 628], ['google-quadrado', 1200, 1200], ['google-300x250', 300, 250], ['google-728x90', 728, 90], ['google-320x50', 320, 50], ['google-160x600', 160, 600],
];
const only = process.argv[2];
const b = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
fs.mkdirSync('out', { recursive: true });
for (const v of ['cupom', 'conta', 'loja']) for (const [n, w, h] of sizes) {
  if (only && !`${v}-${n}`.includes(only)) continue;
  const scale = w < 800 ? 2 : 1;
  const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await pg.goto(`file://${process.cwd()}/ad.html?v=${v}&w=${w}&h=${h}`);
  await pg.waitForSelector('body[data-ready]');
  await pg.waitForTimeout(150);
  await pg.screenshot({ path: `out/${v}-${n}.png` });
  await pg.close();
}
await b.close();
console.log(fs.readdirSync('out').length, 'arquivos');
