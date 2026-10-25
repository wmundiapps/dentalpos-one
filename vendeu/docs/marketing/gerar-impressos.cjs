// Gera cartaz A4 (2480x3508), santinho A6 frente/verso (1240x1748) e selo transparente.
//   VENDEU_FONTS=/pasta/com/node_modules-pai node gerar-impressos.cjs
const path = require('node:path');
const { SHOW_URL, logo, symbol, qr, render, close } = require('./lib.cjs');
const OUT = path.join(__dirname, 'impressos');
const o = (f) => path.join(OUT, f);
const FEES = [['Até R$ 150', 'R$ 15'], ['R$ 150,01 a R$ 500', 'R$ 20'], ['R$ 500,01 a R$ 1.000', 'R$ 30'], ['R$ 1.000,01 a R$ 1.500', 'R$ 50'], ['R$ 1.500,01 a R$ 2.000', 'R$ 80'], ['R$ 2.000,01 a R$ 3.000', 'R$ 100'], ['Acima de R$ 3.000', 'R$ 100 + R$ 50 por R$ 1.000'], ['Retirou sem vender', 'R$ 10']];
const blobs = '<div class="blob" style="width:900px;height:900px;right:-300px;top:-300px"></div><div class="blob" style="width:600px;height:600px;left:-220px;bottom:-200px"></div>';

(async () => {
  const q = await qr(700);
  // Cartaz A4: desenhado em 1240x1754 css px, saída 2x = 2480x3508
  const cartaz = `<div class="c" style="padding:80px 80px 70px">${blobs}<div class="top">${logo(84, true)}</div>
  <div class="body"><h1 style="font-size:104px">Tem algo parado em casa? <em>Anuncie.</em></h1><p class="sub" style="font-size:44px">Anunciar não custa nada. Você paga só quando vende, ou R$ 10 se desistir e retirar o anúncio.</p>
  <div class="steps" style="margin-top:50px"><div class="step"><div class="n">1</div><div><b style="font-size:46px">Cadastre um cartão (sem cobrança) e anuncie</b><span style="font-size:34px">Móveis, imóveis, brinquedos, automóveis, utilidades para o lar e mais.</span></div></div><div class="step"><div class="n">2</div><div><b style="font-size:46px">Converse pelo app</b><span style="font-size:34px">Seu telefone não aparece no anúncio.</span></div></div><div class="step"><div class="n">3</div><div><b style="font-size:46px">Vendeu? Retire e pague a taxa</b><span style="font-size:34px">A partir de R$ 15, cobrada no cartão cadastrado. Retirou sem vender: R$ 10.</span></div></div></div></div>
  <div style="position:relative;z-index:2;background:#FFB703;color:#102A43;border-radius:40px;padding:36px 48px;display:flex;align-items:center;gap:48px"><div style="background:#fff;padding:16px;border-radius:24px"><img src="${q}" width="330" height="330" style="display:block"></div><div><div style="font-size:50px;font-weight:800;line-height:1.1">Aponte a câmera e anuncie</div><div style="font-size:60px;font-weight:800;margin-top:12px">${SHOW_URL}</div><div style="font-size:26px;margin-top:12px;font-weight:600">Compra · Venda · Locação</div></div></div>
  <div style="position:relative;z-index:2;font-size:22px;opacity:.8;margin-top:22px;line-height:1.35">O Vendeu é uma plataforma de anúncios: o pagamento da compra é combinado entre comprador e vendedor. Taxa de sucesso conforme tabela em ${SHOW_URL}. Retirar o anúncio sem ter vendido custa R$ 10,00. O cartão de crédito é cadastrado pelo Mercado Pago ao anunciar, com autorização para cobrar a taxa de sucesso ou a de retirada; cadastrar não gera cobrança.</div></div>`;
  await render(cartaz, 1240, 1754, o('cartaz-a4.png'), { dsf: 2 });

  // Santinho A6 (620x874 css, 2x = 1240x1748)
  const fr = `<div class="c" style="padding:44px 40px 40px">${blobs.replace(/900px/g, '450px').replace(/600px/g, '300px')}<div class="top">${logo(44, true)}</div><div class="body"><div class="kicker" style="font-size:17px">Compra · Venda · Locação</div><h1 style="font-size:52px">Anunciar <em>não custa nada</em>.<br>Você paga só quando <em>vende</em>.</h1><p class="sub" style="font-size:23px;margin-top:18px">Desistiu e retirou o anúncio sem vender? São R$ 10. Cartão cadastrado ao anunciar, sem cobrança no cadastro.</p></div><div style="position:relative;z-index:2;background:#FFB703;color:#102A43;border-radius:24px;padding:18px 24px;display:flex;align-items:center;gap:22px"><div style="background:#fff;padding:8px;border-radius:14px"><img src="${q}" width="150" height="150" style="display:block"></div><div><div style="font-size:24px;font-weight:800;line-height:1.15">Aponte a câmera e anuncie</div><div style="font-size:30px;font-weight:800;margin-top:6px">${SHOW_URL}</div></div></div></div>`;
  await render(fr, 620, 874, o('santinho-a6-frente.png'), { dsf: 2, css: '.blob{opacity:.07}' });
  const vs = `<div class="c light" style="padding:40px 38px 34px">${blobs.replace(/900px/g, '450px').replace(/600px/g, '300px')}<div class="top">${logo(40, false)}</div><div class="body" style="padding:14px 0 6px;justify-content:flex-start"><h2 style="font-size:36px;margin-top:6px">Como <em>funciona</em></h2><div style="display:grid;gap:8px;margin-top:12px;font-size:21px;font-weight:600;line-height:1.25"><div>1. Cadastre um cartão (sem cobrança) e anuncie, com fotos e preço.</div><div>2. Converse pelo app, sem mostrar seu telefone.</div><div>3. Vendeu? Retire o anúncio e pague a taxa. Sem vender, retirar custa R$ 10.</div></div>
  <h2 style="font-size:28px;margin-top:16px">Quanto <em>você paga</em></h2><table class="fees" style="margin-top:4px;border-spacing:0 5px">${FEES.map((r) => `<tr><td style="font-size:17px;padding:7px 14px;border-radius:10px 0 0 10px">${r[0]}</td><td style="font-size:${r[1].length > 8 ? 14 : 18}px;padding:7px 14px;border-radius:0 10px 10px 0;white-space:normal">${r[1]}</td></tr>`).join('')}</table>
  <div style="font-size:15px;font-weight:600;margin-top:8px;line-height:1.3">Taxa só ao vender; se vendeu, não soma os R$ 10. Verificação de identidade, orientações anti-golpe e conversa dentro do app.</div></div>
  <div style="position:relative;z-index:2;font-size:14px;line-height:1.35;opacity:.8">Plataforma de anúncios: o pagamento da compra é entre comprador e vendedor. Nunca pedimos Pix antecipado nem códigos. O cartão é cadastrado ao anunciar (sem cobrança); o Vendeu não guarda número nem CVV. Suporte: suporte@vendeu.app · ${SHOW_URL}</div></div>`;
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
