const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface StudentDocument { id: string; studentId: string; type: string; title: string; url: string }

export interface DocumentRequest {
  id: string;
  studentId: string;
  type: string;
  deliveryMethod: "DIGITAL" | "PRESENCIAL";
  status: "SOLICITADO" | "EM_ANALISE" | "PRONTO" | "ENTREGUE" | "RECUSADO";
  notes: string | null;
  fileUrl: string | null;
  student?: { fullName: string };
}

export interface Certificate {
  id: string;
  studentId: string;
  type: "CERTIFICADO_CONCLUSAO" | "DIPLOMA" | "CERTIFICADO_PARTICIPACAO";
  title: string;
  verificationCode: string;
  status: string;
  issueDate: string;
  student?: { fullName: string };
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

export const listStudentDocuments = (studentId: string) => get<StudentDocument[]>(`/edu/students/${studentId}/documents`);
export const addStudentDocument = (studentId: string, input: { type: string; title: string; url: string }) =>
  post<StudentDocument>(`/edu/students/${studentId}/documents`, input);

export const listDocumentRequests = () => get<DocumentRequest[]>("/edu/document-requests");
export const createDocumentRequest = (studentId: string, input: { type: string; deliveryMethod: string; notes?: string }) =>
  post<DocumentRequest>(`/edu/students/${studentId}/document-requests`, input);
export const updateDocumentRequestStatus = (id: string, input: { status: string; fileUrl?: string; notes?: string }) =>
  put<DocumentRequest>(`/edu/document-requests/${id}/status`, input);

export const listCertificates = () => get<Certificate[]>("/edu/certificates");
export const createCertificate = (input: { studentId: string; enrollmentId?: string; type: string; title: string }) =>
  post<Certificate>("/edu/certificates", input);
