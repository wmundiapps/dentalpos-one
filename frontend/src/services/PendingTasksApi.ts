const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:3000/api").replace(/\/$/, "");
function headers() {
  const token = localStorage.getItem("dentalpos.token");
  const clinicId = localStorage.getItem("dentalpos.clinicId");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(clinicId ? { "X-Clinic-ID": clinicId } : {}) };
}
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...headers(), ...(init?.headers || {}) } });
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `Erro HTTP ${r.status}`); }
  return r.status === 204 ? (undefined as T) : r.json();
}

export const TASK_STATUS_LABEL: Record<string, string> = { ABERTA: "Aberta", EM_ANDAMENTO: "Em andamento", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };
export const TASK_PRIORITY_LABEL: Record<string, string> = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", URGENTE: "Urgente" };

export type PendingTask = {
  id: string; title: string; description: string | null; module: string | null; status: string; priority: string;
  dueDate: string | null; assigneeId: string | null; completedAt: string | null; points: number;
  assignee?: { id: string; firstName: string; lastName: string } | null;
};
export type TaskInput = { title: string; description?: string | null; module?: string | null; priority?: string; dueDate?: string | null; assigneeId?: string | null; status?: string };
export type Assignee = { id: string; name: string };
export type RankingRow = { assigneeId: string; name: string; points: number; completed: number; onTime: number; late: number };

export const listPendingTasks = (f: { status?: string; priority?: string; assigneeId?: string } = {}) => {
  const qs = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => { if (v) qs.set(k, v); });
  return req<PendingTask[]>(`/pending-tasks${qs.toString() ? `?${qs}` : ""}`);
};
export const listAssignees = () => req<Assignee[]>("/pending-tasks/assignees");
export const createPendingTask = (d: TaskInput) => req<PendingTask>("/pending-tasks", { method: "POST", body: JSON.stringify(d) });
export const updatePendingTask = (id: string, d: Partial<TaskInput>) => req<PendingTask>(`/pending-tasks/${id}`, { method: "PUT", body: JSON.stringify(d) });
export const completePendingTask = (id: string) => req<PendingTask>(`/pending-tasks/${id}/complete`, { method: "POST", body: "{}" });
export const cancelPendingTask = (id: string) => req<PendingTask>(`/pending-tasks/${id}/cancel`, { method: "POST", body: "{}" });
export const getTaskRanking = (period: "week" | "month") => req<{ period: string; ranking: RankingRow[] }>(`/pending-tasks/ranking?period=${period}`);
