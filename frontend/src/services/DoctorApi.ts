const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface DoctorUser { id: string; firstName: string; lastName: string; email: string; phone?: string | null }

export interface Doctor {
  id: string; userId: string; user?: DoctorUser; cro: string; croState?: string | null; rqe?: string | null;
  specialty: string; specialties?: string[]; isActive: boolean; consultationValue?: number | null;
  contractType?: string; documentIssuer?: string;
  revenueModel?: string; revenuePercent?: number | null; revenueBase?: string;
  materialSplit?: string; labSplit?: string; cardFeeSplit?: string;
  cpf?: string | null; rg?: string | null; birthDate?: string | null;
  personalAddress?: string | null; personalCity?: string | null; personalState?: string | null; personalZipCode?: string | null;
  companyName?: string | null; tradeName?: string | null; cnpj?: string | null; companyCro?: string | null;
  technicalManager?: string | null; companyAddress?: string | null; companyCity?: string | null; companyState?: string | null;
  companyZipCode?: string | null; municipalRegistration?: string | null;
  commissionPercent?: number | null; payoutDay?: number | null;
  bankName?: string | null; bankAgency?: string | null; bankAccount?: string | null; pixKey?: string | null;
  contractStartDate?: string | null; contractEndDate?: string | null; notes?: string | null;
}

export interface DoctorDocument {
  id: string; documentType: string; title: string; fileName?: string | null;
  issueDate?: string | null; expiresAt?: string | null; notes?: string | null; createdAt: string;
}

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}

async function parse<T>(r: Response): Promise<T> {
  if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.error || `Erro HTTP ${r.status}`); }
  return r.status === 204 ? (undefined as T) : r.json();
}

export async function loadDoctors(): Promise<Doctor[]> {
  return parse<Doctor[]>(await fetch(`${API}/doctors`, { headers: headers() }));
}
export async function createDoctor(input: Record<string, unknown>): Promise<Doctor> {
  return parse<Doctor>(await fetch(`${API}/doctors`, { method: "POST", headers: headers(true), body: JSON.stringify(input) }));
}
export async function updateDoctor(id: string, input: Record<string, unknown>): Promise<Doctor> {
  return parse<Doctor>(await fetch(`${API}/doctor/${encodeURIComponent(id)}`, { method: "PUT", headers: headers(true), body: JSON.stringify(input) }));
}
export async function loadDoctorDocuments(id: string): Promise<DoctorDocument[]> {
  return parse<DoctorDocument[]>(await fetch(`${API}/doctor/${encodeURIComponent(id)}/documents`, { headers: headers() }));
}
export async function addDoctorDocument(id: string, input: Record<string, unknown>): Promise<DoctorDocument> {
  return parse<DoctorDocument>(await fetch(`${API}/doctor/${encodeURIComponent(id)}/documents`, { method: "POST", headers: headers(true), body: JSON.stringify(input) }));
}
export async function removeDoctorDocument(id: string, documentId: string): Promise<void> {
  return parse<void>(await fetch(`${API}/doctor/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}`, { method: "DELETE", headers: headers() }));
}
export async function loadClinicUsers(): Promise<DoctorUser[]> {
  return parse<DoctorUser[]>(await fetch(`${API}/users`, { headers: headers() }));
}