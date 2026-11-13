import { reaisPorExtenso } from "./extenso";

// Contrato de prestação de serviços odontológicos montado a partir do orçamento aprovado.
// Saída em HTML simples (parágrafos, listas, negrito), no formato aceito pelos documentos do sistema.
export interface ContractItem { procedure: string; tooth?: number | string | null; region?: string | null; value: number }
export interface ContractData {
  clinic: { name: string; cnpj?: string; address?: string; city?: string; state?: string; rtName?: string; rtCro?: string };
  patient: { name: string; cpf?: string; rg?: string; address?: string; city?: string; state?: string; phone?: string };
  items: ContractItem[];
  discountPercent?: number;
  entryAmount?: number;
  installments: number;
  installmentValue: number;
  paymentMethod: string;
  dueDates?: string[]; // vencimentos das parcelas (ISO), quando já definidos
  place?: string;
  date?: Date;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dmy = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const cpfMask = (v?: string) => { const d = String(v || "").replace(/\D/g, ""); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : v || "__________________"; };
const J = 'style="text-align:justify"';
const p = (t: string) => `<p ${J}>${t}</p>`;
const h = (t: string) => `<p style="text-align:left"><b>${t}</b></p>`;
const li = (items: string[]) => `<ol style="text-align:justify;list-style-type:lower-alpha">${items.map((i) => `<li ${J}>${i}</li>`).join("")}</ol>`;

const PAYMENT_TEXT: Record<string, string> = {
  boleto: "boletos bancários emitidos pela CONTRATADA, acompanhados de uma nota promissória por parcela, assinadas pelo CONTRATANTE",
  "promissória": "notas promissórias, uma por parcela, assinadas pelo CONTRATANTE",
  "cartão": "cartão de crédito, na quantidade de parcelas ajustada neste contrato",
  pix: "PIX, nas datas de vencimento indicadas",
  "transferência": "transferência bancária, nas datas de vencimento indicadas",
  dinheiro: "dinheiro, mediante recibo emitido pela CONTRATADA",
  cheque: "cheques pré-datados, entregues no ato da assinatura deste contrato",
};
const paymentText = (m: string) => PAYMENT_TEXT[m.trim().toLowerCase()] || esc(m);
const isCarne = (m: string) => ["boleto", "promissória", "cheque", "pix", "transferência"].includes(m.trim().toLowerCase());

export function buildContractHtml(d: ContractData): string {
  const total = Math.round(d.items.reduce((s, i) => s + (Number(i.value) || 0), 0) * 100) / 100;
  const discPct = Number(d.discountPercent || 0);
  const discount = Math.round(total * discPct) / 100;
  const net = Math.round((total - discount) * 100) / 100;
  const entry = Math.round(Number(d.entryAmount || 0) * 100) / 100;
  const financed = Math.max(0, Math.round((net - entry) * 100) / 100);
  const n = Math.max(1, d.installments || 1);
  const parc = Number(d.installmentValue) || Math.round((financed / n) * 100) / 100;
  const date = d.date || new Date();
  const place = d.place || d.clinic.city || "";
  const dateLong = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const patientAddr = [d.patient.address, d.patient.city, d.patient.state].filter(Boolean).join(", ");
  const clinicAddr = [d.clinic.address, [d.clinic.city, d.clinic.state].filter(Boolean).join(" – ")].filter(Boolean).join(", ");

  const itemLines = d.items.length
    ? `<ul style="text-align:left">${d.items.map((i) => `<li>${esc(i.procedure)}${i.tooth ? ` (dente ${esc(String(i.tooth))})` : ""}${i.region ? ` — ${esc(i.region)}` : ""} — <b>${money(i.value)}</b></li>`).join("")}</ul>`
    : p("<i>(Procedimentos conforme o orçamento aprovado.)</i>");

  const dueLines = d.dueDates && d.dueDates.length
    ? `<ul style="text-align:left">${d.dueDates.map((iso, k) => `<li>Parcela ${k + 1}/${d.dueDates!.length} — vencimento em ${dmy(iso)} — ${money(parc)}</li>`).join("")}</ul>`
    : "";

  const pay: string[] = [];
  pay.push(p(`<b>CLÁUSULA 3ª:</b> Pelos serviços descritos na Cláusula 1ª, o CONTRATANTE pagará à CONTRATADA o valor correspondente à <b>soma dos procedimentos acima discriminados: ${money(total)}</b> (${esc(reaisPorExtenso(total))}).`));
  if (discount > 0) pay.push(p(`Sobre esse valor foi concedido desconto de ${discPct.toLocaleString("pt-BR")}% (${money(discount)}), resultando no <b>valor final de ${money(net)}</b> (${esc(reaisPorExtenso(net))}).`));
  const parts: string[] = [];
  if (entry > 0) parts.push(`entrada de <b>${money(entry)}</b> (${esc(reaisPorExtenso(entry))}), paga no ato da assinatura`);
  if (financed > 0) parts.push(`o saldo de <b>${money(financed)}</b> em <b>${n} parcela${n > 1 ? "s" : ""} de ${money(parc)}</b>`);
  pay.push(p(`<b>Parágrafo Primeiro — Forma de pagamento escolhida pelo CONTRATANTE:</b> ${esc(d.paymentMethod)}. O pagamento será feito da seguinte forma: ${parts.join("; ") || "à vista"}, por meio de ${paymentText(d.paymentMethod)}.`));
  if (dueLines) pay.push(p("<b>Vencimentos:</b>") + dueLines);
  if (isCarne(d.paymentMethod) && financed > 0) pay.push(p(`<b>Parágrafo Segundo:</b> O atraso no pagamento de qualquer parcela sujeitará o CONTRATANTE a multa de 2% (dois por cento) sobre o valor em atraso, juros de mora de 1% (um por cento) ao mês, calculados pro rata die, e correção monetária pelo índice IPCA, até o efetivo pagamento.`));
  pay.push(p(`<b>Parágrafo Terceiro — Procedimentos efetivamente executados:</b> O CONTRATANTE somente é devedor dos procedimentos efetivamente executados. A execução de cada procedimento será registrada no prontuário e confirmada pelo CONTRATANTE por assinatura (física ou eletrônica), servindo esse registro como comprovante. Em caso de interrupção do tratamento, rescisão ou abandono, será devido o valor dos procedimentos já executados, conforme os valores individuais da Cláusula 1ª, deduzidos os pagamentos já realizados, <b>não sendo cobrados procedimentos não executados</b>.`));
  pay.push(p(`<b>Parágrafo Quarto:</b> Persistindo o inadimplemento por mais de 30 (trinta) dias, a CONTRATADA poderá considerar vencidas as parcelas vincendas dos procedimentos já executados, promover a cobrança extrajudicial e judicial e, <b>após prévia notificação ao CONTRATANTE</b>, levar o débito a protesto e a cadastros de proteção ao crédito, sem prejuízo das demais medidas legais.`));

  const html = [
    `<p style="text-align:center"><b>CONTRATO DE PRESTAÇÃO DE SERVIÇOS ODONTOLÓGICOS</b></p>`,
    p(`Pelo presente instrumento particular, de um lado <b>${esc(d.patient.name)}</b>, portador(a) do CPF nº ${esc(cpfMask(d.patient.cpf))}${d.patient.rg ? `, RG nº ${esc(d.patient.rg)}` : ""}, residente e domiciliado(a) em ${esc(patientAddr || "__________________________________________")}${d.patient.phone ? `, telefone ${esc(d.patient.phone)}` : ""}, doravante denominado(a) <b>CONTRATANTE</b>; e, de outro lado, <b>${esc(d.clinic.name)}</b>, inscrita no CNPJ nº ${esc(cpfMask(d.clinic.cnpj))}, com sede em ${esc(clinicAddr || "__________________________________________")}${d.clinic.rtName ? `, tendo como responsável técnico(a) ${esc(d.clinic.rtName)}${d.clinic.rtCro ? ` (${esc(d.clinic.rtCro)})` : ""}` : ""}, doravante denominada <b>CONTRATADA</b>, resolvem celebrar, de comum acordo, o presente Contrato de Prestação de Serviços Odontológicos, com fundamento no Código Civil, no Código de Defesa do Consumidor e no Código de Ética Odontológica, que se regerá pelas cláusulas e condições a seguir.`),
    h("DO OBJETO DO CONTRATO"),
    p(`<b>CLÁUSULA 1ª:</b> O presente instrumento tem por objeto a prestação de serviços odontológicos pela CONTRATADA, apta e habilitada à realização plena e segura dos procedimentos abaixo descritos no(a) paciente <b>${esc(d.patient.name)}</b>, com o valor de cada um:`),
    itemLines,
    p(`<b>Parágrafo Primeiro:</b> Os serviços contratados compreendem a realização dos procedimentos acima, nas datas e horários previamente agendados.`),
    p(`<b>Parágrafo Segundo:</b> Se, no decorrer do ato odontológico (planejamento e execução), for verificada a necessidade ou a viabilidade de procedimento não previsto na Cláusula 1ª, a CONTRATADA somente o realizará mediante <b>prévio orçamento e concordância expressa do CONTRATANTE</b>, que será registrada por escrito, com o respectivo valor, como aditivo a este contrato.`),
    p(`<b>Parágrafo Terceiro:</b> O CONTRATANTE declara-se ciente dos produtos e materiais utilizados, bem como de que, apesar da previsão industrial de durabilidade, esse prazo pode sofrer oscilações por fatores imponderáveis que influenciam o tratamento, especialmente a conduta do CONTRATANTE e sua postura enquanto paciente.`),
    h("DOS ESCLARECIMENTOS"),
    p(`<b>CLÁUSULA 2ª:</b> O CONTRATANTE declara, de boa-fé e com plena autonomia, que a CONTRATADA foi clara, didática e transparente quanto aos procedimentos a serem realizados, informando a necessidade, o conceito, as dores, os riscos, os desconfortos, os efeitos colaterais possíveis, as alternativas e as expectativas em relação ao potencial resultado, entre outras situações que possam gerar modificações no cenário. Declara, ainda, que os procedimentos gerarão resultados alinhados com as suas condições fisiológicas, anatômicas e orgânicas.`),
    p(`<b>Parágrafo Único:</b> O CONTRATANTE tem consciência de que não há garantia de satisfação com o procedimento, mas sim o dever do profissional de saúde de seguir o roteiro técnico mais adequado e fazer o melhor possível dentro das condições e circunstâncias presentes.`),
    h("DOS CUSTOS E DA FORMA DE PAGAMENTO"),
    ...pay,
    h("OBRIGAÇÕES DO CONTRATANTE"),
    p(`<b>CLÁUSULA 4ª:</b> São obrigações do CONTRATANTE:`),
    li([
      "compreender sua posição de corresponsável no tratamento e seguir rigorosamente as orientações do profissional, no âmbito pré e pós-procedimental, informando qualquer desconforto sentido, sob pena de responder pelo potencial insucesso do tratamento;",
      "manter atualizado o cadastro junto à CONTRATADA, para eficiência na comunicação e agilidade nos agendamentos;",
      "honrar o pagamento dos honorários profissionais, de acordo com as condições pactuadas, sob pena de suspensão do tratamento, observados os devidos cuidados de saúde;",
      "informar seu histórico de saúde, sensibilidade e alergias a medicamentos e anestésicos, problemas de sangramento, infecções recentes, e fornecer documentos e informações sobre tratamentos anteriores;",
      "comparecer pontualmente às consultas agendadas, desmarcando-as apenas em casos justificados e com antecedência;",
      "acatar as recomendações e prescrições do profissional relativas a medicamentos, controles e cuidados antes, durante e após o tratamento, conforme instruções repassadas por escrito a cada procedimento realizado;",
      "realizar os exames solicitados, de modo a propiciar condições para o diagnóstico e o desenrolar do tratamento, ficando o profissional livre para não realizar procedimentos para os quais não tenha os subsídios necessários, em razão de desídia ou negligência do paciente;",
      "comparecer às consultas, em especial às de continuidade de tratamento já iniciado ou urgente, sob risco de comprometer o sucesso dos serviços contratados;",
      "avisar imediatamente qualquer sinal, indício ou fato que denote reação adversa, intercorrência ou complicação, devendo procurar diretamente o profissional responsável e não outro profissional sem o devido conhecimento do histórico odontológico.",
    ]),
    p(`<b>Parágrafo Único:</b> Caso o CONTRATANTE deixe de comparecer nas datas e horários definidos, abandonando o tratamento, a CONTRATADA exime-se da responsabilidade pelos resultados esperados dos procedimentos, ficando rescindido o presente contrato, sendo devido o pagamento dos procedimentos efetivamente executados até a data do abandono, nos termos do Parágrafo Terceiro da Cláusula 3ª.`),
    h("OBRIGAÇÕES DA CONTRATADA"),
    p(`<b>CLÁUSULA 5ª:</b> São obrigações da CONTRATADA:`),
    li([
      "executar o tratamento indicado em ambiente de trabalho seguro, observando os padrões de higiene e sanitários aplicáveis;",
      "realizar os procedimentos de acordo com a melhor técnica, observando o estado atual da ciência, o zelo, a prudência e a honestidade;",
      "esclarecer previamente o CONTRATANTE sobre as especificações de cada procedimento, contratado ou eventual, suas vantagens, riscos, consequências e valores (honorários);",
      "informar o CONTRATANTE, a cada procedimento realizado, sobre o plano de tratamento e sua sequência (evolução), registrando o procedimento no prontuário;",
      "observar os preceitos éticos do Código de Ética Odontológica e as demais legislações pertinentes;",
      "resguardar a privacidade do CONTRATANTE durante e após o tratamento, notadamente o prontuário e os dados sensíveis (Lei Geral de Proteção de Dados);",
      "acompanhar o CONTRATANTE durante todo o tratamento e prestar a assistência necessária no período pós-procedimental, até a completa recuperação;",
      "fornecer o prontuário odontológico e tudo o que dele faz parte, quando solicitado pelo titular, mediante agendamento prévio.",
    ]),
    h("DA RESPONSABILIDADE"),
    p(`<b>CLÁUSULA 6ª:</b> A responsabilidade assumida pela CONTRATADA é de meio: incumbe ao profissional agir dentro da melhor técnica na execução dos serviços, empregando todos os esforços e meios necessários ao alcance do objetivo possível, sem se responsabilizar pelo resultado, uma vez que a atividade é permeada pelo imponderável da vida humana e por outras variáveis inerentes ao serviço.`),
    p(`<b>Parágrafo Primeiro:</b> A CONTRATADA não se responsabilizará por consequências ao tratamento, nem por prejuízos financeiros, estéticos e morais, decorrentes da não cooperação do CONTRATANTE antes, durante e após o tratamento, ou da omissão de informações relevantes para o diagnóstico (anamnese) e prognóstico do caso.`),
    p(`<b>Parágrafo Segundo:</b> Considera-se não cooperação, para os fins deste instrumento, o não comparecimento às consultas agendadas, atrasos injustificados, o abandono do tratamento e a não observância das recomendações prescritas pelo cirurgião-dentista, entre outras hipóteses.`),
    p(`<b>Parágrafo Terceiro:</b> Considerados os riscos inerentes ao tratamento, a CONTRATADA não se responsabilizará por efeitos imprevisíveis ou de baixíssima previsibilidade decorrentes da execução dos serviços, desde que observada a boa técnica, nos termos do §1º do art. 14 da Lei nº 8.078/1990 (Código de Defesa do Consumidor), do Código de Ética Odontológica e das causas excludentes de responsabilidade e culpabilidade.`),
    p(`<b>Parágrafo Quarto:</b> A CONTRATADA não se responsabiliza, salvo nos casos de manejo inadequado, por defeito proveniente de máquina, equipamento, material ou substância, cabendo a responsabilidade ao fornecedor do produto.`),
    h("DA PROTEÇÃO DE DADOS"),
    p(`<b>CLÁUSULA 7ª:</b> Em cumprimento à Lei Geral de Proteção de Dados (Lei nº 13.709/2018), a CONTRATADA informa ao CONTRATANTE que os dados pessoais e de saúde coletados serão utilizados para viabilizar a execução deste contrato e o atendimento odontológico, e armazenados durante a vigência do contrato e pelo período em que sua guarda for exigida por lei ou justificada por outra hipótese legal prevista na LGPD, em especial a guarda do prontuário.`),
    p(`<b>Parágrafo Único:</b> As partes declaram-se cientes dos direitos, obrigações e penalidades da LGPD e obrigam-se a adotar as medidas razoáveis para garantir, por si e por seus colaboradores, empregados e subcontratados, o uso dos dados protegidos nos limites autorizados.`),
    h("DA RESCISÃO CONTRATUAL"),
    p(`<b>CLÁUSULA 8ª:</b> Além das hipóteses legais, o presente instrumento poderá ser rescindido pelas partes em caso de descumprimento de qualquer cláusula ou condição pactuada, bem como pela perda da relação de confiança entre profissional e paciente, com as consequências previstas neste contrato.`),
    p(`<b>Parágrafo Primeiro:</b> A parte que der causa à rescisão responderá pelas perdas e danos comprovadamente ocasionados à parte inocente.`),
    p(`<b>Parágrafo Segundo:</b> Em qualquer hipótese de rescisão, o CONTRATANTE pagará os procedimentos efetivamente executados e ainda não quitados, e a CONTRATADA devolverá, se houver, os valores pagos por procedimentos não executados.`),
    h("DO EQUILÍBRIO CONTRATUAL"),
    p(`<b>CLÁUSULA 9ª:</b> Ajustam as partes, nos termos dos arts. 317, 478 e 479 do Código Civil, que, se por motivos imprevisíveis ocorrer desproporção manifesta entre o valor ajustado e o custo do serviço no momento de sua execução, as partes buscarão, <b>de comum acordo e por escrito</b>, o reequilíbrio econômico-financeiro do contrato.`),
    h("DA ASSINATURA"),
    p(`<b>CLÁUSULA 10ª:</b> As partes reconhecem como válida a assinatura física, digital ou eletrônica deste instrumento e dos registros de execução dos procedimentos, nos termos da legislação vigente, comprometendo-se a não impugná-las.`),
    h("DA AUTORIZAÇÃO DE USO DE IMAGEM (OPCIONAL)"),
    p(`<b>CLÁUSULA 11ª:</b> O CONTRATANTE, em campo próprio e de forma facultativa, ${"( &nbsp; ) AUTORIZA &nbsp;&nbsp; ( &nbsp; ) NÃO AUTORIZA"} a utilização dos registros do seu tratamento (fotografias e exames) para estudos e divulgação científica, inclusive em meios digitais, sempre preservada a sua identidade. A recusa não interfere no atendimento.`),
    h("DO TÍTULO EXECUTIVO"),
    p(`<b>CLÁUSULA 12ª:</b> As partes reconhecem este contrato, assinado pelo CONTRATANTE e por duas testemunhas, como título executivo extrajudicial, nos termos do art. 784, III, do Código de Processo Civil, quanto às obrigações de pagamento nele previstas.`),
    h("DO FORO"),
    p(`<b>CLÁUSULA 13ª:</b> As partes elegem o foro da comarca do domicílio do CONTRATANTE para dirimir quaisquer questões decorrentes deste contrato.`),
    p(`E, por estarem justas e contratadas, firmam o presente em 02 (duas) vias de igual teor e forma, na presença de duas testemunhas.`),
    `<div><p style="text-align:center">${esc(place)}${place ? ", " : ""}${dateLong}.</p>`,
    `<p style="text-align:center"><br><br>________________________________________<br><b>CONTRATANTE</b><br>${esc(d.patient.name)}<br>CPF ${esc(cpfMask(d.patient.cpf))}</p>`,
    `<p style="text-align:center"><br><br>________________________________________<br><b>CONTRATADA</b><br>${esc(d.clinic.name)}<br>CNPJ ${esc(cpfMask(d.clinic.cnpj))}</p>`,
    `<p style="text-align:center"><br><b>TESTEMUNHAS</b></p>`,
    `<p style="text-align:center"><br>________________________________________<br>Nome: ____________________________ CPF: ________________</p>`,
    `<p style="text-align:center"><br>________________________________________<br>Nome: ____________________________ CPF: ________________</p></div>`,
  ];
  return html.join("");
}
