import { loadBrandKit } from "../services/BrandKitApi";
import { reaisPorExtenso } from "./promissory";

type Pay = { installment: number; amount: number; dueDate: string };
type Item = { procedure: string; tooth?: string | number | null; planningData?: unknown };
type Patient = { fullName?: string; cpf?: string | null; rg?: string | null; phone?: string | null; address?: string | null; city?: string | null; state?: string | null };
type Budget = { totalAmount: number; installments: number; installmentValue: number; entryAmount?: number; discountPercent?: number; paymentMethod?: string; description?: string; payments?: Pay[] };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ext = (v: number) => `${brl(v)} (${reaisPorExtenso(v)})`;
const dmy = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const maskDoc = (v?: string | null) => { const d = String(v || "").replace(/\D/g, ""); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : String(v || "").trim(); };

// Contrato de prestação de serviços odontológicos (texto revisado), preenchido com os dados do paciente, da clínica e do orçamento.
export async function buildContractText(opts: { patient?: Patient; budget: Budget; items: Item[]; professional: string }): Promise<string> {
  const p = opts.patient || {};
  const b = opts.budget;
  let clinicName = "CONTRATADA", cnpj = "", seat = "", rt = opts.professional, city = p.city || "";
  try {
    const r = await loadBrandKit();
    const c = r.clinic; const k = r.kit || {};
    clinicName = c.displayName || c.name || clinicName;
    cnpj = c.cnpj || "";
    seat = [c.address, [c.city, c.state].filter(Boolean).join(" – ")].filter(Boolean).join(", ");
    if (k.rtName) rt = `${k.rtName}${k.rtCro ? ` (${k.rtCro})` : ""}`;
    city = c.city || city;
  } catch { /* sem identidade: usa o que houver */ }

  const name = (p.fullName || "PACIENTE").toUpperCase();
  const residence = [p.address, p.city, p.state].filter(Boolean).join(", ");
  const doc = (v: unknown) => Number((((v || {}) as { unitValue?: number }).unitValue) || 0);
  const lines = opts.items.map((i) => `${i.procedure}${i.tooth ? ` (dente ${i.tooth})` : ""} — ${brl(doc(i.planningData))}`);
  const sum = opts.items.reduce((s, i) => s + doc(i.planningData), 0);
  const final = Number(b.totalAmount || 0);
  const pct = Number(b.discountPercent || 0);
  const gross = sum > 0 ? sum : pct > 0 && pct < 100 ? Math.round((final / (1 - pct / 100)) * 100) / 100 : final;
  const discountMoney = Math.max(0, Math.round((gross - final) * 100) / 100);
  const entry = Number(b.entryAmount || 0);
  const n = Math.max(1, Number(b.installments || 1));
  const balance = Math.round((final - entry) * 100) / 100;
  const method = String(b.paymentMethod || "").trim();
  const boleto = /boleto|promiss/i.test(method);
  const pays = (b.payments || []).filter((x) => x.installment >= 1).sort((a, c) => a.installment - c.installment);
  const due = pays.length ? pays.map((x) => `Parcela ${x.installment}/${pays.length} — vencimento em ${dmy(x.dueDate)} — ${brl(Number(x.amount))}`) : [];

  const payment = [
    `Parágrafo Primeiro — Forma de pagamento escolhida pelo CONTRATANTE: ${method || "a combinar"}. O pagamento será feito da seguinte forma: ${entry > 0 ? `entrada de ${ext(entry)}, paga no ato da assinatura; o saldo de ${brl(balance)} em ${n === 1 ? "1 parcela" : `${n} parcelas`} de ${brl(Number(b.installmentValue || 0))}` : `${brl(balance)} em ${n === 1 ? "1 parcela" : `${n} parcelas`} de ${brl(Number(b.installmentValue || 0))}`}${boleto ? ", por meio de boletos bancários emitidos pela CONTRATADA, acompanhados de uma nota promissória por parcela, assinadas pelo CONTRATANTE" : method ? `, por meio de ${method}` : ""}.`,
    ...(due.length ? ["Vencimentos:", ...due] : []),
  ];

  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  const T = (...x: string[]) => x;
  return [
    "CONTRATO DE PRESTAÇÃO DE SERVIÇOS ODONTOLÓGICOS", "",
    `Pelo presente instrumento particular, de um lado ${name}${p.cpf ? `, portador(a) do CPF nº ${maskDoc(p.cpf)}` : ""}${p.rg ? `, RG nº ${p.rg}` : ""}${residence ? `, residente e domiciliado(a) em ${residence}` : ""}${p.phone ? `, telefone ${p.phone}` : ""}, doravante denominado(a) CONTRATANTE; e, de outro lado, ${clinicName}${cnpj ? `, inscrita no CNPJ nº ${cnpj}` : ""}${seat ? `, com sede em ${seat}` : ""}, tendo como responsável técnico(a) ${rt}, doravante denominada CONTRATADA, resolvem celebrar, de comum acordo, o presente Contrato de Prestação de Serviços Odontológicos, com fundamento no Código Civil, no Código de Defesa do Consumidor e no Código de Ética Odontológica, que se regerá pelas cláusulas e condições a seguir.`, "",
    "DO OBJETO DO CONTRATO",
    `CLÁUSULA 1ª: O presente instrumento tem por objeto a prestação de serviços odontológicos pela CONTRATADA, apta e habilitada à realização plena e segura dos procedimentos abaixo descritos no(a) paciente ${name}, com o valor de cada um:`,
    ...(lines.length ? lines : [`Conforme o orçamento: ${b.description || ""}`]),
    "Parágrafo Primeiro: Os serviços contratados compreendem a realização dos procedimentos acima, nas datas e horários previamente agendados.",
    "Parágrafo Segundo: Se, no decorrer do ato odontológico (planejamento e execução), for verificada a necessidade ou a viabilidade de procedimento não previsto na Cláusula 1ª, a CONTRATADA somente o realizará mediante prévio orçamento e concordância expressa do CONTRATANTE, que será registrada por escrito, com o respectivo valor, como aditivo a este contrato.",
    "Parágrafo Terceiro: O CONTRATANTE declara-se ciente dos produtos e materiais utilizados, bem como de que, apesar da previsão industrial de durabilidade, esse prazo pode sofrer oscilações por fatores imponderáveis que influenciam o tratamento, especialmente a conduta do CONTRATANTE e sua postura enquanto paciente.", "",
    "DOS ESCLARECIMENTOS",
    "CLÁUSULA 2ª: O CONTRATANTE declara, de boa-fé e com plena autonomia, que a CONTRATADA foi clara, didática e transparente quanto aos procedimentos a serem realizados, informando a necessidade, o conceito, as dores, os riscos, os desconfortos, os efeitos colaterais possíveis, as alternativas e as expectativas em relação ao potencial resultado, entre outras situações que possam gerar modificações no cenário. Declara, ainda, que os procedimentos gerarão resultados alinhados com as suas condições fisiológicas, anatômicas e orgânicas.",
    "Parágrafo Único: O CONTRATANTE tem consciência de que não há garantia de satisfação com o procedimento, mas sim o dever do profissional de saúde de seguir o roteiro técnico mais adequado e fazer o melhor possível dentro das condições e circunstâncias presentes.", "",
    "DOS CUSTOS E DA FORMA DE PAGAMENTO",
    `CLÁUSULA 3ª: Pelos serviços descritos na Cláusula 1ª, o CONTRATANTE pagará à CONTRATADA o valor correspondente à soma dos procedimentos acima discriminados: ${ext(gross)}.${discountMoney > 0 ? ` Sobre esse valor foi concedido desconto de ${pct > 0 ? `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% ` : ""}(${brl(discountMoney)}), resultando no valor final de ${ext(final)}.` : ""}`,
    ...payment,
    "Parágrafo Segundo: O atraso no pagamento de qualquer parcela sujeitará o CONTRATANTE a multa de 2% (dois por cento) sobre o valor em atraso, juros de mora de 1% (um por cento) ao mês, calculados pro rata die, e correção monetária pelo índice IPCA, até o efetivo pagamento.",
    "Parágrafo Terceiro — Procedimentos efetivamente executados: O CONTRATANTE somente é devedor dos procedimentos efetivamente executados. A execução de cada procedimento será registrada no prontuário e confirmada pelo CONTRATANTE por assinatura (física ou eletrônica), servindo esse registro como comprovante. Em caso de interrupção do tratamento, rescisão ou abandono, será devido o valor dos procedimentos já executados, conforme os valores individuais da Cláusula 1ª, deduzidos os pagamentos já realizados, não sendo cobrados procedimentos não executados.",
    "Parágrafo Quarto: Persistindo o inadimplemento por mais de 30 (trinta) dias, a CONTRATADA poderá considerar vencidas as parcelas vincendas dos procedimentos já executados, promover a cobrança extrajudicial e judicial e, após prévia notificação ao CONTRATANTE, levar o débito a protesto e a cadastros de proteção ao crédito, sem prejuízo das demais medidas legais.", "",
    "OBRIGAÇÕES DO CONTRATANTE",
    "CLÁUSULA 4ª: São obrigações do CONTRATANTE:",
    ...T(
      "a. compreender sua posição de corresponsável no tratamento e seguir rigorosamente as orientações do profissional, no âmbito pré e pós-procedimental, informando qualquer desconforto sentido, sob pena de responder pelo potencial insucesso do tratamento;",
      "b. manter atualizado o cadastro junto à CONTRATADA, para eficiência na comunicação e agilidade nos agendamentos;",
      "c. honrar o pagamento dos honorários profissionais, de acordo com as condições pactuadas, sob pena de suspensão do tratamento, observados os devidos cuidados de saúde;",
      "d. informar seu histórico de saúde, sensibilidade e alergias a medicamentos e anestésicos, problemas de sangramento, infecções recentes, e fornecer documentos e informações sobre tratamentos anteriores;",
      "e. comparecer pontualmente às consultas agendadas, desmarcando-as apenas em casos justificados e com antecedência;",
      "f. acatar as recomendações e prescrições do profissional relativas a medicamentos, controles e cuidados antes, durante e após o tratamento, conforme instruções repassadas por escrito a cada procedimento realizado;",
      "g. realizar os exames solicitados, de modo a propiciar condições para o diagnóstico e o desenrolar do tratamento, ficando o profissional livre para não realizar procedimentos para os quais não tenha os subsídios necessários, em razão de desídia ou negligência do paciente;",
      "h. comparecer às consultas, em especial às de continuidade de tratamento já iniciado ou urgente, sob risco de comprometer o sucesso dos serviços contratados;",
      "i. avisar imediatamente qualquer sinal, indício ou fato que denote reação adversa, intercorrência ou complicação, devendo procurar diretamente o profissional responsável e não outro profissional sem o devido conhecimento do histórico odontológico.",
    ),
    "Parágrafo Único: Caso o CONTRATANTE deixe de comparecer nas datas e horários definidos, abandonando o tratamento, a CONTRATADA exime-se da responsabilidade pelos resultados esperados dos procedimentos, ficando rescindido o presente contrato, sendo devido o pagamento dos procedimentos efetivamente executados até a data do abandono, nos termos do Parágrafo Terceiro da Cláusula 3ª.", "",
    "OBRIGAÇÕES DA CONTRATADA",
    "CLÁUSULA 5ª: São obrigações da CONTRATADA:",
    ...T(
      "a. executar o tratamento indicado em ambiente de trabalho seguro, observando os padrões de higiene e sanitários aplicáveis;",
      "b. realizar os procedimentos de acordo com a melhor técnica, observando o estado atual da ciência, o zelo, a prudência e a honestidade;",
      "c. esclarecer previamente o CONTRATANTE sobre as especificações de cada procedimento, contratado ou eventual, suas vantagens, riscos, consequências e valores (honorários);",
      "d. informar o CONTRATANTE, a cada procedimento realizado, sobre o plano de tratamento e sua sequência (evolução), registrando o procedimento no prontuário;",
      "e. observar os preceitos éticos do Código de Ética Odontológica e as demais legislações pertinentes;",
      "f. resguardar a privacidade do CONTRATANTE durante e após o tratamento, notadamente o prontuário e os dados sensíveis (Lei Geral de Proteção de Dados);",
      "g. acompanhar o CONTRATANTE durante todo o tratamento e prestar a assistência necessária no período pós-procedimental, até a completa recuperação;",
      "h. fornecer o prontuário odontológico e tudo o que dele faz parte, quando solicitado pelo titular, mediante agendamento prévio.",
    ), "",
    "DA RESPONSABILIDADE",
    "CLÁUSULA 6ª: A responsabilidade assumida pela CONTRATADA é de meio: incumbe ao profissional agir dentro da melhor técnica na execução dos serviços, empregando todos os esforços e meios necessários ao alcance do objetivo possível, sem se responsabilizar pelo resultado, uma vez que a atividade é permeada pelo imponderável da vida humana e por outras variáveis inerentes ao serviço.",
    "Parágrafo Primeiro: A CONTRATADA não se responsabilizará por consequências ao tratamento, nem por prejuízos financeiros, estéticos e morais, decorrentes da não cooperação do CONTRATANTE antes, durante e após o tratamento, ou da omissão de informações relevantes para o diagnóstico (anamnese) e prognóstico do caso.",
    "Parágrafo Segundo: Considera-se não cooperação, para os fins deste instrumento, o não comparecimento às consultas agendadas, atrasos injustificados, o abandono do tratamento e a não observância das recomendações prescritas pelo cirurgião-dentista, entre outras hipóteses.",
    "Parágrafo Terceiro: Considerados os riscos inerentes ao tratamento, a CONTRATADA não se responsabilizará por efeitos imprevisíveis ou de baixíssima previsibilidade decorrentes da execução dos serviços, desde que observada a boa técnica, nos termos do §1º do art. 14 da Lei nº 8.078/1990 (Código de Defesa do Consumidor), do Código de Ética Odontológica e das causas excludentes de responsabilidade e culpabilidade.",
    "Parágrafo Quarto: A CONTRATADA não se responsabiliza, salvo nos casos de manejo inadequado, por defeito proveniente de máquina, equipamento, material ou substância, cabendo a responsabilidade ao fornecedor do produto.", "",
    "DA PROTEÇÃO DE DADOS",
    "CLÁUSULA 7ª: Em cumprimento à Lei Geral de Proteção de Dados (Lei nº 13.709/2018), a CONTRATADA informa ao CONTRATANTE que os dados pessoais e de saúde coletados serão utilizados para viabilizar a execução deste contrato e o atendimento odontológico, e armazenados durante a vigência do contrato e pelo período em que sua guarda for exigida por lei ou justificada por outra hipótese legal prevista na LGPD, em especial a guarda do prontuário.",
    "Parágrafo Único: As partes declaram-se cientes dos direitos, obrigações e penalidades da LGPD e obrigam-se a adotar as medidas razoáveis para garantir, por si e por seus colaboradores, empregados e subcontratados, o uso dos dados protegidos nos limites autorizados.", "",
    "DA RESCISÃO CONTRATUAL",
    "CLÁUSULA 8ª: Além das hipóteses legais, o presente instrumento poderá ser rescindido pelas partes em caso de descumprimento de qualquer cláusula ou condição pactuada, bem como pela perda da relação de confiança entre profissional e paciente, com as consequências previstas neste contrato.",
    "Parágrafo Primeiro: A parte que der causa à rescisão responderá pelas perdas e danos comprovadamente ocasionados à parte inocente.",
    "Parágrafo Segundo: Em qualquer hipótese de rescisão, o CONTRATANTE pagará os procedimentos efetivamente executados e ainda não quitados, e a CONTRATADA devolverá, se houver, os valores pagos por procedimentos não executados.", "",
    "DO EQUILÍBRIO CONTRATUAL",
    "CLÁUSULA 9ª: Ajustam as partes, nos termos dos arts. 317, 478 e 479 do Código Civil, que, se por motivos imprevisíveis ocorrer desproporção manifesta entre o valor ajustado e o custo do serviço no momento de sua execução, as partes buscarão, de comum acordo e por escrito, o reequilíbrio econômico-financeiro do contrato.", "",
    "DA ASSINATURA",
    "CLÁUSULA 10ª: As partes reconhecem como válida a assinatura física, digital ou eletrônica deste instrumento e dos registros de execução dos procedimentos, nos termos da legislação vigente, comprometendo-se a não impugná-las.", "",
    "DA AUTORIZAÇÃO DE USO DE IMAGEM (OPCIONAL)",
    "CLÁUSULA 11ª: O CONTRATANTE, em campo próprio e de forma facultativa, (   ) AUTORIZA    (   ) NÃO AUTORIZA a utilização dos registros do seu tratamento (fotografias e exames) para estudos e divulgação científica, inclusive em meios digitais, sempre preservada a sua identidade. A recusa não interfere no atendimento.", "",
    "DO TÍTULO EXECUTIVO",
    "CLÁUSULA 12ª: As partes reconhecem este contrato, assinado pelo CONTRATANTE e por duas testemunhas, como título executivo extrajudicial, nos termos do art. 784, III, do Código de Processo Civil, quanto às obrigações de pagamento nele previstas.", "",
    "DO FORO",
    "CLÁUSULA 13ª: As partes elegem o foro da comarca do domicílio do CONTRATANTE para dirimir quaisquer questões decorrentes deste contrato.", "",
    "E, por estarem justas e contratadas, firmam o presente em 02 (duas) vias de igual teor e forma, na presença de duas testemunhas.", "",
    `${city ? `${city}, ` : ""}${hoje}.`, "",
    "________________________________________",
    `CONTRATANTE: ${name}${p.cpf ? ` — CPF ${maskDoc(p.cpf)}` : ""}`, "",
    "________________________________________",
    `CONTRATADA: ${clinicName}${cnpj ? ` — CNPJ ${cnpj}` : ""}`, "",
    "TESTEMUNHAS", "",
    "________________________________________",
    "Nome: ____________________________ CPF: ________________", "",
    "________________________________________",
    "Nome: ____________________________ CPF: ________________",
  ].join("\n");
}
