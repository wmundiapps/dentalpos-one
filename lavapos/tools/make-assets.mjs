// Gera ícones dos aplicativos (Android/iOS), imagens das lojas e a logomarca em PNG a partir de brand/*.svg.
// Uso: node tools/make-assets.mjs        (rode de dentro de lavapos/)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.dirname + '/../server/')('sharp');
const { chromium } = createRequire('/node-tools/node_modules/')('playwright');
const root = path.resolve(import.meta.dirname, '..');
const brand = path.join(root, 'brand');
const store = path.join(root, 'store');
fs.mkdirSync(store, { recursive: true });
const icon = fs.readFileSync(path.join(brand, 'logo-icon.svg'));
const mark = fs.readFileSync(path.join(brand, 'logo-mark.svg'));
const NAVY = { r: 11, g: 42, b: 74 };

// ---- Ícones das lojas
await sharp(icon, { density: 400 }).resize(1024, 1024).flatten({ background: NAVY }).png().toFile(path.join(store, 'icone-ios-1024.png')); // iOS: sem transparência
await sharp(icon, { density: 400 }).resize(512, 512).png().toFile(path.join(store, 'icone-google-play-512.png'));
// ---- iOS (ícone único 1024 e tela de abertura)
const ios = path.join(root, 'web/ios/App/App/Assets.xcassets');
await sharp(icon, { density: 400 }).resize(1024, 1024).flatten({ background: NAVY }).png().toFile(path.join(ios, 'AppIcon.appiconset/AppIcon-512@2x.png'));
const splash = await sharp({ create: { width: 2732, height: 2732, channels: 3, background: NAVY } }).composite([{ input: await sharp(mark, { density: 300 }).resize(760, 760).png().toBuffer(), gravity: 'center' }]).png().toBuffer();
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) fs.writeFileSync(path.join(ios, 'Splash.imageset', f), splash);
// ---- Android (ícones mipmap + adaptativo)
const res = path.join(root, 'web/android/app/src/main/res');
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, s] of Object.entries(sizes)) {
  const dir = path.join(res, `mipmap-${d}`);
  await sharp(icon, { density: 300 }).resize(s, s).png().toFile(path.join(dir, 'ic_launcher.png'));
  const round = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}"/></svg>`);
  await sharp(await sharp(icon, { density: 300 }).resize(s, s).png().toBuffer()).composite([{ input: round, blend: 'dest-in' }]).png().toFile(path.join(dir, 'ic_launcher_round.png'));
  const fg = Math.round(s * 2.25); // camada adaptativa 108dp
  await sharp({ create: { width: fg, height: fg, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: await sharp(mark, { density: 300 }).resize(Math.round(fg * 0.56), Math.round(fg * 0.56)).png().toBuffer(), gravity: 'center' }]).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));
}
fs.writeFileSync(path.join(res, 'values/ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B2A4A</color>\n</resources>\n');

// ---- Gráficos com texto (renderizados no Chromium para ter a tipografia certa)
const browser = await chromium.launch();
async function render(html, w, h, out) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' }); await page.waitForTimeout(300);
  await page.screenshot({ path: out }); await page.close();
}
const svgUri = (b) => `data:image/svg+xml;base64,${b.toString('base64')}`;
const logoH = fs.readFileSync(path.join(brand, 'logo-horizontal-branco.svg'));
const font = `font-family: Inter, 'Helvetica Neue', Arial, sans-serif;`;
await render(`<body style="margin:0;${font}width:1024px;height:500px;background:linear-gradient(120deg,#0b2a4a,#0b5fd7);color:#fff;display:flex;align-items:center;padding:0 70px;box-sizing:border-box;gap:50px">
  <div style="flex:1"><img src="${svgUri(logoH)}" style="height:70px"><h1 style="font-size:50px;line-height:1.08;margin:26px 0 12px;letter-spacing:-1px">Seu lava-rápido<br>organizado e lucrando</h1><p style="font-size:24px;margin:0;opacity:.88">Check-in com fotos · Agenda · Clube · Cashback</p></div>
  <div style="width:260px;height:330px;border-radius:34px;background:#f3f6fa;box-shadow:0 20px 60px #0007;display:flex;align-items:center;justify-content:center"><img src="${svgUri(icon)}" style="width:170px"></div></body>`, 1024, 500, path.join(store, 'google-play-grafico-destaque-1024x500.png'));
fs.copyFileSync(path.join(brand, 'logo-horizontal.svg'), path.join(store, 'logo-horizontal.svg'));
await browser.close();
for (const [name, svg, w] of [['logo-icone', icon, 1024], ['logo-simbolo', mark, 1024], ['logo-horizontal', fs.readFileSync(path.join(brand, 'logo-horizontal.svg')), 1520], ['logo-horizontal-branco', logoH, 1520]]) {
  await sharp(svg, { density: 400 }).resize({ width: w }).png().toFile(path.join(brand, `${name}.png`));
}
console.log('ícones, imagens das lojas e logomarca gerados');
