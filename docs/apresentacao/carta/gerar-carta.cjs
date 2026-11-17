// Gera a carta-proposta à Diretoria da Uningá (PDF A4).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const b64 = (p) => fs.readFileSync(path.join(__dirname, p)).toString('base64');
const wm = b64('../../../frontend/public/wmundi-logo.png');
const un = b64('../../../frontend/public/brand/uninga-logo.png');
const URL = 'https://web-production-5398c.up.railway.app';
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Carta-proposta · EduMaster Pro · Uningá</title><style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Helvetica,Arial,sans-serif;color:#1f2937;font-size:11.2pt;line-height:1.45;-webkit-print-color-adjust:exact}
.pg{width:210mm;min-height:297mm;padding:0 0 16mm;page-break-after:always;position:relative}
.top{height:10mm;background:linear-gradient(90deg,#EC6236 0 55%,#3162A9 55% 85%,#A32D3B 85%)}
.hd{display:flex;justify-content:space-between;align-items:center;padding:9mm 20mm 4mm}.hd img{height:13mm}.hd .u{height:15mm}
.c{padding:2mm 20mm 0}h1{color:#3162A9;font-size:19pt;margin:2mm 0 1mm}h2{color:#3162A9;font-size:13pt;margin:6mm 0 2mm;border-left:4px solid #EC6236;padding-left:8px}
p{margin:0 0 3mm}ul{margin:0 0 3mm;padding-left:18px}li{margin:1.2mm 0}table{width:100%;border-collapse:collapse;margin:2mm 0 4mm;font-size:10.4pt}
td,th{padding:2.2mm 3mm;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top}th{background:#3162A9;color:#fff;font-size:10pt}td.n{font-weight:700;color:#3162A9;width:34%}
.box{background:#fff4ee;border:1px solid #EC6236;border-radius:3mm;padding:4mm 5mm;margin:3mm 0}.sig{margin-top:8mm}.ft{position:absolute;bottom:7mm;left:20mm;right:20mm;font-size:8.5pt;color:#6b7280;border-top:2px solid #A32D3B;padding-top:2mm}
a{color:#3162A9;font-weight:700;text-decoration:none}
</style></head><body>
<section class="pg"><div class="top"></div>
<div class="hd"><img src="data:image/png;base64,${wm}"><img class="u" src="data:image/png;base64,${un}"></div>
<div class="c">
<p style="color:#6b7280">Maringá, 17 de novembro de 2026</p>
<p><b>À Diretoria da Uningá</b><br>A/C: Sr. Ricardo Benedito de Oliveira, Reitor</p>
<h1>Proposta EduMaster Pro</h1>
<p><b>Uma plataforma única para a gestão acadêmica, administrativa, financeira e regulatória da Uningá.</b></p>
<p>Senhor Reitor e Diretoria,</p>
<p>A WMundi Technologies apresenta a proposta do <b>EduMaster Pro</b>, plataforma que reúne em um só ambiente a Reitoria, a secretaria, o acadêmico, o AVA, o financeiro e a cobrança, o atendimento por IA, o jurídico, o RH, o regulatório e a contabilidade. Ela substitui, de forma gradual e sem parada na operação, os sistemas que hoje a Uningá utiliza: <b>Jacad, Flugo, Dynadoc, Octadesk e Leadlovers</b>.</p>
<h2>O que a Uningá recebe</h2>
<ul>
<li><b>Gestão da Reitoria:</b> indicadores, metas, agenda, convênios, governança e painel de excelência do MEC.</li>
<li><b>Acadêmico e secretaria:</b> matrículas, matrizes, notas, frequência, documentos, certificados e diplomas com verificação.</li>
<li><b>AVA e portais</b> do aluno, do professor e do polo, com preparação para ENADE, ENAMED e OAB.</li>
<li><b>Salas, laboratórios e horários</b> com geração automática da grade e aviso aos alunos (substitui o Flugo).</li>
<li><b>Atendimento e captação:</b> agentes de IA para WhatsApp, Instagram, Facebook, site, telefone e secretaria, com alerta sonoro quando uma pessoa precisa responder (substitui Octadesk e Leadlovers).</li>
<li><b>Financeiro e cobrança:</b> boletos, Pix, cartão, DDA, caixa de autorização de boletos e régua de cobrança.</li>
<li><b>Mensageiro interno</b> entre departamentos, com respostas automáticas por setor.</li>
<li><b>Contabilidade integrada:</b> regime fiscal, notas, guias, conciliação, DRE, RH e departamento pessoal, imposto de renda e assistente de IA.</li>
<li><b>Segurança e LGPD:</b> criptografia, autenticação em duas etapas, auditoria, isolamento de dados e dados sob a guarda da instituição.</li>
</ul>
</div><div class="ft"><b>Instituto Ravel de Ensino Superior Ltda</b> (WMundi Technologies) · CNPJ 03.162.275/0001-10 · Av. XV de Novembro, 255, sala C, Maringá/PR · info@wmundi.com · www.wmundi.com · WhatsApp (44) 99946-6451</div></section>

<section class="pg"><div class="top"></div>
<div class="hd"><img src="data:image/png;base64,${wm}"><img class="u" src="data:image/png;base64,${un}"></div>
<div class="c">
<h2>Implantação: 90 dias, mais 30 de convivência</h2>
<table><tr><th>Período</th><th>Entregas</th></tr>
<tr><td class="n">Dias 1 a 30</td><td>Identidade da Uningá, cargos e cadastros; salas, laboratórios e horários; leads e captação; atendimento e canais com agentes de IA; mensageiro interno</td></tr>
<tr><td class="n">Dias 31 a 60</td><td>Migração do Jacad (alunos, matrículas, notas e financeiro) conferida junto com a Uningá; documentos e assinaturas; financeiro, boletos, DDA e cobrança</td></tr>
<tr><td class="n">Dias 61 a 90</td><td>Treinamento por setor, automações finais, regulatório, relatórios da Reitoria e virada oficial, de preferência no início de um semestre</td></tr>
<tr><td class="n">Dias 91 a 120</td><td>Convivência assistida e desligamento gradual dos sistemas atuais</td></tr></table>
<p>Um agente da WMundi acompanha a Uningá presencialmente durante toda a implantação.</p>
<h2>Personalização e atualizações</h2>
<ul><li>Marca, cores, cargos, fluxos, modelos de documentos, relatórios e portais com a identidade e o regimento da Uningá.</li>
<li><b>Atualizações mensais incluídas</b>, com os pedidos da Uningá priorizados em um roteiro compartilhado; correções e segurança aplicadas sem custo.</li></ul>
<h2>Investimento</h2>
<table><tr><th>Item</th><th>Condição</th></tr>
<tr><td class="n">Mensalidade</td><td><b>R$ 41.900,00 por mês</b>, com franquia de até <b>20.000 alunos ativos</b></td></tr>
<tr><td class="n">Acima da franquia</td><td>R$ 1,20 por aluno ativo adicional, por mês</td></tr>
<tr><td class="n">Implantação e integrações</td><td>Tarifa única de <b>R$ 30.000,00</b>: 10 parcelas de R$ 3.000,00 ou <b>R$ 27.000,00 à vista</b> (10% de desconto). Inclui agente presencial, migração e as conexões com Jacad, Flugo, Dynadoc, Octadesk e Leadlovers</td></tr>
<tr><td class="n">IA, WhatsApp e SMS</td><td>Contratados e pagos diretamente aos fornecedores, sem intermediação nem margem da WMundi</td></tr>
<tr><td class="n">Aplicativos Apple e Android</td><td>Opcional: R$ 50.000,00 em 10 parcelas de R$ 5.000,00; hospedagem de R$ 1.690,00 por mês mais R$ 1,02 por aplicativo baixado, por mês</td></tr>
<tr><td class="n">Polos e unidades avançadas</td><td>Módulos adicionais com orçamento combinado previamente</td></tr></table>
<div class="box"><b>Conheça o sistema na prática.</b> A demonstração, personalizada com as cores e a marca da Uningá, está disponível por <b>20 dias, até 07/12/2026</b>:<br><a href="${URL}">${URL}</a><br>Usuário: <b>apresentacao@uninga.br</b> · Senha: <b>Uninga@2026</b></div>
<p>Estamos à disposição para agendar uma apresentação à Diretoria e iniciar o planejamento da implantação.</p>
<p class="sig">Atenciosamente,<br><b>Prof. Me. Robson Ravel de Oliveira</b><br>Diretoria Comercial<br>WMundi Technologies</p>
</div><div class="ft"><b>Instituto Ravel de Ensino Superior Ltda</b> (WMundi Technologies) · CNPJ 03.162.275/0001-10 · Av. XV de Novembro, 255, sala C, Maringá/PR · info@wmundi.com · www.wmundi.com · WhatsApp (44) 99946-6451</div></section>
</body></html>`;
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent(html, { waitUntil: 'load' });
  await pg.pdf({ path: path.join(__dirname, 'carta-proposta-uninga.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  fs.writeFileSync(path.join(__dirname, 'carta-proposta-uninga.html'), html);
  await b.close(); console.log('ok');
})();
