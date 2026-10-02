// Modelos de contrato (baseados nas minutas originais em docs/contratos-originais/).
// O texto final é gerado com os dados do caso, salvo como "retrato" imutável e
// aceito eletronicamente (nome, CPF, IP, data/hora e hash SHA-256 do texto).
import { escapeHtml as e, brl } from './util.js';

const blank = (v, label = 'a preencher') =>
  v === undefined || v === null || v === '' ? `<mark>[${e(label)}]</mark>` : e(v);

export function company() {
  return {
    name: process.env.COMPANY_NAME || '',
    cnpj: process.env.COMPANY_CNPJ || '',
    address: process.env.COMPANY_ADDRESS || '',
    city: process.env.COMPANY_CITY || 'Maringá/PR',
    representative: process.env.COMPANY_REPRESENTATIVE || '',
  };
}

const today = () => new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });

const sec = (n, title, html) => `<section><h3>${n}. ${e(title)}</h3>${html}</section>`;
const p = (html) => `<p>${html}</p>`;
const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

const ELECTRONIC = p('As partes reconhecem a validade da contratação e da assinatura por meio eletrônico, com aceite registrado na plataforma AlignSystem (identificação do signatário, data, hora, endereço IP e código de integridade do documento), nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001 e do art. 107 do Código Civil.');

// ---------------------------------------------------------------- paciente
export function patientContract(c, dentist) {
  const k = company();
  const plan = c.plan || {};
  const title = 'Contrato de prestação de serviços odontológicos — tratamento com alinhadores transparentes';
  const body = [
    `<h2>Contrato de prestação de serviços odontológicos</h2>`,
    `<p class="sub">Tratamento ortodôntico com alinhadores transparentes — AlignSystem · Caso nº ${e(c.code)}</p>`,
    p(`<b>CONTRATANTE:</b> ${blank(c.name, 'nome do paciente')}, portador(a) do CPF nº ${blank(c.cpf, 'CPF')}, residente em ${blank(c.address, 'endereço')} ("Paciente").`),
    p(`<b>CONTRATADA:</b> ${blank(k.name, 'razão social AlignSystem')}, CNPJ nº ${blank(k.cnpj, 'CNPJ')}, com sede em ${blank(k.address, 'endereço')}, tendo como responsável técnico pelo caso ${blank(dentist?.name, 'dentista responsável')}, CRO-${blank(dentist?.cro_uf, 'UF')} nº ${blank(dentist?.cro, 'CRO')} ("Contratada").`),
    p('As partes acima identificadas têm, entre si, justo e acordado o presente contrato, que se rege pelas cláusulas seguintes.'),
    sec(1, 'Objeto', p(`O presente contrato tem por objeto a prestação, pela Contratada, de serviço odontológico de tratamento ortodôntico por meio de alinhadores transparentes da marca ${blank(plan.brand, 'marca do alinhador')}, conforme plano de tratamento elaborado após avaliação e documentação digital do(a) Paciente, que passa a integrar este contrato como Anexo I.`)),
    sec(2, 'Documentação e planejamento', p('A Contratada realizará escaneamento intraoral, fotografias clínicas e radiografia panorâmica do(a) Paciente, com base nas quais será elaborado o plano de tratamento individualizado, apresentado e aprovado pelo(a) Paciente antes do início da confecção dos alinhadores. A pré-avaliação por fotos realizada pela internet tem caráter apenas orientativo e não substitui o exame clínico presencial.')),
    sec(3, 'Prazo do tratamento',
      p(`3.1. O tratamento tem duração estimada de ${blank(plan.months, 'nº de')} meses, respeitado o limite máximo de 36 (trinta e seis) meses previsto neste contrato, podendo variar conforme a resposta biológica individual do(a) Paciente.`) +
      p('3.2. Havendo necessidade clínica de prorrogação além do prazo inicialmente estimado, dentro do limite de 36 meses, esta poderá ocorrer sem custo adicional de planejamento, desde que decorrente de evolução normal do tratamento e não de descumprimento das orientações pelo(a) Paciente.')),
    sec(4, 'Valor e condições de pagamento',
      p(`4.1. O valor total do tratamento, referente ao protocolo descrito no Anexo I, é de ${plan.total ? e(brl(plan.total)) : blank('', 'valor total')} ("Contrato Fechado"), cobrindo a documentação inicial, os alinhadores previstos no planejamento aprovado e o acompanhamento clínico durante o tratamento, ressalvadas as hipóteses da Cláusula 5.`) +
      p(`4.2. Forma de pagamento: o valor total é pago de forma integral, à vista por Pix ou por cartão de crédito em até ${blank(plan.maxInstallments || 12, 'nº')} parcelas. No cartão de crédito, o valor total é lançado de uma só vez no limite do cartão, e o parcelamento é feito pela operadora/banco emissor. Não há pagamento por boleto nem por mensalidades.`) +
      p('4.3. A confecção dos alinhadores e o início do tratamento ocorrem somente após a confirmação do pagamento integral.') +
      p('4.4. O link de pagamento é emitido pela plataforma de pagamentos utilizada pela Contratada e enviado ao(à) Paciente por e-mail e/ou WhatsApp. Eventuais juros ou encargos de parcelamento no cartão de crédito são de responsabilidade da respectiva operadora/banco emissor e serão informados ao(à) Paciente antes da confirmação do pagamento, conforme exige o Código de Defesa do Consumidor.')),
    sec(5, 'Alinhadores extraviados ou danificados',
      p('5.1. Os alinhadores fornecidos são de uso individual e de responsabilidade do(a) Paciente quanto à sua guarda e conservação.') +
      p(`<b>5.2. Em caso de perda, quebra ou dano ao alinhador por mau uso, será cobrado o valor adicional de reposição de ${plan.replacementValue ? e(brl(plan.replacementValue)) : blank('', 'valor de reposição')} por unidade, não incluído no valor do Contrato Fechado descrito na Cláusula 4.</b>`) +
      p('5.3. Substituições decorrentes de defeito de fabricação não geram cobrança adicional ao(à) Paciente.')),
    sec(6, 'Obrigações do(a) Paciente', ul([
      'comparecer às consultas agendadas e seguir as orientações de uso dos alinhadores;',
      'usar os alinhadores pelo tempo diário recomendado pelo profissional responsável;',
      'comunicar imediatamente qualquer perda, quebra ou desconforto significativo;',
      'efetuar o pagamento integral, conforme a Cláusula 4.',
    ])),
    sec(7, 'Obrigações da Contratada', ul([
      'prestar o serviço com a técnica e o cuidado exigidos pela boa prática odontológica;',
      'fornecer os alinhadores conforme o plano de tratamento aprovado;',
      'informar o(a) Paciente sobre a evolução do tratamento e eventuais ajustes necessários;',
      'manter sigilo sobre os dados e prontuário do(a) Paciente, nos termos da LGPD.',
    ])),
    sec(8, 'Contestação do pagamento', p('<b>A contestação indevida da compra junto à operadora do cartão (chargeback), em desacordo com este contrato, torna o valor contestado devido pelo(a) Paciente, com multa de 2% (dois por cento), acrescida de juros de mora de 1% (um por cento) ao mês, calculados pro rata die, sem prejuízo da correção monetária, nos limites da legislação aplicável.</b>')),
    sec(9, 'Rescisão e desistência',
      p('9.1. Caso a contratação tenha ocorrido fora do estabelecimento comercial (ex.: internet, telefone, domicílio), o(a) Paciente poderá exercer o direito de arrependimento em até 7 (sete) dias corridos a contar da assinatura, nos termos do art. 49 do Código de Defesa do Consumidor, com devolução integral dos valores eventualmente pagos.') +
      p('<b>9.2. Após esse prazo, a rescisão a pedido do(a) Paciente implicará o pagamento proporcional dos serviços já prestados e dos alinhadores já confeccionados ou em confecção até a data da rescisão, sendo restituído o saldo remanescente, se houver, em até 30 (trinta) dias.</b>') +
      p('9.3. A Contratada poderá rescindir o contrato em caso de descumprimento reiterado das orientações clínicas pelo(a) Paciente que inviabilize a continuidade segura do tratamento, mediante comunicação prévia por escrito.')),
    sec(10, 'Uso de imagem', p('O uso de fotografias do(a) Paciente para fins de divulgação da Contratada é facultativo e depende de consentimento específico e destacado, a ser formalizado em termo apartado, podendo ser revogado a qualquer tempo pelo(a) Paciente. As fotos enviadas pela plataforma são usadas exclusivamente para avaliação e acompanhamento clínico.')),
    sec(11, 'Proteção de dados (LGPD)', p('Os dados pessoais e de saúde do(a) Paciente serão tratados exclusivamente para as finalidades relacionadas à execução deste contrato, com as salvaguardas exigidas pela Lei nº 13.709/2018, podendo o(a) Paciente exercer os direitos previstos na referida lei mediante solicitação pelo e-mail ' + e(process.env.PUBLIC_CONTACT_EMAIL || 'contato@alignsystem.com.br') + '.')),
    sec(12, 'Assinatura eletrônica', ELECTRONIC),
    sec(13, 'Foro', p('Fica eleito o foro do domicílio do(a) Paciente para dirimir quaisquer questões oriundas deste contrato, em conformidade com o Código de Defesa do Consumidor.')),
    `<h3>Anexo I — Plano de tratamento</h3>`,
    p(plan.treatmentNotes ? e(plan.treatmentNotes).replace(/\n/g, '<br>') : 'Plano de tratamento individualizado apresentado ao(à) Paciente após a documentação digital, com número estimado de alinhadores, etapas e consultas de acompanhamento.'),
    p(`${e(k.city)}, ${e(today())}.`),
  ].join('\n');
  return { title, body };
}

// ---------------------------------------------------------------- parceiro
export const PARTNER_DEFAULTS = {
  caseValue: 2000,
  pctInstall: 30,
  pctStart: 40,
  pctFinish: 30,
  avulsaValue: 120,
  payoutDays: 10,
  noticeDays: 30,
  lockMonths: 12,
  penaltyRepasses: 3,
  penaltyFixed: 5000,
  nonSolicitMonths: 12,
};

export function partnerContract(d, terms = {}) {
  const k = company();
  const t = { ...PARTNER_DEFAULTS, ...terms };
  const title = 'Termo de Adesão — Rede de Parceria AlignSystem';
  const body = [
    `<h2>Termo de Adesão — Rede de Parceria AlignSystem</h2>`,
    `<p class="sub">Credenciamento de cirurgião-dentista / consultório parceiro</p>`,
    p(`Pelo presente instrumento particular, de um lado ${blank(k.name, 'razão social AlignSystem')}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${blank(k.cnpj, 'CNPJ')}, com sede em ${blank(k.address, 'endereço')} ("AlignSystem"), e, de outro lado, ${blank(d.name, 'nome do profissional')}, cirurgião(ã)-dentista inscrito(a) no CRO-${blank(d.cro_uf, 'UF')} sob o nº ${blank(d.cro, 'CRO')}, inscrito(a) no CPF/CNPJ sob o nº ${blank(d.cpf_cnpj, 'CPF/CNPJ')} ("Parceiro(a)"), doravante em conjunto denominados "Partes", têm entre si justo e acordado o presente Termo de Adesão, que se rege pelas cláusulas seguintes.`),
    sec(1, 'Objeto', p('O presente Termo tem por objeto estabelecer as condições de credenciamento e de parceria entre a AlignSystem e o(a) Parceiro(a) para a execução clínica de tratamentos ortodônticos com alinhadores transparentes em pacientes direcionados pela rede AlignSystem, conforme o fluxo operacional descrito neste instrumento.')),
    sec(2, 'Natureza da relação',
      p('2.1. O presente Termo não constitui, sob nenhuma hipótese, contrato de franquia empresarial, não estando sujeito à Lei nº 13.966/2019 (Lei de Franquias). A AlignSystem não cobra taxa de filiação, taxa de franquia, royalties sobre o faturamento do Parceiro ou qualquer contrapartida pelo uso de método de negócio padronizado.') +
      p('2.2. O presente Termo também não constitui vínculo empregatício, relação de sociedade, consórcio ou representação comercial entre as Partes, tratando-se de parceria de natureza estritamente civil, mantendo cada Parte sua autonomia técnica, administrativa, tributária e patrimonial.') +
      p('2.3. O(A) Parceiro(a) mantém integral responsabilidade técnica e ética pelos atos clínicos que praticar, nos termos do Código de Ética Odontológica e das normas do CRO/CFO, não havendo qualquer ingerência da AlignSystem sobre o exercício profissional.')),
    sec(3, 'Modelo operacional',
      p('3.1. Ficam a cargo da AlignSystem, salvo disposição em contrário registrada no caso:') +
      ul([
        'a captação, triagem e documentação digital inicial do paciente (escaneamento, fotografias e radiografia panorâmica);',
        'a aquisição e o fornecimento dos alinhadores ao paciente, conforme protocolo indicado;',
        'o planejamento digital do caso e o suporte técnico durante o tratamento;',
        'a relação financeira e de cobrança com o paciente.',
      ]) +
      p('3.2. Fica a cargo do(a) Parceiro(a) a execução clínica presencial do caso — avaliação, instalação, ajustes, acompanhamento e finalização — conforme o plano de tratamento aprovado, bem como o registro de evidências clínicas (fotos e anotações) de cada atendimento na plataforma AlignSystem.') +
      p('3.3. A pré-avaliação por fotos e a teleorientação feitas pela plataforma têm caráter orientativo, respeitadas as normas do Conselho Federal de Odontologia sobre odontologia mediada por tecnologia; diagnóstico e plano de tratamento dependem de exame clínico presencial.')),
    sec(4, 'Obrigações do(a) Parceiro(a)', ul([
      'manter registro profissional (CRO) ativo e regular durante toda a vigência deste Termo;',
      'executar os procedimentos conforme o planejamento aprovado, informando à AlignSystem qualquer divergência clínica relevante;',
      'registrar evidências de cada atendimento na plataforma, como condição para liberação do repasse correspondente;',
      'preservar a confidencialidade de dados de pacientes, materiais e informações comerciais da rede;',
      `não utilizar a base de pacientes recebida pela rede para atendimento particular direto, à margem da AlignSystem, durante a vigência deste Termo e pelo prazo de ${e(t.nonSolicitMonths)} meses após seu término;`,
      'não divulgar preços, promoções ou condições de pagamento em nome da rede, observando o Código de Ética Odontológica;',
      'observar o Código de Ética Odontológica e a legislação sanitária aplicável em todos os atendimentos.',
    ])),
    sec(5, 'Obrigações da AlignSystem', ul([
      'direcionar ao(à) Parceiro(a) pacientes triados, conforme região e disponibilidade de agenda informada;',
      'fornecer a documentação inicial e os alinhadores necessários à execução do caso, dentro dos prazos operacionais da rede;',
      'disponibilizar planejamento digital e suporte técnico durante o tratamento;',
      'efetuar os repasses devidos nos prazos e condições descritos na Cláusula 6.',
    ])),
    sec(6, 'Remuneração e repasses',
      p(`6.1. <b>Coparticipação por caso completo.</b> Pela condução clínica integral de um caso, do início ao fim do tratamento, a AlignSystem pagará ao(à) Parceiro(a) o valor de ${e(brl(t.caseValue))}, dividido em parcelas vinculadas a marcos clínicos: ${e(t.pctInstall)}% na instalação/documentação, ${e(t.pctStart)}% no início do uso dos alinhadores e ${e(t.pctFinish)}% na finalização do tratamento, mediante validação das respectivas evidências.`) +
      p(`6.2. <b>Consulta avulsa.</b> Para atendimentos pontuais não vinculados à condução integral do caso pelo(a) Parceiro(a) — como ajustes, manutenções ou consultas de acompanhamento realizadas por profissional diverso do responsável original — a AlignSystem pagará o valor de ${e(brl(t.avulsaValue))} por atendimento validado.`) +
      p(`6.3. <b>Fluxo de validação.</b> O repasse depende do registro de evidências do atendimento na plataforma, da confirmação do paciente quando aplicável, e da validação administrativa da AlignSystem, sendo efetuado em até ${e(t.payoutDays)} dias úteis após a validação.`) +
      p('6.4. <b>Forma de repasse.</b> Os repasses podem ser feitos por divisão automática de pagamento (split) na plataforma de pagamentos utilizada pela AlignSystem, creditados em conta de pagamento de titularidade do(a) Parceiro(a), ou por transferência bancária/Pix para conta de mesma titularidade. O(A) Parceiro(a) autoriza a abertura dessa conta de pagamento em seu nome, com os dados fornecidos no credenciamento, e é responsável pelos tributos incidentes sobre os valores que receber.') +
      p('6.5. Os valores desta cláusula poderão ser revistos mediante aditivo escrito, não se aplicando reajuste automático.')),
    sec(7, 'Marca e materiais', p('O uso do nome, marca, materiais de comunicação e identidade visual AlignSystem pelo(a) Parceiro(a) está condicionado à prévia autorização da AlignSystem e restrito à vigência deste Termo, devendo cessar imediatamente após seu término, sem geração de direito a indenização por essa cessação.')),
    sec(8, 'Confidencialidade e não desvio', p('As Partes comprometem-se a manter sigilo sobre informações comerciais, técnicas e operacionais da rede, bem como sobre dados de pacientes, aplicando-se a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD) a todo tratamento de dados pessoais realizado no âmbito desta parceria.')),
    sec(9, 'Vigência', p('O presente Termo vigora por prazo indeterminado a partir de seu aceite, podendo ser rescindido pelas Partes na forma da Cláusula 10.')),
    sec(10, 'Rescisão e multa rescisória',
      p(`10.1. Qualquer das Partes poderá rescindir este Termo mediante aviso prévio por escrito de ${e(t.noticeDays)} dias, ressalvada a conclusão dos casos clínicos em andamento sob responsabilidade do(a) Parceiro(a), que deverão ser finalizados ou formalmente transferidos, conforme acordo entre as Partes.`) +
      p(`<b>10.2. Em caso de rescisão imotivada por qualquer das Partes antes de completados ${e(t.lockMonths)} meses de vigência, a parte denunciante pagará à outra multa rescisória equivalente a ${e(t.penaltyRepasses)} repasses médios mensais apurados nos últimos 90 dias, ou o valor fixo de ${e(brl(t.penaltyFixed))}, o que for maior.</b>`) +
      p('10.3. Havendo justa causa — descumprimento contratual, infração ética ou legal, ou risco à segurança do paciente —, a rescisão poderá ocorrer de forma imediata, sem aviso prévio e sem multa em favor da parte infratora.')),
    sec(11, 'Proteção de dados (LGPD)', p('Cada Parte atuará como controladora ou operadora de dados pessoais conforme sua atuação nesta parceria, comprometendo-se a adotar medidas técnicas e administrativas adequadas à proteção dos dados de pacientes, e a comunicar prontamente eventuais incidentes de segurança à outra Parte.')),
    sec(12, 'Disposições gerais',
      p('12.1. Este Termo não gera exclusividade em favor do(a) Parceiro(a), podendo a AlignSystem credenciar outros profissionais na mesma região.') +
      p('12.2. A tolerância de uma Parte quanto ao descumprimento de qualquer cláusula não implica novação ou renúncia de direitos.') +
      p('12.3. Este Termo obriga as Partes e seus eventuais sucessores.')),
    sec(13, 'Assinatura eletrônica', ELECTRONIC),
    sec(14, 'Foro', p(`Fica eleito o foro da comarca de ${e(k.city)}, com renúncia a qualquer outro, por mais privilegiado que seja, para dirimir questões oriundas deste Termo.`)),
    p(`${e(k.city)}, ${e(today())}.`),
  ].join('\n');
  return { title, body };
}

export const contractsReviewed = () => process.env.CONTRACTS_REVIEWED === 'true';
