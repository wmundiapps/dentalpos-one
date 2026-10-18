// Renderiza ads/out/html/*.html em PNG (Playwright em Node). Uso: node ads/shoot.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'out', 'html');
const SIZES = { 'feed-1x1': [1080, 1080], 'feed-4x5': [1080, 1350], 'story-9x16': [1080, 1920], 'link-1.91x1': [1200, 628], 'google-1x1': [1200, 1200] };
(async () => {
  const b = await chromium.launch();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) {
    const size = f.replace('.html', '').split('_').slice(1).join('_');
    const [w, h] = SIZES[size];
    const pg = await b.newPage({ viewport: { width: w, height: h } });
    await pg.goto('file://' + path.join(dir, f));
    await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(150);
    await pg.screenshot({ path: path.join(__dirname, 'out', f.replace('.html', '.png')) });
    await pg.close();
  }
  await b.close();
})();
