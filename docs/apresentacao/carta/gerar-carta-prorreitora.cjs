// Gera a carta de oferta à Pró-Reitora da Uningá (PDF A4).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const b64 = (p) => fs.readFileSync(path.join(__dirname, p)).toString('base64');
const wm = b64('../../../frontend/public/wmundi-logo.png');
const un = b64('../../../frontend/public/brand/uninga-logo.png');
const URL = 'https://web-production-5398c.up.railway.app';
const KEY = process.env.DEMO_KEY || '';
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Carta de oferta · EduMaster Pro · Uningá</title><style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Helvetica,Arial,sans-serif;color:#1f2937;font-size:10.5pt;line-height:1.4;-webkit-print-color-adjust:exact}
.pg{width:210mm;min-height:297mm;padding:0 0 16mm;page-break-after:always;position:relative}
.top{height:10mm;background:linear-gradient(90deg,#EC6236 0 55%,#3162A9 55% 85%,#A32D3B 85%)}
.hd{display:flex;justify-content:space-between;align-items:center;padding:9mm 20mm 4mm}.hd img{height:13mm}.rg{font-size:11pt;font-weight:700;vertical-align:top;margin-left:1px}.hd .w{display:flex;align-items:flex-start}.hd .u{height:15mm}
.c{padding:2mm 20mm 0}h1{color:#3162A9;font-size:19pt;margin:2mm 0 1mm}h2{color:#3162A9;font-size:12.5pt;margin:4.5mm 0 2mm;border-left:4px solid #EC6236;padding-left:8px}
p{margin:0 0 3mm}ul{margin:0 0 3mm;padding-left:18px}li{margin:1.2mm 0}table{width:100%;border-collapse:collapse;margin:2mm 0 3mm;font-size:10pt}
td,th{padding:2.2mm 3mm;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top}th{background:#3162A9;color:#fff;font-size:10pt}td.n{font-weight:700;color:#3162A9;width:34%}
.box{background:#fff4ee;border:1px solid #EC6236;border-radius:3mm;padding:4mm 5mm;margin:3mm 0}.sig{margin-top:5mm}.ft{position:absolute;bottom:7mm;left:20mm;right:20mm;font-size:8.5pt;color:#6b7280;border-top:2px solid #A32D3B;padding-top:2mm}
a{color:#3162A9;font-weight:700;text-decoration:none}
</style></head><body>
<section class="pg"><div class="top"></div>
<div class="hd"><span class="w"><img src="data:image/png;base64,${wm}"><span class="rg">®</span></span><img class="u" src="data:image/png;base64,${un}"></div>
<div class="c">
<p style="color:#6b7280">Maringá, 17 de novembro de 2026</p>
<p><b>À Pró-Reitora da Uningá</b><br>Profa. Bruna Molinari</p>
<h1>Oferta EduMaster Pro</h1>
<p><b>Uma plataforma única, com a identidade da Uningá, para o ensino presencial, a educação a distância e a gestão institucional.</b></p>
<p>Prezada Pró-Reitora Bruna Molinari,</p>
<p>É com grande satisfação que a WMundi® Technologies apresenta à Uningá o <b>EduMaster Pro</b>, plataforma completa de gestão educacional que reúne, em um só ambiente, o acadêmico, a secretaria, o AVA, o financeiro e a cobrança, o atendimento por inteligência artificial, a Reitoria, o regulatório e a contabilidade, com a marca e as cores da Uningá.</p>
<h2>O que a plataforma entrega a cada área</h2>
<table><tr><th>Área</th><th>Resultados para a Uningá</th></tr>
<tr><td class="n">Diretoria e Reitoria</td><td>Indicadores, metas e comparativos em tempo real; painel de excelência do MEC; governança e convênios; visão financeira consolidada</td></tr>
<tr><td class="n">Ensino presencial</td><td>Matrículas, matrizes, notas e frequência; salas, laboratórios e horários com grade gerada automaticamente e aviso aos alunos; aulas práticas, estágios e campos de prática</td></tr>
<tr><td class="n">Educação a distância</td><td>AVA completo com videoaulas, atividades e fóruns; polos; tutoria; acompanhamento virtual do aluno por e-mail, com lembretes de estudo, provas, estágios, PIESC e ENADE; preparação para ENADE, ENAMED e OAB</td></tr>
<tr><td class="n">Diretoria de TI</td><td>Uma plataforma que substitui Jacad, Flugo, Dynadoc, Octadesk e Leadlovers; criptografia, autenticação em duas etapas, auditoria e isolamento de dados; conformidade com a LGPD; implantação gradual, sem parada na operação</td></tr></table>
<h2>Convite: apresentação de 90 minutos</h2>
<p>Solicitamos a gentileza de reservar cerca de <b>90 minutos</b> para apresentar o EduMaster Pro à <b>Diretoria</b>, ao <b>Ensino Presencial</b>, à <b>Educação a Distância</b> e à <b>Diretoria de TI</b>, em encontro presencial na Uningá.</p>
</div><div class="ft"><b>Instituto Ravel de Ensino Superior Ltda</b> (WMundi® Technologies) · CNPJ 03.162.275/0001-10 · Av. XV de Novembro, 255, sala C, Maringá/PR · info@wmundi.com · www.wmundi.com · WhatsApp (44) 99946-6451</div></section>

<section class="pg"><div class="top"></div>
<div class="hd"><span class="w"><img src="data:image/png;base64,${wm}"><span class="rg">®</span></span><img class="u" src="data:image/png;base64,${un}"></div>
<div class="c">
<h2>Roteiro sugerido</h2>
<table><tr><th>Tempo</th><th>Bloco</th></tr>
<tr><td class="n">15 min</td><td><b>Visão executiva:</b> Reitoria, indicadores, painel do MEC, financeiro e proposta de valor</td></tr>
<tr><td class="n">20 min</td><td><b>Ensino presencial:</b> secretaria, matrículas, grade de salas e laboratórios, notas, estágios e aulas práticas</td></tr>
<tr><td class="n">20 min</td><td><b>Educação a distância:</b> AVA, polos, tutoria, acompanhamento virtual do aluno e atendimento por IA</td></tr>
<tr><td class="n">20 min</td><td><b>Diretoria de TI:</b> arquitetura, segurança, LGPD, integrações e cronograma de implantação</td></tr>
<tr><td class="n">15 min</td><td><b>Perguntas, próximos passos</b> e condições comerciais</td></tr></table>
<h2>Implantação e condições</h2>
<ul><li><b>Implantação em 90 dias</b>, mais 30 dias de convivência assistida, com agente da WMundi® presencialmente na Uningá.</li>
<li><b>Personalização completa</b> (marca, cargos, fluxos, modelos e relatórios) e <b>atualizações mensais incluídas</b>.</li>
<li><b>Mensalidade de R$ 41.900,00</b>, com franquia de até 20.000 alunos ativos, e implantação com integrações em tarifa única de R$ 30.000,00 (10 parcelas de R$ 3.000,00 ou R$ 27.000,00 à vista).</li></ul>
<div class="box"><b>Conheça o sistema agora.</b> A demonstração completa, com as cores e a marca da Uningá, está disponível por <b>20 dias, até 07/12/2026</b>.<br>${KEY ? `<b>Acesso direto, sem login e senha:</b> <a href="${URL}/?acesso=${KEY}">${URL}/?acesso=${KEY}</a><br>` : ''}<b>Ou entre com:</b> <a href="${URL}">${URL}</a> · Usuário: <b>apresentacao@uninga.br</b> · Senha: <b>Uninga@2026</b></div>
<p>Será uma honra apresentar o EduMaster Pro à Diretoria da Uningá. Aguardamos a indicação de data e horário que melhor atendam à agenda de V. Sa.</p>
<p class="sig">Atenciosamente,<br><b>Prof. Me. Robson Ravel de Oliveira</b><br>Diretoria Comercial<br>WMundi® Technologies</p>
</div><div class="ft"><b>Instituto Ravel de Ensino Superior Ltda</b> (WMundi® Technologies) · CNPJ 03.162.275/0001-10 · Av. XV de Novembro, 255, sala C, Maringá/PR · info@wmundi.com · www.wmundi.com · WhatsApp (44) 99946-6451</div></section>
</body></html>`;
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent(html, { waitUntil: 'load' });
  await pg.pdf({ path: path.join(__dirname, 'carta-oferta-prorreitora-uninga.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  fs.writeFileSync(path.join(__dirname, 'carta-oferta-prorreitora-uninga.html'), html);
  await b.close(); console.log('ok');
})();
