// Modelos de contrato (baseados nas minutas originais em docs/contratos-originais/).
// O texto final é gerado com os dados do caso, salvo como "retrato" imutável e
// aceito eletronicamente (nome, CPF, IP, data/hora e hash SHA-256 do texto).
import { escapeHtml as e, brl } from './util.js';
import { MODEL, quote } from './pricing.js';

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

const ATT_LABEL = {
  rede_300: 'Aceito ser atendido(a) por qualquer dentista credenciado em até 300 km, com deslocamento por minha conta',
  mais_proximo: 'Prefiro o dentista credenciado mais próximo, em até 300 km, com deslocamento por minha conta',
  mais_proximo_viagem: 'Dentista credenciado mais próximo, a mais de 300 km, com 4 deslocamentos incluídos no preço',
};
const numWords = (n) => ({ 8: 'oito', 10: 'dez', 12: 'doze', 15: 'quinze', 20: 'vinte' }[n] || String(n));
const pctWords = (n) => ({ 12: 'doze', 20: 'vinte', 30: 'trinta', 50: 'cinquenta' }[n] || String(n));
const sec = (n, title, html) => `<section><h3>${n}. ${e(title)}</h3>${html}</section>`;
const p = (html) => `<p>${html}</p>`;
const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

const ELECTRONIC = p('As partes reconhecem a validade da contratação e da assinatura por meio eletrônico, com aceite registrado na plataforma AlignSystem (identificação do signatário, data, hora, endereço IP e código de integridade do documento), nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001 e do art. 107 do Código Civil.');

// ---------------------------------------------------------------- paciente
export function patientContract(c, dentist) {
  const k = company();
  const plan = c.plan || {};
  const rede = plan.model === 'rede'; // AlignSystem recebe 100% e paga os dentistas da rede pelas consultas presenciais
  const att = c.attendance || null;
  const travel = rede && att?.choice === 'mais_proximo_viagem' ? Number(plan.travel ?? att.travelTotal) || 0 : 0;
  const grand = plan.total ? Number(plan.total) + travel : null;
  const q = grand ? quote(grand) : null;
  const n = (x) => x + (rede ? 1 : 0); // cláusula extra de atendimento presencial no modelo rede
  const title = 'Contrato de prestação de serviços odontológicos — tratamento com alinhadores transparentes';
  const body = [
    `<h2>Contrato de prestação de serviços odontológicos</h2>`,
    `<p class="sub">Tratamento ortodôntico com alinhadores transparentes — AlignSystem · Caso nº ${e(c.code)}</p>`,
    p(`<b>CONTRATANTE:</b> ${blank(c.name, 'nome do paciente')}, portador(a) do CPF nº ${blank(c.cpf, 'CPF')}, residente em ${blank(c.address, 'endereço')} ("Paciente").`),
    p(`<b>CONTRATADA:</b> ${blank(k.name, 'razão social AlignSystem')}, CNPJ nº ${blank(k.cnpj, 'CNPJ')}, com sede em ${blank(k.address, 'endereço')}, ("Contratada").`),
    rede ? '' : p(`<b>DENTISTA PARCEIRO(A), interveniente:</b> ${blank(dentist?.name, 'dentista responsável')}, CRO-${blank(dentist?.cro_uf, 'UF')} nº ${blank(dentist?.cro, 'CRO')}, credenciado(a) na rede AlignSystem por Termo de Adesão, responsável pelos atendimentos clínicos presenciais do(a) Paciente.`),
    p('As partes acima identificadas têm, entre si, justo e acordado o presente contrato, que se rege pelas cláusulas seguintes.'),
    sec(1, 'Objeto', p(`O presente contrato tem por objeto a prestação, pela Contratada, de serviço odontológico de tratamento ortodôntico por meio de alinhadores transparentes da marca ${blank(plan.brand, 'marca do alinhador')}, conforme plano de tratamento elaborado após avaliação e documentação digital do(a) Paciente, que passa a integrar este contrato como Anexo I.`)),
    sec(2, 'Documentação e planejamento', p('A Contratada realizará escaneamento intraoral, fotografias clínicas e radiografia panorâmica do(a) Paciente, com base nas quais será elaborado o plano de tratamento individualizado, apresentado e aprovado pelo(a) Paciente antes do início da confecção dos alinhadores. A pré-avaliação por fotos realizada pela internet tem caráter apenas orientativo e não substitui o exame clínico presencial.')),
    sec(3, 'Prazo do tratamento',
      p(`3.1. O tratamento tem duração estimada de ${blank(plan.months, 'nº de')} meses, respeitado o limite máximo de 36 (trinta e seis) meses previsto neste contrato, podendo variar conforme a resposta biológica individual do(a) Paciente.`) +
      p('3.2. Havendo necessidade clínica de prorrogação além do prazo inicialmente estimado, dentro do limite de 36 meses, esta poderá ocorrer sem custo adicional de planejamento, desde que decorrente de evolução normal do tratamento e não de descumprimento das orientações pelo(a) Paciente.')),
    sec(4, 'Valor, composição e condições de pagamento',
      p(`4.1. O valor do tratamento, referente ao protocolo descrito no Anexo I, é de ${plan.total ? e(brl(plan.total)) : blank('', 'valor do tratamento')} ("Contrato Fechado"), cobrindo a documentação inicial, os alinhadores previstos no planejamento aprovado e o acompanhamento clínico durante o tratamento, ressalvadas as hipóteses da Cláusula 5.${travel ? ` Somam-se a ele ${e(brl(travel))} referentes aos deslocamentos previstos na Cláusula 10.3, totalizando <b>${e(brl(grand))}</b>.` : ''}`) +
      p(`<b>4.2. Composição do valor.</b> O valor total é composto por: (a) <b>${MODEL.alignerPct}% (${e(pctWords(MODEL.alignerPct))} por cento) referentes ao fornecimento dos alinhadores</b> confeccionados sob medida para o(a) Paciente${q ? ` (${e(brl(q.boleto?.entry ?? plan.total * MODEL.alignerPct / 100))})` : ''}; e (b) ${100 - MODEL.alignerPct}% (${e(pctWords(100 - MODEL.alignerPct))} por cento) referentes ao planejamento, às despesas operacionais e aos atendimentos${rede ? ', incluídas as consultas presenciais realizadas por dentistas credenciados da rede, remunerados diretamente pela Contratada' : dentist ? `, dos quais ${MODEL.dentistPct}% do valor total correspondem aos atendimentos clínicos presenciais realizados pelo(a) dentista parceiro(a) indicado(a) no preâmbulo e ${MODEL.supervisionPct}% à supervisão clínica remota e ao teleatendimento prestados pela Contratada` : ''}.`) +
      p(`4.3. Formas de pagamento, à escolha do(a) Paciente no link de pagamento: (a) <b>Pix à vista, com desconto de ${MODEL.pixDiscountPct}% (${e(pctWords(MODEL.pixDiscountPct))} por cento)</b> sobre o valor total${q ? ` (${e(brl(q.pix))})` : ''}; (b) <b>cartão de crédito em até ${MODEL.cardMaxInstallments} parcelas sem juros</b>, com o valor total lançado no limite do cartão; ou (c) <b>boleto bancário</b>, com entrada de ${MODEL.boletoEntryPct}% do valor total paga por Pix ou cartão de crédito, e o saldo em até ${MODEL.boletoMaxInstallments} boletos mensais, sujeito a análise de crédito.`) +
      p('4.4. O pedido de fabricação dos alinhadores somente é feito após (i) a confirmação do pagamento integral, no Pix ou no cartão, ou da entrada, no boleto; e (ii) o término do prazo de arrependimento previsto na Cláusula 9.1.') +
      p('4.5. O link de pagamento é emitido pela plataforma de pagamentos utilizada pela Contratada e enviado ao(à) Paciente por e-mail e/ou WhatsApp. Na modalidade boleto, os boletos do saldo são emitidos após a confirmação da entrada.')),
    sec(5, 'Alinhadores extraviados ou danificados',
      p('5.1. Os alinhadores fornecidos são de uso individual e de responsabilidade do(a) Paciente quanto à sua guarda e conservação.') +
      p(`<b>5.2. Em caso de perda, quebra ou dano ao alinhador por mau uso, será cobrado o valor adicional de reposição de ${plan.replacementValue ? e(brl(plan.replacementValue)) : blank('', 'valor de reposição')} por unidade, não incluído no valor do Contrato Fechado descrito na Cláusula 4.</b>`) +
      p('5.3. Substituições decorrentes de defeito de fabricação não geram cobrança adicional ao(à) Paciente.')),
    sec(6, 'Obrigações do(a) Paciente', ul([
      'comparecer às consultas agendadas e seguir as orientações de uso dos alinhadores;',
      'usar os alinhadores pelo tempo diário recomendado pelo profissional responsável;',
      'comunicar imediatamente qualquer perda, quebra ou desconforto significativo;',
      'efetuar os pagamentos na forma escolhida, conforme a Cláusula 4.',
    ])),
    sec(7, 'Obrigações da Contratada', ul([
      'prestar o serviço com a técnica e o cuidado exigidos pela boa prática odontológica;',
      'fornecer os alinhadores conforme o plano de tratamento aprovado;',
      'informar o(a) Paciente sobre a evolução do tratamento e eventuais ajustes necessários;',
      'manter sigilo sobre os dados e prontuário do(a) Paciente, nos termos da LGPD.',
    ])),
    sec(8, 'Atraso e contestação', p('<b>Na modalidade boleto, o atraso no pagamento de qualquer parcela sujeitará o(a) Paciente à multa de 2% (dois por cento) sobre o valor em atraso, acrescida de juros de mora de 1% (um por cento) ao mês, calculados pro rata die, e de correção monetária, podendo o débito ser levado a protesto ou aos cadastros de proteção ao crédito após comunicação prévia. A contestação indevida da compra junto à operadora do cartão (chargeback) torna o valor contestado devido nas mesmas condições.</b>')),
    sec(9, 'Rescisão e desistência',
      p('9.1. Caso a contratação tenha ocorrido fora do estabelecimento comercial (ex.: internet, telefone, domicílio), o(a) Paciente poderá exercer o direito de arrependimento em até 7 (sete) dias corridos a contar da assinatura, nos termos do art. 49 do Código de Defesa do Consumidor, com devolução integral dos valores eventualmente pagos.') +
      p(`<b>9.2. Após esse prazo e depois do pedido de fabricação dos alinhadores, a desistência pelo(a) Paciente implicará o pagamento integral da parcela referente aos alinhadores (${MODEL.alignerPct}% do valor total), por se tratar de produto confeccionado sob medida e sem possibilidade de reaproveitamento, acrescido de multa compensatória de ${MODEL.withdrawalPenaltyPct}% (${e(pctWords(MODEL.withdrawalPenaltyPct))} por cento) sobre o valor restante (${100 - MODEL.alignerPct}% do valor total), deduzidos os valores já pagos. Havendo saldo a favor do(a) Paciente, será restituído em até 30 (trinta) dias; havendo saldo devedor, deverá ser pago em até 30 (trinta) dias.</b>`) +
      p(`9.3. Se a desistência ocorrer após o prazo de arrependimento, mas antes do pedido de fabricação dos alinhadores, o(a) Paciente pagará apenas a multa compensatória de ${MODEL.withdrawalPenaltyPct}% sobre o valor restante (${100 - MODEL.alignerPct}% do valor total), que cobre a documentação e o planejamento já realizados, sendo restituído o saldo em até 30 (trinta) dias.`) +
      p('9.4. A Contratada poderá rescindir o contrato em caso de descumprimento reiterado das orientações clínicas pelo(a) Paciente que inviabilize a continuidade segura do tratamento, mediante comunicação prévia por escrito.')),
    rede ? sec(10, 'Atendimento presencial e deslocamento',
      p(`10.1. As consultas presenciais (exame clínico, instalação, ajustes e acompanhamento) são realizadas por cirurgião-dentista credenciado da rede AlignSystem, indicado pela Contratada. <b>${att?.choice === 'mais_proximo_viagem'
        ? `O(A) Paciente concorda em ser atendido(a) pelo dentista credenciado mais próximo de seu município de residência${att?.city ? ` (${e(att.city)}/${e(att.uf)})` : ''}, ou por outro dentista credenciado indicado pela Contratada a distância igual ou menor, `
        : att?.choice === 'mais_proximo'
          ? `O(A) Paciente será atendido(a) preferencialmente pelo dentista credenciado mais próximo${att?.nearestCity ? ` (${e(att.nearestCity)}/${e(att.nearestUf)})` : ''} e, na falta de agenda, concorda em ser atendido(a) por qualquer dentista credenciado da rede num raio de até 300 (trezentos) quilômetros do município de residência informado${att?.city ? ` (${e(att.city)}/${e(att.uf)})` : ''}, `
          : `O(A) Paciente concorda em ser atendido(a) por qualquer dentista credenciado da rede localizado num raio de até 300 (trezentos) quilômetros do município de residência informado${att?.city ? ` (${e(att.city)}/${e(att.uf)})` : ''}, `}sendo as despesas de locomoção, deslocamento, hospedagem e alimentação de sua exclusiva responsabilidade${att?.choice === 'mais_proximo_viagem' ? ', ressalvados os deslocamentos incluídos na Cláusula 10.3' : ''}.</b>`) +
      p('10.2. Os dentistas credenciados são remunerados pelas consultas presenciais diretamente pela Contratada, sem custo adicional ao(à) Paciente além do valor previsto na Cláusula 4.') +
      (travel
        ? p(`<b>10.3. Como o dentista credenciado mais próximo do(a) Paciente está a mais de 300 km (aproximadamente ${e(att.km)} km, em ${e(att.nearestCity)}/${e(att.nearestUf)}), o valor do contrato inclui ${e(brl(travel))} referentes a ${e(att.trips || 4)} (quatro) deslocamentos de ida e volta em ônibus convencional, estimados pela Contratada. Deslocamentos além desses correm por conta do(a) Paciente. Em caso de desistência, os deslocamentos ainda não realizados são restituídos.</b>`)
        : p('10.3. Caso não haja dentista credenciado no raio de 300 km, o valor de até 4 (quatro) deslocamentos de ida e volta em ônibus convencional até o dentista credenciado mais próximo será acrescido ao valor do contrato, conforme informado ao(à) Paciente antes da contratação.')) +
      p(`10.4. A opção de atendimento foi escolhida pelo(a) Paciente no questionário da plataforma${att?.answeredAt ? ` em ${e(new Date(att.answeredAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}` : ''}${att?.choice ? `: “${e(ATT_LABEL[att.choice] || att.choice)}”` : ''}.`)) : '',
    sec(n(10), 'Uso de imagem', p('O uso de fotografias do(a) Paciente para fins de divulgação da Contratada é facultativo e depende de consentimento específico e destacado, a ser formalizado em termo apartado, podendo ser revogado a qualquer tempo pelo(a) Paciente. As fotos enviadas pela plataforma são usadas exclusivamente para avaliação e acompanhamento clínico.')),
    sec(n(11), 'Proteção de dados (LGPD)', p('Os dados pessoais e de saúde do(a) Paciente serão tratados exclusivamente para as finalidades relacionadas à execução deste contrato, com as salvaguardas exigidas pela Lei nº 13.709/2018, podendo o(a) Paciente exercer os direitos previstos na referida lei mediante solicitação pelo e-mail ' + e(process.env.PUBLIC_CONTACT_EMAIL || 'contato@alignsystem.com.br') + '.')),
    sec(n(12), 'Assinatura eletrônica', ELECTRONIC),
    sec(n(13), 'Foro', p('Fica eleito o foro do domicílio do(a) Paciente para dirimir quaisquer questões oriundas deste contrato, em conformidade com o Código de Defesa do Consumidor.')),
    `<h3>Anexo I — Plano de tratamento</h3>`,
    p(plan.treatmentNotes ? e(plan.treatmentNotes).replace(/\n/g, '<br>') : 'Plano de tratamento individualizado apresentado ao(à) Paciente após a documentação digital, com número estimado de alinhadores, etapas e consultas de acompanhamento.'),
    p(`${e(k.city)}, ${e(today())}.`),
  ].join('\n');
  return { title, body };
}

// ---------------------------------------------------------------- parceiro
export const PARTNER_DEFAULTS = {
  avulsaValue: 120,
  redeValue: 120,
  limitSimple: 8,
  limitMedium: 12,
  limitComplex: 15,
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
      p('6.1. <b>Modelos de caso.</b> Cada caso direcionado ao(à) Parceiro(a) é identificado na plataforma, no momento do direcionamento, como (a) <b>modelo parceiro</b>, em que o(a) Parceiro(a) conduz o caso e recebe percentual do valor pago pelo paciente; ou (b) <b>modelo rede</b>, em que a AlignSystem recebe a totalidade do valor pago pelo paciente e remunera o(a) Parceiro(a) por consulta presencial.') +
      p(`6.2. <b>Modelo parceiro.</b> O valor do tratamento pago pelo paciente é composto por ${MODEL.alignerPct}% referentes aos alinhadores, fornecidos pela AlignSystem; ${MODEL.dentistPct}% referentes aos atendimentos clínicos presenciais realizados pelo(a) Parceiro(a); e ${MODEL.supervisionPct}% referentes à supervisão clínica remota e ao teleatendimento prestados pela AlignSystem. Pela condução clínica integral do caso, o(a) Parceiro(a) faz jus a ${MODEL.dentistPct}% (trinta por cento) do valor efetivamente pago pelo paciente, calculado sobre o valor líquido recebido, de modo que descontos concedidos (como o desconto para pagamento à vista) e taxas da plataforma de pagamentos são suportados proporcionalmente pelas Partes. Na modalidade boleto, a entrada corresponde aos alinhadores e pertence integralmente à AlignSystem, e o(a) Parceiro(a) recebe ${(MODEL.dentistPct / (100 - MODEL.alignerPct) * 100).toFixed(0)}% de cada boleto do saldo efetivamente pago.`) +
      p(`<b>6.3. Modelo rede.</b> A AlignSystem pagará ao(à) Parceiro(a) ${e(brl(t.redeValue))} por consulta presencial realizada e validada, <b>limitado a ${e(t.limitSimple)} (${e(numWords(t.limitSimple))}) consultas nos casos simples, ${e(t.limitMedium)} (${e(numWords(t.limitMedium))}) nos casos de média complexidade e ${e(t.limitComplex)} (${e(numWords(t.limitComplex))}) nos casos complexos</b>, conforme a classificação definida no planejamento e informada na plataforma ao direcionar o caso. Consultas além do limite somente serão remuneradas se previamente autorizadas por escrito pela AlignSystem. O pagamento é feito em até ${e(t.payoutDays)} dias úteis após a validação de cada consulta.`) +
      p('6.4. <b>Desistência do paciente.</b> Em caso de desistência, a multa compensatória cobrada do paciente pertence integralmente à AlignSystem, e o(a) Parceiro(a) faz jus apenas aos valores referentes a atendimentos efetivamente realizados e registrados na plataforma: no modelo parceiro, os já recebidos; no modelo rede, as consultas já realizadas e validadas.') +
      p(`6.5. <b>Consulta avulsa.</b> Para atendimentos pontuais não vinculados à condução integral do caso pelo(a) Parceiro(a) — como ajustes, manutenções ou consultas de acompanhamento realizadas por profissional diverso do responsável original — a AlignSystem pagará o valor de ${e(brl(t.avulsaValue))} por atendimento validado, em até ${e(t.payoutDays)} dias úteis após a validação.`) +
      p('6.6. <b>Registro dos atendimentos.</b> O(A) Parceiro(a) deve registrar cada atendimento na plataforma, com fotos e anotações, como condição para o pagamento. Valores recebidos por atendimentos não realizados ou não registrados serão compensados nos repasses seguintes ou restituídos à AlignSystem.') +
      p('6.7. <b>Forma de repasse.</b> No modelo parceiro, os repasses são feitos por divisão automática de pagamento (split) na plataforma de pagamentos utilizada pela AlignSystem, creditados em conta de pagamento de titularidade do(a) Parceiro(a). No modelo rede e nas consultas avulsas, o pagamento é feito por transferência bancária, Pix ou crédito na mesma conta de pagamento, sempre em conta de titularidade do(a) Parceiro(a). O(A) Parceiro(a) autoriza a abertura dessa conta de pagamento em seu nome, com os dados fornecidos no credenciamento, e é responsável pelos tributos incidentes sobre os valores que receber.') +
      p('6.8. Os percentuais e valores desta cláusula poderão ser revistos mediante aditivo escrito, não se aplicando reajuste automático.')),
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
