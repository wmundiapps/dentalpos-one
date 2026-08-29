const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface BackendPatient {
  id: string;
  fullName: string;
  phone: string;
  birthDate?: string | null;
  city?: string | null;
  isActive?: boolean;
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

export async function createBackendPatient(input: {
  fullName: string;
  phone: string;
  birthDate: string;
  city: string;
}): Promise<BackendPatient> {
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
