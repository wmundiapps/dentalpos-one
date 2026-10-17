// Gera os cards de anúncio (Meta Ads: feed 1080x1080, retrato 1080x1350, stories/reels 1080x1920) a partir das capturas reais.
// Uso: node tools/make-ads.mjs   (depois de rodar tools/screenshots.mjs e salvar em store/capturas)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire('/node-tools/node_modules/')('playwright');
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'store/capturas/iphone-6.7pol-1290x2796');
const out = path.join(root, 'marketing/meta-ads');
const b64 = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
const logo = `data:image/svg+xml;base64,${fs.readFileSync(path.join(root, 'brand/logo-horizontal-branco.svg')).toString('base64')}`;

const ADS = [
  { id: '1-checkin-fotos', shot: '02-04-fotos.png', kicker: 'CHECK-IN COM FOTOS', h: 'Chega de discussão sobre <em>risco e amassado</em>', s: 'Marque o estado do carro na entrada e na saída, com fotos. O cliente confere e concorda.', cta: 'Teste 30 dias grátis' },
  { id: '2-clube', shot: '09-clube.png', kicker: 'CLUBE DE ASSINATURA', h: 'Seu cliente <em>volta sozinho</em> toda semana', s: 'Lavagem semanal, quinzenal, trisemanal ou mensal com cobrança automática.', cta: 'Criar conta grátis' },
  { id: '3-oferta', shot: '01-hoje.png', kicker: 'OFERTA PARA LAVA-RÁPIDOS', h: '<em>30 dias grátis.</em> Sem cartão.', s: 'Depois, R$ 119 por mês. Check-in, agenda, clube, cashback, estoque e financeiro.', cta: 'Começar agora' },
  { id: '4-lucro', shot: '10-financeiro.png', kicker: 'FINANCEIRO E PRECIFICAÇÃO', h: 'Quanto sobra <em>de verdade</em> em cada lavagem?', s: 'Preço certo por categoria, ponto de equilíbrio e lucro do mês, sem planilha.', cta: 'Teste grátis' },
  { id: '5-agenda', shot: '08-agenda.png', kicker: 'AGENDA E AVISOS', h: 'Carro pronto? <em>O cliente já sabe.</em>', s: 'Agendamento online e avisos por WhatsApp, SMS e e-mail. Menos telefone, mais lavagem.', cta: 'Criar conta grátis' },
];
const FORMATS = [['feed-1080x1080', 1080, 1080], ['retrato-1080x1350', 1080, 1350], ['stories-1080x1920', 1080, 1920]];

const html = (a, w, h) => {
  const story = h === 1920, wide = h === 1080;
  const phoneW = story ? 600 : wide ? 400 : 470;
  return `<!doctype html><meta charset="utf-8"><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:Inter,Arial,sans-serif;color:#fff;background:linear-gradient(150deg,#0b2a4a 0%,#0b5fd7 120%);position:relative">
  <div style="position:absolute;right:-180px;top:-180px;width:560px;height:560px;border-radius:50%;background:radial-gradient(#14b8e655,transparent 70%)"></div>
  <div style="position:absolute;inset:0;padding:${story ? '120px 70px 110px' : '64px 70px'};display:flex;flex-direction:${wide ? 'row' : 'column'};gap:${wide ? 30 : 34}px;box-sizing:border-box">
    <div style="flex:${wide ? '1.25' : 'none'};display:flex;flex-direction:column;justify-content:${wide ? 'center' : 'flex-start'}">
      <img src="${logo}" style="height:${wide ? 54 : 64}px;align-self:flex-start;margin-bottom:${wide ? 30 : 38}px">
      <div style="font-size:24px;font-weight:700;letter-spacing:2px;color:#14b8e6;margin-bottom:14px">${a.kicker}</div>
      <div style="font-size:${wide ? 62 : story ? 86 : 74}px;font-weight:800;line-height:1.04;letter-spacing:-2px">${a.h.replace(/<em>/g, '<span style="color:#14b8e6">').replace(/<\/em>/g, '</span>')}</div>
      <div style="font-size:${wide ? 26 : 32}px;line-height:1.35;margin-top:22px;opacity:.92;max-width:${wide ? 520 : 900}px">${a.s}</div>
      <div style="margin-top:${wide ? 30 : 38}px;align-self:flex-start;background:#fff;color:#0b2a4a;font-weight:800;font-size:${wide ? 28 : 34}px;padding:20px 38px;border-radius:18px">${a.cta} →</div>
    </div>
    <div style="flex:1;display:flex;justify-content:center;align-items:${wide ? 'center' : 'flex-end'};${wide ? '' : 'margin-bottom:-' + (story ? 40 : 20) + 'px;'}">
      <div style="width:${phoneW}px;border-radius:54px;background:#0a1624;padding:12px;box-shadow:0 30px 80px #0009;${wide ? 'transform:rotate(3deg)' : ''}">
        <div style="border-radius:44px;overflow:hidden;height:${wide ? 700 : story ? 1080 : 520}px;background:#f3f6fa"><img src="${b64(path.join(shots, a.shot))}" style="width:100%;display:block"></div></div></div>
  </div></body>`;
};

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const a of ADS) for (const [name, w, h] of FORMATS) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html(a, w, h), { waitUntil: 'load' }); await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, `${a.id}_${name}.png`) }); await page.close();
}
await browser.close();
console.log(ADS.length * FORMATS.length, 'cards gerados em', out);
