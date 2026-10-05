const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface PendingAlertItem { key: string; label: string; count: number; path: string; lines?: string[] }
export interface LockedUser { id: string; name: string; count: number }
export interface PendingAlerts {
  enabled: boolean;
  mode: "ALERT" | "BLOCK";
  blocked: boolean;
  canManage: boolean;
  total: number;
  items: PendingAlertItem[];
  lockedUsers: LockedUser[];
  visibleKeys: string[];
  blockingLabOrders?: Array<{ localId: string; patientName: string; workType: string; dentistName: string | null; dueDate: string | null }>;
  settings?: {
    lockedUserIds: string[]; hasKey: boolean;
    visibility: Record<string, string[]>;
    categories: Array<{ key: string; label: string }>;
    profiles: Array<{ code: string; name: string }>;
  };
}

// Tipos de pendência que o usuário pode ver (o admin vê todos). Usado para esconder os avisos locais de agenda/financeiro/laboratório.
export function alertCategoryOf(alert: { id: string; area: string }): string | null {
  if (alert.area === "Laboratório") return "laboratory";
  if (alert.id.startsWith("financial-") || alert.id.startsWith("agenda-unbilled") || alert.area === "Financeiro") return "receivables";
  if (alert.area === "Agenda" || alert.area === "Pacientes") return "appointments";
  return null;
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

export async function savePendingAlertsSettings(input: { enabled?: boolean; mode?: "ALERT" | "BLOCK"; lockedUserIds?: string[]; unlockKey?: string; visibility?: Record<string, string[]> }) {
  const result = await parse<unknown>(await fetch(`${API}/pending-alerts/settings`, { method: "PUT", headers: headers(true), body: JSON.stringify(input) }));
  window.dispatchEvent(new Event(PENDING_ALERTS_EVENT));
  return result;
}

// Usuário travado digita a chave de desbloqueio e destrava a própria tela (até o fim do dia).
export async function unlockPendingAlerts(key: string) {
  const result = await parse<unknown>(await fetch(`${API}/pending-alerts/unlock`, { method: "POST", headers: headers(true), body: JSON.stringify({ key }) }));
  window.dispatchEvent(new Event(PENDING_ALERTS_EVENT));
  return result;
}

// Admin/gestor destrava a tela de um usuário.
export async function unlockUserScreen(userId: string) {
  const result = await parse<unknown>(await fetch(`${API}/pending-alerts/unlock-user`, { method: "POST", headers: headers(true), body: JSON.stringify({ userId }) }));
  window.dispatchEvent(new Event(PENDING_ALERTS_EVENT));
  return result;
}

// Destrava resolvendo a pendência: informa a entrega do trabalho com comprovação.
export async function proveLabDelivery(input: { localId: string; receivedBy: string; proof: string }) {
  const result = await parse<unknown>(await fetch(`${API}/pending-alerts/resolve-lab`, { method: "POST", headers: headers(true), body: JSON.stringify(input) }));
  window.dispatchEvent(new Event(PENDING_ALERTS_EVENT));
  return result;
}
