// Opções de escopo do orçamento apresentadas ao paciente.
export type BudgetScope = "FULL" | "PARTIAL" | "COMPLAINT" | "SINGLE";

export const BUDGET_SCOPES: Array<{ id: BudgetScope; title: string; hint: string }> = [
  { id: "FULL", title: "Tratamento completo", hint: "Todos os procedimentos indicados pelo(a) dentista." },
  { id: "PARTIAL", title: "Tratamento parcial", hint: "Somente os procedimentos mais urgentes." },
  { id: "COMPLAINT", title: "Somente a queixa principal", hint: "Só os procedimentos ligados à queixa do paciente." },
  { id: "SINGLE", title: "Somente um serviço", hint: "Um único procedimento escolhido pelo paciente." },
];

export const scopeTitle = (scope?: string) => BUDGET_SCOPES.find((s) => s.id === scope)?.title || "Tratamento completo";

// Ciência do paciente quando ele escolhe um plano diferente do recomendado.
export const RECOMMENDATION_NOTICE =
  "O plano recomendado pelo(a) dentista é o tratamento completo. Ao optar por outro plano, o paciente declara estar ciente de que o problema poderá voltar e de que os objetivos do tratamento poderão não ser atingidos.";

export type BudgetAlternative = { scope: BudgetScope; title: string; count: number; total: number };

export type BudgetOptionsMeta = {
  treatmentItemIds?: string[];
  scope?: BudgetScope;
  alternatives?: BudgetAlternative[];
  limitedPlanAcknowledged?: boolean;
  grossTotal?: number;
};
