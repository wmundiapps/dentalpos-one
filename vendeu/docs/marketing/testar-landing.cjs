// Testa a landing (calculadora com comissão e "você recebe", FAQ, JSON-LD, termos proibidos e capturas 390px e 1280px).
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
      const cents = (t) => Math.round(parseFloat(t.replace(/[^\d,]/g, '').replace(',', '.')) * 100);
      for (const [v, exp] of cases) {
        await p.fill('#preco', v);
        const got = (await p.textContent('#r-fee')).replace(/\s/g, ' ');
        if (got !== exp.replace(/\s/g, ' ')) errors.push(`calculadora ${v}: esperado ${exp}, veio ${got}`); else console.log('ok', v, '->', got);
        // Você recebe = preço - comissão
        const net = cents(await p.textContent('#r-net')), fee = cents(got), price = Math.round(parseFloat(v.replace(/\.(?=\d{3}$)/g, '').replace(',', '.')) * 100);
        if (net !== price - fee) errors.push(`você recebe ${v}: esperado ${price - fee}, veio ${net}`);
      }
      // Retirar sem vender: R$ 10,00 fixo, igual para qualquer preço (e também com valor inválido).
      for (const v of ['120', '800', '3500', '4000.01', 'abc']) {
        await p.fill('#preco', v);
        const wd = (await p.textContent('#r-withdraw')).replace(/\s/g, ' ');
        if (wd !== 'R$ 10,00') errors.push(`retirada ${v}: esperado R$ 10,00, veio ${wd}`); else console.log('ok retirada', v, '->', wd);
      }
      await p.fill('#preco', 'abc'); if ((await p.textContent('#r-fee')) !== '—') errors.push('valor inválido deveria mostrar —');
      console.log('selftest interno:', await p.evaluate(() => window.__feeSelfTest()));
      await p.fill('#preco', '800');
      // 12 perguntas, FAQ schema coerente e termos proibidos ausentes.
      const nq = await p.locator('#faq details').count(); if (nq !== 12) errors.push('FAQ deveria ter 12 perguntas, tem ' + nq);
      const ld = await p.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)));
      const faq = ld.find((x) => x['@type'] === 'FAQPage'); if (!faq || faq.mainEntity.length !== 12) errors.push('FAQPage JSON-LD inválido');
      const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      for (const bad of [/100% seguro/i, /compra garantida/i, /sem golpes?/i, /garantimos/i, /\bOLX\b/i, /Mercado Livre/i, /cart[aã]o cadastrado/i, />gr[aá]tis</i]) if (bad.test(html)) errors.push('termo proibido na landing: ' + bad);
      if (!(await p.locator('#como-funciona svg').count())) errors.push('diagrama SVG ausente');
    }
    await p.screenshot({ path: path.join(__dirname, `landing-preview-${name}.png`), fullPage: true });
    await ctx.close();
  }
  await b.close();
  console.log(errors.length ? 'ERROS:\n' + errors.join('\n') : 'landing ok');
  srv.close();
  process.exit(errors.length ? 1 : 0);
})();
