const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const KEY = "completodonto.rhVault";
function headers(json = true) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  const vault = sessionStorage.getItem(KEY) || "";
  return { Authorization: `Bearer ${token}`, ...(vault ? { "X-HR-Vault": vault } : {}), ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}
async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}/hr/vault/${path}`, { method: body === undefined ? "GET" : "POST", headers: headers(body !== undefined), body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
  return d as T;
}
export interface VaultStatus { configured: boolean; unlocked: boolean; login: string | null; recoveryEmail: string | null; lockedUntil: string | null }
type Opened = { ok: boolean; token: string; minutes: number };
const keep = (r: Opened) => { sessionStorage.setItem(KEY, r.token); return r; };
export const HrVaultApi = {
  status: () => call<VaultStatus>("status"),
  setup: async (b: { login: string; password: string; confirm: string; recoveryEmail: string }) => keep(await call<Opened>("setup", b)),
  unlock: async (b: { login: string; password: string }) => keep(await call<Opened>("unlock", b)),
  requestReset: () => call<{ ok: boolean; sentTo: string }>("reset/request", {}),
  confirmReset: async (b: { code: string; password: string; confirm: string; login?: string }) => keep(await call<Opened>("reset/confirm", b)),
  lock: () => sessionStorage.removeItem(KEY),
};
