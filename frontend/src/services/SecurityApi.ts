const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(`${API}${path}`, { method: init.method || "GET", headers: headers(init.body !== undefined), body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
  return d as T;
}

export interface SessionRow { id: string; userName: string | null; current: boolean; device: string; place: string; ip: string | null; createdAt: string; lastSeenAt: string; anomaly: boolean }
export const listSessions = (all = false) => call<{ canManage: boolean; sessions: SessionRow[]; unavailable?: boolean }>(`/security/sessions${all ? "?all=1" : ""}`);
export const revokeSession = (id: string) => call<{ ok: boolean }>(`/security/sessions/${id}/revoke`, { method: "POST", body: {} });
export const revokeOtherSessions = () => call<{ ok: boolean; revoked: number }>("/security/sessions/revoke-others", { method: "POST", body: {} });
