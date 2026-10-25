// Gera todos os cards de docs/marketing/cards (PNG). Reproduzível.
//   VENDEU_FONTS=/pasta/com/node_modules-pai node gerar-cards.cjs
// (a pasta precisa ter node_modules com @fontsource/poppins e qrcode; playwright vem do ambiente)
const path = require('node:path');
const { C, SHOW_URL, logo, symbol, qr, render, close } = require('./lib.cjs');
const OUT = path.join(__dirname, 'cards');
const out = (...p) => path.join(OUT, ...p);

const blobs = '<div class="blob" style="width:560px;height:560px;right:-200px;top:-180px"></div><div class="blob" style="width:380px;height:380px;left:-150px;bottom:-130px"></div>';
const top = (n, t, dark = true) => `<div class="top">${logo(58, dark)}<div class="count">${n ? `${n}/${t}` : ''}</div></div>`;
const foot = (last, label = SHOW_URL) => `<div class="foot"><span>${label}</span>${last ? '' : '<span class="swipe">arraste →</span>'}</div>`;
const card = (cls, n, t, body, last = false, dark = true) => `<div class="c ${cls}">${blobs}${top(n, t, dark)}<div class="body">${body}</div>${foot(last)}</div>`;
const LEGAL = 'O Vendeu é uma plataforma de anúncios: o pagamento da compra é combinado entre comprador e vendedor.';

const FEES = [
  ['Até R$ 150', 'R$ 15'], ['R$ 150,01 a R$ 500', 'R$ 20'], ['R$ 500,01 a R$ 1.000', 'R$ 30'],
  ['R$ 1.000,01 a R$ 1.500', 'R$ 50'], ['R$ 1.500,01 a R$ 2.000', 'R$ 80'], ['R$ 2.000,01 a R$ 3.000', 'R$ 100'],
  ['Acima de R$ 3.000', 'R$ 100 + R$ 50 por R$ 1.000'],
];

(async () => {
  const qrImg = await qr(300);
  const cta = (txt) => `<div style="display:flex;align-items:center;gap:44px;margin-top:44px"><div class="qrbox"><img src="${qrImg}" width="230" height="230"></div><div><span class="btn" style="font-size:40px;padding:24px 40px">${txt}</span><div class="url">${SHOW_URL}</div></div></div>`;

  // (a) Carrossel principal 1080x1350
  const A = [
    (n, t) => card('', n, t, `<div class="kicker">Compra · Venda · Locação</div><h1>Anunciar é <em>grátis</em>.<br>Você só paga quando <em>vende</em>.</h1><p class="sub">Sem mensalidade e sem pagar para publicar. Não vendeu? Retire o anúncio de graça.</p>`),
    (n, t) => card('light', n, t, `<div class="kicker">Como funciona</div><h2>3 passos, <em>sem complicação</em></h2><div class="steps" style="color:#102A43"><div class="step"><div class="n">1</div><div><b>Anuncie de graça</b><span>Fotos, descrição, preço e categoria.</span></div></div><div class="step"><div class="n">2</div><div><b>Converse pelo app</b><span>Seu contato não aparece no anúncio.</span></div></div><div class="step"><div class="n">3</div><div><b>Vendeu? Retire e pague</b><span>A taxa só vem depois, por Pix ou cartão, em até 7 dias.</span></div></div></div>`, false, false),
    (n, t) => card('', n, t, `<div class="kicker">Taxa de sucesso</div><h2>Quanto você paga <em>ao vender</em></h2><table class="fees">${FEES.map((r) => `<tr><td>${r[0]}</td><td${r[1].length > 8 ? ' style="font-size:30px;white-space:normal;line-height:1.2"' : ''}>${r[1]}</td></tr>`).join('')}</table><div class="note">Sobre o valor fechado. Não vendeu? R$ 0.</div>`),
    (n, t) => card('yellow', n, t, `<div class="kicker">Vitrines separadas</div><h2><em>Novos</em> e <em>Usados</em> nunca se misturam</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:48px"><div class="card" style="text-align:center"><div style="font-size:90px">✨</div><div style="font-size:54px;font-weight:800;color:#0B7A4B">NOVOS</div><div style="font-size:30px;margin-top:8px">Produtos novos, em uma aba só deles</div></div><div class="card" style="text-align:center"><div style="font-size:90px">♻️</div><div style="font-size:54px;font-weight:800;color:#0B7A4B">USADOS</div><div style="font-size:30px;margin-top:8px">Segunda mão, em outra aba só deles</div></div></div><p class="sub" style="font-size:36px">Cada busca mostra um lado por vez: você sabe o que está vendo.</p>`, false, false),
    (n, t) => card('light', n, t, `<div class="kicker">Categorias</div><h2>Achou o seu <em>jeito de vender</em></h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:40px">${[['🛋️', 'Móveis'], ['🏠', 'Imóveis'], ['🧸', 'Brinquedos'], ['🚗', 'Automóveis'], ['🍳', 'Utilidades para o lar'], ['📦', 'Outros']].map(([e, l]) => `<div class="card" style="display:flex;align-items:center;gap:20px;padding:28px 28px"><span style="font-size:62px">${e}</span><b style="font-size:34px;line-height:1.15">${l}</b></div>`).join('')}</div><div class="note" style="opacity:1;font-size:28px">Em “Outros”, quando um produto aparece muito, criamos um grupo só dele automaticamente.</div>`, false, false),
    (n, t) => card('', n, t, `<div class="kicker">Anunciantes verificados</div><h2>Quem anuncia <em>é verificado</em></h2><div class="list"><div><b>🪪</b>Documento com foto</div><div><b>🤳</b>Selfie com o documento</div><div><b>🏡</b>Comprovante de endereço</div><div><b>✍️</b>Declaração de origem lícita assinada em cada anúncio</div></div><div class="note">${LEGAL}</div>`),
    (n, t) => card('ink', n, t, `<div class="kicker">Anti-golpe</div><h2>Mais segurança <em>na conversa</em></h2><div class="list"><div><b>💬</b>Conversa dentro do app: telefone e e-mail não aparecem no anúncio</div><div><b>🚨</b>Alertas automáticos em mensagens suspeitas</div><div><b>📍</b>Fotos sem localização (GPS)</div><div><b>🚩</b>Botão de denúncia em cada anúncio</div></div>`),
    (n, t) => card('', n, t, `<h1>Tem algo parado em casa? <em>Anuncie hoje.</em></h1><p class="sub">Grátis para anunciar. Você só paga se vender.</p>${cta('Anunciar grátis')}`, true),
  ];
  for (const [i, f] of A.entries()) await render(f(i + 1, A.length), 1080, 1350, out('carrossel-anunciar-gratis', `${i + 1}.png`));

  // (b) Carrossel "Quanto custa vender?"
  const ex = (preco, taxa, fica, item, faixa) => (n, t) => card('', n, t, `<div class="kicker">Exemplo ${n - 1}</div><h2>${item}</h2><div class="card" style="margin-top:44px"><div style="font-size:32px;font-weight:600;opacity:.7">Você vende por</div><div style="font-size:104px;font-weight:800;line-height:1.1">${preco}</div><div style="height:4px;background:#E3EBE7;margin:26px 0"></div><div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px"><div style="font-size:34px;font-weight:600">Taxa de sucesso</div><div style="font-size:70px;font-weight:800;color:#0B7A4B">${taxa}</div></div><div style="font-size:28px;opacity:.7;margin-top:6px">Faixa: ${faixa}</div><div style="font-size:30px;margin-top:22px;font-weight:600">Sobra para você: <b style="color:#0B7A4B">${fica}</b></div></div><div class="note">Simulação sobre o valor fechado. ${LEGAL}</div>`);
  const B = [
    (n, t) => card('', n, t, `<div class="kicker">Taxa de sucesso</div><h1>Quanto custa <em>vender</em>?</h1><p class="sub">Anunciar é grátis. Veja 3 exemplos reais da tabela e descubra quanto você paga.</p>`),
    ex('R$ 120', 'R$ 15', 'R$ 105', 'Um brinquedo usado', 'até R$ 150'),
    ex('R$ 800', 'R$ 30', 'R$ 770', 'Uma mesa de jantar', 'R$ 500,01 a R$ 1.000'),
    ex('R$ 3.500', 'R$ 150', 'R$ 3.350', 'Uma moto usada', 'acima de R$ 3.000: R$ 100 + R$ 50 pelo bloco de R$ 1.000'),
    (n, t) => card('yellow', n, t, `<h1>Não vendeu? <em>Retire de graça.</em></h1><p class="sub">Anuncie sem custo e só pague quando fechar negócio.</p>${cta('Anunciar grátis')}`, true, false),
  ];
  for (const [i, f] of B.entries()) await render(f(i + 1, B.length), 1080, 1350, out('carrossel-quanto-custa', `${i + 1}.png`));

  // (c) 5 dicas anti-golpe
  const tip = (num, icon, title, txt) => (n, t) => card('light', n, t, `<div class="kicker">Dica ${num} de 5</div><div style="font-size:130px;line-height:1">${icon}</div><h2 style="margin-top:24px">${title}</h2><p class="sub" style="font-size:40px">${txt}</p>`, n === t, false);
  const Cc = [
    (n, t) => card('ink', n, t, `<div class="kicker">Segurança</div><h1>5 dicas <em>anti-golpe</em> para comprar e vender</h1><p class="sub">Salve para não esquecer na hora do negócio.</p>`),
    tip(1, '👀', 'Veja <em>antes</em> de pagar', 'Não faça Pix de sinal, reserva ou frete para quem você não conhece.'),
    tip(2, '🏦', 'Confirme o Pix <em>no app do banco</em>', 'Print e comprovante podem ser falsos. Só entregue depois que o dinheiro estiver na sua conta.'),
    tip(3, '🔐', 'Nunca passe <em>códigos</em>', 'Código de SMS ou WhatsApp dá acesso à sua conta. O Vendeu nunca pede senha nem código.'),
    tip(4, '💬', 'Converse <em>pelo app</em>', 'Os alertas automáticos só funcionam dentro do Vendeu. Desconfie de preço bom demais.'),
    tip(5, '📍', 'Encontre em <em>local público</em>', 'De dia, num lugar movimentado, de preferência acompanhado. Algo estranho? Denuncie o anúncio.'),
  ];
  for (const [i, f] of Cc.entries()) await render(f(i + 1, Cc.length), 1080, 1350, out('carrossel-5-dicas-anti-golpe', `${i + 1}.png`));

  // (d) Posts por categoria 1080x1080
  const cat = (slug, e, nome, frase, extra) => ({ slug, html: `<div class="c light">${blobs}${top(0, 0, false)}<div class="body"><div style="font-size:150px;line-height:1">${e}</div><div class="kicker" style="margin-top:20px">${nome === 'Outros' ? 'Categoria' : 'Categoria'}</div><h1 style="font-size:84px;color:#102A43">${nome}</h1><p class="sub" style="font-size:40px;margin-top:20px">${frase}</p><div style="margin-top:30px"><span class="chip">${extra}</span></div></div><div class="foot"><span>${SHOW_URL}</span><span class="swipe">Anuncie grátis</span></div></div>` });
  const cats = [
    cat('moveis', '🛋️', 'Móveis', 'Aquele sofá ou guarda-roupa que não cabe mais? Anuncie de graça, só paga se vender.', 'Novos e Usados em abas separadas'),
    cat('imoveis', '🏠', 'Imóveis', 'Venda ou anuncie para alugar. Anunciar é grátis; a taxa vem só depois do negócio.', 'Compra · Venda · Locação'),
    cat('brinquedos', '🧸', 'Brinquedos', 'O brinquedo que ficou pequeno pode alegrar outra criança. Anuncie grátis.', 'Novos e Usados em abas separadas'),
    cat('automoveis', '🚗', 'Automóveis', 'Anuncie seu carro ou moto. Anunciar é grátis e a taxa só vale se você vender.', 'Declaração de origem em cada anúncio'),
    cat('utilidades-lar', '🍳', 'Utilidades para o lar', 'Itens para a casa que estão parados no armário? Hora de dar nova vida a eles.', 'Anunciar é grátis'),
    cat('outros', '📦', 'Outros', 'Não achou a categoria? Anuncie em Outros. Se um produto aparece muito, criamos um grupo só dele.', 'Grupos automáticos'),
  ];
  for (const c of cats) await render(c.html, 1080, 1080, out('posts-categorias', `${c.slug}.png`));

  // (e) Stories 1080x1920 (zonas seguras: 250 topo / 340 base)
  const st = (cls, inner, dark = true) => `<div class="c ${cls}" style="padding:250px 80px 340px">${blobs}<div style="position:absolute;left:80px;top:110px;z-index:2">${logo(70, dark)}</div><div class="body">${inner}</div></div>`;
  const stories = [
    ['lancamento', st('', `<div class="kicker">Chegou o Vendeu</div><h1 style="font-size:104px">Anunciar é <em>grátis</em>.<br>Você só paga quando <em>vende</em>.</h1><p class="sub">O marketplace para comprar, vender e alugar perto de você.</p><div><span class="btn" style="margin-top:50px">Anunciar grátis</span></div><div class="url">${SHOW_URL}</div>`)],
    ['taxa', st('light', `<div class="kicker">Taxa de sucesso</div><h1 style="font-size:96px;color:#102A43">Vendeu por <em>R$ 800</em>?</h1><div class="card" style="margin-top:50px;text-align:center"><div style="font-size:36px;font-weight:600;opacity:.7">Taxa</div><div style="font-size:150px;font-weight:800;color:#0B7A4B;line-height:1.1">R$ 30</div></div><p class="sub" style="color:#102A43">Anunciar é grátis. A taxa só vale quando você vende. Tabela completa em ${SHOW_URL}</p>`, false)],
    ['anti-golpe', st('ink', `<div class="kicker">Anti-golpe</div><h1 style="font-size:96px">Pix antecipado? <em>Nunca.</em></h1><div class="list"><div><b>✅</b>Veja o produto antes de pagar</div><div><b>🏦</b>Confirme o Pix no app do banco</div><div><b>🔐</b>Nunca passe códigos</div><div><b>💬</b>Converse pelo app</div></div>`)],
    ['vendeu-retire', st('yellow', `<div class="kicker">Vendeu?</div><h1 style="font-size:104px">Retire o anúncio e <em>pague só agora</em>.</h1><p class="sub">Pix ou cartão, em até 7 dias. Não vendeu? Retirar é grátis.</p><div style="margin-top:50px"><div class="qrbox" style="box-shadow:0 10px 30px rgba(0,0,0,.15)"><img src="${qrImg}" width="260" height="260"></div></div><div class="url">${SHOW_URL}</div>`, false)],
  ];
  for (const [n, h] of stories) await render(h, 1080, 1920, out('stories', `${n}.png`));

  // (f) Capa/OG e capa Facebook
  const og = (w, h, fs1, pad) => `<div class="c" style="padding:${pad}">${blobs}<div class="top">${logo(h > 600 && w < 1300 ? 64 : 60, true)}</div><div class="body"><h1 style="font-size:${fs1}px">Anunciar é <em>grátis</em>.<br>Você só paga quando <em>vende</em>.</h1></div><div class="foot"><span>Compra · Venda · Locação</span><span>${SHOW_URL}</span></div></div>`;
  await render(og(1200, 630, 66, '48px 72px'), 1200, 630, out('og-image.png'));
  await render(`<div class="c" style="padding:44px 70px 44px 70px;flex-direction:row;align-items:center;gap:40px">${blobs}<div style="position:relative;z-index:2;flex:1"><div style="margin-bottom:20px">${logo(60, true)}</div><h1 style="font-size:64px">Anunciar é <em>grátis</em>.<br>Só paga quando <em>vende</em>.</h1><p class="sub" style="font-size:30px;margin-top:16px">Compra · Venda · Locação · ${SHOW_URL}</p></div></div>`, 1640, 624, out('capa-facebook.png'));

  // (g) Foto de perfil 1080x1080 (símbolo; segura para recorte circular)
  await render(`<div class="c light" style="padding:0;align-items:center;justify-content:center;background:#F6F8F7"><div style="filter:drop-shadow(0 20px 40px rgba(7,87,53,.25))">${symbol(640)}</div></div>`, 1080, 1080, out('foto-perfil.png'), { skipCheck: true });

  await close();
  console.log('cards ok');
})();
