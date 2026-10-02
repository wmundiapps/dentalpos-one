const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface DunningPreviewRow { patientName: string; stage: string; daysOverdue: number; amount: number; hasContact: boolean }
export interface DunningNoticeRow { id: string; stage: string; channel: string; status: string; sentAt: string | null; errorMessage: string | null; createdAt: string }
export interface DunningState {
  enabled: boolean; since: string | null; includeOlder: boolean; channel: string; ready: boolean; channels: string[];
  preview: DunningPreviewRow[]; recent: DunningNoticeRow[]; example: string; exampleLegal: string;
}

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

export const DunningApi = {
  load: async () => parse<DunningState>(await fetch(`${API}/dunning`, { headers: headers() })),
  save: async (input: { enabled?: boolean; includeOlder?: boolean; channel?: string }) =>
    parse<unknown>(await fetch(`${API}/dunning/settings`, { method: "PUT", headers: headers(true), body: JSON.stringify(input) })),
};

export const STAGE_LABEL = (stage: string) => (stage === "LEGAL" ? "Aviso jurídico" : `${stage.slice(1)}º dia de atraso`);
