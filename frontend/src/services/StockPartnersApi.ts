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

export interface PartnerClinicStatus { authorized: boolean; authorizedAt: string | null; authorizedBy: string | null; activePartners: number; noticesLast30Days: number }
export interface StockPartner { id: string; name: string; email: string; whatsapp: string | null; categories: string[]; monthlyFee: string | number; status: "PENDENTE" | "ATIVO" | "SUSPENSO"; paidUntil: string | null; notes: string | null }

export const loadPartnerStatus = () => call<PartnerClinicStatus>("/stock-partners/status");
export const authorizePartners = (authorized: boolean) => call<{ ok: boolean }>("/stock-partners/authorize", { method: "PUT", body: { authorized } });
export const listStockPartners = () => call<{ partners: StockPartner[]; suggestedFee: number; minimumWage: number }>("/platform/stock-partners");
export const createStockPartner = (b: Partial<StockPartner> & { categories?: string[] | string }) => call<StockPartner>("/platform/stock-partners", { method: "POST", body: b });
export const updateStockPartner = (id: string, b: Record<string, unknown>) => call<StockPartner>(`/platform/stock-partners/${id}`, { method: "PUT", body: b });
