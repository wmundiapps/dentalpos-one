// Taxa de sucesso do Vendeu: o anunciante NÃO paga para anunciar. Só paga quando vende (ou aluga)
// e retira o anúncio. Valores em centavos (inteiros), para nunca ter erro de arredondamento.

export interface FeeTier { upToCents: number; feeCents: number }

/** Faixas definidas pelo dono do produto. Até o valor (inclusive) → taxa. */
export const FEE_TIERS: FeeTier[] = [
  { upToCents: 150_00, feeCents: 15_00 },
  { upToCents: 500_00, feeCents: 20_00 },
  { upToCents: 1_000_00, feeCents: 30_00 },
  { upToCents: 1_500_00, feeCents: 50_00 },
  { upToCents: 2_000_00, feeCents: 80_00 },
  { upToCents: 3_000_00, feeCents: 100_00 },
];

/** Acima de R$ 3.000: a taxa de R$ 100 sobe R$ 50 a cada R$ 1.000 (ou fração) acima de R$ 3.000. */
export const FEE_STEP_ABOVE_CENTS = 1_000_00;
export const FEE_STEP_INCREMENT_CENTS = 50_00;
export const FEE_BASE_ABOVE_CENTS = 100_00;
export const FEE_TOP_TIER_LIMIT_CENTS = 3_000_00;

/** Retirar um anúncio já publicado sem ter vendido/alugado: taxa fixa (centavos). */
export const REMOVAL_FEE_CENTS = 10_00;

/** Valor mínimo/máximo aceito para anúncio (evita R$ 0 e erros de digitação). */
export const MIN_PRICE_CENTS = 1_00;
export const MAX_PRICE_CENTS = 100_000_000_00;

/** Teto opcional da taxa (centavos). 0 = sem teto. Configurável por quem opera (ver server/src/config.ts). */
export function calcFeeCents(priceCents: number, capCents = 0): number {
  if (!Number.isInteger(priceCents) || priceCents < MIN_PRICE_CENTS) throw new RangeError('invalid_price');
  let fee: number;
  const tier = FEE_TIERS.find((t) => priceCents <= t.upToCents);
  if (tier) fee = tier.feeCents;
  else {
    const steps = Math.ceil((priceCents - FEE_TOP_TIER_LIMIT_CENTS) / FEE_STEP_ABOVE_CENTS);
    fee = FEE_BASE_ABOVE_CENTS + steps * FEE_STEP_INCREMENT_CENTS;
  }
  return capCents > 0 ? Math.min(fee, capCents) : fee;
}

export const reaisToCents = (v: number | string): number => Math.round(Number(String(v).replace(',', '.')) * 100);
export const formatBRL = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Tabela pública (para a página "Quanto custa vender?"). */
export function feeTable(): { label: string; feeCents: number }[] {
  const rows: { label: string; feeCents: number }[] = [];
  let prev = 0;
  for (const t of FEE_TIERS) {
    rows.push({
      label: prev === 0 ? `Até ${formatBRL(t.upToCents)}` : `De ${formatBRL(prev + 1)} a ${formatBRL(t.upToCents)}`,
      feeCents: t.feeCents,
    });
    prev = t.upToCents;
  }
  rows.push({ label: `Acima de ${formatBRL(FEE_TOP_TIER_LIMIT_CENTS)}`, feeCents: FEE_BASE_ABOVE_CENTS + FEE_STEP_INCREMENT_CENTS });
  return rows;
}
