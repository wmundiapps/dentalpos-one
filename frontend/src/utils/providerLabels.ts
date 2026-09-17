const LABELS: Record<string, string> = {
  asaas: "Gateway de pagamento",
  stripe: "Cartão internacional",
  bank: "Banco",
  "banco / open finance": "Banco",
  manual: "Manual",
};

/** Nome exibido ao usuario para o meio de recebimento, sem revelar fornecedores. */
export function providerLabel(value?: string | null): string {
  if (!value) return "";
  return LABELS[value.trim().toLowerCase()] ?? "Outro";
}