const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface CreditPackage { id: string; kind: string; name: string; units: number; priceAmount: number; }
export interface PurchaseResult { purchaseId: string; invoiceUrl?: string; pixQrCode?: string; pixCopyPaste?: string; }

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}
async function parse<T>(r: Response): Promise<T> {
  if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.error || `Erro HTTP ${r.status}`); }
  return r.json();
}
export async function listPackages(kind?: string): Promise<CreditPackage[]> {
  return parse<CreditPackage[]>(await fetch(`${API}/credits/packages${kind ? `?kind=${kind}` : ""}`, { headers: headers() }));
}
export async function buyPackage(packageId: string, method: string): Promise<PurchaseResult> {
  return parse<PurchaseResult>(await fetch(`${API}/credits/purchase`, { method: "POST", headers: headers(true), body: JSON.stringify({ packageId, method }) }));
}