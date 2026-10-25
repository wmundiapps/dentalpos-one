// Gera todos os cards de docs/marketing/cards (PNG) para o modelo "compra protegida". Reproduzível.
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
const LEGAL = 'O Vendeu é uma plataforma de anúncios. Pagamento processado pelo Mercado Pago; disputas decididas pela moderação.';
const SHORT = 'Pagamento processado pelo Mercado Pago. A moderação decide disputas.';
const CARD_NOTE = 'Anunciar não custa nada; comissão só quando a venda se conclui. Pagamento retido no Mercado Pago até o recebimento.';

(async () => {
  const qrImg = await qr(300);
  const cta = (txt) => `<div style="display:flex;align-items:center;gap:44px;margin-top:44px"><div class="qrbox"><img src="${qrImg}" width="230" height="230"></div><div><span class="btn" style="font-size:40px;padding:24px 40px">${txt}</span><div class="url">${SHOW_URL}</div></div></div>`;
  const flow = (items) => `<div style="display:flex;align-items:stretch;gap:14px;margin-top:46px">${items.map((it, i) => `${i ? '<div style="align-self:center;font-size:54px;font-weight:800">→</div>' : ''}<div class="card" style="flex:1;padding:28px 22px;text-align:center"><div style="font-size:64px;line-height:1">${it[0]}</div><div style="font-size:30px;font-weight:800;line-height:1.15;margin-top:12px">${it[1]}</div><div style="font-size:23px;line-height:1.25;margin-top:8px;opacity:.75">${it[2]}</div></div>`).join('')}</div>`;

  // (a) Carrossel "Compra protegida" 1080x1350 (8 cards)
  const A = [
    (n, t) => card('', n, t, `<div class="kicker">Compra protegida pela plataforma</div><h1>Compre e venda <em>sem dar seu telefone</em>.</h1><p class="sub">Seu dinheiro fica retido até você receber.</p><div class="note">${SHORT}</div>`),
    (n, t) => card('ink', n, t, `<div class="kicker">O problema</div><h2>Muito golpe começa com um <em>contato direto</em></h2><div class="list"><div><b>📱</b>“Me chama no WhatsApp que a gente fecha por fora”</div><div><b>💸</b>Pix antecipado de sinal ou frete, e o vendedor some</div><div><b>🧾</b>Comprovante falso de pagamento</div></div>`),
    (n, t) => card('light', n, t, `<div class="kicker">Como funciona</div><h2>Tudo <em>dentro do Vendeu</em></h2><div class="steps" style="color:#102A43;gap:24px;margin-top:34px"><div class="step"><div class="n">1</div><div><b>Pedido no anúncio</b><span>Comprar pelo preço cheio ou enviar proposta.</span></div></div><div class="step"><div class="n">2</div><div><b>Pix dentro do Vendeu</b><span>O dinheiro fica retido no Mercado Pago.</span></div></div><div class="step"><div class="n">3</div><div><b>Envio ou retirada com código</b><span>O código só é passado com o produto em mãos.</span></div></div><div class="step"><div class="n">4</div><div><b>Recebi, 7 dias, repasse</b><span>Ou devolução integral se você devolver.</span></div></div></div>`, false, false),
    (n, t) => card('yellow', n, t, `<div class="kicker">Dinheiro retido</div><h2>Seu dinheiro fica <em>retido no Mercado Pago</em></h2>${flow([['📲', 'Você paga', 'Pix dentro do Vendeu'], ['🔒', 'Fica retido', 'até você receber'], ['✅', 'Vendedor recebe', 'depois do prazo']])}<p class="sub" style="font-size:34px">Não passa por conta do Vendeu.</p>`, false, false),
    (n, t) => card('', n, t, `<div class="kicker">Contato só depois</div><h2>Telefone e e-mail <em>ocultos</em> até o recebimento</h2><div class="list"><div><b>💬</b>O chat do Vendeu oculta telefone, e-mail, links e @usuário</div><div><b>🔓</b>Só depois do “Recebi”, o contato aparece para os dois lados</div><div><b>🚫</b>Negociar por fora tira o pagamento retido e os 7 dias</div></div>`),
    (n, t) => card('light', n, t, `<div class="kicker">Prazo de devolução</div><h2>Receba, confira. <em>7 dias para devolver.</em></h2><div class="list" style="margin-top:34px"><div><b>↩️</b><span><b style="all:unset;font-weight:800">Devolveu:</b> o dinheiro volta 100% ao comprador e ninguém paga nada</span></div><div><b>✅</b><span><b style="all:unset;font-weight:800">Não devolveu:</b> o valor é repassado ao vendedor, menos a comissão</span></div></div><div class="note" style="opacity:1">Disputa? A moderação decide com base nas informações do pedido.</div>`, false, false),
    (n, t) => card('', n, t, `<div class="kicker">Quanto custa</div><h2>Anunciar <em>não custa nada</em></h2><div class="list"><div><b>💚</b>Comissão só quando a venda se conclui (a partir de R$ 15)</div><div><b>🔟</b>Retirar anúncio publicado sem vender: R$ 10</div><div><b>🛒</b>O comprador paga só o preço combinado</div></div><div class="note">Tabela completa em ${SHOW_URL}</div>`),
    (n, t) => card('', n, t, `<h1>Compre e venda <em>sem dar seu telefone.</em></h1><p class="sub" style="font-size:36px">Anunciar não custa nada. A comissão só existe quando a venda se conclui.</p>${cta('Quero anunciar')}<div class="note">${LEGAL}</div>`, true),
  ];
  for (const [i, f] of A.entries()) await render(f(i + 1, A.length), 1080, 1350, out('carrossel-compra-protegida', `${i + 1}.png`));

  // (b) Carrossel "Quanto custa vender?" (6 cards)
  const ex = (preco, fee, fica, item, faixa) => (n, t) => card('', n, t, `<div class="kicker">Exemplo ${n - 1}</div><h2>${item}</h2><div class="card" style="margin-top:44px"><div style="font-size:32px;font-weight:600;opacity:.7">Você vende por</div><div style="font-size:104px;font-weight:800;line-height:1.1">${preco}</div><div style="height:4px;background:#E3EBE7;margin:26px 0"></div><div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px"><div style="font-size:34px;font-weight:600">Comissão</div><div style="font-size:62px;font-weight:800;color:#0B7A4B">${fee}</div></div><div style="font-size:26px;opacity:.7;margin-top:4px">Faixa: ${faixa}</div><div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-top:22px"><div style="font-size:36px;font-weight:700">Você recebe</div><div style="font-size:62px;font-weight:800;color:#0B7A4B">${fica}</div></div></div><div class="note">Simulação sobre o valor combinado. ${LEGAL}</div>`);
  const B = [
    (n, t) => card('', n, t, `<div class="kicker">Comissão</div><h1>Quanto custa <em>vender</em>?</h1><p class="sub">Anunciar não custa nada. A comissão só existe quando a venda se conclui e é descontada do repasse. Veja 3 exemplos.</p>`),
    ex('R$ 120', 'R$ 15', 'R$ 105', 'Um brinquedo usado', 'até R$ 150'),
    ex('R$ 800', 'R$ 30', 'R$ 770', 'Uma mesa de jantar', 'R$ 500,01 a R$ 1.000'),
    ex('R$ 3.500', 'R$ 150', 'R$ 3.350', 'Um item de valor mais alto', 'acima de R$&nbsp;3.000: R$&nbsp;100 + R$&nbsp;50 por bloco de R$&nbsp;1.000'),
    (n, t) => card('yellow', n, t, `<div class="kicker">E se eu não vender?</div><h2>Retirar sem vender: <em>R$ 10</em></h2><div class="list"><div><b>✅</b>Vendeu: só a comissão da tabela, descontada do repasse</div><div><b>↩️</b>Comprador devolveu: ninguém paga nada, nem comissão</div><div><b>⏸️</b>Pausar, rascunho, anúncio recusado ou retirado pela moderação: sem cobrança</div></div>`, false, false),
    (n, t) => card('', n, t, `<h1>Anunciar <em>não custa nada.</em></h1><p class="sub" style="font-size:36px">Comissão só quando a venda se conclui. Retirar um anúncio publicado sem vender custa R$ 10.</p>${cta('Quero anunciar')}<div class="note">${LEGAL}</div>`, true),
  ];
  for (const [i, f] of B.entries()) await render(f(i + 1, B.length), 1080, 1350, out('carrossel-quanto-custa', `${i + 1}.png`));

  // (c) 5 dicas anti-golpe
  const tip = (num, icon, title, txt) => (n, t) => card('light', n, t, `<div class="kicker">Dica ${num} de 5</div><div style="font-size:130px;line-height:1">${icon}</div><h2 style="margin-top:24px">${title}</h2><p class="sub" style="font-size:40px">${txt}</p>`, n === t, false);
  const Cc = [
    (n, t) => card('ink', n, t, `<div class="kicker">Segurança</div><h1>5 dicas <em>anti-golpe</em> para comprar e vender</h1><p class="sub">Salve para não esquecer na hora do negócio. Nenhuma plataforma elimina todos os riscos.</p>`),
    tip(1, '🚫', 'Nunca negocie <em>fora do app</em>', 'O pagamento retido e os 7 dias para devolver só valem dentro do Vendeu. Quem pede para conversar ou pagar por fora merece desconfiança.'),
    tip(2, '📦', 'Só confirme “Recebi” com o <em>produto na mão</em>', 'Na retirada em mãos, o código de 6 dígitos só é passado ao vendedor depois que você conferir o produto.'),
    tip(3, '🔐', 'Nunca passe <em>códigos</em>', 'Código de SMS ou WhatsApp dá acesso à sua conta. O Vendeu nunca pede senha nem código por mensagem.'),
    tip(4, '🧐', 'Desconfie de <em>pressa</em>', 'Pedido de telefone, link, Pix antecipado ou preço bom demais com urgência são sinais de alerta. Denuncie o anúncio.'),
    tip(5, '📍', 'Retirada em <em>local público</em>', 'De dia, num lugar movimentado, de preferência acompanhado. Confira o produto antes de passar o código.'),
  ];
  for (const [i, f] of Cc.entries()) await render(f(i + 1, Cc.length), 1080, 1350, out('carrossel-5-dicas-anti-golpe', `${i + 1}.png`));

  // (d) Posts por categoria 1080x1080
  const cat = (slug, e, nome, frase, extra) => ({ slug, html: `<div class="c light">${blobs}${top(0, 0, false)}<div class="body"><div style="font-size:150px;line-height:1">${e}</div><div class="kicker" style="margin-top:20px">Categoria</div><h1 style="font-size:84px;color:#102A43">${nome}</h1><p class="sub" style="font-size:38px;margin-top:20px">${frase}</p><div style="margin-top:30px"><span class="chip">${extra}</span></div><div class="note" style="font-size:24px;margin-top:22px">${CARD_NOTE}</div></div><div class="foot"><span>${SHOW_URL}</span><span class="swipe">Anuncie no Vendeu</span></div></div>` });
  const cats = [
    cat('moveis', '🛋️', 'Móveis', 'Aquele sofá ou guarda-roupa que não cabe mais? Anuncie sem mostrar seu telefone.', 'Novos e Usados em abas separadas'),
    cat('imoveis', '🏠', 'Imóveis', 'Anuncie para vender ou alugar. Seu telefone não aparece no anúncio.', 'Compra · Venda · Locação'),
    cat('brinquedos', '🧸', 'Brinquedos', 'O brinquedo que ficou pequeno pode alegrar outra criança. Anuncie sem mostrar seu telefone.', 'Novos e Usados em abas separadas'),
    cat('automoveis', '🚗', 'Automóveis', 'Anuncie seu carro ou moto. Seu telefone não aparece no anúncio.', 'Declaração de origem em cada anúncio'),
    cat('utilidades-lar', '🍳', 'Utilidades para o lar', 'Itens parados no armário? Dê nova vida a eles e receba pelo Vendeu.', 'Anunciar não custa nada'),
    cat('outros', '📦', 'Outros', 'Não achou a categoria? Anuncie em Outros. Se um produto aparece muito, criamos um grupo só dele.', 'Grupos automáticos'),
  ];
  for (const c of cats) await render(c.html, 1080, 1080, out('posts-categorias', `${c.slug}.png`));

  // (e) Stories 1080x1920 (zonas seguras: 250 topo / 340 base)
  const st = (cls, inner, dark = true) => `<div class="c ${cls}" style="padding:250px 80px 340px">${blobs}<div style="position:absolute;left:80px;top:110px;z-index:2">${logo(70, dark)}</div><div class="body">${inner}</div></div>`;
  const stories = [
    ['lancamento', st('', `<div class="kicker">Chegou o Vendeu</div><h1 style="font-size:92px">Compre e venda <em>sem dar seu telefone</em>.</h1><p class="sub">Seu dinheiro fica retido até você receber. Anunciar não custa nada.</p><div><span class="btn" style="margin-top:50px">Quero anunciar</span></div><div class="url">${SHOW_URL}</div><div class="note" style="font-size:28px">${SHORT}</div>`)],
    ['dinheiro-retido', st('yellow', `<div class="kicker">Pagamento retido</div><h1 style="font-size:100px">Seu dinheiro fica <em>retido</em> até você receber.</h1><p class="sub">Você paga por Pix dentro do Vendeu e o valor fica retido no Mercado Pago. Não passa por conta do Vendeu.</p><div class="note" style="font-size:28px;opacity:1">${SHORT}</div>`, false)],
    ['contato-depois', st('ink', `<div class="kicker">Sem dar seu telefone</div><h1 style="font-size:96px">Contato só <em>depois de receber</em>.</h1><div class="list"><div><b>💬</b>Chat do Vendeu oculta telefone, e-mail e links</div><div><b>📦</b>Recebeu? Aí o contato aparece nos dois lados</div></div>`)],
    ['sete-dias', st('light', `<div class="kicker">Prazo de devolução</div><h1 style="font-size:100px;color:#102A43"><em>7 dias</em> para devolver.</h1><div class="card" style="margin-top:50px"><div style="font-size:40px;font-weight:700;line-height:1.25">Devolveu: o dinheiro volta 100% e ninguém paga nada.</div></div><p class="sub" style="color:#102A43;font-size:36px">Não devolveu: o valor vai para o vendedor, menos a comissão.</p><div class="url" style="color:#0B7A4B">${SHOW_URL}</div>`, false)],
  ];
  for (const [n, h] of stories) await render(h, 1080, 1920, out('stories', `${n}.png`));

  // (f) Capa/OG e capa Facebook
  const og = (fs1, pad) => `<div class="c" style="padding:${pad}">${blobs}<div class="top">${logo(60, true)}</div><div class="body"><h1 style="font-size:${fs1}px">Compre e venda <em>sem dar seu telefone</em>.</h1><p class="sub" style="font-size:34px;margin-top:18px">Seu dinheiro fica retido até você receber.</p></div><div class="foot" style="font-size:24px"><span>Anunciar não custa nada · Pagamento via Mercado Pago</span><span>${SHOW_URL}</span></div></div>`;
  await render(og(70, '48px 72px'), 1200, 630, out('og-image.png'));
  await render(`<div class="c" style="padding:44px 70px;flex-direction:row;align-items:center;gap:40px">${blobs}<div style="position:relative;z-index:2;flex:1"><div style="margin-bottom:20px">${logo(60, true)}</div><h1 style="font-size:64px">Compre e venda <em>sem dar seu telefone</em>.</h1><p class="sub" style="font-size:30px;margin-top:16px">Dinheiro retido até você receber · 7 dias para devolver · ${SHOW_URL}</p></div></div>`, 1640, 624, out('capa-facebook.png'));

  // (g) Foto de perfil 1080x1080 (símbolo; segura para recorte circular)
  await render(`<div class="c light" style="padding:0;align-items:center;justify-content:center;background:#F6F8F7"><div style="filter:drop-shadow(0 20px 40px rgba(7,87,53,.25))">${symbol(640)}</div></div>`, 1080, 1080, out('foto-perfil.png'), { skipCheck: true });

  await close();
  console.log('cards ok');
})();
