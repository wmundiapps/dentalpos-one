const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface CompetencyBreakdown { competency: string; percent: number | null }

export interface StudentPerformance {
  student?: { id: string; fullName: string };
  attendancePercent: number | null;
  examsAverage: number | null;
  competencyBreakdown: CompetencyBreakdown[];
  riskLevel: "BAIXO" | "MEDIO" | "ALTO";
  examAttemptsCount: number;
}

export interface ReinforcementPlan {
  id: string;
  studentId: string;
  subjectId: string | null;
  competency: string | null;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: string;
  student?: { fullName: string };
  actions?: ReinforcementAction[];
}

export interface ReinforcementAction {
  id: string;
  planId: string;
  description: string;
  dueDate: string | null;
  status: string;
  completedAt: string | null;
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

export const getStudentPerformance = (studentId: string) => get<StudentPerformance>(`/edu/students/${studentId}/performance`);
export const listReinforcementPlans = () => get<ReinforcementPlan[]>("/edu/reinforcement-plans");
export const createReinforcementPlan = (input: { studentId: string; subjectId?: string; competency?: string; title: string; description?: string }) =>
  post<ReinforcementPlan>("/edu/reinforcement-plans", input);
export const addReinforcementAction = (planId: string, input: { description: string }) =>
  post<ReinforcementAction>(`/edu/reinforcement-plans/${planId}/actions`, input);
export const completeReinforcementAction = (actionId: string) => post<ReinforcementAction>(`/edu/reinforcement-actions/${actionId}/complete`, {});
