// Gera cartaz A4 (2480x3508), santinho A6 frente/verso (1240x1748) e selo transparente.
//   VENDEU_FONTS=/pasta/com/node_modules-pai node gerar-impressos.cjs
const path = require('node:path');
const { SHOW_URL, logo, symbol, qr, render, close } = require('./lib.cjs');
const OUT = path.join(__dirname, 'impressos');
const o = (f) => path.join(OUT, f);
const FEES = [['Até R$ 150', 'R$ 15'], ['R$ 150,01 a R$ 500', 'R$ 20'], ['R$ 500,01 a R$ 1.000', 'R$ 30'], ['R$ 1.000,01 a R$ 1.500', 'R$ 50'], ['R$ 1.500,01 a R$ 2.000', 'R$ 80'], ['R$ 2.000,01 a R$ 3.000', 'R$ 100'], ['Acima de R$ 3.000', 'R$ 100 + R$ 50 por R$ 1.000'], ['Retirar anúncio publicado sem vender', 'R$ 10']];
const blobs = '<div class="blob" style="width:900px;height:900px;right:-300px;top:-300px"></div><div class="blob" style="width:600px;height:600px;left:-220px;bottom:-200px"></div>';

(async () => {
  const q = await qr(700);
  // Cartaz A4: desenhado em 1240x1754 css px, saída 2x = 2480x3508
  const cartaz = `<div class="c" style="padding:70px 80px 56px">${blobs}<div class="top">${logo(84, true)}</div>
  <div class="body"><h1 style="font-size:92px">Compre e venda <em>sem dar seu telefone.</em></h1><p class="sub" style="font-size:40px">Seu dinheiro fica retido até você receber. Anunciar não custa nada.</p>
  <div class="steps" style="margin-top:30px;gap:22px"><div class="step"><div class="n">1</div><div><b style="font-size:46px">Pague dentro do Vendeu</b><span style="font-size:34px">O dinheiro fica retido no Mercado Pago até o recebimento.</span></div></div><div class="step"><div class="n">2</div><div><b style="font-size:46px">Contato só depois de receber</b><span style="font-size:34px">Telefone e e-mail ficam ocultos até o produto chegar.</span></div></div><div class="step"><div class="n">3</div><div><b style="font-size:46px">7 dias para devolver</b><span style="font-size:34px">Devolveu: dinheiro integral de volta. Não devolveu: repasse ao vendedor, menos a comissão.</span></div></div></div></div>
  <div style="position:relative;z-index:2;background:#FFB703;color:#102A43;border-radius:40px;padding:36px 48px;display:flex;align-items:center;gap:48px"><div style="background:#fff;padding:16px;border-radius:24px"><img src="${q}" width="330" height="330" style="display:block"></div><div><div style="font-size:50px;font-weight:800;line-height:1.1">Aponte a câmera e anuncie</div><div style="font-size:60px;font-weight:800;margin-top:12px">${SHOW_URL}</div><div style="font-size:26px;margin-top:12px;font-weight:600">Compra · Venda · Locação</div></div></div>
  <div style="position:relative;z-index:2;font-size:20px;opacity:.85;margin-top:16px;line-height:1.35">O Vendeu é uma plataforma de anúncios e não garante o produto anunciado. Pagamento processado e retido pelo Mercado Pago; disputas decididas pela moderação com base nas informações do pedido. Anunciar não custa nada: a comissão (a partir de R$ 15, conforme tabela em ${SHOW_URL}) só existe quando a venda se conclui. Retirar um anúncio já publicado sem vender custa R$ 10,00.</div></div>`;
  await render(cartaz, 1240, 1754, o('cartaz-a4.png'), { dsf: 2 });

  // Santinho A6 (620x874 css, 2x = 1240x1748)
  const fr = `<div class="c" style="padding:44px 40px 40px">${blobs.replace(/900px/g, '450px').replace(/600px/g, '300px')}<div class="top">${logo(44, true)}</div><div class="body"><div class="kicker" style="font-size:17px">Compra · Venda · Locação</div><h1 style="font-size:52px">Compre e venda <em>sem dar seu telefone</em>.</h1><p class="sub" style="font-size:25px;margin-top:18px">Seu dinheiro fica retido até você receber. 7 dias para devolver. Anunciar não custa nada.</p></div><div style="position:relative;z-index:2;background:#FFB703;color:#102A43;border-radius:24px;padding:18px 24px;display:flex;align-items:center;gap:22px"><div style="background:#fff;padding:8px;border-radius:14px"><img src="${q}" width="150" height="150" style="display:block"></div><div><div style="font-size:24px;font-weight:800;line-height:1.15">Aponte a câmera e anuncie</div><div style="font-size:30px;font-weight:800;margin-top:6px">${SHOW_URL}</div></div></div></div>`;
  await render(fr, 620, 874, o('santinho-a6-frente.png'), { dsf: 2, css: '.blob{opacity:.07}' });
  const vs = `<div class="c light" style="padding:40px 38px 34px">${blobs.replace(/900px/g, '450px').replace(/600px/g, '300px')}<div class="top">${logo(40, false)}</div><div class="body" style="padding:14px 0 6px;justify-content:flex-start"><h2 style="font-size:34px;margin-top:6px">Como <em>funciona</em></h2><div style="display:grid;gap:7px;margin-top:10px;font-size:19px;font-weight:600;line-height:1.25"><div>1. Pague por Pix dentro do Vendeu: o dinheiro fica retido no Mercado Pago.</div><div>2. Telefone e e-mail só aparecem depois do recebimento.</div><div>3. Recebeu? Você tem 7 dias para devolver (dinheiro integral de volta). Não devolveu: repasse ao vendedor, menos a comissão.</div></div>
  <h2 style="font-size:26px;margin-top:14px">Comissão <em>do vendedor</em></h2><table class="fees" style="margin-top:4px;border-spacing:0 4px">${FEES.map((r) => `<tr><td style="font-size:16px;padding:6px 14px;border-radius:10px 0 0 10px">${r[0]}</td><td style="font-size:${r[1].length > 8 ? 14 : 17}px;padding:6px 14px;border-radius:0 10px 10px 0;white-space:normal">${r[1]}</td></tr>`).join('')}</table>
  <div style="font-size:14px;font-weight:600;margin-top:6px;line-height:1.3">Anunciar não custa nada; comissão só quando a venda se conclui. O comprador paga só o preço combinado.</div></div>
  <div style="position:relative;z-index:2;font-size:13px;line-height:1.35;opacity:.8">Plataforma de anúncios; não garante o produto. Pagamento processado pelo Mercado Pago; a moderação decide disputas. Nunca pedimos Pix antecipado nem códigos. Suporte: suporte@vendeu.app · ${SHOW_URL}</div></div>`;
  await render(vs, 620, 874, o('santinho-a6-verso.png'), { dsf: 2, css: '.fees td{background:#fff}.fees td:last-child{color:#0B7A4B}' });

  // Selo "Vendedor verificado" com fundo transparente (1200x1200)
  const selo = `<div style="width:1200px;height:1200px;display:grid;place-items:center">
  <svg width="1200" height="1200" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg" font-family="Poppins">
   <defs><path id="arcT" d="M150 600a450 450 0 0 1 900 0"/><path id="arcB" d="M130 600a470 470 0 0 0 940 0"/></defs>
   <circle cx="600" cy="600" r="580" fill="#0B7A4B"/><circle cx="600" cy="600" r="545" fill="none" stroke="#FFB703" stroke-width="10"/>
   <circle cx="600" cy="600" r="330" fill="#fff"/>
   <text font-size="86" font-weight="800" fill="#fff" letter-spacing="6" text-anchor="middle"><textPath href="#arcT" startOffset="50%">VENDEDOR VERIFICADO</textPath></text>
   <text font-size="86" font-weight="800" fill="#FFB703" letter-spacing="10" text-anchor="middle" dy="62"><textPath href="#arcB" startOffset="50%">VENDEU</textPath></text>
   <g transform="translate(405 405) scale(6.1)">${symbol(64).replace(/<svg[^>]*>/, '').replace('</svg>', '')}</g>
  </svg></div>`;
  await render(selo, 1200, 1200, o('selo-vendedor-verificado.png'), { transparent: true, skipCheck: true, css: 'body{background:transparent}.c{display:none}' });
  await close();
  console.log('impressos ok');
})();
