const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface FundingAgency { id: string; name: string; website: string | null }
export interface FundingCall { id: string; agencyId: string; title: string; applicationDeadline: string; agency?: { name: string } }

export interface ResearchProject {
  id: string; type: "PESQUISA" | "EXTENSAO"; title: string; coordinatorName: string; status: string;
  budgetAmount: number | null; members?: { id: string; name: string; role: string | null }[];
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

export const listFundingAgencies = () => get<FundingAgency[]>("/edu/funding-agencies");
export const createFundingAgency = (input: { name: string; website?: string }) => post<FundingAgency>("/edu/funding-agencies", input);

export const listFundingCalls = () => get<FundingCall[]>("/edu/funding-calls");
export const createFundingCall = (input: { agencyId: string; title: string; applicationDeadline: string; description?: string }) =>
  post<FundingCall>("/edu/funding-calls", input);

export const listResearchProjects = () => get<ResearchProject[]>("/edu/research-projects");
export const createResearchProject = (input: { type: string; title: string; coordinatorName: string; description?: string; budgetAmount?: number }) =>
  post<ResearchProject>("/edu/research-projects", input);
export const updateResearchProjectStatus = (id: string, status: string) => put<ResearchProject>(`/edu/research-projects/${id}/status`, { status });
export const addResearchProjectMember = (projectId: string, input: { name: string; role?: string }) =>
  post(`/edu/research-projects/${projectId}/members`, input);
