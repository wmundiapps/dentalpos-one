// Gera as capturas de tela reais do sistema (lojas de aplicativos, landing page e demonstrativo).
// Pré-requisitos: API em :4100 com o banco de demonstração (npm run seed-demo) e a tela em :5174 (vite preview).
// Uso: DEMO_EMAIL=... DEMO_PASSWORD=... node tools/screenshots.mjs <pasta-de-saida>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/node-tools/node_modules/');
const { chromium } = require('playwright');

const OUT = path.resolve(process.argv[2] ?? 'screens');
const WEB = process.env.WEB ?? 'http://127.0.0.1:5174';
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@lavapos.com.br';
const PASSWORD = process.env.DEMO_PASSWORD;
if (!PASSWORD) throw new Error('Defina DEMO_PASSWORD');

const login = await (await fetch(`${WEB}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).json();
const token = login.token;
const api = async (p) => (await fetch(`${WEB}/api${p}`, { headers: { authorization: `Bearer ${token}` } })).json();
const slug = (await api('/auth/me')).tenant.slug;

// fotos de apoio para o passo de fotos do check-in
fs.mkdirSync(OUT, { recursive: true });
const tmp = path.join(OUT, '_tmp'); fs.mkdirSync(tmp, { recursive: true });
const orders = await api('/orders?status=entregue');
const withPhotos = [];
for (const o of orders) { const ph = await api(`/photos/order/${o.id}`); if (ph.some((p) => p.phase === 'checkin')) withPhotos.push({ o, ph }); if (withPhotos.length >= 2) break; }
const photoFiles = [];
for (const [i, { ph }] of withPhotos.entries()) for (const p of ph.filter((x) => x.phase === 'checkin')) {
  const buf = Buffer.from(await (await fetch(`${WEB}/api/photos/${p.id}/file`, { headers: { authorization: `Bearer ${token}` } })).arrayBuffer());
  const f = path.join(tmp, `c${i}-${p.id}.jpg`); fs.writeFileSync(f, buf); photoFiles.push(f);
}

const browser = await chromium.launch();
async function session(name, viewport, dsf, shots) {
  const dir = path.join(OUT, name); fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', isMobile: viewport.width < 600, hasTouch: viewport.width < 600, colorScheme: 'light' });
  await ctx.addInitScript((t) => localStorage.setItem('lp_token', t), token);
  const page = await ctx.newPage();
  const snap = async (file) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(dir, file) }); };
  await shots(page, snap);
  await ctx.close();
}

async function checkinFlow(page, snap, prefix) {
  await page.goto(`${WEB}/checkin`); await page.waitForSelector('text=Placa do veículo');
  await page.fill('input[placeholder="ABC1D23"]', 'QWE1R23');
  await page.waitForSelector('text=Marca');
  await page.selectOption('label.f:has(> span:text-is("Marca")) select', 'Toyota');
  await page.selectOption('label.f:has(> span:text-is("Modelo")) select', 'Corolla Cross');
  await page.selectOption('label.f:has(> span:text-is("Ano")) select', '2023');
  await page.selectOption('label.f:has(> span:text-is("Cor")) select', 'Prata');
  await page.fill('label.f:has(> span:text-is("Nome completo")) input', 'Marcelo Andrade');
  await page.fill('label.f:has(> span:text-is("WhatsApp")) input', '44998877665');
  await page.fill('label.f:has(> span:text-is("CPF (para a nota fiscal)")) input', '52998224725');
  await snap(`${prefix}-01-cliente-veiculo.png`);
  await page.click('text=Continuar →'); await page.waitForSelector('text=Lavagem completa');
  await page.click('button.chip:has-text("Lavagem completa")'); await page.click('button.chip:has-text("Enceramento")');
  await snap(`${prefix}-02-servicos.png`);
  await page.click('text=Continuar →'); await page.waitForSelector('text=Marcar o que falta como OK');
  await page.click('text=Marcar o que falta como OK');
  const rows = page.locator('.check-row'); 
  await rows.nth(0).locator('button.chip:has-text("Riscado")').click(); await rows.nth(2).locator('button.chip:has-text("Sujo")').click(); await rows.nth(3).locator('button.chip:has-text("Amassado")').click();
  await page.evaluate(() => window.scrollTo(0, 0)); await snap(`${prefix}-03-checklist.png`);
  await page.click('text=Continuar →'); await page.waitForSelector('text=Fotos de entrada');
  const angles = ['Frente', 'Traseira', 'Lateral esq.', 'Lateral dir.'];
  for (const [i, a] of angles.entries()) { if (!photoFiles[i % photoFiles.length]) break; const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`button[aria-label="Foto: ${a}"]`)]); await fc.setFiles(photoFiles[i % photoFiles.length]); }
  await snap(`${prefix}-04-fotos.png`);
}

const mobile = (name, vp, dsf) => session(name, vp, dsf, async (page, snap) => {
  await page.goto(`${WEB}/`); await page.waitForSelector('text=Carros em serviço'); await snap('01-hoje.png');
  await checkinFlow(page, snap, '02');
  await page.goto(`${WEB}/patio`); await page.waitForSelector('text=Pátio e ordens'); await snap('06-patio.png');
  const first = await page.locator('a.card').first().getAttribute('href'); await page.goto(`${WEB}${first}`); await page.waitForSelector('text=Serviços'); await snap('07-ordem.png');
  await page.goto(`${WEB}/agenda`); await page.waitForSelector('text=Link de agendamento online'); await snap('08-agenda.png');
  await page.goto(`${WEB}/clube`); await page.waitForSelector('text=Assinantes ativos'); await snap('09-clube.png');
  await page.goto(`${WEB}/financeiro`); await page.waitForSelector('text=Comissão da plataforma'); await snap('10-financeiro.png');
  await page.goto(`${WEB}/precificacao`); await page.waitForSelector('text=Ponto de equilíbrio'); await snap('11-precificacao.png');
  await page.goto(`${WEB}/l/${slug}`); await page.waitForSelector('text=Serviços e valores'); await snap('12-pagina-publica.png');
});

await mobile('ios-6.7', { width: 430, height: 932 }, 3);      // 1290 x 2796
await mobile('android-phone', { width: 360, height: 640 }, 3); // 1080 x 1920
await mobile('mobile-preview', { width: 390, height: 844 }, 2);

await session('desktop', { width: 1440, height: 900 }, 1, async (page, snap) => {
  const go = async (route, text, file, full = false) => { await page.goto(`${WEB}${route}`); await page.waitForSelector(`text=${text}`); await page.waitForTimeout(600); await page.screenshot({ path: path.join(OUT, 'desktop', file), fullPage: full }); };
  await go('/', 'Carros em serviço', 'dashboard.png');
  await go('/patio', 'Pátio e ordens', 'patio.png');
  await go('/agenda', 'Link de agendamento online', 'agenda.png');
  await go('/servicos', 'Serviços e preços', 'servicos.png');
  await go('/clube', 'Assinantes ativos', 'clube.png');
  await go('/financeiro', 'Comissão da plataforma', 'financeiro.png');
  await go('/estoque', 'Estoque e fornecedores', 'estoque.png');
  await go('/lembretes', 'Licenças, alvarás e contratos', 'lembretes.png');
  await go('/precificacao', 'Ponto de equilíbrio', 'precificacao.png', true);
  await go('/vitrine', 'Antes e depois', 'vitrine.png');
  await go(`/l/${slug}`, 'Serviços e valores', 'pagina-publica.png', true);
  await go('/marketing', 'Fidelidade e avisos', 'fidelidade.png');
});
fs.rmSync(tmp, { recursive: true, force: true });
await browser.close();
console.log('Capturas salvas em', OUT);
