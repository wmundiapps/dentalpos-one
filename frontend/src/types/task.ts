export type TaskPriority =
  | "Baixa"
  | "Média"
  | "Alta"
  | "Urgente";

export interface Task {
  id: number;
  titulo: string;
  descricao: string;
  prioridade: TaskPriority;
  concluida: boolean;
}