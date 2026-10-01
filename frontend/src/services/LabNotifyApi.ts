const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const CACHE_KEY = "dentalpos.lab.notify.v1";

export type LabChannel = "WHATSAPP" | "SMS" | "TELEGRAM";
export const LAB_CHANNEL_LABELS: Record<LabChannel, string> = { WHATSAPP: "WhatsApp (API oficial da Meta)", SMS: "SMS", TELEGRAM: "Telegram" };

export interface LabNotifyChoice { labMemberId: string; channels: LabChannel[] }

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function readCache(): Record<string, LabNotifyChoice> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; }
}

export function cachedLabNotify(workId: number | string): LabNotifyChoice {
  return readCache()[String(workId)] || { labMemberId: "", channels: [] };
}

export function rememberLabNotify(workId: number | string, choice: LabNotifyChoice) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...readCache(), [String(workId)]: choice })); } catch { /* sem cache local */ }
}

export interface LabScheduleInput {
  workRef: string;
  patientName: string;
  workType: string;
  teeth?: string;
  dueDateISO?: string;
  dentistName?: string;
  labMemberId: string;
  channels: LabChannel[];
  isNew: boolean;
  createdAtISO?: string;
}

export async function scheduleLabNotifications(input: LabScheduleInput) {
  return parse<{ scheduled: number }>(await fetch(`${API}/lab-notifications/schedule`, { method: "POST", headers: headers(true), body: JSON.stringify(input) }));
}

export async function cancelLabNotifications(workRef: string) {
  return parse<{ cancelled: number }>(await fetch(`${API}/lab-notifications/cancel`, { method: "POST", headers: headers(true), body: JSON.stringify({ workRef }) }));
}
