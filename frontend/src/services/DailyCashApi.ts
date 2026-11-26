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

export interface CashLine { id: string; time: string; kind: "ENTRADA" | "SAIDA"; who: string; payer: string; receivedBy: string; description: string; method: string; destination: "CAIXA" | "CONTA"; destinationLabel: string; destinationInferred: boolean; amount: number }
export interface CashGroup { key: string; name: string; entries: number; exits: number; balance: number; lines: CashLine[] }
export interface CashReport { date: string; groups: CashGroup[]; entries: number; exits: number; balance: number; byMethod: Array<{ method: string; total: number }>; byDestination: Array<{ destination: string; total: number }>; count: number }
export interface CashResponse { report: CashReport; settings: { enabled: boolean; emails: string[] } }

export const loadCashReport = (date: string) => call<CashResponse>(`/finance/daily-close?date=${date}`);
export const saveCashSettings = (b: { enabled?: boolean; emails?: string[] }) => call<{ ok: boolean }>("/finance/daily-close/settings", { method: "PUT", body: b });
export const sendCashNow = (date: string) => call<{ skipped?: boolean; sent?: number; reason?: string }>("/finance/daily-close/send", { method: "POST", body: { date } });
