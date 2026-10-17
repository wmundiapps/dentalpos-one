const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { method: init.method || "GET", headers: headers(init.body !== undefined), body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Erro ${response.status}`);
  return data as T;
}

export type UnscheduledKind = "FALTOU" | "CANCELOU" | "SEM_RETORNO";
export interface UnscheduledPatient { id: string; name: string; phone: string; email: string | null; kind: UnscheduledKind; lastVisit: string; daysAway: number }
export interface UnscheduledGroup { kind: UnscheduledKind; label: string; total: number; patients: UnscheduledPatient[] }
export interface FollowUpSettings { weeklyList: boolean; dailyDebtors: boolean; debtorNotice: boolean; emails: string[]; effectiveEmails: string[]; debtorCount: number }

export const loadUnscheduled = (limit = 30) => call<{ total: number; groups: UnscheduledGroup[] }>(`/followup/unscheduled?limit=${limit}`);
export const loadFollowUpSettings = () => call<FollowUpSettings>("/followup/settings");
export const saveFollowUpSettings = (b: Partial<Pick<FollowUpSettings, "weeklyList" | "dailyDebtors" | "debtorNotice">> & { emails?: string[] }) => call<{ ok: boolean }>("/followup/settings", { method: "PUT", body: b });
export const sendFollowUpNow = () => call<{ weekly: { skipped?: boolean; sent?: number; patients?: number; reason?: string }; daily: { skipped?: boolean; sent?: number; patients?: number } }>("/followup/send-now", { method: "POST", body: {} });
