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

export interface FacePunchResult { id: string; kind: string; label: string; time: string; insideWorkplace: boolean | null; note: string | null; employeeName: string }
export const employeeFaceStatus = (employeeId: string) => call<{ enrolled: boolean; consentAt: string | null }>(`/hr/employees/${encodeURIComponent(employeeId)}/face`);
export const enrollEmployeeFace = (employeeId: string, samples: number[][], photo?: string) => call<{ ok: boolean }>(`/hr/employees/${encodeURIComponent(employeeId)}/face`, { method: "POST", body: { samples, photo, consent: true } });
export const removeEmployeeFace = (employeeId: string) => call<{ ok: boolean }>(`/hr/employees/${encodeURIComponent(employeeId)}/face`, { method: "DELETE" });
export const facePunch = (cpf: string, descriptor: number[], photo: string, geo: { latitude?: number; longitude?: number; accuracy?: number }) => call<FacePunchResult>("/hr/timeclock/face-punch", { method: "POST", body: { cpf, descriptor, photo, ...geo } });
export const punchPhoto = (punchId: string) => call<{ photo: string | null }>(`/hr/timeclock/punches/${encodeURIComponent(punchId)}/photo`);
export const employeeFacePhoto = (employeeId: string) => call<{ photo: string | null }>(`/hr/employees/${encodeURIComponent(employeeId)}/face-photo`);
