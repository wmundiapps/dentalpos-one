// Gera os cards de divulgação da WMundi (PNG) para cada rede. Uso: node gerar.mjs
// Requer Playwright com Chromium. Marca e textos: ver ../PLANO-DE-MARKETING-WMUNDI.md
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }
const aqui = dirname(fileURLToPath(import.meta.url))
const logo = 'data:image/png;base64,' + readFileSync(join(aqui, '../../../docs/wmundi/site-novo/assets/logo-wmundi.png')).toString('base64')

// formatos: [arquivo, largura, altura]
const FORMATOS = {
  'instagram-feed': [1080, 1350],
  'stories-reels-tiktok': [1080, 1920],
  'facebook': [1200, 630],
  'linkedin': [1200, 627],
  'x': [1600, 900],
  'google-ads-horizontal': [1200, 628],
  'google-ads-quadrado': [1200, 1200],
  'google-meu-negocio': [1200, 900],
}

const TEMAS = {
  marca: {
    olho: 'Sistemas · Aplicativos · Inteligência artificial',
    titulo: 'Tecnologia que trabalha para o seu negócio <em>prosperar</em>.',
    sub: 'Soluções sob medida, desenvolvidas em Maringá-PR.',
    arte: 'globo',
  },
  sites: {
    olho: 'Sites e soluções personalizadas',
    titulo: 'O seu site e as suas soluções, <em>sob medida</em>.',
    sub: 'Sites, lojas virtuais e sistemas pensados para o seu negócio vender mais.',
    arte: 'site',
  },
  redes: {
    olho: 'Automação de redes sociais',
    titulo: 'Automação para as suas <em>redes sociais</em>.',
    sub: 'Agende, crie com IA e responda com supervisão. As suas contas, sob o seu controle.',
    arte: 'redes',
  },
  agentes: {
    olho: 'Agentes de inteligência artificial',
    titulo: 'Agentes de IA que atendem <em>enquanto você descansa</em>.',
    sub: 'Atendimento, agenda, cobrança de atraso e avaliação, com supervisão humana.',
    arte: 'chat',
  },
  apps: {
    olho: 'Desenvolvimento de aplicativos',
    titulo: 'O seu aplicativo, <em>do esboço à loja</em>.',
    sub: 'iPhone, iPad e Android, com conta ativa na App Store e no Google Play.',
    arte: 'celular',
  },
}

function arte(tipo) {
  if (tipo === 'globo')
    return `<div class="a globo"><i></i><i></i><i></i><b>24h</b></div>`
  if (tipo === 'site')
    return `<div class="a site"><div class="barra"><s></s><s></s><s></s></div><div class="corpo"><p class="h"></p><p></p><p class="c"></p><div class="gr"><span></span><span></span><span></span></div></div></div>`
  if (tipo === 'redes')
    return `<div class="a redes">${['Instagram', 'Facebook', 'Google', 'TikTok', 'LinkedIn', 'X'].map((n) => `<span>${n}</span>`).join('')}</div>`
  if (tipo === 'chat')
    return `<div class="a chat"><p class="c1">Oi! Vocês atendem sábado?</p><p class="c2">Atendemos das 8h às 12h. Quer um horário?</p><p class="c1">Quero sim, de manhã</p><p class="c2">Reservado! Te lembro um dia antes.</p></div>`
  return `<div class="a celular"><div class="tela"><div class="ic i1"></div><div class="ic i2"></div><div class="ic i3"></div><div class="ic i4"></div><div class="ic i5"></div><div class="ic i6"></div></div></div>`
}

function html(t, w, h) {
  const u = Math.min(w, h) / 100
  const paisagem = w / h > 1.25
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;800&family=DM+Sans:wght@500;700&display=swap">
<style>
:root{--u:${u}px;--ink:#0b1b3f;--sun:#ffc94d;--coral:#ff5a4e;--blue:#2f5bff}
*{box-sizing:border-box;margin:0}
body{width:${w}px;height:${h}px;overflow:hidden;font-family:'DM Sans',system-ui,sans-serif;color:#fff;
 background:radial-gradient(${w * 0.7}px ${h * 0.6}px at 85% 8%,#1d3a8a 0%,transparent 62%),linear-gradient(160deg,#0b1b3f 0%,#0a1530 100%)}
.q{height:100%;padding:calc(var(--u)*6);display:grid;gap:calc(var(--u)*3);
 ${paisagem ? 'grid-template-columns:1.15fr .85fr;grid-template-rows:auto 1fr auto;' : 'grid-template-rows:auto auto 1fr auto;'}}
.topo{display:flex;align-items:center;justify-content:space-between;${paisagem ? 'grid-column:1/3;' : ''}}
.topo img{height:calc(var(--u)*${paisagem ? 7.5 : 6.5})}
.texto{align-self:center;${paisagem ? '' : ''}}
.olho{font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--sun);font-size:calc(var(--u)*${paisagem ? 2.2 : 2.3});margin-bottom:calc(var(--u)*2)}
h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;line-height:1.04;letter-spacing:-.02em;font-size:calc(var(--u)*${paisagem ? 7.2 : 8.4})}
h1 em{font-style:normal;color:var(--sun)}
.sub{margin-top:calc(var(--u)*2.4);color:#c3cdee;font-size:calc(var(--u)*${paisagem ? 2.7 : 3.1});line-height:1.35;max-width:92%}
.arte{display:grid;place-items:center;${paisagem ? '' : 'min-height:0;'}}
.rodape{display:flex;align-items:center;justify-content:space-between;gap:calc(var(--u)*2);${paisagem ? 'grid-column:1/3;' : ''}}
.cta{background:var(--coral);color:#fff;font-weight:700;border-radius:calc(var(--u)*1.6);padding:calc(var(--u)*1.8) calc(var(--u)*3.6);font-size:calc(var(--u)*2.8)}
.site-url{color:#c3cdee;font-weight:700;font-size:calc(var(--u)*2.8)}
/* artes */
.a{position:relative;width:calc(var(--u)*${paisagem ? 36 : 54});height:calc(var(--u)*${paisagem ? 30 : 40})}
.globo{display:grid;place-items:center}
.globo i{position:absolute;border:calc(var(--u)*.5) solid rgba(255,201,77,.55);border-radius:50%}
.globo i:nth-child(1){inset:0}.globo i:nth-child(2){inset:12%;border-color:rgba(255,255,255,.35)}.globo i:nth-child(3){inset:26%;border-color:rgba(47,91,255,.9)}
.globo b{font-family:'Bricolage Grotesque';font-size:calc(var(--u)*9);color:var(--sun)}
.site{background:#fff;border-radius:calc(var(--u)*2);box-shadow:0 calc(var(--u)*2) calc(var(--u)*6) rgba(0,0,0,.4);overflow:hidden;transform:rotate(-3deg)}
.site .barra{background:#e6ebfa;padding:calc(var(--u)*1.4);display:flex;gap:calc(var(--u)*.8)}.site s{width:calc(var(--u)*1.2);height:calc(var(--u)*1.2);border-radius:50%;background:#9fb0e0}
.site .corpo{padding:calc(var(--u)*2.4)}.site p{height:calc(var(--u)*1.6);background:#dbe3ff;border-radius:99px;margin-bottom:calc(var(--u)*1.4);width:80%}
.site p.h{height:calc(var(--u)*4);background:var(--ink);width:60%}.site p.c{background:var(--coral);width:30%;height:calc(var(--u)*2.4)}
.site .gr{display:flex;gap:calc(var(--u)*1.2);margin-top:calc(var(--u)*2)}.site .gr span{flex:1;height:calc(var(--u)*8);border-radius:calc(var(--u)*1.2);background:#e6ebfa}
.redes{display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--u)*1.6);align-content:center}
.redes span{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);border-radius:calc(var(--u)*1.6);padding:calc(var(--u)*2.2);text-align:center;font-weight:700;font-size:calc(var(--u)*2.9)}
.redes span:nth-child(odd){background:rgba(255,201,77,.16);border-color:rgba(255,201,77,.5)}
.chat{display:flex;flex-direction:column;gap:calc(var(--u)*1.6);justify-content:center}
.chat p{max-width:82%;padding:calc(var(--u)*1.8) calc(var(--u)*2.2);border-radius:calc(var(--u)*2);font-size:calc(var(--u)*2.5);line-height:1.3}
.chat .c1{background:#fff;color:#111;align-self:flex-start}.chat .c2{background:#d9fdd3;color:#111;align-self:flex-end}
.celular{display:grid;place-items:center}
.celular .tela{width:calc(var(--u)*${paisagem ? 18 : 24});height:calc(var(--u)*${paisagem ? 30 : 40});border:calc(var(--u)*.9) solid #fff;border-radius:calc(var(--u)*3.4);padding:calc(var(--u)*3);display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--u)*2);align-content:start;background:rgba(255,255,255,.06)}
.ic{border-radius:calc(var(--u)*1.6);aspect-ratio:1}.i1{background:var(--sun)}.i2{background:var(--coral)}.i3{background:var(--blue)}.i4{background:#13b58f}.i5{background:#fff}.i6{background:#7a4dff}
${h / w > 1.6 ? '.a{transform:scale(1.5)}' : ''}
.reg{position:absolute;opacity:0}
</style></head><body><div class="q">
<div class="topo"><img src="${logo}" alt=""></div>
<div class="texto"><div class="olho">${t.olho}</div><h1>${t.titulo}</h1><p class="sub">${t.sub}</p></div>
<div class="arte">${arte(t.arte)}</div>
<div class="rodape"><span class="cta">Peça a sua proposta</span><span class="site-url">wmundi.com</span></div>
</div></body></html>`
}

const nav = await chromium.launch(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {})
let total = 0
for (const [tema, t] of Object.entries(TEMAS)) {
  for (const [fmt, [w, h]] of Object.entries(FORMATOS)) {
    const pg = await nav.newPage({ viewport: { width: w, height: h } })
    await pg.setContent(html(t, w, h), { waitUntil: 'load' })
    await pg.evaluate(() => document.fonts.ready)
    await pg.screenshot({ path: join(aqui, `${tema}-${fmt}.png`) })
    await pg.close()
    total++
  }
}
await nav.close()
console.log('cards gerados:', total)
