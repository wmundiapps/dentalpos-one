// Testa a landing (calculadora + capturas de tela mobile 390px e desktop 1280px).
//   node testar-landing.cjs
const path = require('node:path');
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs');
const ROOT = path.join(__dirname, '..', '..', 'site');
const types = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
let SITE;
(async () => {
  await new Promise((ok) => srv.listen(0, ok)); SITE = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch();
  const errors = [];
  for (const [name, w, h, dark] of [['mobile', 390, 844, false], ['desktop', 1280, 800, false], ['mobile-dark', 390, 844, true]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await p.goto(SITE + '?selftest');
    await p.evaluate(() => document.fonts.ready);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w) errors.push(`${name}: rolagem horizontal (${sw} > ${w})`);
    if (name === 'mobile') {
      // Limites da calculadora, digitando no campo (pt-BR) e lendo o resultado na tela.
      const cases = [['150', 'R$ 15,00'], ['150,01', 'R$ 20,00'], ['500', 'R$ 20,00'], ['501', 'R$ 30,00'], ['1000', 'R$ 30,00'], ['1500', 'R$ 50,00'], ['2000', 'R$ 80,00'], ['3000', 'R$ 100,00'], ['3001', 'R$ 150,00'], ['4000', 'R$ 150,00'], ['4000.01', 'R$ 200,00'], ['3.500', 'R$ 150,00'], ['120', 'R$ 15,00']];
      for (const [v, exp] of cases) {
        await p.fill('#preco', v);
        const got = (await p.textContent('#r-fee')).replace(/\s/g, ' ');
        if (got !== exp.replace(/\s/g, ' ')) errors.push(`calculadora ${v}: esperado ${exp}, veio ${got}`); else console.log('ok', v, '->', got);
      }
      await p.fill('#preco', 'abc'); if ((await p.textContent('#r-fee')) !== '—') errors.push('valor inválido deveria mostrar —');
      console.log('selftest interno:', await p.evaluate(() => window.__feeSelfTest()));
      await p.fill('#preco', '800');
    }
    await p.screenshot({ path: path.join(__dirname, `landing-preview-${name}.png`), fullPage: true });
    await ctx.close();
  }
  await b.close();
  console.log(errors.length ? 'ERROS:\n' + errors.join('\n') : 'landing ok');
  srv.close();
  process.exit(errors.length ? 1 : 0);
})();
