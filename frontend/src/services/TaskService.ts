import type { Task } from "../types/task";

export const tasks: Task[] = [
  {
    id: 1,
    titulo: "Confirmar pacientes de amanhã",
    descricao: "Enviar confirmação automática por WhatsApp.",
    prioridade: "Alta",
    concluida: false,
  },
  {
    id: 2,
    titulo: "Conferir estoque W48",
    descricao: "Verificar necessidade de reposição.",
    prioridade: "Média",
    concluida: false,
  },
  {
    id: 3,
    titulo: "Executar backup",
    descricao: "Backup automático diário.",
    prioridade: "Baixa",
    concluida: true,
  },
];