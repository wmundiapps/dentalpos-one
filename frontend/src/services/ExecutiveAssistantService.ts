import type {
  ExecutiveAlert,
  ExecutiveSummary,
} from "../types/executiveAssistant";

export const executiveSummary: ExecutiveSummary = {
  greeting: "Bom dia, Dr. Robson.",
  clinicStatus:
    "A operação está funcionando normalmente, mas existem pontos importantes que exigem atenção.",
  confirmedPatients: 15,
  pendingBudgets: 4,
  pendingBudgetValue: 68400,
  criticalStockItems: 2,
  overdueLaboratoryWorks: 1,
  overdueReceivables: 3200,
};

export const executiveAlerts: ExecutiveAlert[] = [
  {
    id: 1,
    title: "Orçamentos aguardando retorno",
    description:
      "Existem quatro propostas comerciais sem retorno nas últimas 48 horas.",
    recommendation:
      "Realizar contato pelo WhatsApp e oferecer simulação de parcelamento.",
    priority: "Alta",
    module: "CRM",
  },
  {
    id: 2,
    title: "Estoque crítico",
    description:
      "Dois materiais atingiram quantidade inferior ao estoque mínimo.",
    recommendation:
      "Gerar solicitação de compra e comunicar os fornecedores cadastrados.",
    priority: "Crítica",
    module: "Estoque",
  },
  {
    id: 3,
    title: "Trabalho laboratorial atrasado",
    description:
      "Um guia cirúrgico ultrapassou o prazo previsto de entrega.",
    recommendation:
      "Notificar o técnico responsável e avaliar o impacto na agenda do paciente.",
    priority: "Alta",
    module: "Laboratório",
  },
  {
    id: 4,
    title: "Cobrança vencida",
    description:
      "Existe um recebimento vencido no valor de R$ 3.200,00.",
    recommendation:
      "Iniciar cobrança automática por WhatsApp, e-mail e ligação.",
    priority: "Média",
    module: "Financeiro",
  },
];