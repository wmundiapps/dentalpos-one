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
  reminders?: Array<{
    id: string;
    type: "ON_BOOKING" | "ONE_DAY_BEFORE" | "ON_DAY" | string;
    channel: "WHATSAPP" | "SMS" | string;
    status: string;
    scheduledFor: string;
  }>;
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
  reminderChannel?: "WHATSAPP" | "SMS";
  reminders?: {
    onBooking: boolean;
    oneDayBefore: boolean;
    onDay: boolean;
  };
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
  reminderChannel?: "WHATSAPP" | "SMS";
  reminders?: {
    onBooking: boolean;
    oneDayBefore: boolean;
    onDay: boolean;
  };
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