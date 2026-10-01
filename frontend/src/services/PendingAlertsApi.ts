const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface PendingAlertItem { key: string; label: string; count: number; path: string }
export interface PendingAlerts {
  enabled: boolean;
  mode: "ALERT" | "BLOCK";
  blocked: boolean;
  unlocked: boolean;
  canManage: boolean;
  total: number;
  items: PendingAlertItem[];
}

export const PENDING_ALERTS_MESSAGE =
  "Resolva a(s) pendência(s) mais urgente(s) antes de continuar - Persistindo a pendência, seu sistema poderá ser travado e somente o gestor poderá destravar";

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

export const PENDING_ALERTS_EVENT = "dentalpos:pending-alerts-changed";

export async function loadPendingAlerts(): Promise<PendingAlerts> {
  return parse(await fetch(`${API}/pending-alerts`, { headers: headers() }));
}

export async function savePendingAlertsSettings(input: { enabled?: boolean; mode?: "ALERT" | "BLOCK" }) {
  const result = await parse<unknown>(await fetch(`${API}/pending-alerts/settings`, { method: "PUT", headers: headers(true), body: JSON.stringify(input) }));
  window.dispatchEvent(new Event(PENDING_ALERTS_EVENT));
  return result;
}

export async function unlockPendingAlerts() {
  const result = await parse<unknown>(await fetch(`${API}/pending-alerts/unlock`, { method: "POST", headers: headers(true), body: "{}" }));
  window.dispatchEvent(new Event(PENDING_ALERTS_EVENT));
  return result;
}
