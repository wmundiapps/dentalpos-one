// Gera o demonstrativo (PDF, formato apresentação 16:9) com as telas reais. Uso: node tools/make-demonstrativo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire('/node-tools/node_modules/')('playwright');
const root = path.resolve(import.meta.dirname, '..');
const img = (p) => `data:image/png;base64,${fs.readFileSync(path.join(root, p)).toString('base64')}`;
const svg = (p) => `data:image/svg+xml;base64,${fs.readFileSync(path.join(root, p)).toString('base64')}`;
const logo = svg('brand/logo-horizontal-branco.svg');
const D = (n) => img(`docs/img/${n}.png`), M = (n) => img(`docs/img/mobile/${n}.png`);

const slide = (inner, dark = false) => `<section class="s ${dark ? 'dark' : ''}">${inner}</section>`;
const head = (kicker, h) => `<div class="k">${kicker}</div><h2>${h}</h2>`;
const win = (src, h = 470) => `<div class="win" style="height:${h}px"><img src="${src}"></div>`;
const phone = (src, h = 520) => `<div class="ph"><div style="height:${h}px;overflow:hidden;border-radius:26px"><img src="${src}" style="width:100%"></div></div>`;

const slides = [
  slide(`<img src="${logo}" style="height:70px"><h1>Demonstrativo do<br>LavaPos</h1><p class="lead">O sistema completo para lava-rápidos e estética automotiva — da entrada do carro ao caixa.</p><p class="small">WMundi · 17/10/2026 · telas reais com dados de demonstração</p>`, true),
  slide(`${head('O QUE É', 'Um sistema para o lava-rápido operar, vender mais e lucrar')}<div class="grid3">
    <div class="card"><b>📝 Check-in e saída com fotos</b><p>Checklist por toque (✕), fotos em 8 ângulos, comparação na entrega.</p></div>
    <div class="card"><b>📅 Agenda e avisos</b><p>Dias, horários e boxes; agendamento online; WhatsApp, SMS e e-mail.</p></div>
    <div class="card"><b>🔁 Clube e cashback</b><p>Semanal, quinzenal, trisemanal e mensal; cashback próprio ou Cashbacksmart.</p></div>
    <div class="card"><b>💰 Financeiro e nota</b><p>Pix, cartão e boleto (Asaas) com 10% para a plataforma; despesas, lucro, NF.</p></div>
    <div class="card"><b>📦 Estoque e fornecedores</b><p>Baixa automática por serviço e alerta de estoque baixo.</p></div>
    <div class="card"><b>📈 Precificação</b><p>Preço pelo custo real, ponto de equilíbrio e lucro do mês.</p></div></div>
    <p class="note">30 dias grátis, sem cartão · depois R$ 119/mês · comissão de 10% sobre as lavagens pagas pelo sistema</p>`),
  slide(`${head('CHECK-IN', 'Placa, dados do dono, estado do carro e fotos — em 4 toques')}<div class="row4">${[['02-01-cliente-veiculo', '1. Placa e dados (listas de rolagem)'], ['02-02-servicos', '2. Serviços e preço da categoria'], ['02-03-checklist', '3. Estado do carro com ✕'], ['02-04-fotos', '4. Fotos de entrada']].map(([f, t]) => `<div>${phone(M(f), 560)}<p class="cap">${t}</p></div>`).join('')}</div>`),
  slide(`${head('DIA A DIA', 'Seu dia num relance: pátio, agenda e alertas')}<div class="row2">${win(D('dashboard'), 480)}<div>${win(D('agenda'), 480)}</div></div><p class="cap">Categorias Carro · SUV · Utilitários · Vans · Caminhões, com preço por categoria e por serviço.</p>`),
  slide(`${head('SERVIÇOS E PREÇOS', 'Valores por categoria e por procedimento — tudo configurável')}${win(D('servicos'), 500)}<p class="cap">Lavagem completa e só externa, higienização, hidratação de couro, enceramento, espelhamento, impermeabilização, insulfilme, película de proteção e itens criados por você.</p>`),
  slide(`${head('CLUBE E FIDELIDADE', 'O cliente volta sozinho')}<div class="row2">${win(D('clube'), 470)}${win(D('fidelidade'), 470)}</div>`),
  slide(`${head('FINANCEIRO', 'Recebimentos, despesas, resultado e comissão da plataforma')}<div class="row2">${win(D('financeiro'), 470)}${win(D('estoque'), 470)}</div>`),
  slide(`${head('PRECIFICAÇÃO', 'Descubra o preço certo e quanto sobra em cada serviço')}${win(D('precificacao'), 500)}<p class="cap">Custo = materiais + mão de obra + parte das despesas fixas. Mostra a margem atual e o preço sugerido; ponto de equilíbrio e lucro projetado.</p>`),
  slide(`${head('ANTES E DEPOIS + GOOGLE', 'Vitrine do lava-rápido e agendamento online para o cliente')}<div class="row2">${win(D('vitrine'), 470)}${win(D('lembretes'), 470)}</div><p class="cap">Fotos só com autorização do cliente e placa coberta · pedido de avaliação no Google para todos os clientes · alertas de licença ambiental, alvará, bombeiros e aluguel.</p>`),
  slide(`${head('PÁGINA PÚBLICA', 'O lava-rápido ganha uma página de vendas e agendamento')}<div class="row3" style="align-items:flex-start">${phone(M('12-pagina-publica'), 560)}<div class="card" style="flex:2"><b>O que o cliente vê</b><p>Serviços e preços por categoria · antes e depois · avaliações do Google · escolha de dia e horário livre · confirmação por WhatsApp.</p><b>O que o dono ganha</b><p>Menos telefone, agenda cheia, cliente cadastrado com consentimento, clube e cashback divulgados.</p></div></div>`),
  slide(`${head('SEGURANÇA', 'Camadas contra invasão, vírus e golpe')}<div class="grid3">
    <div class="card"><b>🔐 Contra hackers</b><p>Senha forte · bloqueio após 5 erros · verificação em 2 etapas · sessão curta · limite por IP · dados separados por lava-rápido · auditoria · banco fechado (RLS).</p></div>
    <div class="card"><b>🦠 Contra vírus</b><p>Só aceita foto; cada imagem é decodificada e regravada sem metadados · arquivo disfarçado é recusado · limites de tamanho e formato · sem upload de PDF/planilha.</p></div>
    <div class="card"><b>🎣 Contra phishing</b><p>Mensagens de modelo fixo · links digitados são removidos · link de sair assinado · chave do Asaas só na tela, criptografada · SPF/DKIM/DMARC (a configurar).</p></div></div><p class="note">11 testes automáticos cobrem a segurança. Falta: teste de invasão profissional, DNS de e-mail e chaves na Vercel (docs/SEGURANCA.md).</p>`),
  slide(`${head('CONTRATOS', 'Minutas prontas — aguardam sua aprovação e a revisão da Dra. Roberta')}<div class="grid3">
    <div class="card"><b>Contrato WMundi × estabelecimento</b><p>Licença de uso · 30 dias grátis e R$ 119/mês · comissão de 10% (split Asaas e fatura mensal) · clube, cashback, mensagens, fotos, Google · disponibilidade (C1) · limitação de responsabilidade.</p></div>
    <div class="card"><b>Política de privacidade e Adendo LGPD</b><p>Papéis controlador/operador · suboperadores · incidentes em 48 h · exportação e anonimização.</p></div>
    <div class="card"><b>Termos para o cliente final</b><p>Termo do clube de assinatura · Termo de check-in do veículo (estado, pertences, fotos, retirada).</p></div></div><p class="note">Pontos em [colchetes] a decidir: base de cálculo da comissão, reajuste, multa por atraso, foro, dados da empresa.</p>`),
  slide(`${head('O NEGÓCIO', 'Meta: 6.000 lava-rápidos e 600.000 usuários')}<table><tr><th></th><th>Conta</th><th>Resultado</th></tr>
    <tr><td>Mensalidade</td><td>6.000 × R$ 119</td><td><b>R$ 714 mil/mês</b> (R$ 8,57 mi/ano)</td></tr>
    <tr><td>Usuários por lava-rápido</td><td>600.000 ÷ 6.000</td><td><b>100 clientes</b> cada</td></tr>
    <tr><td>Comissão 10% — 30% das lavagens no sistema</td><td>1,5 lav./cliente × R$ 70</td><td><b>R$ 1,89 mi/mês</b></td></tr>
    <tr><td>Comissão 10% — 60% das lavagens no sistema</td><td>idem</td><td><b>R$ 3,78 mi/mês</b></td></tr>
    <tr><td>Testes necessários (25% viram pagantes)</td><td>6.000 ÷ 25%</td><td><b>24.000 testes</b></td></tr>
    <tr><td>Reposição de cancelamentos (3%/mês)</td><td>6.000 × 3%</td><td><b>180 novos por mês</b></td></tr></table>
    <p class="note">Números calculados a partir de premissas a validar no piloto — não são previsão. A comissão só existe quando o pagamento passa pelo sistema.</p>`),
  slide(`${head('COMUNICAÇÃO', 'Marca, anúncios e página de vendas prontos')}<div class="row3" style="align-items:center"><img src="${img('brand/logo-horizontal.png')}" style="width:300px;background:#fff;border-radius:14px;padding:10px"><img src="${img('marketing/meta-ads/1-checkin-fotos_feed-1080x1080.png')}" style="height:300px;border-radius:14px"><img src="${img('marketing/meta-ads/3-oferta_feed-1080x1080.png')}" style="height:300px;border-radius:14px"></div><p class="cap">Logomarca (4 versões) · 15 cards Meta Ads · 15 títulos e 4 descrições Google Ads · landing page · 4 modelos de e-mail · sugestões de nome.</p>`),
  slide(`${head('SITUAÇÃO', 'O que está pronto e o que depende de conta, chave ou provedor')}<div class="grid2"><div class="card"><b>✅ Pronto e testado</b><p>Check-in/check-out com fotos · categorias e preços · agenda e agendamento online · clube · cashback próprio · financeiro e despesas · estoque e fornecedores · licenças · precificação · vitrine antes/depois · segurança e 2 etapas · contratos (minutas).</p></div>
    <div class="card"><b>🟡 Pronto no código, falta ligar</b><p>Asaas com split 10% (testar no sandbox) · WhatsApp/SMS/e-mail (provedor) · nota fiscal automática (provedor fiscal) · Cashbacksmart (credenciais e documentação) · nota do Google (chave) · lojas Apple/Google (contas, Mac, assinatura).</p></div></div>
    <p class="note"><b>Próximos passos:</b> 1) banco e Vercel · 2) Asaas e provedores · 3) aprovar contratos · 4) checar o nome (INPI/domínio) · 5) piloto com 10–20 lava-rápidos · 6) anúncios e lojas.</p>`, true),
];

const css = `*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;color:#0f2238}
.s{width:1280px;height:720px;padding:46px 56px;background:#f3f6fa;page-break-after:always;position:relative;overflow:hidden}.s.dark{background:linear-gradient(150deg,#0b2a4a,#0b5fd7);color:#fff}
h1{font-size:64px;line-height:1.02;letter-spacing:-2px;margin:34px 0 14px}h2{font-size:34px;letter-spacing:-1px;margin:4px 0 18px;line-height:1.1}.k{font-size:15px;font-weight:800;letter-spacing:2px;color:#0b5fd7}.dark .k{color:#14b8e6}
.lead{font-size:24px;max-width:760px;opacity:.92}.small{font-size:15px;opacity:.75}.cap{font-size:14px;color:#5b6b7e;margin:8px 0 0;text-align:center}.dark .cap{color:#cfe0f3}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}.row2{display:grid;grid-template-columns:1fr 1fr;gap:16px}.row3{display:flex;gap:20px}.row4{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.card{background:#fff;border:1px solid #dde4ec;border-radius:16px;padding:18px;color:#0f2238;font-size:15.5px;line-height:1.45}.card b{font-size:18px;display:block;margin-bottom:6px}.card p{margin:.3rem 0 .6rem;color:#445468}
.note{margin-top:16px;background:#fff8e6;border:1px solid #f0c36d;border-radius:12px;padding:11px 14px;font-size:14.5px;color:#6b4300}.dark .note{background:#ffffff22;border-color:#ffffff55;color:#fff}
.win{overflow:hidden;border-radius:12px;border:1px solid #dde4ec;box-shadow:0 8px 24px #0a213c22;background:#fff}.win img{width:100%;display:block}
.ph{width:300px;flex:none;background:#0a1624;border-radius:34px;padding:8px;box-shadow:0 12px 30px #0a213c33}.ph img{display:block}
table{width:100%;border-collapse:collapse;font-size:17px;background:#fff;border-radius:14px;overflow:hidden}th,td{padding:12px 16px;border-bottom:1px solid #e6ecf3;text-align:left}th{background:#0b2a4a;color:#fff;font-size:13px;letter-spacing:1px}`;
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>${css}</style><body>${slides.join('')}</body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.setContent(html, { waitUntil: 'load' }); await page.waitForTimeout(800);
await page.pdf({ path: path.join(root, 'docs/DEMONSTRATIVO-LAVAPOS.pdf'), width: '1280px', height: '720px', printBackground: true, pageRanges: '' });
await browser.close();
console.log('PDF gerado:', slides.length, 'páginas');
