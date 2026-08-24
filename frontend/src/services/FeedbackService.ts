import type { UserFeedback } from "../types/feedback";

export const userFeedbacks: UserFeedback[] = [
  {
    id: 1,
    type: "Sugestão",
    title: "Adicionar filtro por profissional na agenda",
    description:
      "Seria útil visualizar somente os atendimentos de um profissional específico.",
    priority: "Média",
    status: "Em análise",
    userName: "Robson Ravel",
    userEmail: "robson@dentalpos.com.br",
    module: "Agenda",
    createdAt: "02/08/2026, 14:40",
  },
  {
    id: 2,
    type: "Bug",
    title: "Botão de impressão não respondeu",
    description:
      "O botão de impressão do documento clínico não abriu a janela de impressão.",
    priority: "Alta",
    status: "Enviado",
    userName: "Juliana",
    userEmail: "juliana@dentalpos.com.br",
    module: "Documentos Clínicos",
    createdAt: "02/08/2026, 13:15",
    attachmentName: "erro-impressao.png",
  },
  {
    id: 3,
    type: "Melhoria",
    title: "Mostrar total financeiro por profissional",
    description:
      "Adicionar comparação de produção e recebimentos por profissional.",
    priority: "Média",
    status: "Em desenvolvimento",
    userName: "Robson Ravel",
    userEmail: "robson@dentalpos.com.br",
    module: "Financeiro",
    createdAt: "01/08/2026, 18:20",
  },
];

export function countOpenFeedbacks(): number {
  return userFeedbacks.filter(
    (feedback) =>
      feedback.status !== "Resolvido" &&
      feedback.status !== "Arquivado",
  ).length;
}

export function countCriticalFeedbacks(): number {
  return userFeedbacks.filter(
    (feedback) => feedback.priority === "Crítica",
  ).length;
}