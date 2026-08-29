const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export type PublicBookingChannel = "WHATSAPP" | "SMS" | "TELEGRAM" | "MANUAL";

export interface PublicBookingDoctor {
  id: string;
  name: string;
  specialty?: string;
}

export interface PublicBookingConfig {
  clinic: { id: string; name: string };
  doctors: PublicBookingDoctor[];
}

export interface OnlineBookingSettings {
  enabled: boolean;
  slots: Record<string, Record<string, string[]>>;
}

function authHeaders(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export async function loadOnlineBookingSettings(): Promise<OnlineBookingSettings> {
  const response = await fetch(`${API}/public-booking-settings`, {
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function saveOnlineBookingSettings(
  input: OnlineBookingSettings,
): Promise<OnlineBookingSettings> {
  const response = await fetch(`${API}/public-booking-settings`, {
    method: "PUT",
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

async function errorMessage(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error || `Erro HTTP ${response.status}`;
}

export async function loadPublicBookingConfig(clinicId: string): Promise<PublicBookingConfig> {
  const response = await fetch(`${API}/public/booking/${encodeURIComponent(clinicId)}`);
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function loadPublicAvailability(input: {
  clinicId: string;
  doctorId: string;
  dateISO: string;
  durationMinutes?: number;
}): Promise<string[]> {
  const params = new URLSearchParams({
    doctorId: input.doctorId,
    date: input.dateISO,
    durationMinutes: String(input.durationMinutes || 30),
  });
  const response = await fetch(
    `${API}/public/booking/${encodeURIComponent(input.clinicId)}/availability?${params.toString()}`,
  );
  if (!response.ok) throw new Error(await errorMessage(response));
  const body = await response.json();
  return body.slots || [];
}

export async function createPublicBooking(input: {
  clinicId: string;
  patientName: string;
  patientPhone: string;
  doctorId: string;
  procedure: string;
  dateISO: string;
  time: string;
  durationMinutes?: number;
  reminderChannel?: PublicBookingChannel;
}) {
  const response = await fetch(`${API}/public/booking/${encodeURIComponent(input.clinicId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}
