// Modelo único de pagamento e composição do valor do tratamento.
//  - Pix à vista com desconto; cartão de crédito em até 18x sem juros (taxa absorvida e rateada);
//    boleto: entrada de 50% (Pix ou cartão) + saldo em até 18 boletos mensais.
//  - Composição: 50% alinhadores (AlignSystem), 30% atendimentos do dentista parceiro,
//    20% supervisão clínica remota e teleatendimento (AlignSystem).
//  - Descontos e taxas são compartilhados: o repasse ao dentista é percentual sobre o valor líquido.
export const MODEL = {
  pixDiscountPct: 12,
  cardMaxInstallments: 18,
  boletoEntryPct: 50,
  boletoMaxInstallments: 18,
  alignerPct: 50,
  dentistPct: 30,
  supervisionPct: 20,
  withdrawalPenaltyPct: 20,
};

const round2 = (n) => Math.round(n * 100) / 100;

export function quote(total, { cardMax = MODEL.cardMaxInstallments, boletoMax = MODEL.boletoMaxInstallments, boleto = true } = {}) {
  const t = Number(total);
  const pix = round2(t * (1 - MODEL.pixDiscountPct / 100));
  const entry = round2(t * MODEL.boletoEntryPct / 100);
  const rest = round2(t - entry);
  return {
    total: t,
    pix,
    card: Array.from({ length: cardMax }, (_, i) => ({ installments: i + 1, each: round2(t / (i + 1)) })),
    boleto: boleto ? { entry, rest, options: Array.from({ length: boletoMax }, (_, i) => ({ installments: i + 1, each: round2(rest / (i + 1)) })) } : null,
  };
}

// Percentual do dentista sobre cada cobrança (aplicado pelo Asaas sobre o valor líquido)
export function dentistSplitPct(part) {
  if (part === 'boleto_entry') return 0; // entrada = alinhadores, 100% AlignSystem
  if (part === 'boleto_rest') return round2(MODEL.dentistPct / (100 - MODEL.alignerPct) * 100); // 30/50 = 60%
  return MODEL.dentistPct; // Pix ou cartão: 30% do total pago
}
