const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function headers() {
  const token = localStorage.getItem("dentalpos.token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Falha na operação.");
  return data as T;
}

export const twoFactorStatus = () => call<{ enabled: boolean; backupCodesLeft: number; pendingSetup: boolean }>("/auth/2fa/status");
export const twoFactorSetup = () => call<{ secret: string; otpauthUri: string }>("/auth/2fa/setup", "POST");
export const twoFactorEnable = (code: string) => call<{ enabled: boolean; backupCodes: string[] }>("/auth/2fa/enable", "POST", { code });
export const twoFactorDisable = (password: string, code: string) => call<{ enabled: boolean }>("/auth/2fa/disable", "POST", { password, code });
export const dentalPodToken = () => call<{ token: string; expiresIn: number }>("/dpd/token", "POST");
