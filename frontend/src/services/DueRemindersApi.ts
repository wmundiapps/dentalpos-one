const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const json = init.body !== undefined;
  const r = await fetch(`${API}${path}`, { method: init.method || "GET", headers: headers(json), body: json ? JSON.stringify(init.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
  return d as T;
}

export interface DueItem { source: string; kind: string; id: string; title: string; dueDate: string; daysLeft: number; path: string; recurrence: string }
export interface CustomReminder { id: string; kind: string; title: string; dueDate: string; recurrence: string; notes: string | null }
export interface DueSettings { enabled: boolean; emails: string[]; receitaSaudeDay: number }

export const loadDueOverview = () => call<{ today: string; items: DueItem[] }>("/due-reminders");
export const loadDueSettings = () => call<{ settings: DueSettings; kinds: Record<string, string>; custom: CustomReminder[] }>("/due-reminders/settings");
export const saveDueSettings = (body: DueSettings) => call<{ settings: DueSettings }>("/due-reminders/settings", { method: "PUT", body });
export const createDueReminder = (body: { kind: string; title: string; dueDate: string; recurrence: string; notes?: string }) => call<{ id: string }>("/due-reminders/custom", { method: "POST", body });
export const archiveDueReminder = (id: string) => call<{ ok: boolean }>(`/due-reminders/custom/${id}`, { method: "PUT", body: { active: false } });
export const doneDueReminder = (id: string) => call<{ nextDue: string | null }>(`/due-reminders/custom/${id}/done`, { method: "POST", body: {} });
