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

export interface FaceAppointment { id: string; scheduledAt: string; procedure: string; status: string }
export interface FaceMatch { patientId: string; fullName: string; appointments: FaceAppointment[] }
export interface FaceIdentifyResult { status: "MATCH" | "CANDIDATES" | "NONE"; matches?: FaceMatch[] }

export const identifyFace = (descriptor: number[]) => call<FaceIdentifyResult>("/face/identify", { method: "POST", body: { descriptor } });
export const faceStatus = (patientId: string) => call<{ enrolled: boolean; consentAt: string | null }>(`/face/status/${encodeURIComponent(patientId)}`);
export const enrollFace = (patientId: string, samples: number[][]) => call<{ ok: boolean }>("/face/enroll", { method: "POST", body: { patientId, samples, consent: true } });
export const removeFace = (patientId: string) => call<{ ok: boolean }>(`/face/${encodeURIComponent(patientId)}`, { method: "DELETE" });
