const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface EquivalencyItem {
  id: string; originSubjectName: string; originWorkloadHours: number; originGrade: number | null;
  targetSubjectId: string | null; status: string; approvedWorkloadHours: number | null;
  targetSubject?: { name: string } | null;
}

export interface EquivalencyRequest {
  id: string; studentId: string; programId: string; originInstitution: string; status: string; notes: string | null;
  student?: { fullName: string }; program?: { name: string }; items: EquivalencyItem[];
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

export const listEquivalencyRequests = () => get<EquivalencyRequest[]>("/edu/equivalency-requests");
export const createEquivalencyRequest = (input: {
  studentId: string; programId: string; originInstitution: string; notes?: string;
  items: { originSubjectName: string; originWorkloadHours: number; targetSubjectId?: string }[];
}) => post<EquivalencyRequest>("/edu/equivalency-requests", input);
export const decideEquivalencyItem = (itemId: string, input: { status: string; targetSubjectId?: string; approvedWorkloadHours?: number }) =>
  put<EquivalencyItem>(`/edu/equivalency-items/${itemId}/decision`, input);
