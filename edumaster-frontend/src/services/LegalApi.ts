const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface LegalCase {
  id: string; type: string; title: string; involvedName: string; status: string;
  hearings?: LegalHearing[]; documents?: { id: string; title: string; url: string }[];
}

export interface LegalHearing { id: string; caseId: string; scheduledAt: string; location: string | null; status: string; outcome: string | null }
export interface LegalDeadline { id: string; title: string; expiresAt: string; status: string }

function headers(json: boolean) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(Boolean(init?.body)), ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

const get = <T,>(path: string) => request<T>(path);
const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
const put = <T,>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) });

export const listLegalCases = () => get<LegalCase[]>("/edu/legal-cases");
export const createLegalCase = (input: { type: string; title: string; involvedName: string; description?: string }) =>
  post<LegalCase>("/edu/legal-cases", input);
export const updateLegalCaseStatus = (id: string, status: string) => put<LegalCase>(`/edu/legal-cases/${id}/status`, { status });

export const scheduleHearing = (caseId: string, input: { scheduledAt: string; location?: string }) =>
  post<LegalHearing>(`/edu/legal-cases/${caseId}/hearings`, input);
export const recordHearingOutcome = (id: string, input: { status: string; outcome?: string }) =>
  put<LegalHearing>(`/edu/legal-hearings/${id}/outcome`, input);

export const addLegalDocument = (caseId: string, input: { title: string; url: string }) =>
  post(`/edu/legal-cases/${caseId}/documents`, input);

export const listLegalDeadlines = (caseId: string) => get<LegalDeadline[]>(`/edu/legal-cases/${caseId}/deadlines`);
export const addLegalDeadline = (caseId: string, input: { title: string; expiresAt: string }) =>
  post<LegalDeadline>(`/edu/legal-cases/${caseId}/deadlines`, input);
