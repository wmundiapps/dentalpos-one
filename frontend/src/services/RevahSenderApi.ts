const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export type ChannelKey = "WHATSAPP" | "SMS" | "EMAIL" | "TELEGRAM" | "VOICE";

export interface RevahSender {
  id: string;
  channel: string;
  label: string;
  address: string;
  isDefault: boolean;
  isActive: boolean;
  hasCredentials?: boolean;
  updatedAt?: string;
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

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }
  return response.json();
}

export async function listSenders(): Promise<RevahSender[]> {
  return parse<RevahSender[]>(await fetch(`${API}/revah/senders`, { headers: headers() }));
}

export async function saveSender(input: Record<string, unknown>): Promise<RevahSender> {
  return parse<RevahSender>(await fetch(`${API}/revah/senders`, { method: "PUT", headers: headers(true), body: JSON.stringify(input) }));
}

export async function sendTest(input: { channel: string; destination: string; content: string; contactName?: string }): Promise<unknown> {
  return parse<unknown>(await fetch(`${API}/revah/send`, { method: "POST", headers: headers(true), body: JSON.stringify(input) }));
}