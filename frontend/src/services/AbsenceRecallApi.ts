const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface AbsenceSettings { enabled: boolean; periodDays: number; channels: Array<"EMAIL" | "WHATSAPP">; dailyLimit: number }
export interface AbsenceToday { emails: number; whatsapps: number; names: string[] }
export interface AbsenceOverview {
  settings: AbsenceSettings; periods: number[]; candidatesCount: number;
  sample: Array<{ name: string; daysAway: number; hasEmail: boolean }>; today: AbsenceToday;
}
export interface AbsenceRunResult { candidates: number; eligible: number; sent: number; skipped: number; failures: string[]; dryRun: boolean }

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}
async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const ABSENCE_EVENT = "dentalpos:absence-recall-changed";

export function periodLabel(days: number) {
  if (days === 7) return "1 semana";
  if (days === 365) return "1 ano";
  if (days === 548) return "18 meses";
  if (days === 730) return "24 meses";
  if (days === 913) return "30 meses";
  if (days === 1095) return "36 meses";
  return `${days} dias`;
}

export const loadAbsenceOverview = async () => parse<AbsenceOverview>(await fetch(`${API}/absence-recall`, { headers: headers() }));
export const loadAbsenceToday = async () => parse<AbsenceToday>(await fetch(`${API}/absence-recall/today`, { headers: headers() }));
export const saveAbsenceSettings = async (input: Partial<AbsenceSettings>) => {
  const r = await parse<AbsenceSettings>(await fetch(`${API}/absence-recall/settings`, { method: "PUT", headers: headers(true), body: JSON.stringify(input) }));
  window.dispatchEvent(new Event(ABSENCE_EVENT));
  return r;
};
export const runAbsenceRecall = async (dryRun: boolean) => {
  const r = await parse<AbsenceRunResult>(await fetch(`${API}/absence-recall/run`, { method: "POST", headers: headers(true), body: JSON.stringify({ dryRun }) }));
  window.dispatchEvent(new Event(ABSENCE_EVENT));
  return r;
};
