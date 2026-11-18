// Gera a carta-proposta à Pró-Reitoria da Uningá (A4 retrato) e o cronograma de implantação (A4 paisagem).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const b64 = (p) => fs.readFileSync(path.join(__dirname, p)).toString('base64');
const wm = b64('../../../frontend/public/wmundi-logo.png');
const un = b64('../../../frontend/public/brand/uninga-logo.png');
const BASE = 'https://web-production-5398c.up.railway.app';
const KEY = process.env.DEMO_KEY || '';
const LINK = KEY ? `${BASE}/?acesso=${KEY}` : BASE;
const APRES = `${BASE}/apresentacao/index.html`, APRES_PDF = `${BASE}/apresentacao-edumaster.pdf`;
const RODAPE = '<b>Instituto Ravel de Ensino Superior Ltda</b> (WMundi® Technologies) · CNPJ 03.162.275/0001-10 · Av. XV de Novembro, 255, sala C, Maringá/PR · info@wmundi.com · www.wmundi.com · WhatsApp (44) 99946-6451';
const CSS = `
*{box-sizing:border-box}body{margin:0;font-family:Helvetica,Arial,sans-serif;color:#1f2937;font-size:10.5pt;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{position:relative;page-break-after:always;overflow:hidden}.top{height:10mm;background:linear-gradient(90deg,#EC6236 0 55%,#3162A9 55% 85%,#A32D3B 85%)}
.hd{display:flex;justify-content:space-between;align-items:center}.hd img{height:13mm}.rg{font-size:11pt;font-weight:700;margin-left:1px;vertical-align:top}.hd .w{display:flex;align-items:flex-start}.hd .u{height:15mm}
h1{color:#3162A9;font-size:19pt;margin:2mm 0 1mm}h2{color:#3162A9;font-size:12.5pt;margin:4.5mm 0 2mm;border-left:4px solid #EC6236;padding-left:8px}
p{margin:0 0 3mm}ul{margin:0 0 3mm;padding-left:18px}li{margin:1.2mm 0}table{width:100%;border-collapse:collapse;margin:2mm 0 3mm;font-size:10pt}
td,th{padding:2mm 3mm;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top}th{background:#3162A9;color:#fff;font-size:10pt}td.n{font-weight:700;color:#3162A9;width:30%}
.box{background:#fff4ee;border:1px solid #EC6236;border-radius:3mm;padding:4mm 5mm;margin:3mm 0}.sig{margin-top:5mm}a{color:#3162A9;font-weight:700;text-decoration:none}
.ft{position:absolute;bottom:7mm;left:20mm;right:20mm;font-size:8.5pt;color:#6b7280;border-top:2px solid #A32D3B;padding-top:2mm}`;
const head = '<div class="top"></div><div class="hd" style="padding:9mm 20mm 4mm"><span class="w"><img src="data:image/png;base64,' + wm + '"><span class="rg">®</span></span><img class="u" src="data:image/png;base64,' + un + '"></div>';

const carta = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Carta-proposta · EduMaster Pro · Uningá</title><style>@page{size:A4;margin:0}${CSS}.pg{width:210mm;height:297mm}.c{padding:0 20mm}body{font-size:9.5pt;line-height:1.32}td,th{padding:1.3mm 2.6mm!important}table{font-size:9.2pt!important;margin:1mm 0 2mm!important}p{margin-bottom:2mm}h2{margin:3mm 0 1.4mm}h1{font-size:17pt}.box{padding:3mm 4mm;margin:2mm 0}li{margin:.8mm 0}.sig{margin-top:3mm}</style></head><body>
<section class="pg">${head}<div class="c">
<p style="color:#6b7280">Maringá, 18 de novembro de 2026</p>
<p><b>À Pró-Reitoria da Uningá</b><br>Profa. Bruna Molinari, Pró-Reitora<br><span style="color:#6b7280">C/c: Sr. Ricardo Benedito de Oliveira, Reitor</span></p>
<h1>Proposta EduMaster Pro</h1>
<p><b>Toda a Uningá em uma única plataforma, com a sua identidade, pronta para entrar em operação logo após o encerramento das aulas.</b></p>
<p>Prezada Pró-Reitora,</p>
<p>Agradecemos a oportunidade de apresentar o <b>EduMaster Pro</b> à Uningá. Reunimos nesta carta o que a plataforma entrega, o caminho para a implantação nos próximos 90 dias e os links para que a Diretoria, o Ensino Presencial, a Educação a Distância e a Diretoria de TI conheçam o sistema funcionando.</p>
<h2>Conheça agora</h2>
<div class="box"><b>1. Apresentação (34 telas):</b><br><a href="${APRES}">${APRES.replace('https://', '')}</a><br><span style="font-size:9pt">PDF para download: <a href="${APRES_PDF}">${APRES_PDF.replace('https://', '')}</a></span><br><br>
<b>2. Sistema para testar, com a marca da Uningá${KEY ? ' (acesso direto, sem login e senha)' : ''}:</b><br><a href="${LINK}">${LINK.replace('https://', '')}</a><br>
<span style="font-size:9pt">Se preferir entrar com usuário e senha: <a href="${BASE}">${BASE.replace('https://', '')}</a> · Usuário <b>apresentacao@uninga.br</b> · Senha <b>Uninga@2026</b> · disponível até 07/12/2026</span></div>
<h2>O que a plataforma entrega</h2>
<table><tr><th>Área</th><th>Resultados para a Uningá</th></tr>
<tr><td class="n">Reitoria e Diretoria</td><td>Indicadores, metas e comparativos em tempo real, painel de excelência do MEC, governança, convênios e visão financeira consolidada</td></tr>
<tr><td class="n">Financeiro e cobrança</td><td>Contas a receber e a pagar, conciliação bancária, boletos e DDA, régua de cobrança automática, acordos e recuperação da inadimplência</td></tr>
<tr><td class="n">Ensino presencial e EAD</td><td>Matrículas, notas e frequência, AVA com videoaulas, grade de salas e laboratórios, polos, tutoria, acompanhamento virtual do aluno por e-mail e preparação para ENADE, ENAMED e OAB</td></tr>
<tr><td class="n">Jurídico e regulatório</td><td>Contratos, processos e inteligência para reduzir a recorrência de ações; processos do MEC, CPA, NDE e PDI</td></tr>
<tr><td class="n">Pessoas e segurança</td><td>Portal do colaborador (declarações, POPs, treinamentos e EPIs), CIPA com registro de CAT e confirmação de providências, controle de entrada e saída</td></tr>
<tr><td class="n">Operação</td><td>Compras com acompanhamento até o setor, lavanderia e rouparia, infraestrutura, atendimento por IA, marketing e captação</td></tr>
<tr><td class="n">Diretoria de TI</td><td>Substitui Jacad, Flugo, Dynadoc, Octadesk e Leadlovers; perfis e polos por gestor, autenticação em 2 etapas e reconhecimento facial opcionais, criptografia, auditoria e LGPD</td></tr></table>
</div><div class="ft">${RODAPE}</div></section>

<section class="pg">${head}<div class="c">
<h2>Implantação em 90 dias, com os setores críticos primeiro</h2>
<table><tr><th style="width:21%">Período</th><th>O que acontece</th></tr>
<tr><td class="n">Semanas 1 a 4</td><td>Kick-off, cargos, identidade e cadastro único; <b>mapeamento bancário</b>; primeira carga do ambiente Presencial; credenciais e espaços do controle de acesso; financeiro em modo espelho</td></tr>
<tr><td class="n">Semanas 5 a 8</td><td>Migração assistida e conferência com os setores; ambiente EAD; atendimento com IA; <b>homologação das remessas com os bancos</b> e lote-piloto com dupla autorização; piloto de portaria e biblioteca</td></tr>
<tr><td class="n">Semanas 9 a 12</td><td>Pós-graduação e polos piloto; <b>virada do financeiro banco a banco</b>, com plano de retorno; virada acadêmica no início do semestre; expansão do controle de acesso; painéis da Reitoria; treinamento por setor</td></tr>
<tr><td class="n">Semana 13 em diante</td><td>Convivência assistida e acompanhamento diário; demais módulos (RH, contabilidade, CIPA, lavanderia, compras, jurídico e marketing) por ordem de prioridade definida com a Diretoria</td></tr></table>
<p style="font-size:9.5pt;color:#4b5563">O cronograma completo, a integração bancária, o controle de entrada e saída e os ambientes estão no documento <b>“Cronograma de implantação”</b>, enviado junto com esta carta.</p>
<h2>Equipe à disposição da Uningá</h2>
<ul><li><b>Um profissional da WMundi® à disposição da Uningá por 6 horas diárias</b>, inclusive com <b>visitas presenciais</b> durante o processo de instalação, <b>sem custo adicional nos 6 primeiros meses</b>.</li>
<li>Depois desse período, a Uningá arca <b>somente com deslocamento, estadia e alimentação</b>, caso necessite de assistência presencial.</li>
<li><b>Personalização completa</b> (marca, cargos, fluxos, modelos e relatórios) e <b>atualizações mensais incluídas</b>.</li></ul>
<h2>Investimento</h2>
<table><tr><td class="n">Mensalidade e valor por aluno</td><td><b>A definir em conjunto com a Diretoria</b></td></tr>
<tr><td class="n">Implantação e integrações</td><td><b>A definir em conjunto com a Diretoria</b>, incluindo a equipe dedicada descrita acima</td></tr>
<tr><td class="n">Aplicativos (opcional)</td><td>Desenvolvimento e hospedagem: <b>a definir em conjunto com a Diretoria</b></td></tr>
<tr><td class="n">Serviços de terceiros</td><td>IA, WhatsApp, SMS e e-mail contratados e pagos diretamente aos fornecedores, sem margem da WMundi®</td></tr></table>
<h2>Próximos passos</h2>
<p>Para que a implantação comece assim que as aulas forem encerradas, nos colocamos à disposição para ajustar e formalizar o contrato nos próximos dias úteis e para realizar a <b>apresentação de cerca de 90 minutos</b> à Diretoria, ao Ensino Presencial, à EAD e à Diretoria de TI, na data que a Pró-Reitoria indicar.</p>
<p class="sig">Atenciosamente,<br><b>Prof. Me. Robson Ravel de Oliveira</b><br>Diretoria Comercial<br>WMundi® Technologies</p>
</div><div class="ft">${RODAPE}</div></section></body></html>`;

const W = 13;
const gantt = (rows) => `<table class="g"><tr><th class="gl">Frente</th>${Array.from({ length: W }, (_, i) => `<th>S${i + 1}</th>`).join('')}</tr>${rows.map(([n, segs]) => { let c = 1, t = ''; for (const [a, b, r, k] of segs) { if (a > c) t += `<td colspan="${a - c}"></td>`; t += `<td colspan="${b - a + 1}"><div class="b ${k}">${r}</div></td>`; c = b + 1 } if (c <= W) t += `<td colspan="${W - c + 1}"></td>`; return `<tr><td class="gl">${n}</td>${t}</tr>` }).join('')}</table>`;
const cron = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cronograma de implantação · EduMaster Pro · Uningá</title><style>@page{size:A4 landscape;margin:0}${CSS}.pg{width:297mm;height:210mm}.c{padding:0 14mm}h2{margin:3mm 0 2mm}
.g{table-layout:fixed;border-collapse:separate;border-spacing:0 1.4mm;font-size:8.5pt;margin:0}.g th{background:none;color:#6b7280;border:0;padding:0;text-align:center;font-size:8.5pt}.g th.gl{width:62mm;text-align:left}.g td{border:0;padding:0 .6mm;height:8mm}.g td.gl{font-weight:700;color:#0B2A55;font-size:9pt;line-height:1.1}
.b{height:7.4mm;border-radius:2mm;color:#fff;font-weight:700;font-size:8pt;display:flex;align-items:center;padding:0 2mm;line-height:1.05;overflow:hidden}.b1{background:#3162A9}.b2{background:#4f86d6}.b3{background:#EC6236}.b4{background:#A32D3B}.b5{background:#0B2A55}
.cols{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm}.cd{border:1px solid #e5e7eb;border-top:3px solid #3162A9;border-radius:2mm;padding:3mm;font-size:9pt}.cd b{display:block;color:#0B2A55;margin-bottom:1mm;font-size:10pt}.cd p{margin:0 0 1.2mm}
.ft{left:14mm;right:14mm}.sm{font-size:9pt}.sm li{margin:.8mm 0}</style></head><body>
<section class="pg">${head.replace('padding:9mm 20mm 4mm', 'padding:4mm 14mm 1mm')}<div class="c">
<h1 style="font-size:17pt;margin:0">Cronograma de implantação · 90 dias</h1>
<p class="sm" style="color:#4b5563;margin:0 0 1mm">Setores críticos primeiro. Semana 1 = início da implantação, logo após o encerramento das aulas.</p>
${gantt([
  ['Fundação: equipe, cargos, identidade e cadastro único', [[1, 2, 'Kick-off e acessos', 'b1'], [3, 5, 'Cadastros conferidos', 'b2']]],
  ['Financeiro e bancos', [[1, 2, 'Mapeamento', 'b1'], [3, 6, 'Modo espelho (somente leitura)', 'b2'], [7, 9, 'Homologação', 'b3'], [10, 12, 'Virada por banco', 'b4'], [13, 13, 'Acomp.', 'b5']]],
  ['Acadêmico e secretaria', [[2, 5, 'Migração assistida', 'b1'], [6, 9, 'Conferência e treino', 'b2'], [10, 12, 'Virada do semestre', 'b4'], [13, 13, 'Acomp.', 'b5']]],
  ['Entrada e saída', [[3, 5, 'Espaços e credenciais', 'b1'], [6, 9, 'Piloto: portaria e biblioteca', 'b3'], [10, 12, 'Expansão por bloco', 'b4']]],
  ['Ambientes de ensino', [[2, 5, 'Presencial', 'b1'], [6, 8, 'EAD', 'b2'], [9, 10, 'Pós', 'b3'], [11, 12, 'Polos piloto', 'b4']]],
  ['Atendimento com IA, Reitoria e BI', [[5, 9, 'Atendimento e mensageiro', 'b2'], [10, 12, 'Painéis da Reitoria', 'b3']]],
  ['Treinamento por setor', [[4, 12, 'Turmas por setor, com material e assistente de ajuda dentro do sistema', 'b3']]],
])}
<h2>Integração bancária sem risco para o financeiro</h2>
<div class="cols">
<div class="cd"><b>1 · Mapeamento (S1–S2)</b><p>Contas, convênios de cobrança, carteiras, layouts de remessa e retorno, DDA e Pix de cada banco; responsáveis e alçadas da Uningá.</p></div>
<div class="cd"><b>2 · Modo espelho (S3–S6)</b><p>Extratos conciliados em paralelo ao processo atual. O sistema não emite boleto nem pagamento; divergências aparecem no painel.</p></div>
<div class="cd"><b>3 · Homologação (S7–S9)</b><p>Remessa e retorno testados com os bancos; lote-piloto de baixo valor com dupla conferência e dupla autorização.</p></div>
<div class="cd"><b>4 · Virada por banco (S10–S12)</b><p>Um banco ou convênio por vez, com plano de retorno e conferência diária entre extrato e sistema por 30 dias.</p></div></div>
<p class="sm" style="margin-top:2mm"><b>Controles:</b> fila de conferência e autorização antes de qualquer pagamento · conciliação diária · permissões por cargo e 2 etapas para quem autoriza · trilha de auditoria de todas as operações.</p>
</div><div class="ft">${RODAPE}</div></section>

<section class="pg">${head.replace('padding:9mm 20mm 4mm', 'padding:4mm 14mm 1mm')}<div class="c">
<div class="cols" style="grid-template-columns:1fr 1fr;gap:6mm">
<div><h2>Controle de entrada e saída</h2>
<p class="sm">Alunos, colaboradores e visitantes identificados por carteirinha com QR, código ou reconhecimento facial (opcional, com consentimento e prova de vivacidade), com registro de entrada, saída, visitantes, empréstimos e alertas ao responsável.</p>
<table class="sm"><tr><td class="n" style="width:26%">S3 a S5</td><td>Mapa de espaços e portarias, regras por perfil e horário, emissão das carteirinhas e cadastro facial voluntário</td></tr>
<tr><td class="n">S6 a S9</td><td>Piloto na portaria principal, biblioteca e laboratórios, com relatório diário ao responsável</td></tr>
<tr><td class="n">S10 a S12</td><td>Demais blocos e polos; presença nas aulas pela mesma identificação; relatórios de acesso à Diretoria</td></tr></table>
<p class="sm">A integração com catracas e leitores já instalados é definida com a Diretoria de TI conforme o modelo de cada equipamento. Enquanto isso, tablets e celulares funcionam como pontos de leitura.</p></div>
<div><h2>Ambientes no sistema</h2>
<table class="sm"><tr><td class="n" style="width:30%">S2 a S5 · Presencial</td><td>Cursos, matrizes, turmas, salas e portais do aluno e do professor, com a primeira carga de dados conferida pelos setores</td></tr>
<tr><td class="n">S6 a S8 · EAD</td><td>AVA, videoaulas, tutoria, engajamento e acompanhamento virtual do aluno por e-mail</td></tr>
<tr><td class="n">S9 a S10 · Pós</td><td>Turmas, calendário, financeiro e comunicação próprios, com a mesma identidade visual</td></tr>
<tr><td class="n">S11 a S12 · Polos</td><td>Polos piloto com gestor e acesso por polo; os demais seguem o cronograma combinado com a Diretoria</td></tr></table>
<p class="sm">Cada ambiente tem cadastros, relatórios e permissões próprios; a Reitoria enxerga todos em um só painel.</p></div></div>
<h2>Equipe à disposição da Uningá</h2>
<ul class="sm"><li><b>6 horas diárias</b> de um profissional da WMundi® à disposição da Uningá durante a implantação, inclusive com <b>visitas presenciais</b> durante o processo de instalação.</li>
<li><b>Sem custo adicional nos 6 primeiros meses.</b> Depois, a Uningá paga somente <b>deslocamento, estadia e alimentação</b> caso precise de assistência presencial.</li>
<li><b>Treinamento por setor</b> com material próprio e assistente de ajuda permanente dentro do sistema (ícone “?” em cada menu e busca “onde encontro...?”).</li></ul>
<h2>Depois dos 90 dias</h2>
<p class="sm">Os demais módulos entram por ordem de prioridade definida com a Diretoria: RH e portal do colaborador, contabilidade, CIPA e segurança do trabalho, compras com acompanhamento, lavanderia, jurídico, marketing e captação, campos de prática e regulatório MEC.</p>
</div><div class="ft">${RODAPE}</div></section></body></html>`;

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const [html, nome, land] of [[carta, 'carta-proposta-pro-reitoria-uninga', false], [cron, 'cronograma-implantacao-uninga', true]]) {
    const pg = await b.newPage(); await pg.setContent(html, { waitUntil: 'load' });
    await pg.pdf({ path: path.join(__dirname, nome + '.pdf'), format: 'A4', landscape: land, printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(path.join(__dirname, nome + '.html'), html);
  }
  await b.close(); console.log('ok');
})();
