const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}

export interface CondoEmployee { name: string; salary: number }
export interface CondoMonth { employees: CondoEmployee[]; encargosPct: number; items: Record<string, number>; outrosDesc: string; condominos: number }

export async function loadCondoSplit(): Promise<Record<string, CondoMonth>> {
  const r = await fetch(`${API}/condo-split`, { headers: headers() });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
  return d.months || {};
}

export async function saveCondoSplit(month: string, data: CondoMonth) {
  const r = await fetch(`${API}/condo-split`, { method: "PUT", headers: headers(true), body: JSON.stringify({ month, data }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
}
