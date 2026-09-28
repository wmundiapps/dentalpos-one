const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface BookableResource {
  id: string;
  name: string;
  category: "SALA" | "AUDITORIO" | "LABORATORIO" | "EQUIPAMENTO";
  location: string | null;
  capacity: number | null;
  isActive: boolean;
}

export interface ResourceBooking {
  id: string;
  resourceId: string;
  requestedById: string;
  purpose: string;
  startAt: string;
  endAt: string;
  status: "CONFIRMADA" | "CANCELADA";
  resource: BookableResource;
}

export interface JobPosting {
  id: string;
  title: string;
  company: string;
  description: string;
  type: "ESTAGIO" | "EMPREGO" | "TRAINEE";
  modality: "PRESENCIAL" | "REMOTO" | "HIBRIDO";
  location: string | null;
  applicationUrl: string | null;
  isActive: boolean;
  expiresAt: string | null;
}

export interface JobApplication {
  id: string;
  postingId: string;
  studentId: string;
  message: string | null;
  status: "ENVIADA" | "EM_ANALISE" | "APROVADA" | "REJEITADA";
  posting?: JobPosting;
  student?: { id: string; fullName: string; email: string };
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

export const listBookableResources = () => get<BookableResource[]>("/edu/bookable-resources");
export const createBookableResource = (input: Partial<BookableResource>) => post<BookableResource>("/edu/bookable-resources", input);
export const listResourceBookings = (resourceId?: string) =>
  get<ResourceBooking[]>(`/edu/resource-bookings${resourceId ? `?resourceId=${resourceId}` : ""}`);
export const createResourceBooking = (input: { resourceId: string; purpose: string; startAt: string; endAt: string }) =>
  post<ResourceBooking>("/edu/resource-bookings", input);
export const cancelResourceBooking = (id: string) => post<ResourceBooking>(`/edu/resource-bookings/${id}/cancel`, {});

export const listJobPostings = () => get<JobPosting[]>("/edu/job-postings");
export const createJobPosting = (input: Partial<JobPosting>) => post<JobPosting>("/edu/job-postings", input);
export const closeJobPosting = (id: string) => post<JobPosting>(`/edu/job-postings/${id}/close`, {});
export const listJobApplications = (postingId: string) => get<JobApplication[]>(`/edu/job-postings/${postingId}/applications`);
export const decideJobApplication = (id: string, status: JobApplication["status"]) =>
  put<JobApplication>(`/edu/job-applications/${id}/decision`, { status });

export const myJobApplications = () => get<JobApplication[]>("/edu/me/job-applications");
export const applyToJobPosting = (postingId: string, message?: string) =>
  post<JobApplication>(`/edu/me/job-postings/${postingId}/apply`, { message });
