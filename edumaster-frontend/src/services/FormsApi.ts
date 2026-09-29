const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface FormField { key: string; label: string; type: "TEXT" | "TEXTAREA" | "NUMBER" | "BOOLEAN" | "DATE" | "SELECT"; required: boolean; options: string[] }

export interface FormTemplate {
  id: string; name: string; description: string | null; department: string;
  fields: FormField[]; workflowSteps: string[]; isActive: boolean;
}

export interface FormSubmission {
  id: string; templateId: string; submitterName: string | null; data: Record<string, unknown>;
  currentStep: number; status: string; template?: FormTemplate;
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

export const listFormTemplates = () => get<FormTemplate[]>("/edu/form-templates");
export const createFormTemplate = (input: { name: string; description?: string; department: string; fields: FormField[]; workflowSteps: string[] }) =>
  post<FormTemplate>("/edu/form-templates", input);
export const createFormSubmission = (templateId: string, input: { data: Record<string, unknown>; submitterName?: string }) =>
  post<FormSubmission>(`/edu/form-templates/${templateId}/submissions`, input);

export const listFormSubmissions = () => get<FormSubmission[]>("/edu/form-submissions");
export const reviewFormSubmission = (id: string, input: { status: string; reviewNotes?: string }) =>
  put<FormSubmission>(`/edu/form-submissions/${id}/review`, input);
export const advanceFormSubmission = (id: string) => post<FormSubmission>(`/edu/form-submissions/${id}/advance`, {});
