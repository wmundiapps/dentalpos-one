// Gera os cards de redes sociais em docs/marketing/cards/<pasta>/ (Meta, Facebook, Instagram, TikTok, YouTube, Google Ads).
// Uso (numa pasta com playwright-core e @fontsource/poppins instalados):
//   node gerar-cards-redes.mjs <pasta-com-node_modules> <pasta-de-saida> [caminho-do-chrome]
// Ex.: node docs/marketing/gerar-cards-redes.mjs /tmp/deps docs/marketing/cards
// Textos e temas seguem a ficha de fatos (sem promoção, sem renda garantida; números de exemplo marcados como "simulação").
// O script avisa no console se algum texto sair da área segura do formato (stories, banner do YouTube etc.).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const S = path.resolve(process.argv[2] || '.'), OUT = path.resolve(process.argv[3] || 'cards');
const { chromium } = createRequire(`${S}/package.json`)('playwright-core');
const CHROME = process.argv[4] || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const font = (w) => `@font-face{font-family:P;font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(`${S}/node_modules/@fontsource/poppins/files/poppins-latin-${w}-normal.woff2`).toString('base64')})}`;
const css = `${[400, 600, 700, 800].map(font).join('')}
*{box-sizing:border-box;margin:0}
html,body{background:transparent}
body{font-family:P,'Noto Color Emoji',sans-serif;}
.c{position:relative;overflow:hidden;color:#fff;background:linear-gradient(145deg,#073f3e 0%,#0a5f5e 40%,#0e7c7b 75%,#17a8a5 100%);display:flex;flex-direction:column;padding:88px 84px}
.c.light{background:#f3fbfa;color:#0b3534}
.c.solid{background:#0e7c7b}
.c.deep{background:linear-gradient(160deg,#052e2d 0%,#073f3e 55%,#0a5f5e 100%)}
.blob{position:absolute;border-radius:50%;filter:blur(2px);opacity:.14;background:#fff}
.light .blob{background:#0e7c7b;opacity:.08}
.top{display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:30px;position:relative}
.logo{display:flex;align-items:center;gap:16px;font-weight:700;font-size:36px}
.mark{flex:none;width:58px;height:58px;border-radius:15px;background:#fff;color:#0e7c7b;--face:#fff;display:grid;place-items:center;line-height:1}
.light .mark,.mark.inv{background:#0e7c7b;color:#fff;--face:#0e7c7b}
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
.list{margin-top:40px;display:grid;gap:24px}
.list div{display:flex;gap:24px;align-items:center;font-size:40px;font-weight:600;line-height:1.2}
.list b{flex:none;width:64px;height:64px;border-radius:18px;background:rgba(255,255,255,.16);display:grid;place-items:center;font-size:36px}
.light .list b{background:#0e7c7b;color:#fff}
.btn{display:inline-block;margin-top:44px;background:#fff;color:#0a5f5e;font-weight:800;font-size:44px;padding:28px 48px;border-radius:22px;box-shadow:0 12px 30px rgba(0,0,0,.25)}
.light .btn{background:#0e7c7b;color:#fff;box-shadow:0 12px 30px rgba(14,124,123,.3)}
.url{margin-top:26px;font-size:36px;font-weight:600;opacity:.9}
.week{margin-top:40px;display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
.week .d{font-size:24px;font-weight:600;text-align:center;opacity:.8}
.slot{height:64px;border-radius:12px;background:rgba(255,255,255,.9)}
.slot.v{background:transparent;border:3px dashed rgba(255,255,255,.55)}
.light .slot{background:#0e7c7b}
.light .slot.v{background:transparent;border-color:#0e7c7b80}
.legend{margin-top:22px;display:flex;gap:36px;font-size:26px;opacity:.9}
.legend span{display:flex;align-items:center;gap:12px}
.legend i{width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.9)}
.legend i.v{background:transparent;border:3px dashed rgba(255,255,255,.7)}
.light .legend i{background:#0e7c7b}
.light .legend i.v{background:transparent;border-color:#0e7c7b80}
.money{margin-top:36px;background:rgba(255,255,255,.12);border-radius:28px;padding:34px 40px}
.light .money{background:#fff;box-shadow:0 10px 30px rgba(11,53,52,.08)}
.money small{font-size:30px;opacity:.85;display:block}
.money strong{font-size:96px;font-weight:800;display:block;line-height:1.1}
.money em{font-style:normal;font-size:26px;opacity:.8;display:block;line-height:1.35;margin-top:8px}
.tag{display:inline-block;font-size:24px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:#8ff0e9;color:#073f3e;padding:8px 18px;border-radius:10px}
.light .tag{background:#0e7c7b;color:#fff}
.chips{margin-top:34px;display:flex;flex-wrap:wrap;gap:16px}
.chips span{font-size:34px;font-weight:600;background:#8ff0e9;color:#073f3e;padding:14px 26px;border-radius:40px}
.light .chips span{background:#0e7c7b;color:#fff}
.steps{margin-top:48px;display:grid;gap:34px}
.step{display:flex;gap:30px;align-items:flex-start}
.step b{flex:none;width:88px;height:88px;border-radius:50%;background:#fff;color:#0a5f5e;display:grid;place-items:center;font-size:44px;font-weight:800}
.light .step b{background:#0e7c7b;color:#fff}
.step strong{display:block;font-size:40px;font-weight:700;line-height:1.2}
.step span{display:block;font-size:30px;opacity:.85;margin-top:6px;line-height:1.3}
.tiles{margin-top:44px;display:grid;gap:22px}
.tile{display:flex;gap:28px;align-items:center;background:rgba(255,255,255,.12);border-radius:26px;padding:28px 32px}
.light .tile{background:#fff;box-shadow:0 10px 30px rgba(11,53,52,.08)}
.tile .ic{flex:none;font-size:64px;line-height:1}
.tile strong{display:block;font-size:38px;font-weight:700;line-height:1.2}
.tile span{display:block;font-size:28px;opacity:.85;line-height:1.3;margin-top:4px}
.big{font-size:300px;font-weight:800;line-height:.9;letter-spacing:-.04em}
.fine{font-size:24px;opacity:.75;line-height:1.4;margin-top:24px}
.zone{border:4px dashed rgba(255,255,255,.35);border-radius:36px;display:grid;place-items:center;font-size:30px;font-weight:600;opacity:.8}
.light .zone{border-color:#0e7c7b55}
.st .list div{font-size:54px}.st .list b{width:80px;height:80px}.st .tile strong{font-size:48px}.st .tile span{font-size:34px}.st .url{font-size:42px}.st .btn{font-size:52px}.st .kicker{font-size:36px}.st .zone{font-size:36px}
.q{font-size:220px;line-height:.6;font-weight:800;color:#8ff0e9;height:120px}
`;

const ck = '<svg viewBox="0 0 24 24" width="38" height="38"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const xx = '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>';
// Símbolo SpaceHour: pino de localização com relógio (docs/marca/simbolo.svg)
// cores pelo CSS: pino = currentColor, mostrador = --face (fundo branco ou teal conforme o card)
const pinClock = `<svg viewBox="0 0 100 100" style="width:100%;height:100%;display:block"><path d="M50 86 C50 86 25 60 25 43 A25 25 0 0 1 75 43 C75 60 50 86 50 86 Z" fill="currentColor"/><circle cx="50" cy="43" r="14" style="fill:var(--face)"/><path d="M50 43 V34 M50 43 L57 47" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" fill="none"/></svg>`;
const mark = (s, cls = '') => `<div class="mark ${cls}" style="width:${s}px;height:${s}px;border-radius:${Math.round(s * .26)}px">${pinClock}</div>`;
const logo = (s = 58, cls = '') => `<div class="logo" style="font-size:${Math.round(s * .62)}px;gap:${Math.round(s * .28)}px">${mark(s, cls)}SpaceHour</div>`;
const top = (n, t) => `<div class="top">${logo()}<div class="count">${n ? `${n}/${t}` : ''}</div></div>`;
const foot = (url, swipe) => `<div class="foot"><span>${url}</span>${swipe ? '<span class="swipe">arraste →</span>' : ''}</div>`;
const blobs = (w, h) => `<div class="blob" style="width:${w * .48}px;height:${w * .48}px;right:${-w * .17}px;top:${-w * .15}px"></div><div class="blob" style="width:${w * .33}px;height:${w * .33}px;left:${-w * .13}px;bottom:${-w * .11}px"></div>`;
const list = (items, icon = ck) => `<div class="list">${items.map((t) => `<div><b>${icon}</b>${t}</div>`).join('')}</div>`;
const chips = (items) => `<div class="chips">${items.map((t) => `<span>${t}</span>`).join('')}</div>`;
const steps = (items) => `<div class="steps">${items.map(([a, b], i) => `<div class="step"><b>${i + 1}</b><div><strong>${a}</strong><span>${b}</span></div></div>`).join('')}</div>`;
const tiles = (items) => `<div class="tiles">${items.map(([ic, a, b]) => `<div class="tile"><div class="ic">${ic}</div><div><strong>${a}</strong>${b ? `<span>${b}</span>` : ''}</div></div>`).join('')}</div>`;
const btn = (t, url) => `<div><span class="btn">${t}</span></div><div class="url">${url}</div>`;
const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const pattern = [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0]];
const week = (legend = true, slotH = 64, labels = true) => `<div class="week">${labels ? days.map((d) => `<div class="d">${d}</div>`).join('') : ''}${[0, 1, 2].map((r) => pattern.map((c) => `<div class="slot${c[r] ? '' : ' v'}" style="height:${slotH}px"></div>`).join('')).join('')}</div>${legend ? '<div class="legend"><span><i></i>ocupado</span><span><i class="v"></i>vago = dinheiro parado</span></div>' : ''}`;
const SPACES = ['🦷 Odontológico', '🧠 Psicologia', '💪 Fisioterapia', '🩺 Consultório médico', '✨ Estética', '🎓 Sala de aula', '🎤 Auditório'];
const SIM = (big = '96px') => `<div class="money"><span class="tag">simulação</span><small style="margin-top:18px">R$ 60/h × 12 h por semana × 4 semanas</small><strong style="font-size:${big}">R$ 2.880<span style="font-size:.4em;font-weight:700">/mês</span></strong><em>Valor bruto de exemplo, antes da taxa de 5% e da tarifa do Mercado Pago. O resultado depende da procura e do preço que você definir.</em></div>`;

const H = 'spacehour.com.br/anuncie', PRO = 'spacehour.com.br/profissionais', GER = 'spacehour.com.br/conheca';
const card = (cls, w, h, inner, style = '') => `<div class="c ${cls}" style="${style}">${blobs(w, h)}${inner}</div>`;

// ---------- render ----------
const b = await chromium.launch({ executablePath: CHROME });
const made = [];
async function render(folder, file, w, h, html, { safe, transparent } = {}) {
  fs.mkdirSync(`${OUT}/${folder}`, { recursive: true });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.setContent(`<html><head><style>${css}.c{width:${w}px;height:${h}px}</style></head><body>${html}</body></html>`);
  await p.evaluate(() => document.fonts.ready);
  const sz = safe || { x0: 0, y0: 0, x1: w, y1: h };
  const issues = await p.evaluate((sz) => {
    const out = [];
    const root = document.querySelector('.c');
    for (const el of root.querySelectorAll('*')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.left < sz.x0 - 1 || r.top < sz.y0 - 1 || r.right > sz.x1 + 1 || r.bottom > sz.y1 + 1) out.push(`fora da área segura: "${el.textContent.trim().slice(0, 40)}" [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') out.push(`texto cortado: "${el.textContent.trim().slice(0, 40)}"`);
    }
    for (const bd of root.querySelectorAll('.body')) if (bd.scrollHeight > bd.clientHeight + 2) out.push(`conteúdo maior que o card (${bd.scrollHeight} > ${bd.clientHeight})`);
    return out;
  }, sz);
  for (const i of issues) console.warn(`AVISO ${folder}/${file}.png: ${i}`);
  await p.screenshot({ path: `${OUT}/${folder}/${file}.png`, omitBackground: !!transparent });
  await p.close();
  made.push(`${folder}/${file}.png`);
}

// ---------- Meta carrossel 1080x1080 ----------
const SQ = [1080, 1080];
const anf = [
  (n, t) => card('', ...SQ, `${top(n, t)}<div class="body"><div class="emoji">⏰</div><div class="kicker">Dono de consultório?</div><h1>Seu consultório fica <em>vazio</em> em alguns horários?</h1></div>${foot(H, true)}`),
  (n, t) => card('light', ...SQ, `${top(n, t)}<div class="body"><h1>Horário vago é <em>dinheiro parado</em>.</h1>${week()}</div>${foot(H, true)}`),
  (n, t) => card('', ...SQ, `${top(n, t)}<div class="body"><h1>Alugue por hora para profissionais <em>verificados</em>.</h1>${chips(['CRO', 'CRM', 'CRP', 'CREFITO'])}<p class="sub">Registro profissional informado e verificado no cadastro.</p></div>${foot(H, true)}`),
  (n, t) => card('light', ...SQ, `${top(n, t)}<div class="body"><h1>Você define <em>preço, horários e regras</em>.</h1>${list(['Preço por hora', 'Dias e horários livres', 'Aprovar pedidos ou reserva instantânea', 'Caução e avalista, se quiser'])}</div>${foot(H, true)}`),
  (n, t) => card('deep', ...SQ, `${top(n, t)}<div class="body"><h1>Dinheiro <em>direto</em> na sua conta Mercado Pago.</h1>${tiles([['⚡', 'Pix', 'o profissional paga online'], ['💳', 'Cartão', 'sem maquininha, sem cobrança manual']])}</div>${foot(H, true)}`),
  (n, t) => card('', ...SQ, `${top(n, t)}<div class="body"><div class="emoji">🚀</div><h1>Anuncie <em>grátis</em>.</h1><p class="sub">Sem mensalidade. Você só paga 5% quando alugar.</p>${btn('Anunciar meu espaço', H)}</div>`),
];
const pro = [
  (n, t) => card('', ...SQ, `${top(n, t)}<div class="body"><div class="kicker">Profissional autônomo?</div><h1>Atende poucas vezes por semana e paga <em>aluguel cheio</em>?</h1><p class="sub">Dá para pagar só as horas em que você atende.</p></div>${foot(PRO, true)}`),
  (n, t) => card('light', ...SQ, `${top(n, t)}<div class="body"><h1>Espaços <em>prontos</em> por hora.</h1>${chips(SPACES)}</div>${foot(PRO, true)}`),
  (n, t) => card('deep', ...SQ, `${top(n, t)}<div class="body"><div class="kicker">Para alugar por hora</div>${list(['Sem contrato', 'Sem fiador', 'Sem condomínio'], xx).replace('class="list"', 'class="list" style="gap:30px"').replaceAll('font-size:40px', '')}<h1 style="margin-top:50px;font-size:64px">Só a sala, só <em>quando você usa</em>.</h1></div>${foot(PRO, true)}`).replace(/<div><b>/g, '<div style="font-size:72px;font-weight:800"><b style="width:88px;height:88px;border-radius:24px">'),
  (n, t) => card('light', ...SQ, `${top(n, t)}<div class="body"><h1>Pague só as <em>horas</em> que usar.</h1>${tiles([['⚡', 'Pix', ''], ['💳', 'Cartão de crédito', '']])}<p class="sub" style="font-size:34px">Avulso ou toda semana no mesmo horário.</p></div>${foot(PRO, true)}`),
  (n, t) => card('', ...SQ, `${top(n, t)}<div class="body"><div class="emoji">📲</div><h1>Cadastro <em>grátis</em>.</h1><p class="sub">Escolha o espaço, reserve o horário e pague online.</p>${btn('Encontrar um espaço', PRO)}</div>`),
];
for (const [i, f] of anf.entries()) await render('meta-carrossel', `anfitrioes-0${i + 1}`, ...SQ, f(i + 1, anf.length));
for (const [i, f] of pro.entries()) await render('meta-carrossel', `profissionais-0${i + 1}`, ...SQ, f(i + 1, pro.length));

// ---------- Facebook posts 1080x1350 ----------
const PT = [1080, 1350];
const fb = [
  card('', ...PT, `${top()}<div class="body"><div class="kicker">Lançamento · Maringá-PR</div><h1 style="font-size:96px">Chegou o SpaceHour em <em>Maringá</em>.</h1><p class="sub">Consultórios e salas profissionais prontos para alugar por hora.</p>${btn('Conheça', GER)}</div>`),
  card('light', ...PT, `${top()}<div class="body"><div class="kicker">Para donos de espaço</div><h1>Anuncie <em>grátis</em>, sem mensalidade.</h1><div class="money" style="display:flex;align-items:center;gap:36px"><strong style="font-size:170px;color:#0e7c7b">5%</strong><div style="font-size:36px;font-weight:600;line-height:1.3">você só paga quando alugar<em style="font-weight:400">por reserva paga, mais a tarifa do Mercado Pago</em></div></div>${btn('Anunciar meu espaço', H)}</div>`),
  card('deep', ...PT, `${top()}<div class="body"><div class="kicker">Faça a conta</div><h1>Quanto rende um <em>horário vago</em>?</h1>${SIM()}</div>${foot(H)}`),
  card('light', ...PT, `${top()}<div class="body"><div class="kicker">Anfitrião · como funciona</div><h1>Seu espaço no ar em <em>3 passos</em>.</h1>${steps([['Crie a conta grátis', 'e conecte sua conta Mercado Pago'], ['Anuncie o espaço', 'fotos, preço por hora, horários e regras'], ['Aprove e receba', 'o pagamento cai direto na sua conta']])}</div>${foot(H)}`),
  card('', ...PT, `${top()}<div class="body"><div class="kicker">Profissional · como funciona</div><h1>Reserve uma sala em <em>3 passos</em>.</h1>${steps([['Cadastre-se grátis', 'e informe seu registro profissional'], ['Escolha espaço e horário', 'avulso ou toda semana'], ['Pague com Pix ou cartão', 'e receba o endereço na confirmação']])}</div>${foot(PRO)}`),
  card('light', ...PT, `${top()}<div class="body"><h1>Mais <em>segurança</em> para os dois lados.</h1>${tiles([['🪪', 'Registro verificado', 'CRO, CRM, CRP, CREFITO e outros'], ['🛡️', 'Caução', 'o anfitrião pode exigir na reserva'], ['⭐', 'Avaliações', 'depois de cada uso do espaço']])}</div>${foot(GER)}`),
  card('', ...PT, `${top()}<div class="body"><div class="q">“</div><h1 style="font-size:96px">Você dividiria seu consultório <em>por hora</em>?</h1>${chips(['👍 Sim', '🤔 Talvez', '👎 Não'])}<p class="sub">Conta pra gente nos comentários.</p></div>${foot(GER)}`),
  card('light', ...PT, `${top()}<div class="body"><div class="emoji">🎓</div><div class="kicker">Recém-formado?</div><h1>Comece a atender <em>sem alugar sala</em>.</h1>${list(['Sem contrato nem fiador', 'Pague só as horas que usar'])}${btn('Encontrar um espaço', PRO)}</div>`),
];
for (const [i, h] of fb.entries()) await render('facebook', `post-0${i + 1}`, ...PT, h);
await render('facebook', 'capa', 1640, 624, card('', 1640, 624, `<div class="body" style="align-items:center;text-align:center">${logo(64)}<h1 style="font-size:72px;margin-top:26px">Espaços profissionais <em>por hora</em> em Maringá</h1><p class="sub" style="font-size:32px;margin-top:16px">Consultórios e salas prontas · ${GER}</p></div>`, 'padding:40px 250px 110px'), { safe: { x0: 250, y0: 30, x1: 1390, y1: 524 } });

// ---------- Avatares (logo centralizado, funciona em círculo) ----------
const avatar = (w) => card('', w, w, `<div class="body" style="align-items:center">${mark(Math.round(w * .5)).replace('style="', 'style="box-shadow:0 ' + Math.round(w * .02) + 'px ' + Math.round(w * .05) + 'px rgba(0,0,0,.25);')}</div>`, 'padding:0');
await render('facebook', 'perfil', 720, 720, avatar(720));

// ---------- Instagram feed 1080x1350 (grade de 9: 01 = canto superior esquerdo) ----------
const ig = [
  card('deep', ...PT, `<div class="body" style="align-items:center;text-align:center">${mark(300)}<div style="font-size:110px;font-weight:800;margin-top:50px">SpaceHour</div><p class="sub" style="margin-top:14px">Chegamos a Maringá</p></div>`),
  card('deep', ...PT, `${top()}<div class="body"><h1 style="font-size:104px">Espaços prontos, <em>por hora</em>.</h1>${chips(['Consultórios', 'Salas', 'Auditórios'])}</div>${foot(GER)}`),
  card('deep', ...PT, `${top()}<div class="body"><div class="emoji">🔑</div><div class="kicker">Tem espaço ocioso?</div><h1 style="font-size:104px">Anuncie <em>grátis</em>.</h1><p class="sub">Sem mensalidade. Só 5% quando alugar.</p></div>${foot(H)}`),
  card('light', ...PT, `${top()}<div class="body"><div class="kicker">Dono de consultório?</div><h1>Seu consultório fica <em>vazio</em> em alguns horários?</h1>${week()}</div>${foot(H)}`),
  card('light', ...PT, `${top()}<div class="body"><h1>Quanto rende um <em>horário vago</em>?</h1>${SIM('104px')}</div>${foot(H)}`),
  card('light', ...PT, `${top()}<div class="body"><h1>Anuncie em <em>3 passos</em>.</h1>${steps([['Crie a conta grátis', 'e conecte o Mercado Pago'], ['Publique o espaço', 'fotos, preço, horários e regras'], ['Aprove e receba', 'direto na sua conta']])}</div>${foot(H)}`),
  card('', ...PT, `${top()}<div class="body"><div class="kicker">Profissional autônomo?</div><h1>Atende poucas vezes por semana e paga <em>aluguel cheio</em>?</h1><p class="sub">Alugue por hora, só quando atender.</p></div>${foot(PRO)}`),
  card('', ...PT, `${top()}<div class="body"><h1>Que espaço você <em>precisa</em>?</h1>${chips(SPACES)}</div>${foot(PRO)}`),
  card('', ...PT, `${top()}<div class="body"><div class="emoji">👆</div><h1 style="font-size:104px">Link na <em>bio</em>.</h1><p class="sub">Cadastro grátis para anfitriões e profissionais.</p>${btn('Conheça o SpaceHour', GER)}</div>`),
];
for (const [i, h] of ig.entries()) await render('instagram', `feed-0${i + 1}`, ...PT, h);

// ---------- Stories / capas verticais 1080x1920 (texto fora dos 250px de cima e 350px de baixo) ----------
const ST = [1080, 1920];
const stSafe = { safe: { x0: 60, y0: 250, x1: 1020, y1: 1570 } };
const stPad = 'padding:270px 84px 370px';
const st = [
  card('st', ...ST, `${top()}<div class="body"><div class="kicker">Enquete</div><h1 style="font-size:104px">Seu consultório fica <em>vazio</em> quando?</h1><div class="zone" style="height:420px;margin-top:60px">coloque a figurinha de enquete aqui</div></div>`, stPad),
  card('light st', ...ST, `${top()}<div class="body"><div class="emoji" style="font-size:150px">🔑</div><h1 style="font-size:110px">Anuncie <em>grátis</em>, sem mensalidade.</h1><p class="sub" style="font-size:42px">Você só paga 5% quando alugar (mais a tarifa do Mercado Pago).</p>${btn('Anunciar meu espaço', H)}</div>`, stPad),
  card('st', ...ST, `${top()}<div class="body"><div class="kicker">Dono de consultório?</div><h1 style="font-size:100px">Transforme horário vago em <em>reserva</em>.</h1>${week(false, 70)}<div class="zone" style="height:200px;margin-top:50px">toque no link ↓</div><div class="url" style="text-align:center">${H}</div></div>`, stPad),
  card('light st', ...ST, `${top()}<div class="body"><div class="kicker">Profissional autônomo?</div><h1 style="font-size:100px">Sala pronta, <em>por hora</em>.</h1>${list(['Sem contrato', 'Sem fiador', 'Pix ou cartão'])}<div class="zone" style="height:200px;margin-top:60px">toque no link ↓</div><div class="url" style="text-align:center">${PRO}</div></div>`, stPad),
  card('deep st', ...ST, `${top()}<div class="body"><div class="kicker">Bastidores</div><h1 style="font-size:100px">Conheça o <em>SpaceHour</em>.</h1><div class="tile" style="margin-top:50px;display:block;padding:0;overflow:hidden;color:#0b3534;background:#fff"><div style="height:240px;background:linear-gradient(135deg,#8ff0e9,#17a8a5);display:grid;place-items:center;font-size:130px">🦷</div><div style="padding:30px 36px"><strong>Consultório odontológico</strong><span>Maringá-PR · por hora · Pix ou cartão</span><span style="margin-top:14px;font-size:24px;font-weight:700;color:#0e7c7b;text-transform:uppercase;letter-spacing:.06em">exemplo ilustrativo</span></div></div>${btn('Conheça', GER)}</div>`, stPad),
  card('light st', ...ST, `${top()}<div class="body"><div class="emoji" style="font-size:150px">💬</div><h1 style="font-size:110px">Tire sua <em>dúvida</em>.</h1><p class="sub" style="font-size:42px">Sobre anunciar seu espaço ou alugar por hora.</p><div class="zone" style="height:380px;margin-top:50px">caixa de perguntas aqui</div></div>`, stPad),
];
for (const [i, h] of st.entries()) await render('instagram', `story-0${i + 1}`, ...ST, h, stSafe);

// Capas de destaques: ícone simples + 1 palavra sobre teal sólido (centro, para o recorte em círculo)
const ico = {
  key: '<svg viewBox="0 0 24 24" width="300" height="300" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2"/></svg>',
  user: '<svg viewBox="0 0 24 24" width="300" height="300" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
  steps: '<svg viewBox="0 0 24 24" width="300" height="300" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="19" cy="12" r="2.5"/><path d="M7.5 12h2M14.5 12h2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="300" height="300" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>',
  ask: '<svg viewBox="0 0 24 24" width="300" height="300" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M10 9a2 2 0 1 1 2.5 1.9c-.4.2-.5.5-.5.9V12M12 14h.01"/></svg>',
};
const hl = [['anfitriao', 'key', 'Anfitrião'], ['profissional', 'user', 'Profissional'], ['como-funciona', 'steps', 'Passos'], ['anuncie', 'plus', 'Anuncie'], ['duvidas', 'ask', 'Dúvidas']];
for (const [f, i, word] of hl) await render('instagram', `destaque-${f}`, ...ST, `<div class="c solid" style="padding:0;align-items:center;justify-content:center;text-align:center">${ico[i]}<div style="font-size:84px;font-weight:700;margin-top:30px">${word}</div></div>`, { safe: { x0: 140, y0: 500, x1: 940, y1: 1420 } });
await render('instagram', 'perfil', 1080, 1080, avatar(1080));

// ---------- Capas de vídeos curtos (TikTok / Shorts): texto longe do topo, da base e dos botões à direita ----------
const vPad = 'padding:270px 170px 370px 84px';
const vSafe = { safe: { x0: 60, y0: 250, x1: 940, y1: 1570 } };
const vid = [
  (cls) => card(cls + ' st', ...ST, `${top()}<div class="body"><div class="big" style="font-size:260px">R$ ?</div><h1 style="font-size:116px;margin-top:40px">Quanto custa um consultório <em>vazio</em>?</h1></div>`, vPad),
  (cls) => card(cls + ' st', ...ST, `${top()}<div class="body"><div class="emoji" style="font-size:200px">⏱️</div><h1 style="font-size:120px">Aluguei um consultório por <em>1 hora</em></h1></div>`, vPad),
  (cls) => card(cls + ' st', ...ST, `${top()}<div class="body"><div class="big" style="font-size:380px">3</div><h1 style="font-size:116px;margin-top:20px">erros de quem aluga <em>sala inteira</em></h1></div>`, vPad),
  (cls) => card(cls + ' st', ...ST, `${top()}<div class="body"><div class="emoji" style="font-size:200px">🎓</div><div class="kicker" style="font-size:40px">Recém-formado:</div><h1 style="font-size:100px">como começar <em>sem gastar com sala</em></h1></div>`, vPad),
  (cls) => card(cls + ' st', ...ST, `${top()}<div class="body"><div class="big" style="font-size:300px">30s</div><h1 style="font-size:110px;margin-top:30px">Como funciona o <em>SpaceHour</em></h1></div>`, vPad),
  (cls) => card(cls + ' st', ...ST, `${top()}<div class="body"><h1 style="font-size:120px">Seu horário vago vira <em>renda</em></h1>${week(false, 60)}${btn('Anuncie grátis', H)}</div>`, vPad),
];
const tkTheme = ['', 'light', 'deep', 'light', '', 'deep'];
for (const [i, f] of vid.entries()) await render('tiktok', `capa-0${i + 1}`, ...ST, f(tkTheme[i]), vSafe);
await render('tiktok', 'perfil', 1080, 1080, avatar(1080));
const shTheme = ['light', 'deep', 'light', ''];
for (let i = 0; i < 4; i++) await render('youtube', `shorts-capa-0${i + 1}`, ...ST, vid[i](shTheme[i]), vSafe);

// ---------- YouTube ----------
await render('youtube', 'banner', 2560, 1440, card('', 2560, 1440, `<div class="body" style="align-items:center;text-align:center">${logo(84)}<h1 style="font-size:96px;margin-top:30px">Espaços profissionais <em>por hora</em></h1><p class="sub" style="font-size:40px;margin-top:20px">Consultórios e salas prontas em Maringá · ${GER}</p></div>`, 'padding:528px 527px 529px'), { safe: { x0: 507, y0: 508, x1: 2053, y1: 931 } });
const TH = [1280, 720];
const thumb = (cls, title, visual, kick = '') => card(cls, ...TH, `<div style="display:flex;height:100%;align-items:center;gap:40px;position:relative"><div style="flex:1">${logo(52)}${kick ? `<div class="kicker" style="margin:34px 0 0;font-size:32px">${kick}</div>` : ''}<h1 style="font-size:80px;margin-top:${kick ? 10 : 34}px">${title}</h1></div><div style="flex:none;width:380px;display:grid;place-items:center">${visual}</div></div>`, 'padding:56px 64px 90px');
const circ = (inner, cls = '') => `<div style="width:340px;height:340px;border-radius:50%;background:${cls ? '#0e7c7b' : 'rgba(255,255,255,.14)'};display:grid;place-items:center;font-size:190px;line-height:1;${cls ? 'color:#fff;' : ''}font-weight:800">${inner}</div>`;
const yt = [
  thumb('', 'Como alugar seu consultório <em>por hora</em>', `<div class="steps" style="margin:0;gap:22px">${[1, 2, 3].map((n) => `<div class="step"><b style="width:96px;height:96px;font-size:50px">${n}</b></div>`).join('')}</div>`, 'Passo a passo'),
  thumb('light', 'Consultório compartilhado <em>vale a pena?</em>', circ('?', 1)),
  thumb('deep', 'Quanto rende alugar <em>horários vagos</em>', `<div style="width:360px">${week(false, 54).replace('class="week"', 'class="week" style="margin:0;gap:10px"')}</div>`),
  thumb('light', 'Recém-formado: atenda <em>sem alugar sala</em>', circ('🎓', 1)),
  thumb('', 'Tour pelo <em>SpaceHour</em>', mark(300)),
  thumb('deep', 'Dúvidas de anfitriões <em>respondidas</em>', circ('💬')),
];
for (const [i, h] of yt.entries()) await render('youtube', `thumb-0${i + 1}`, ...TH, h, { safe: { x0: 0, y0: 0, x1: 1280, y1: 650 } });
await render('youtube', 'perfil', 800, 800, avatar(800));
await render('youtube', 'marca-dagua', 150, 150, `<div class="c" style="background:transparent;padding:0;align-items:center;justify-content:center">${mark(150)}</div>`, { transparent: true });

// ---------- Google Ads (pouco texto, nada miúdo) ----------
const L = [1200, 628], Q = [1200, 1200];
const tileGrid = (s) => `<div style="display:grid;grid-template-columns:repeat(3,${s}px);gap:${s * .16}px">${['🦷', '🧠', '💪', '🩺', '🎓', '🎤'].map((e) => `<div style="width:${s}px;height:${s}px;border-radius:${s * .24}px;background:rgba(255,255,255,.16);display:grid;place-items:center;font-size:${s * .52}px">${e}</div>`).join('')}</div>`;
const pin = (s) => `<div style="position:relative;width:${s}px;height:${s}px;display:grid;place-items:center"><div style="position:absolute;inset:0;border-radius:50%;background:rgba(255,255,255,.12)"></div><div style="position:absolute;inset:${s * .17}px;border-radius:50%;background:rgba(255,255,255,.14)"></div>${mark(s * .38)}</div>`;
const gVis = (sq) => [`<div style="width:100%">${week(false, sq ? 110 : 76, false).replace('class="week"', `class="week" style="margin:0;gap:${sq ? 20 : 14}px"`)}</div>`, tileGrid(sq ? 230 : 118), pin(sq ? 600 : 400)];
const gTxt = ['Seu consultório vago vira <em>renda</em>', 'Consultório pronto <em>por hora</em>', 'Espaços profissionais por hora em <em>Maringá</em>'];
const gCls = ['', 'deep', ''];
for (let i = 0; i < 3; i++) {
  await render('google-ads', `paisagem-0${i + 1}`, ...L, card(gCls[i], ...L, `<div style="display:flex;height:100%;align-items:center;gap:56px;position:relative"><div style="flex:1;display:grid;place-items:center">${gVis(false)[i]}</div><div style="flex:none;width:470px">${logo(50)}<h1 style="font-size:56px;margin-top:26px;text-wrap:balance">${gTxt[i]}</h1></div></div>`, 'padding:56px 64px'));
  await render('google-ads', `quadrado-0${i + 1}`, ...Q, card(gCls[i], ...Q, `<div class="top">${logo(64)}</div><div class="body" style="align-items:center;justify-content:center"><div style="width:100%;display:grid;place-items:center">${gVis(true)[i]}</div></div><h1 style="font-size:76px;position:relative;text-align:center;text-wrap:balance">${gTxt[i]}</h1>`, 'padding:80px 90px 96px'));
}
await render('google-ads', 'logo-quadrado', 1200, 1200, `<div class="c light" style="background:#fff;padding:0;align-items:center;justify-content:center">${mark(720, 'inv')}</div>`);
await render('google-ads', 'logo-paisagem', 1200, 300, `<div class="c light" style="background:#fff;padding:0;align-items:center;justify-content:center"><div class="logo" style="font-size:120px;gap:44px;color:#0b3534">${mark(170, 'inv')}SpaceHour</div></div>`);

await b.close();
console.log(`${made.length} cards gerados em ${OUT}`);
