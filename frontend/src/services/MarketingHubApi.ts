const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function headers() {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
  };
}

async function parse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error || `Erro HTTP ${response.status}`) as Error & { code?: string; status?: number };
    error.code = body?.code;
    error.status = response.status;
    throw error;
  }
  return body as T;
}

export interface MarketingHubStatus {
  configured: boolean;
  enabled: boolean;
  plan: string | null;
  provisioned: boolean;
  lastSyncAt: string | null;
}

export async function getMarketingHubStatus() {
  return parse<MarketingHubStatus>(await fetch(`${API}/revah-bridge/status`, { headers: headers() }));
}

export async function openMarketingHub() {
  return parse<{ url: string }>(await fetch(`${API}/revah-bridge/sso`, { method: "POST", headers: headers() }));
}

export async function syncMarketingHub() {
  return parse<{ events?: number; sent?: number; errors?: number; skipped?: string }>(
    await fetch(`${API}/revah-bridge/sync`, { method: "POST", headers: headers() }),
  );
}
