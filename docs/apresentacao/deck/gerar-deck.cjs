// Gera a apresentação comercial do EduMaster Pro® para a Uningá (HTML 16:9 + PDF).
// Uso: DEMO_KEY=<chave> node gerar-deck.cjs   (capturas de tela em ./shots/*.jpg)
const fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const QR = require('/home/user/dentalpos-one/frontend/node_modules/qrcode');
const D = __dirname, PUB = path.join(D, '../../../frontend/public');
const b64 = (p, mime = 'image/png') => `data:${mime};base64,` + fs.readFileSync(p).toString('base64');
const wm = b64(path.join(PUB, 'wmundi-logo.png'));
const un = b64(path.join(PUB, 'brand/uninga-logo.png'));
const BASE = 'https://web-production-5398c.up.railway.app';
const KEY = process.env.DEMO_KEY || '';
const LINK = KEY ? `${BASE}/?acesso=${KEY}` : BASE;
const shot = (n) => b64(path.join(D, 'shots', n + '.jpg'), 'image/jpeg');
const NOVAS = ['colaborador', 'colab-gestao', 'cipa-cat', 'cipa-instr', 'cipa-painel', 'lavanderia', 'compras', 'acesso-polos', 'seguranca', 'login'];
const win = (n, label, cls = '') => `<div class="win ${cls}" style="--s:url(${shot(n)});${NOVAS.includes(n) ? '--o:-5.2cqw' : ''}"><div class="bar"><i></i><i></i><i></i><span>${label}</span></div><div class="hd"></div><div class="bd"></div></div>`;
const li = (arr) => `<ul>${arr.map((t) => `<li>${t}</li>`).join('')}</ul>`;
const chips = (arr) => `<div class="chips">${arr.map((t) => `<span>${t}</span>`).join('')}</div>`;

const gantt = (rows) => {
  const W = 13, head = `<tr><th class="gl">Frente</th>${Array.from({ length: W }, (_, i) => `<th>S${i + 1}</th>`).join('')}</tr>`;
  const body = rows.map(([nome, segs]) => {
    let c = 1, tds = '';
    for (const [a, b, rot, cor] of segs) {
      if (a > c) tds += `<td colspan="${a - c}" class="e"></td>`;
      tds += `<td colspan="${b - a + 1}"><div class="bar ${cor}">${rot}</div></td>`; c = b + 1;
    }
    if (c <= W) tds += `<td colspan="${W - c + 1}" class="e"></td>`;
    return `<tr><td class="gl">${nome}</td>${tds}</tr>`;
  }).join('');
  return `<table class="gantt">${head}${body}</table>`;
};
const S = [];
let num = 0;
const foot = (dark) => `<div class="ft ${dark ? 'd' : ''}"><span class="wml"></span><span class="fx">EduMaster Pro × Uningá</span><span class="pn">${String(num).padStart(2, '0')}</span></div>`;
const slide = (cls, html) => { num++; S.push(`<section class="s ${cls}">${html}${cls.includes('nofoot') ? '' : foot(cls.includes('dark'))}</section>`); };

// Slide de recurso: texto de um lado, tela do sistema do outro
const feat = ({ kicker, title, sub, bullets, shots, label, side = 'right', extra = '' }) => slide('light', `
<div class="fe ${side}">
  <div class="tx"><div class="kk">${kicker}</div><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}${bullets ? li(bullets) : ''}${extra}</div>
  <div class="vs">${shots.map((s, i) => win(s, label[i] || label[0], shots.length > 1 ? 'half' : '')).join('')}</div>
</div>`);

// 1 · capa
slide('dark cover nofoot', `
<div class="orb o1"></div><div class="orb o2"></div>
<div class="logos"><span class="pill"><img src="${wm}"><b>®</b></span><span class="x">×</span><span class="pill u"><img src="${un}"></span></div>
<div class="kk w">PROPOSTA EXCLUSIVA PARA A UNINGÁ</div>
<h1>EduMaster Pro</h1>
<p class="lead">Toda a Uningá em uma única plataforma: ensino presencial e EAD, financeiro e cobrança, jurídico, Reitoria e o relacionamento com cada aluno.</p>
<div class="cv-ft">Instituto Ravel de Ensino Superior Ltda · WMundi® Technologies · Maringá/PR · Novembro de 2026</div>`);

// 2 · cinco sistemas, uma plataforma
slide('light', `
<div class="kk">UMA PLATAFORMA, CINCO SISTEMAS A MENOS</div>
<h2 class="big">Tudo o que a Uningá usa hoje, em um só lugar</h2>
<div class="grid5">
  <div class="card"><div class="old">Jacad</div><div class="arr">↓</div><b>Acadêmico e AVA</b><p>Matrículas, notas, frequência, sala virtual e portais</p></div>
  <div class="card"><div class="old">Flugo</div><div class="arr">↓</div><b>Salas e horários</b><p>Grade gerada automaticamente, com aviso aos alunos</p></div>
  <div class="card"><div class="old">Dynadoc</div><div class="arr">↓</div><b>Documentos e assinaturas</b><p>Requerimentos, certificados e diplomas com verificação</p></div>
  <div class="card"><div class="old">Octadesk</div><div class="arr">↓</div><b>Atendimento com IA</b><p>WhatsApp, Instagram, site e telefone na mesma caixa</p></div>
  <div class="card"><div class="old">Leadlovers</div><div class="arr">↓</div><b>Captação e funil</b><p>Leads, campanhas, vestibular e matrícula</p></div>
</div>
<p class="note">Um cadastro único do aluno, do primeiro contato ao diploma, com a identidade visual da Uningá em todas as telas.</p>`);

// 3 · mapa da plataforma
slide('light', `
<div class="kk">VISÃO GERAL</div>
<h2 class="big">A plataforma completa da instituição</h2>
<div class="tiles">
${[['Reitoria e BI', 'Painéis, metas e comparativos'], ['AVA e portais', 'Aluno, professor e polo'], ['Secretaria', 'Documentos, certificados e diplomas'], ['Financeiro', 'Tesouraria, boletos e DDA'], ['Cobrança', 'Régua, acordos e recuperação'], ['Jurídico preventivo', 'Contratos, processos e prevenção'], ['ENADE · ENAMED · OAB', 'Simulados e prontidão'], ['Marketing e captação', 'Funil, campanhas e vestibular'], ['Atendimento com IA', 'Omnichannel e mensageiro'], ['Regulatório MEC', 'Processos e excelência'], ['Campos de prática', 'Estágios e aulas práticas'], ['Contabilidade integrada', 'Fiscal, folha e carteira'], ['RH e portal do colaborador', 'Declarações, POPs e EPIs'], ['CIPA e segurança', 'Brigada, CAT e emergência'], ['Lavanderia e compras', 'Jornada e rastreio por etapa'], ['Acesso seguro', 'Facial, 2 etapas e polos']].map(([a, b], i) => `<div class="tile t${i % 3}"><b>${a}</b><span>${b}</span></div>`).join('')}
</div>`);

feat({ kicker: 'REITORIA', title: 'Decisão com dados, em tempo real', sub: 'O painel executivo reúne os indicadores de toda a instituição em uma única tela.',
  bullets: ['<b>Saúde geral da instituição</b> com semáforo, variação e meta por indicador', '<b>Alertas inteligentes</b>: inadimplência, despesas, ordens de serviço e pendências críticas', '<b>Metas e OKRs</b> acompanhados por check-ins', '<b>Assistente de IA da Reitoria</b> para consultas em linguagem natural', 'Relatório executivo para <b>imprimir ou exportar</b> em um clique'],
  shots: ['reitoria'], label: ['EduMaster Pro · Painel executivo'] });

feat({ kicker: 'RELATÓRIOS PARA REITORIA E ADMINISTRAÇÃO', title: 'Painéis que respondem antes da pergunta', sub: 'Cada gestor enxerga o seu painel, do financeiro ao acadêmico, com histórico diário.',
  bullets: ['Painéis por perfil: <b>Reitoria, Administração, Coordenação, Secretaria, Professor, Biblioteca, Infraestrutura e Admissões</b>', '<b>Resultado do período, margem, inadimplência e fluxo de caixa</b> realizado e projetado', '<b>Comparativo com outras IES</b>, convênios, agenda e acompanhamento do Diário Oficial', 'Exportação em CSV e impressão para reuniões de diretoria'],
  shots: ['paineis', 'comparativo'], label: ['EduMaster Pro · Painéis executivos', 'EduMaster Pro · Comparativo'], side: 'right' });

feat({ kicker: 'AVA E PORTAL DO ALUNO', title: 'A sala de aula virtual que o aluno quer usar', sub: 'Tudo o que o aluno precisa para estudar, em um só portal, no computador ou no celular.',
  bullets: ['<b>Sala virtual por disciplina</b> com videoaulas, aulas gravadas, materiais e trilhas', '<b>Aulas ao vivo</b> com o Meet, Teams ou Zoom que a Uningá já utiliza', '<b>Atividades com entrega e correção</b>, fóruns e recados da turma', '<b>Notas, frequência, financeiro e requerimentos</b> no mesmo lugar', '<b>Flashcards e simulados</b> para ENADE, ENAMED e OAB', '<b>Portal do professor</b> com diário, frequência, notas, banco de questões e gerador de provas com IA'],
  shots: ['aluno-portal'], label: ['EduMaster Pro · Portal do aluno'], side: 'left' });

feat({ kicker: 'PERMANÊNCIA E ENGAJAMENTO', title: 'Acompanhamento virtual do aluno', sub: 'Um assistente que incentiva, lembra e traz o aluno de volta, por e-mail, sem trabalho manual.',
  bullets: ['<b>Volta aos estudos</b>: convite carinhoso para quem ficou dias sem acessar', '<b>Videoaulas e atividades</b>: lembrete do que está pendente e dos prazos', '<b>Provas, aulas práticas, estágios, PIESC e ENADE</b>: aviso antes de cada data', '<b>Resumo semanal</b> com a agenda de estudos de cada aluno', 'Textos editáveis, limite de e-mails por aluno e opção de sair a qualquer momento'],
  shots: ['acompanhamento'], label: ['EduMaster Pro · Acompanhamento do aluno'], side: 'right' });

feat({ kicker: 'COBRANÇA', title: 'Recuperação de receita com método', sub: 'A inadimplência da Uningá em um painel, com a política e a régua que a instituição definir.',
  bullets: ['<b>Painel de inadimplência</b> com aging por faixa de atraso, saldo atualizado e taxa', '<b>Política configurável</b>: tolerância, multa, juros e correção', '<b>Acordos e negociações</b> com promessas e acompanhamento das parcelas', '<b>Histórico de contatos</b> em conformidade com o CDC e a LGPD', '<b>Escalonamento ao Jurídico</b> com um clique quando necessário'],
  shots: ['cobranca'], label: ['EduMaster Pro · Cobrança e inadimplência'], side: 'right' });

feat({ kicker: 'RÉGUA DE COBRANÇA', title: 'O aluno lembrado na hora certa, no canal certo', sub: 'Mensagens automáticas antes e depois do vencimento, que param sozinhas quando o pagamento entra.',
  bullets: ['Etapas como <b>D-3, no dia, D+3 e D+10</b>, com recorrência até a resolução', '<b>WhatsApp, e-mail, SMS e voz</b>, com canal alternativo quando faltar contato', 'Cobrança <b>suspensa automaticamente</b> para quem já pagou', 'Respeito ao <b>opt-out</b>: quem pede para sair deixa de receber', 'Simulação antes de enviar: veja quem receberia e o texto final'],
  shots: ['regua'], label: ['EduMaster Pro · Régua de cobrança'], side: 'left' });

feat({ kicker: 'FINANCEIRO', title: 'Facilidade para o financeiro, controle para a diretoria', sub: 'Do contas a receber ao contas a pagar, com autorização, conferência e conciliação.',
  bullets: ['<b>Caixa de boletos</b> por DDA e e-mail dedicado, com conferência de autenticidade', '<b>Autorização com alçadas e dupla aprovação</b>, em lote ou individual', '<b>Contas recorrentes</b> lançadas automaticamente', '<b>Bancos, conciliação, notas fiscais e recibos</b> no mesmo painel', 'Boletos, Pix e cartão para o aluno'],
  shots: ['financeiro'], label: ['EduMaster Pro · Financeiro'], side: 'right' });

feat({ kicker: 'JURÍDICO PREVENTIVO', title: 'Menos processos, mais segurança para a Uningá', sub: 'A inteligência de processos identifica a causa raiz e indica a prevenção, para reduzir recorrências.',
  bullets: ['<b>Inteligência de processos sofridos</b>: recorrência, causa raiz e plano de prevenção', '<b>Contratos, imóveis, aluguéis e contratos de polos EAD</b> com vencimentos monitorados', '<b>Processos judiciais e administrativos</b> com prazos e audiências em alerta', '<b>Riscos e seguros</b> em painel integrado à Reitoria e ao Financeiro', 'Sigilo por perfil e análise de contratos com IA'],
  shots: ['juridico'], label: ['EduMaster Pro · Jurídico'], side: 'left' });

feat({ kicker: 'ENADE · ENAMED · OAB', title: 'Resultado nos exames começa na preparação', sub: 'Trilhas, simulados e acompanhamento do preparo de cada curso, do aluno à coordenação.',
  bullets: ['<b>Gerador de questões originais com IA</b>, inspiradas no padrão das provas', '<b>Simulados com tempo, correção automática e gabarito comentado</b>', '<b>Flashcards</b> e sugestões de estudo por lacuna de cada aluno', '<b>Painel de prontidão do curso</b>: alunos em risco, metas e calendário', 'Controle de inscritos e pendências do ENADE'],
  shots: ['exames', 'prontidao'], label: ['EduMaster Pro · ENADE · ENAMED · OAB', 'EduMaster Pro · Prontidão do curso'], side: 'right' });

// aulas particulares
slide('light', `
<div class="kk">NOVA RECEITA PARA A UNINGÁ</div>
<h2 class="big">Aulas particulares com os próprios professores</h2>
<p class="sub w80">Um programa em que o professor parceiro oferece aulas particulares e mentorias aos alunos pela estrutura da Uningá, gerando receita compartilhada e retendo talentos.</p>
<div class="flow">
  <div class="st"><i>1</i><b>Professor parceiro</b><p>Publica horários, temas e valor das aulas</p></div>
  <div class="st"><i>2</i><b>Aluno agenda</b><p>Escolhe professor e horário pelo portal</p></div>
  <div class="st"><i>3</i><b>Uningá organiza</b><p>Sala ou laboratório reservados na grade</p></div>
  <div class="st"><i>4</i><b>Receita compartilhada</b><p>Repasse ao professor e retorno à instituição</p></div>
</div>
<p class="note">Integra-se à agenda de salas, ao financeiro e ao portal do aluno. Entra no roteiro de atualizações mensais, priorizado junto com a Uningá.</p>`);

feat({ kicker: 'SECRETARIA', title: 'Secretaria ágil, documentos com autenticidade', sub: 'Protocolo, requerimentos, certificados e diplomas em um fluxo único, com prazo e responsável.',
  bullets: ['<b>Funil de requerimentos</b> com SLA, responsáveis e alertas de prazo', '<b>Análise de documentos com IA</b> na matrícula e na rematrícula', '<b>Certificados, diplomas e colação</b> com verificação de autenticidade', '<b>Emissão de declarações e históricos</b> com modelos da Uningá', 'Arquivo digital e portal de autoatendimento para o aluno'],
  shots: ['secretaria'], label: ['EduMaster Pro · Secretaria acadêmica'], side: 'left' });

feat({ kicker: 'MARKETING E CAPTAÇÃO', title: 'Do primeiro contato à matrícula', sub: 'Funil, campanhas e vestibular com custo por aluno e retorno visíveis.',
  bullets: ['<b>Funil de captação</b>: leads, contatados, qualificados e matriculados', '<b>Custo por lead, custo por aluno (CAC) e ROI</b> em tempo real', '<b>Gerador de peças com IA</b>, calendário e campanhas multicanal', '<b>Site e landing pages</b>, eventos e mídia offline', '<b>Vestibular e admissões</b> integrados ao acadêmico'],
  shots: ['marketing', 'admissoes'], label: ['EduMaster Pro · Marketing e captação', 'EduMaster Pro · Admissões'], side: 'right' });

feat({ kicker: 'ATENDIMENTO COM IA', title: 'Todos os canais, uma única caixa', sub: 'Agentes de IA atendem alunos e candidatos e chamam uma pessoa quando necessário.',
  bullets: ['<b>WhatsApp, Instagram, Facebook, site e telefone</b> na mesma central', '<b>Agentes de IA</b> com base de conhecimento da Uningá e alerta sonoro quando uma pessoa precisa responder', '<b>Protocolos, SLA e jornada</b> de cada atendimento', '<b>Mensageiro interno</b> entre departamentos, com respostas automáticas por setor'],
  shots: ['atendimento', 'mensagens'], label: ['EduMaster Pro · Central de atendimento', 'EduMaster Pro · Mensageiro interno'], side: 'left' });

feat({ kicker: 'SALAS E HORÁRIOS', title: 'A grade se monta sozinha', sub: 'Salas, laboratórios e professores combinados automaticamente, com aviso aos alunos.',
  bullets: ['<b>Geração automática</b> da grade por período, curso e campus', '<b>Detecção de conflitos</b> de sala, professor e turma', '<b>Reserva de laboratórios</b> e espaços especiais', '<b>Aviso aos alunos</b> por e-mail sobre sala e horário', 'Calendário acadêmico com feriados, provas e prazos'],
  shots: ['salas'], label: ['EduMaster Pro · Salas e horários'], side: 'right' });

feat({ kicker: 'EAD, POLOS E MODALIDADES', title: 'A rede de polos sob controle', sub: 'Gestão por polo e por modalidade, com engajamento e conformidade acompanhados.',
  bullets: ['<b>Rede e mapa de polos</b> com painel de cada unidade', '<b>Tutoria e engajamento</b> do aluno EAD, com alertas de inatividade', '<b>Ofertas automáticas</b> de segunda graduação e pós, com política configurável', 'Cobrança, provas presenciais, estágios e matrículas <b>por polo</b>'],
  shots: ['polos'], label: ['EduMaster Pro · Polos EAD'], side: 'left' });

feat({ kicker: 'REGULATÓRIO MEC', title: 'Preparada para a comissão de avaliação', sub: 'Processos, prazos e documentos do MEC organizados, com painel de excelência.',
  bullets: ['<b>Autorização, reconhecimento e renovação</b> com etapas e prazos', '<b>Painel de excelência</b> e simuladores de CPC e CC', '<b>Governança e PDI</b>, CPA, NDE e colegiados', 'Documentos e evidências sempre à mão'],
  shots: ['regulatorio', 'governanca'], label: ['EduMaster Pro · Regulatório MEC', 'EduMaster Pro · Governança e PDI'], side: 'right' });

feat({ kicker: 'CAMPOS DE PRÁTICA', title: 'Estágios e aulas práticas sem planilha', sub: 'Convênios, vagas, escalas e horas de cada aluno acompanhados em um painel.',
  bullets: ['<b>Convênios e vagas</b> com concedentes', '<b>Estágios</b> com documentos, horas, relatórios e avaliação', '<b>Escalas e agenda</b> das clínicas-escola e laboratórios', 'Aviso automático ao aluno sobre horas pendentes e prazos'],
  shots: ['campos'], label: ['EduMaster Pro · Campos de prática'], side: 'left' });

feat({ kicker: 'CONTABILIDADE INTEGRADA', title: 'Fiscal, folha e carteira de clientes', sub: 'Um módulo completo para a área contábil, integrado ao financeiro da instituição.',
  bullets: ['<b>Regime fiscal, notas, guias e obrigações</b> em painel único', '<b>RH e departamento pessoal</b>: folha, férias, 13º e rescisões', '<b>Conciliação bancária, DRE e balancete</b>', '<b>Assistente contábil com IA</b> e carteira de clientes para escritórios'],
  shots: ['contabil', 'rh'], label: ['EduMaster Pro · Contabilidade', 'EduMaster Pro · RH'], side: 'right' });


feat({ kicker: 'RH · PORTAL DO COLABORADOR', title: 'Cada colaborador com tudo o que precisa saber', sub: 'Um portal próprio, com declarações na hora, procedimentos, treinamentos e EPIs.',
  bullets: ['<b>A quem se reportar</b>: cadeia hierárquica e quem procurar em cada tipo de demanda', '<b>Declarações emitidas na hora</b> a partir de modelos configuráveis', '<b>POPs, instruções de trabalho, manuais e regras</b> do cargo e do setor, com ciência registrada', '<b>Treinamentos</b> obrigatórios com prazo e acompanhamento pelo RH', '<b>EPIs</b>: o que foi entregue e o aviso de quem ainda não retirou'],
  shots: ['colaborador', 'colab-gestao'], label: ['EduMaster Pro · Portal do colaborador', 'EduMaster Pro · Biblioteca e EPIs (RH)'], side: 'right' });

feat({ kicker: 'CIPA E SEGURANÇA DO TRABALHO', title: 'Prevenção, emergência e resposta rápida', sub: 'Membros, brigada, treinamentos e registro de acidentes com aviso e confirmação de providência.',
  bullets: ['<b>CIPA e brigada de incêndio</b> com mandatos, turnos e validade dos certificados', '<b>Calendário</b> de treinamentos, reuniões e simulados de abandono', '<b>Urgência, emergência, autossocorro e socorro ao próximo</b>, com limites de atuação e telefones', '<b>Registro de CAT</b> que avisa os responsáveis no sistema, por e-mail e WhatsApp', '<b>Reforço e escalonamento</b> automáticos até alguém confirmar a providência'],
  shots: ['cipa-cat', 'cipa-instr'], label: ['EduMaster Pro · Registro de CAT', 'EduMaster Pro · Urgência e emergência'], side: 'left' });

feat({ kicker: 'LAVANDERIA E COMPRAS', title: 'Cada peça e cada compra acompanhadas até o destino', sub: 'Logística combinada, etapas com responsável e conferência em cada passo.',
  bullets: ['<b>Lavanderia</b>: rol de rouparia por departamento e jornada de coleta, transporte, lavagem, retorno e entrega', '<b>Rotas combinadas</b> com dia, horário, transportador e prazo de retorno', '<b>Compras</b>: chegou, conferido, entrada no sistema, saiu para entrega e entregue ao setor', '<b>Responsável por etapa</b> e alerta de atraso'],
  shots: ['lavanderia', 'compras'], label: ['EduMaster Pro · Lavanderia e rouparia', 'EduMaster Pro · Acompanhamento de compras'], side: 'right' });

feat({ kicker: 'ACESSO SEGURO', title: 'Cada pessoa com o seu acesso e os seus polos', sub: 'Login e senha por perfil, com camadas de proteção que a instituição escolhe.',
  bullets: ['<b>Perfis</b>: aluno, professor, funcionário, administrativo, gestor, Reitoria', '<b>Gestor com um ou mais polos</b>, definidos pela administração', '<b>Recuperação de senha</b> desde o cadastro: cada pessoa recebe um link para criar a própria senha', '<b>Reconhecimento facial</b> opcional, com consentimento e prova de vivacidade', '<b>Autenticação em 2 etapas</b> ativada pelo usuário ou exigida por perfil'],
  shots: ['login', 'acesso-polos'], label: ['EduMaster Pro · Tela de acesso', 'EduMaster Pro · Acesso por polo'], side: 'left' });

// segurança
slide('dark', `
<div class="orb o1"></div>
<div class="kk w">SEGURANÇA E LGPD</div>
<h2 class="big w">Os dados da Uningá protegidos de ponta a ponta</h2>
<div class="sec">
${[['Criptografia', 'Comunicação HTTPS/TLS e dados sensíveis cifrados em repouso (AES-256-GCM)'], ['Acesso protegido', 'Senhas armazenadas apenas como hash, autenticação em duas etapas e bloqueio progressivo'], ['Isolamento', 'Dados separados por instituição, com perfis de acesso por cargo'], ['Auditoria', 'Registro de acessos a dados sensíveis e trilha de ações'], ['LGPD', 'Consentimentos, opt-out, mascaramento de dados e política de privacidade'], ['Dados sob a guarda da Uningá', 'Banco e chave de criptografia da própria instituição; a WMundi® não mantém cópia dos dados']].map(([a, b]) => `<div class="sc"><b>${a}</b><p>${b}</p></div>`).join('')}
</div>`);

// personalização e atualizações
slide('light', `
<div class="kk">PERSONALIZAÇÃO E EVOLUÇÃO CONTÍNUA</div>
<h2 class="big">A plataforma com a cara da Uningá, sempre evoluindo</h2>
<div class="two">
  <div class="card lg"><h3>Personalização completa</h3>${li(['Marca, cores e logomarca em telas, documentos e relatórios', 'Cargos e permissões configuráveis pela instituição', 'Fluxos de matrícula, rematrícula e aprovações conforme o regimento', 'Modelos de documentos, comunicados e réguas com os textos da Uningá', 'Campos e relatórios sob medida para a gestão', 'Assistente de treinamento permanente: ícone “?” em cada menu e busca “onde encontro...?”'])}</div>
  <div class="card lg"><h3>Atualizações mensais incluídas</h3>${li(['Uma versão nova por mês, com melhorias pedidas pela Uningá', 'Caixa de sugestões dentro do sistema: cada pedido entra no roteiro', 'Roteiro compartilhado e priorizado junto com a instituição', 'Correções e segurança aplicadas sem custo adicional', 'Novidades lançadas para todas as instituições chegam à Uningá'])}</div>
</div>`);

// cronograma
slide('light', `
<div class="kk">IMPLANTAÇÃO · 90 DIAS</div>
<h2 class="big" style="font-size:58px;margin-bottom:22px">Setores críticos primeiro, em 13 semanas</h2>
${gantt([
  ['Fundação: equipe, cargos, identidade, cadastro único', [[1, 2, 'Kick-off e acessos', 'b1'], [3, 5, 'Cadastros conferidos', 'b2']]],
  ['Financeiro e bancos', [[1, 2, 'Mapeamento', 'b1'], [3, 6, 'Modo espelho (só leitura)', 'b2'], [7, 9, 'Homologação', 'b3'], [10, 12, 'Virada por banco', 'b4'], [13, 13, 'Acomp.', 'b5']]],
  ['Acadêmico e secretaria', [[2, 5, 'Migração assistida', 'b1'], [6, 9, 'Conferência e treino', 'b2'], [10, 12, 'Virada do semestre', 'b4'], [13, 13, 'Acomp.', 'b5']]],
  ['Entrada e saída', [[3, 5, 'Espaços e credenciais', 'b1'], [6, 9, 'Piloto (portaria e biblioteca)', 'b3'], [10, 12, 'Expansão por bloco', 'b4']]],
  ['Ambientes de ensino', [[2, 5, 'Presencial', 'b1'], [6, 8, 'EAD', 'b2'], [9, 10, 'Pós', 'b3'], [11, 12, 'Polos piloto', 'b4']]],
  ['Atendimento com IA, Reitoria e BI', [[5, 9, 'Atendimento e mensageiro', 'b2'], [10, 12, 'Painéis da Reitoria', 'b3']]],
  ['Treinamento por setor', [[4, 12, 'Turmas por setor, com material e assistente de ajuda no sistema', 'b3']]],
])}
<p class="note" style="margin-top:22px;font-size:25px">Depois dos 90 dias, os demais módulos (RH, contabilidade, CIPA, lavanderia, compras, jurídico e marketing) entram na ordem de prioridade definida com a Diretoria.</p>`);

slide('light', `
<div class="kk">FINANCEIRO PROTEGIDO</div>
<h2 class="big" style="font-size:60px;margin-bottom:12px">Integração bancária sem risco para o caixa</h2>
<p class="sub">O dinheiro continua nas contas da Uningá, sob as regras da Uningá. O EduMaster Pro primeiro lê e confere; só passa a emitir depois de validado.</p>
<div class="flow">
  <div class="st"><i>1</i><b>Mapeamento</b><p>Semanas 1 e 2 · contas, convênios de cobrança, carteiras, layouts de remessa e retorno, DDA e Pix de cada banco, com responsáveis e alçadas</p></div>
  <div class="st"><i>2</i><b>Modo espelho</b><p>Semanas 3 a 6 · extratos conciliados em paralelo ao processo atual; o sistema não emite boleto nem pagamento; divergências aparecem no painel</p></div>
  <div class="st"><i>3</i><b>Homologação</b><p>Semanas 7 a 9 · remessa e retorno testados com os bancos; lote-piloto de baixo valor com dupla conferência e dupla autorização</p></div>
  <div class="st"><i>4</i><b>Virada por banco</b><p>Semanas 10 a 12 · um banco ou convênio por vez, com plano de retorno e conferência diária entre extrato e sistema por 30 dias</p></div>
</div>
<div class="inv2" style="grid-template-columns:repeat(4,1fr)">
  <div><b>Alçadas e autorização</b>fila de conferência e autorização antes de qualquer pagamento</div>
  <div><b>Conciliação diária</b>extrato bancário conferido com o sistema</div>
  <div><b>Acesso protegido</b>permissões por cargo e 2 etapas para quem autoriza pagamentos</div>
  <div><b>Trilha de auditoria</b>quem fez o quê e quando, em todas as operações</div>
</div>`);

slide('light', `
<div class="kk">CONTROLE DE ENTRADA E SAÍDA</div>
<h2 class="big" style="font-size:60px;margin-bottom:12px">Quem entra e quem sai, com registro e rastro</h2>
<p class="sub">Alunos, colaboradores e visitantes identificados por carteirinha com QR, código ou reconhecimento facial (opcional, com consentimento).</p>
<div class="flow" style="grid-template-columns:repeat(3,1fr)">
  <div class="st"><i>1</i><b>Semanas 3 a 5 · Preparação</b><p>Mapa de espaços e portarias, regras por perfil e horário, emissão das carteirinhas e cadastro facial voluntário</p></div>
  <div class="st"><i>2</i><b>Semanas 6 a 9 · Piloto</b><p>Portaria principal, biblioteca e laboratórios com registro de entrada, saída, visitantes e empréstimos, e alertas ao responsável</p></div>
  <div class="st"><i>3</i><b>Semanas 10 a 12 · Expansão</b><p>Demais blocos e polos, presença nas aulas pela mesma identificação e relatórios de acesso para a Diretoria</p></div>
</div>
<p class="note">A integração com catracas e leitores já instalados é avaliada com a Diretoria de TI conforme o modelo de cada equipamento; até lá, tablets e celulares funcionam como pontos de leitura.</p>`);

slide('light', `
<div class="kk">AMBIENTES NO SISTEMA</div>
<h2 class="big" style="font-size:60px;margin-bottom:12px">Cada ambiente da Uningá entra no ar no seu tempo</h2>
<div class="tl" style="grid-template-columns:repeat(4,1fr)">
  <div class="ph"><div class="d">Semanas 2 a 5</div><b>Graduação Presencial</b><p>Cursos, matrizes, turmas, salas e portais do aluno e do professor; primeira carga de dados conferida com os setores</p></div>
  <div class="ph"><div class="d">Semanas 6 a 8</div><b>Graduação EAD</b><p>AVA, videoaulas, tutoria, engajamento e acompanhamento virtual do aluno por e-mail</p></div>
  <div class="ph"><div class="d">Semanas 9 a 10</div><b>Pós-graduação</b><p>Turmas, calendário, financeiro e comunicação próprios, com a mesma identidade visual</p></div>
  <div class="ph"><div class="d">Semanas 11 a 12</div><b>Polos</b><p>Polos piloto com gestor e acesso por polo; os demais seguem o cronograma combinado com a Diretoria</p></div>
</div>
<p class="note">Cada ambiente tem seus próprios cadastros, relatórios e permissões, e a Reitoria enxerga todos em um só painel.</p>`);

slide('dark', `
<div class="orb o1"></div>
<div class="kk w">EQUIPE À DISPOSIÇÃO</div>
<h2 class="big w" style="font-size:62px">Acompanhamento próximo, do primeiro ao último dia</h2>
<div class="sec">
  <div class="sc"><b>6 horas por dia</b>Um profissional da WMundi® à disposição da Uningá, todos os dias, durante a implantação</div>
  <div class="sc"><b>Visitas presenciais</b>Presença na Uningá durante o processo de instalação, sem custo adicional nos 6 primeiros meses</div>
  <div class="sc"><b>Depois dos 6 meses</b>A Uningá paga somente deslocamento, estadia e alimentação quando precisar de assistência presencial</div>
</div>
<p class="note" style="background:rgba(255,255,255,.12);color:#fff;border-left-color:#EC6236;margin-top:40px">Após os 90 dias, os demais módulos entram por ordem de prioridade definida com a Diretoria, com a mesma equipe de acompanhamento.</p>`);

// investimento
slide('light', `
<div class="kk">INVESTIMENTO</div>
<h2 class="big">Uma proposta clara e competitiva</h2>
<div class="inv">
  <div class="pr main"><span>Mensalidade</span><b>R$ 41.900</b><em>por mês · até 20.000 alunos ativos</em><p>Acima da franquia: R$ 1,20 por aluno ativo adicional</p></div>
  <div class="pr"><span>Implantação e integrações</span><b>R$ 30.000</b><em>10 parcelas de R$ 3.000 ou R$ 27.000 à vista</em><p>Inclui agente presencial, migração e conexões com Jacad, Flugo, Dynadoc, Octadesk e Leadlovers</p></div>
  <div class="pr"><span>Atualizações mensais</span><b>Incluídas</b><em>na mensalidade</em><p>Melhorias, correções e segurança sem custo adicional</p></div>
</div>
<div class="inv2">
  <div><b>IA, WhatsApp, SMS e e-mail</b> contratados e pagos direto aos fornecedores, sem margem da WMundi®</div>
  <div><b>Aplicativos Apple e Android (opcional)</b> R$ 50.000 em 10x · hospedagem R$ 1.690/mês + R$ 1,02 por app baixado/mês</div>
  <div><b>Equipe dedicada</b> 6 horas diárias à disposição da Uningá, com visitas presenciais, sem custo adicional nos 6 primeiros meses</div>
  <div><b>Polos e unidades avançadas</b> módulos adicionais com orçamento combinado previamente</div>
</div>`);

// final
(async () => {
  const qr = await QR.toDataURL(LINK, { margin: 1, width: 360, color: { dark: '#0B2A55', light: '#ffffff' } });
  slide('dark end nofoot', `
<div class="orb o1"></div><div class="orb o2"></div>
<div class="logos"><span class="pill"><img src="${wm}"><b>®</b></span><span class="x">×</span><span class="pill u"><img src="${un}"></span></div>
<div class="kk w">EXPERIMENTE AGORA</div>
<h1 class="m">Conheça o EduMaster Pro na prática</h1>
<p class="lead">A demonstração completa, com a marca e as cores da Uningá, está aberta por 20 dias, até 07/12/2026.</p>
<div class="cta">
  <div class="btn"><span>ACESSO DIRETO · SEM LOGIN E SENHA</span><a href="${LINK}">${LINK.replace('https://', '')}</a></div>
  <div class="qr"><img src="${qr}"><span>Aponte a câmera do celular</span></div>
</div>
<div class="alt">Prefere entrar com usuário e senha? <a href="${BASE}">${BASE.replace('https://', '')}</a> · Usuário <b>apresentacao@uninga.br</b> · Senha <b>Uninga@2026</b></div>
<div class="cv-ft">Instituto Ravel de Ensino Superior Ltda · WMundi® Technologies · CNPJ 03.162.275/0001-10 · Av. XV de Novembro, 255, sala C · Maringá/PR · info@wmundi.com · www.wmundi.com · (44) 99946-6451</div>`);

  const css = `
@page{size:1920px 1080px;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#dfe6f1}
:root{--navy:#0B2A55;--blue:#3162A9;--orange:#EC6236;--red:#A32D3B;--ink:#0f1c33;--muted:#5b6b82;--bg:#F4F7FB;--wm:url(${wm})}
body{font-family:'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.s{width:1920px;height:1080px;position:relative;overflow:hidden;page-break-after:always;padding:96px 120px 120px;background:#fff}
.s.light{background:linear-gradient(180deg,#ffffff 0%,#F4F7FB 100%)}.s.light::before{content:"";position:absolute;left:0;top:0;width:100%;height:12px;background:linear-gradient(90deg,var(--orange) 0 52%,var(--blue) 52% 86%,var(--red) 86%)}
.s.dark{background:linear-gradient(135deg,#061633 0%,#0B2A55 45%,#2d5aa3 100%);color:#fff}
.orb{position:absolute;border-radius:50%;filter:blur(2px);opacity:.9}.o1{width:560px;height:560px;right:-200px;top:-230px;background:radial-gradient(circle at 30% 30%,#EC6236,#A32D3B 70%,transparent 72%);opacity:.85}.o2{width:380px;height:380px;right:260px;bottom:-190px;background:radial-gradient(circle,#3162A9,transparent 70%);opacity:.9}
.kk{font-size:24px;letter-spacing:.2em;font-weight:800;color:var(--orange);margin-bottom:22px;text-transform:uppercase}.kk.w{color:#FFB08F}
h1{font-size:150px;line-height:1;margin:18px 0 28px;font-weight:800;letter-spacing:-.02em}h1.m{font-size:104px}
h2{font-size:64px;line-height:1.08;margin:0 0 20px;font-weight:800;letter-spacing:-.01em;color:var(--navy)}h2.big{font-size:70px;max-width:1500px;margin-bottom:38px}h2.w{color:#fff}
.lead{font-size:38px;line-height:1.35;max-width:1250px;opacity:.95;margin:0 0 30px}.sub{font-size:29px;line-height:1.35;color:var(--muted);margin:0 0 26px}.sub.w80{max-width:1400px;font-size:32px}
.logos{display:flex;align-items:center;gap:30px;margin-bottom:60px}.pill{background:#fff;border-radius:18px;padding:12px 22px;display:inline-flex;align-items:flex-start}.pill img{height:70px}.pill b{font-size:26px;color:#0B2A55;margin-left:3px;line-height:1}.x{font-size:46px;opacity:.7}
.cv-ft{position:absolute;left:120px;right:120px;bottom:60px;font-size:21px;opacity:.85}
.ft{position:absolute;left:120px;right:120px;bottom:38px;display:flex;align-items:center;font-size:20px;color:var(--muted);border-top:1px solid #dbe3ef;padding-top:16px}.ft.d{color:#cfdcf2;border-color:rgba(255,255,255,.25)}
.wml{width:84px;height:34px;background:var(--wm) no-repeat center/contain;border-radius:4px}.ft .fx{margin-left:18px;flex:1}.ft .pn{font-weight:800;color:var(--orange)}
.fe{display:flex;gap:48px;align-items:center;height:100%}.fe.left{flex-direction:row-reverse}.fe .tx{flex:0 0 560px}.fe .vs{flex:1;min-width:0;display:flex;flex-direction:column;gap:22px;justify-content:center}
ul{list-style:none;padding:0;margin:0}.tx li{font-size:25px;line-height:1.3;margin:0 0 14px;padding-left:44px;position:relative}.tx li::before{content:"";position:absolute;left:0;top:7px;width:24px;height:24px;border-radius:50%;background:var(--orange);box-shadow:0 0 0 6px rgba(236,98,54,.16)}
.win{border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 30px 70px rgba(11,42,85,.28),0 0 0 1px rgba(11,42,85,.1)}.win .bar{height:44px;background:linear-gradient(180deg,#eef2f8,#e3e9f3);display:flex;align-items:center;gap:9px;padding:0 18px;font-size:17px;color:#5b6b82}.win .bar i{width:13px;height:13px;border-radius:50%;background:#ff6159}.win .bar i:nth-child(2){background:#ffbd2e}.win .bar i:nth-child(3){background:#27c93f}.win .bar span{margin-left:14px}.win{container-type:inline-size}.win .hd{aspect-ratio:1100/56;background:var(--s) 0 0/100% auto no-repeat}.win .bd{aspect-ratio:1100/560;background:var(--s) 0 var(--o,-27.3cqw)/100% auto no-repeat}
.win.half{width:100%}.vs .win.half .bd{aspect-ratio:1100/300}
.grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:22px;margin-top:18px}.card{background:#fff;border-radius:22px;padding:34px 26px;box-shadow:0 14px 40px rgba(11,42,85,.1);border-top:6px solid var(--blue);text-align:center}.card .old{font-size:30px;font-weight:800;color:#9aa7ba;text-decoration:line-through;text-decoration-color:var(--red)}.card .arr{font-size:38px;color:var(--orange);margin:6px 0}.card b{font-size:27px;color:var(--navy);display:block;margin-bottom:10px}.card p{font-size:21px;color:var(--muted);margin:0;line-height:1.3}
.note{font-size:28px;color:var(--navy);background:#fff4ee;border-left:8px solid var(--orange);padding:22px 30px;border-radius:12px;margin:44px 0 0;max-width:1560px}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}.tile{border-radius:20px;padding:30px 28px;color:#fff;min-height:170px}.tile b{display:block;font-size:30px;margin-bottom:10px}.tile span{font-size:21px;opacity:.92}.t0{background:linear-gradient(135deg,#0B2A55,#3162A9)}.t1{background:linear-gradient(135deg,#3162A9,#4f86d6)}.t2{background:linear-gradient(135deg,#EC6236,#A32D3B)}
.flow{display:grid;grid-template-columns:repeat(4,1fr);gap:26px;margin-top:34px}.st{background:#fff;border-radius:22px;padding:34px;box-shadow:0 14px 40px rgba(11,42,85,.1);position:relative}.st i{display:inline-flex;width:54px;height:54px;border-radius:50%;background:var(--orange);color:#fff;font-style:normal;font-size:28px;font-weight:800;align-items:center;justify-content:center;margin-bottom:16px}.st b{display:block;font-size:30px;color:var(--navy);margin-bottom:8px}.st p{font-size:23px;color:var(--muted);margin:0;line-height:1.3}
.sec{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:20px}.sc{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);border-radius:22px;padding:32px;backdrop-filter:blur(4px)}.sc b{font-size:31px;display:block;margin-bottom:12px;color:#FFB08F}.sc p{font-size:23px;line-height:1.35;margin:0;opacity:.95}
.two{display:grid;grid-template-columns:1fr 1fr;gap:34px}.card.lg{text-align:left;border-top-color:var(--orange);padding:38px}.card.lg h3{font-size:36px;color:var(--navy);margin:0 0 20px}.card.lg li{font-size:25px;line-height:1.3;margin:0 0 13px;padding-left:34px;position:relative}.card.lg li::before{content:"";position:absolute;left:0;top:8px;width:16px;height:16px;border-radius:50%;background:var(--orange)}
.tl{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}.ph{background:#fff;border-radius:22px;padding:34px;box-shadow:0 14px 40px rgba(11,42,85,.1);border-top:8px solid var(--blue)}.ph:nth-child(2){border-top-color:#4f86d6}.ph:nth-child(3){border-top-color:var(--orange)}.ph:nth-child(4){border-top-color:var(--red)}.ph .d{font-size:21px;font-weight:800;color:var(--orange);text-transform:uppercase;letter-spacing:.08em}.ph b{display:block;font-size:34px;color:var(--navy);margin:8px 0 12px}.ph p{font-size:23px;line-height:1.38;color:var(--muted);margin:0}
.inv{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:26px}.pr{background:#fff;border-radius:24px;padding:40px;box-shadow:0 14px 40px rgba(11,42,85,.1);border-top:8px solid var(--blue)}.pr.main{background:linear-gradient(135deg,#0B2A55,#3162A9);color:#fff;border-top-color:var(--orange)}.pr span{font-size:22px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--orange)}.pr b{display:block;font-size:68px;white-space:nowrap;line-height:1.05;margin:12px 0 4px;color:var(--navy)}.pr.main b{color:#fff}.pr em{font-style:normal;font-size:26px;display:block;margin-bottom:14px;color:var(--muted)}.pr.main em{color:#dbe8ff}.pr p{font-size:22px;line-height:1.35;margin:0;color:var(--muted)}.pr.main p{color:#dbe8ff}
.inv2{display:grid;grid-template-columns:repeat(4,1fr);gap:26px;margin-top:26px}.inv2 div{font-size:22px;line-height:1.4;color:var(--muted);border-left:6px solid var(--orange);padding:6px 0 6px 20px}.inv2 b{display:block;color:var(--navy);font-size:25px;margin-bottom:4px}
.cta{display:flex;gap:46px;align-items:center;margin:20px 0 26px}.btn{background:#fff;color:var(--navy);border-radius:26px;padding:34px 44px;box-shadow:0 24px 60px rgba(0,0,0,.35);border-left:14px solid var(--orange)}.btn span{display:block;font-size:22px;font-weight:800;letter-spacing:.14em;color:var(--orange);margin-bottom:10px}.btn a{font-size:34px;font-weight:800;color:var(--blue);text-decoration:none;word-break:break-all;display:block;max-width:1060px}
.qr{background:#fff;border-radius:22px;padding:18px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.35)}.qr img{width:230px;height:230px;display:block}.qr span{display:block;font-size:17px;color:var(--navy);margin-top:6px}
.alt{font-size:25px;color:#dbe8ff;max-width:1500px}.alt a{color:#FFB08F;font-weight:700;text-decoration:none}.alt b{color:#fff}
.end h1.m{margin-top:6px;font-size:92px}.s.end{padding-bottom:190px}.end .cv-ft{font-size:18px;bottom:42px}.end .cta{margin:14px 0 20px}.end .qr img{width:200px;height:200px}

.gantt{table-layout:fixed;width:100%;border-collapse:separate;border-spacing:0 6px;font-size:17px}.gantt th{font-size:16px;color:var(--muted);font-weight:700;padding:2px 0}.gantt th.gl{width:290px;text-align:left}.gantt td{padding:0 3px;height:58px}.gantt td.gl{font-weight:700;color:var(--navy);font-size:19px;line-height:1.15;padding-right:14px}.gantt td.e{background:transparent}
.bar{border-radius:10px;height:48px;display:flex;align-items:center;padding:0 12px;color:#fff;font-weight:700;font-size:16px;line-height:1.1;overflow:hidden}.b1{background:#3162A9}.b2{background:#4f86d6}.b3{background:#EC6236}.b4{background:#A32D3B}.b5{background:#0B2A55}
.tile{min-height:128px!important}.tile b{font-size:27px!important}.tiles{gap:18px!important}
.inv2 b{margin-bottom:4px}
.chips span{display:inline-block;background:#fff4ee;color:#A32D3B;border-radius:999px;padding:8px 18px;margin:0 8px 8px 0;font-size:20px;font-weight:700}`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=1920"><title>EduMaster Pro · Proposta Uningá</title><style>${css}</style></head><body>${S.join('\n')}</body></html>`;
  fs.writeFileSync(path.join(D, 'apresentacao-edumaster-uninga.html'), html);
  // versão web (rolagem por slide, ajustada à largura da tela) publicada junto com a demo
  const web = html.replace('</style>', 'html{scroll-snap-type:y proximity}.s{scroll-snap-align:start;margin:0 auto 24px}@media print{html{scroll-snap-type:none}.s{margin:0}}</style>').replace('</body>', '<script>(function(){function f(){document.body.style.zoom=Math.min(1,window.innerWidth/1960)}f();window.addEventListener("resize",f)})()</script></body>');
  fs.mkdirSync(path.join(PUB, 'apresentacao'), { recursive: true });
  fs.writeFileSync(path.join(PUB, 'apresentacao/index.html'), web);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await pg.setContent(html, { waitUntil: 'load' });
  await pg.pdf({ path: path.join(D, 'apresentacao-edumaster-uninga.pdf'), width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
  await b.close();
  fs.copyFileSync(path.join(D, 'apresentacao-edumaster-uninga.pdf'), path.join(PUB, 'apresentacao-edumaster.pdf'));
  console.log('ok', num, 'slides');
})();
