const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface Committee {
  id: string; type: string; name: string; description: string | null;
  members?: { id: string; name: string; role: string | null }[];
}

export interface PdiGoal {
  id: string; title: string; description: string | null; indicator: string | null;
  targetValue: number | null; currentValue: number | null; status: string; dueDate: string | null;
}

export interface RegulatoryWatch {
  id: string; source: string; title: string; sourceUrl: string | null; rawExcerpt: string | null;
  status: string; relevance: string | null; aiSummary: string | null;
}

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

export const listCommittees = () => get<Committee[]>("/edu/committees");
export const createCommittee = (input: { type: string; name: string; description?: string }) => post<Committee>("/edu/committees", input);
export const addCommitteeMember = (committeeId: string, input: { name: string; role?: string }) =>
  post(`/edu/committees/${committeeId}/members`, input);

export const listPdiGoals = () => get<PdiGoal[]>("/edu/pdi-goals");
export const createPdiGoal = (input: { title: string; description?: string; indicator?: string; targetValue?: number }) =>
  post<PdiGoal>("/edu/pdi-goals", input);
export const updatePdiGoal = (id: string, input: { currentValue?: number; status?: string }) => put<PdiGoal>(`/edu/pdi-goals/${id}`, input);

export const listRegulatoryWatches = () => get<RegulatoryWatch[]>("/edu/regulatory-watches");
export const createRegulatoryWatch = (input: { source: string; title: string; sourceUrl?: string; rawExcerpt?: string }) =>
  post<RegulatoryWatch>("/edu/regulatory-watches", input);
export const triageRegulatoryWatch = (id: string) => post<RegulatoryWatch>(`/edu/regulatory-watches/${id}/triage`, {});
export const updateRegulatoryWatchStatus = (id: string, status: string) => put<RegulatoryWatch>(`/edu/regulatory-watches/${id}/status`, { status });
