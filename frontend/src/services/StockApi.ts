const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export type StockRule = { id: string; procedureLabel: string; productId: string; productName: string; productSku: string; mode: "DEBIT" | "COUNT"; quantity: number; perTooth: boolean };
export type StockCycle = { id: string; startedAt: string; endedAt: string; procedureCount: number; unitsDebited: number; reason: "RESTOCK" | "UNIT_USED" };
export type StockHistory = { cycles: StockCycle[]; openCount: number; average: number | null };
export type StockAlertRow = { productId: string; sku: string; name: string; quantity: number; minimum: number; level: "critical" | "low" | "predicted"; message: string };
export type StockMovementResult = { product: { stockQuantity: number | string }; cycle: StockCycle | null; average: number | null; procedureCount: number };

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

export const StockApi = {
  rules: async () => parse<StockRule[]>(await fetch(`${API}/stock/rules`, { headers: headers() })),
  importRules: async (rows: Array<Record<string, string>>) =>
    parse<{ createdCount: number; updatedCount: number; skipped: Array<{ row: number; reason: string }> }>(await fetch(`${API}/stock/rules/import`, { method: "POST", headers: headers(true), body: JSON.stringify({ rows }) })),
  removeRule: async (id: string) => parse<{ ok: boolean }>(await fetch(`${API}/stock/rules/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers() })),
  history: async (productId: string) => parse<StockHistory>(await fetch(`${API}/stock/${encodeURIComponent(productId)}/history`, { headers: headers() })),
  movement: async (productId: string, type: "RESTOCK" | "UNIT_USED", quantity: number) =>
    parse<StockMovementResult>(await fetch(`${API}/stock/${encodeURIComponent(productId)}/movement`, { method: "POST", headers: headers(true), body: JSON.stringify({ type, quantity }) })),
  alerts: async () => parse<StockAlertRow[]>(await fetch(`${API}/stock/alerts`, { headers: headers() })),
};
