const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface BackendPatient {
  id: string;
  fullName: string;
  phone: string;
  isActive?: boolean;
}

function headers() {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
  };
}

export async function loadBackendPatients(): Promise<BackendPatient[]> {
  const response = await fetch(`${API}/patients`, { headers: headers() });
  if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
  const rows = (await response.json()) as BackendPatient[];
  return rows.filter((patient) => patient.isActive !== false);
}
