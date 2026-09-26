// Gera os cards de docs/marketing/cards. Uso (numa pasta com playwright-core e @fontsource/poppins instalados):
//   node gerar-cards.mjs <pasta-com-node_modules> <pasta-de-saida>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const S = process.argv[2], OUT = process.argv[3];
const font = (w) => `@font-face{font-family:P;font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(`${S}/node_modules/@fontsource/poppins/files/poppins-latin-${w}-normal.woff2`).toString('base64')})}`;
const css = `${[400,600,700,800].map(font).join('')}
*{box-sizing:border-box;margin:0}
body{font-family:P,'Noto Color Emoji',sans-serif;}
.c{position:relative;overflow:hidden;color:#fff;background:linear-gradient(145deg,#073f3e 0%,#0a5f5e 40%,#0e7c7b 75%,#17a8a5 100%);display:flex;flex-direction:column;padding:88px 84px}
.c.light{background:#f3fbfa;color:#0b3534}
.blob{position:absolute;border-radius:50%;filter:blur(2px);opacity:.14;background:#fff}
.light .blob{background:#0e7c7b;opacity:.08}
.top{display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:30px;position:relative}
.logo{display:flex;align-items:center;gap:16px;font-weight:700;font-size:36px}
.mark{width:58px;height:58px;border-radius:15px;background:#fff;color:#0a5f5e;display:grid;place-items:center;font-weight:800;font-size:36px}
.light .mark{background:#0e7c7b;color:#fff}
.count{opacity:.75}
.body{flex:1;display:flex;flex-direction:column;justify-content:center;position:relative}
.kicker{font-size:30px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;opacity:.8;margin-bottom:22px}
h1{font-size:84px;line-height:1.06;font-weight:800;letter-spacing:-.01em}
h1 em{font-style:normal;color:#8ff0e9}
.light h1 em{color:#0e7c7b}
p.sub{font-size:38px;line-height:1.35;margin-top:30px;opacity:.92;font-weight:400}
.foot{display:flex;justify-content:space-between;align-items:center;font-size:30px;font-weight:600;position:relative}
.swipe{background:rgba(255,255,255,.16);padding:14px 28px;border-radius:40px}
.light .swipe{background:#0e7c7b1a}
.emoji{font-size:120px;line-height:1;margin-bottom:34px}
.list{margin-top:34px;display:grid;gap:22px}
.list div{display:flex;gap:22px;align-items:center;font-size:40px;font-weight:600}
.list b{flex:none;width:64px;height:64px;border-radius:18px;background:rgba(255,255,255,.16);display:grid;place-items:center;font-size:36px}
.light .list b{background:#0e7c7b1f}
.btn{display:inline-block;margin-top:44px;background:#fff;color:#0a5f5e;font-weight:800;font-size:44px;padding:28px 48px;border-radius:22px;box-shadow:0 12px 30px rgba(0,0,0,.25)}
.url{margin-top:26px;font-size:36px;font-weight:600;opacity:.9}
.week{margin-top:40px;display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
.week .d{font-size:24px;font-weight:600;text-align:center;opacity:.8}
.slot{height:64px;border-radius:12px;background:rgba(255,255,255,.9)}
.slot.v{background:transparent;border:3px dashed rgba(255,255,255,.55)}
.legend{margin-top:22px;display:flex;gap:36px;font-size:26px;opacity:.9}
.legend span{display:flex;align-items:center;gap:12px}
.legend i{width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.9)}
.legend i.v{background:transparent;border:3px dashed rgba(255,255,255,.7)}
.money{margin-top:36px;background:rgba(255,255,255,.12);border-radius:28px;padding:34px 40px}
.money small{font-size:28px;opacity:.85;display:block}
.money strong{font-size:88px;font-weight:800;display:block;line-height:1.1}
.money em{font-style:normal;font-size:24px;opacity:.75}
.chips{margin-top:34px;display:flex;flex-wrap:wrap;gap:16px}
.chips span{font-size:34px;font-weight:600;background:#fff;color:#0a5f5e;padding:14px 26px;border-radius:40px}
.light .chips span{background:#0e7c7b;color:#fff}
`;
const top = (n, t) => `<div class="top"><div class="logo"><div class="mark">S</div>SpaceHour</div><div class="count">${n ? `${n}/${t}` : ''}</div></div>`;
const foot = (last, url) => `<div class="foot"><span>${url}</span>${last ? '' : '<span class="swipe">arraste →</span>'}</div>`;
const blobs = `<div class="blob" style="width:520px;height:520px;right:-180px;top:-160px"></div><div class="blob" style="width:360px;height:360px;left:-140px;bottom:-120px"></div>`;
const days = ['Seg','Ter','Qua','Qui','Sex','Sáb'];
const pattern = [[1,0,1],[0,0,1],[1,0,0],[0,1,0],[1,0,0],[0,0,0]];
const week = `<div class="week">${days.map((d) => `<div class="d">${d}</div>`).join('')}${[0,1,2].map((r) => pattern.map((c) => `<div class="slot${c[r] ? '' : ' v'}"></div>`).join('')).join('')}</div>
<div class="legend"><span><i></i>ocupado</span><span><i class="v"></i>vago = dinheiro parado</span></div>`;

const H = 'space-hour.com/anuncie', PRO = 'space-hour.com/profissionais';
const host = [
  (n,t)=>`<div class="c">${blobs}${top(n,t)}<div class="body"><div class="kicker">Dono de consultório?</div><h1>Quantos horários da sua sala ficam <em>vazios</em> toda semana?</h1>${week}</div>${foot(false,H)}</div>`,
  (n,t)=>`<div class="c">${blobs}${top(n,t)}<div class="body"><div class="emoji">🦷🩺🧠</div><h1>Alugue esses horários <em>por hora</em>.</h1><p class="sub">Para dentistas, médicos, psicólogos, fisioterapeutas e outros profissionais com registro verificado.</p></div>${foot(false,H)}</div>`,
  (n,t)=>`<div class="c light">${blobs}${top(n,t)}<div class="body"><h1>Você decide <em>tudo</em>.</h1><div class="list"><div><b>🗓️</b>Dias e horários livres</div><div><b>💲</b>Preço por hora e limpeza</div><div><b>✅</b>Aprovar cada pedido ou aceitar na hora</div><div><b>🛡️</b>Caução, avalista e regras da sala</div></div></div>${foot(false,H)}</div>`,
  (n,t)=>`<div class="c">${blobs}${top(n,t)}<div class="body"><h1>O dinheiro cai <em>direto</em> na sua conta.</h1><p class="sub">Pix ou cartão pelo Mercado Pago. Sem mensalidade: só 3% por reserva.</p><div class="money"><small>Exemplo: 12 h/semana × R$ 60/h</small><strong>R$ 2.793,60</strong><em>em 4 semanas, já descontada a taxa · simulação ilustrativa</em></div></div>${foot(false,H)}</div>`,
  (n,t)=>`<div class="c">${blobs}${top(n,t)}<div class="body"><div class="emoji">🚀</div><h1>Anuncie seu espaço <em>grátis</em>.</h1><p class="sub">Crie a conta, coloque fotos, horários e preço, e comece a receber reservas.</p><div><span class="btn">Anunciar meu espaço</span></div><div class="url">${H}</div></div>${foot(true,'')}</div>`,
];
const pro = [
  (n,t)=>`<div class="c">${blobs}${top(n,t)}<div class="body"><div class="kicker">Profissional autônomo?</div><h1>Precisa de um consultório só <em>algumas horas</em> por semana?</h1><p class="sub">Pagar aluguel cheio por uma sala que você usa pouco não faz sentido.</p></div>${foot(false,PRO)}</div>`,
  (n,t)=>`<div class="c light">${blobs}${top(n,t)}<div class="body"><h1>Pague só pelas <em>horas</em> que usar.</h1><div class="list"><div><b>📄</b>Sem contrato de aluguel</div><div><b>🏢</b>Sem condomínio nem IPTU</div><div><b>🤝</b>Sem fiador</div><div><b>🔁</b>Avulso ou toda semana no mesmo horário</div></div></div>${foot(false,PRO)}</div>`,
  (n,t)=>`<div class="c">${blobs}${top(n,t)}<div class="body"><h1>Espaços <em>prontos</em> para atender.</h1><div class="chips"><span>🦷 Odontológico</span><span>🩺 Consultório médico</span><span>🧠 Psicologia</span><span>💪 Fisioterapia</span><span>⚖️ Advocacia</span><span>🎓 Sala de aula</span><span>🎤 Auditório</span></div></div>${foot(false,PRO)}</div>`,
  (n,t)=>`<div class="c">${blobs}${top(n,t)}<div class="body"><div class="emoji">📲</div><h1>Reserve online com <em>Pix</em> ou cartão.</h1><p class="sub">Cadastro grátis. O endereço é liberado quando a reserva é confirmada.</p><div><span class="btn">Encontrar um espaço</span></div><div class="url">${PRO}</div></div>${foot(true,'')}</div>`,
];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function render(html, w, h, file) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<html><head><style>${css}.c{width:${w}px;height:${h}px}</style></head><body>${html}</body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${OUT}/${file}.png` });
  await p.close();
}
for (const [i, f] of host.entries()) await render(f(i + 1, host.length), 1080, 1080, `anfitrioes-${i + 1}`);
for (const [i, f] of pro.entries()) await render(f(i + 1, pro.length), 1080, 1080, `profissionais-${i + 1}`);
// Stories/Reels (1080x1920)
const storyCss = '<style>.c{padding:180px 84px 240px} h1{font-size:96px}</style>';
await render(storyCss + host[0](0,0).replace(foot(false,H), `<div class="foot"><span></span></div>`).replace('</div></div><div class="foot">', `</div><div><span class="btn">Anuncie grátis</span></div><div class="url">${H}</div></div><div class="foot">`), 1080, 1920, 'story-anfitrioes');
await render(storyCss + pro[1](0,0).replace(foot(false,PRO), `<div class="foot"><span></span></div>`).replace('</div></div><div class="foot">', `</div><div><span class="btn">Encontrar um espaço</span></div><div class="url">${PRO}</div></div><div class="foot">`), 1080, 1920, 'story-profissionais');
// Imagem de compartilhamento (Open Graph) 1200x630
await render(`<div class="c" style="padding:64px 72px">${blobs}${top(0,0)}<div class="body"><h1 style="font-size:72px">Espaços profissionais <em>por hora</em>.</h1><p class="sub" style="font-size:34px;margin-top:20px">Consultórios, clínicas e salas prontas nos horários ociosos.</p></div></div>`, 1200, 630, 'og-image');
await b.close();
