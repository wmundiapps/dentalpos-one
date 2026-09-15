const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export type PatientGender = "Masculino" | "Feminino" | "Outro" | "Não informado";
export type PatientStatus = "Ativo" | "Em acompanhamento" | "Inativo";

export interface BackendPatient {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  cpf?: string | null;
  birthDate?: string | null;
  gender?: PatientGender | null;
  city?: string | null;
  status?: PatientStatus | null;
  treatment?: string | null;
  mainComplaint?: string | null;
  allergies?: string | null;
  medications?: string | null;
  medicalHistory?: string | null;
  notes?: string | null;
  isActive?: boolean;
  createdAt?: string;
}

export interface PatientInput {
  fullName: string;
  phone: string;
  email?: string;
  cpf?: string;
  birthDate?: string;
  gender?: PatientGender;
  city?: string;
  status?: PatientStatus;
  treatment?: string;
  mainComplaint?: string;
  allergies?: string;
  medications?: string;
  medicalHistory?: string;
  notes?: string;
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

export async function loadBackendPatients(): Promise<BackendPatient[]> {
  const response = await fetch(`${API}/patients`, { headers: headers() });
  if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
  const rows = (await response.json()) as BackendPatient[];
  return rows.filter((patient) => patient.isActive !== false);
}

export async function loadBackendPatient(id: string): Promise<BackendPatient> {
  const response = await fetch(`${API}/patient/${encodeURIComponent(id)}`, { headers: headers() });
  if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
  return response.json();
}

export async function createBackendPatient(input: PatientInput): Promise<BackendPatient> {
  const response = await fetch(`${API}/patients`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }
  return response.json();
}

export async function updateBackendPatient(
  id: string,
  input: Partial<PatientInput>,
): Promise<BackendPatient> {
  const response = await fetch(`${API}/patient/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }
  return response.json();
}
