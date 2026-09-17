const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export const FEEDBACK_TYPES = ["Bug", "Bot\u00e3o n\u00e3o funciona", "Corre\u00e7\u00e3o", "Sugest\u00e3o", "Nova funcionalidade", "D\u00favida"] as const;
export const FEEDBACK_PRIORITIES = ["Baixa", "M\u00e9dia", "Alta", "Cr\u00edtica"] as const;
export const FEEDBACK_STATUSES = ["Enviado", "Em an\u00e1lise", "Em desenvolvimento", "Resolvido", "Arquivado"] as const;

export interface PlatformFeedback {
  id: string;
  clinicId: string;
  userName: string;
  userEmail: string;
  type: string;
  title: string;
  description: string;
  module?: string | null;
  pagePath?: string | null;
  priority: string;
  status: string;
  createdAt: string;
}

export interface PlatformFeedbackInput {
  type: string;
  priority: string;
  title: string;
  description: string;
  module?: string;
  pagePath?: string;
}

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }
  return response.json();
}

export async function createPlatformFeedback(input: PlatformFeedbackInput): Promise<PlatformFeedback> {
  const response = await fetch(`${API}/platform-feedbacks`, { method: "POST", headers: headers(true), body: JSON.stringify(input) });
  return parse<PlatformFeedback>(response);
}

export async function listPlatformFeedbacks(all = false): Promise<PlatformFeedback[]> {
  const response = await fetch(`${API}/platform-feedbacks${all ? "/all" : ""}`, { headers: headers() });
  return parse<PlatformFeedback[]>(response);
}

export async function updatePlatformFeedbackStatus(id: string, status: string): Promise<PlatformFeedback> {
  const response = await fetch(`${API}/platform-feedbacks/${encodeURIComponent(id)}/status`, { method: "PUT", headers: headers(true), body: JSON.stringify({ status }) });
  return parse<PlatformFeedback>(response);
}