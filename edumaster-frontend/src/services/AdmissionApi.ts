const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface AdmissionExam {
  id: string; programId: string; name: string; modality: string; vacancies: number;
  applicationStart: string; applicationEnd: string;
  program?: { name: string };
}

export interface Application {
  id: string; admissionExamId: string; candidateName: string; candidateEmail: string;
  score: number | null; status: string;
  admissionExam?: { name: string };
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

export const listAdmissionExams = () => get<AdmissionExam[]>("/edu/admission-exams");
export const createAdmissionExam = (input: {
  programId: string; name: string; modality: string; applicationStart: string; applicationEnd: string; vacancies: number;
}) => post<AdmissionExam>("/edu/admission-exams", input);

export const listApplications = () => get<Application[]>("/edu/applications");
export const setApplicationScore = (id: string, score: number) => put<Application>(`/edu/applications/${id}/score`, { score });
export const updateApplicationStatus = (id: string, status: string) => put<Application>(`/edu/applications/${id}/status`, { status });
export const convertApplicationToEnrollment = (id: string, input: { curriculumId: string; termId: string; monthlyFee?: number }) =>
  post(`/edu/applications/${id}/convert-to-enrollment`, input);

// Rota pública (sem autenticação) — mesma usada por um candidato real no
// formulário de inscrição, útil também para simular uma inscrição de teste.
export const publicApply = (admissionExamId: string, input: { candidateName: string; candidateEmail: string; candidatePhone?: string }) =>
  fetch(`${API}/edu/admission-exams/${admissionExamId}/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then(async (r) => {
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `Erro HTTP ${r.status}`);
    return r.json();
  });
