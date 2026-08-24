import type { FunnelStage } from "../types/funnel";

export const funnel: FunnelStage[] = [
  "Lead",
  "Contato",
  "Agendado",
  "Chegou",
  "Triagem",
  "Consulta",
  "Planejamento",
  "Orçamento",
  "Negociação",
  "Aprovado",
  "Cirurgia",
  "Prótese",
  "Controle",
  "Garantia",
  "Recall",
  "Indicação",
];

export function nextStage(
  stage: FunnelStage,
): FunnelStage {
  const index = funnel.indexOf(stage);

  if (index >= funnel.length - 1) {
    return stage;
  }

  return funnel[index + 1];
}