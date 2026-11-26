const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface HoldEntry {
  id: string; description: string; amount: number; dueDate: string; daysOverdue: number;
  charge: { id: string; billingType: string; invoiceUrl: string | null; pixCopyPaste: string | null; digitableLine: string | null } | null;
}
export interface HoldInfo { enabled: boolean; hasPending: boolean; blocked: boolean; total: number; futureAppointments: number; entries: HoldEntry[]; message: string }

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

export const loadPatientHold = async (patientId: string) => parse<HoldInfo>(await fetch(`${API}/patients/${encodeURIComponent(patientId)}/financial-hold`, { headers: headers() }));
export const loadHoldSettings = async () => parse<{ enabled: boolean; graceDays: number }>(await fetch(`${API}/financial-hold/settings`, { headers: headers() }));
export const saveHoldSettings = async (input: { enabled?: boolean; graceDays?: number }) => parse<{ enabled: boolean; graceDays: number }>(await fetch(`${API}/financial-hold/settings`, { method: "PUT", headers: headers(true), body: JSON.stringify(input) }));
