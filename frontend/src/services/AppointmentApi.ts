const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface BackendDoctor {
  id: string;
  specialty?: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
}

export type ReminderChannel = "WHATSAPP" | "SMS" | "TELEGRAM" | "MANUAL";

export interface BackendAppointmentHistory {
  id: string;
  action: string;
  requestedBy?: string | null;
  reason?: string | null;
  previousScheduledAt?: string | null;
  newScheduledAt?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  createdAt: string;
}

export interface BackendAppointment {
  id: string;
  patientId: string;
  doctorId: string;
  procedure: string;
  nextProcedure?: string | null;
  room?: string | null;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  confirmation?: string | null;
  confirmChannel?: string | null;
  history?: BackendAppointmentHistory[];
  patient?: {
    id: string;
    fullName: string;
    phone: string;
  };
  doctor?: BackendDoctor;
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

export async function loadBackendDoctors(): Promise<BackendDoctor[]> {
  const response = await fetch(`${API}/doctors`, { headers: headers() });
  if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
  return response.json();
}

export async function loadBackendAppointments(): Promise<BackendAppointment[]> {
  const response = await fetch(`${API}/appointments`, { headers: headers() });
  if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
  return response.json();
}

export async function createBackendAppointment(input: {
  patientId: string;
  doctorId: string;
  procedure: string;
  nextProcedure?: string;
  room?: string;
  scheduledAt: string;
  durationMinutes?: number;
  reminderChannel?: ReminderChannel;
}) {
  const response = await fetch(`${API}/appointments`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }

  return response.json() as Promise<BackendAppointment>;
}
export async function updateBackendAppointment(id: string, input: {
  scheduledAt?: string;
  durationMinutes?: number;
  status?: string;
  procedure?: string;
  nextProcedure?: string;
  room?: string;
  reason: string;
  requestedBy?: string;
  reminderChannel?: ReminderChannel;
}) {
  const response = await fetch(`${API}/appointment/${id}`, {
    method: "PUT",
    headers: headers(true),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }

  return response.json() as Promise<BackendAppointment>;
}