import type { Notification } from "../types/notification";

export const notifications: Notification[] = [
  {
    id: 1,
    titulo: "Paciente aguardando",
    descricao: "Maria Oliveira chegou à clínica.",
    lida: false,
    tipo: "info",
    data: "Agora",
  },
  {
    id: 2,
    titulo: "Estoque baixo",
    descricao: "Resina A2 abaixo do mínimo.",
    lida: false,
    tipo: "warning",
    data: "5 min",
  },
  {
    id: 3,
    titulo: "Financeiro",
    descricao: "Recebimento PIX confirmado.",
    lida: true,
    tipo: "success",
    data: "10 min",
  },
];