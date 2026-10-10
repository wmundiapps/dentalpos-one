// Pontuação das pendências: pontos por prioridade, bônus se concluída no prazo, zero se atrasada.
export const TASK_PRIORITIES = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as const
export const TASK_STATUSES = ['ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const BASE_POINTS: Record<TaskPriority, number> = { BAIXA: 5, MEDIA: 10, ALTA: 20, URGENTE: 30 }
const BRT_OFFSET_MS = 3 * 3600 * 1000

// O prazo vale até o fim do dia (horário de Brasília). dueDate é guardada como data (meia-noite UTC).
export function dueDeadline(dueDate: Date): number {
  return dueDate.getTime() + 24 * 3600 * 1000 + BRT_OFFSET_MS - 1
}

export function computeTaskPoints(priority: string, dueDate: Date | null | undefined, completedAt: Date): { points: number; onTime: boolean } {
  const base = BASE_POINTS[priority as TaskPriority] ?? BASE_POINTS.MEDIA
  if (!dueDate) return { points: base, onTime: true }
  if (completedAt.getTime() <= dueDeadline(dueDate)) return { points: base + Math.ceil(base * 0.5), onTime: true }
  return { points: 0, onTime: false }
}
