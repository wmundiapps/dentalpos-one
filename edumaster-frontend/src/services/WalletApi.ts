const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface WalletTransaction {
  id: string; type: "RECARGA" | "DEBITO" | "AJUSTE"; amount: number; balanceAfter: number;
  description: string | null; createdAt: string;
}

export interface Wallet {
  id: string; studentId: string; balance: number; isActive: boolean; transactions: WalletTransaction[];
}

function headers(json: boolean) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(Boolean(init?.body)), ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const getStudentWallet = (studentId: string) => request<Wallet>(`/edu/students/${studentId}/wallet`);
export const rechargeWallet = (studentId: string, input: { amount: number; notes?: string }) =>
  request<{ walletId: string; balance: number }>(`/edu/students/${studentId}/wallet/recharge`, { method: "POST", body: JSON.stringify(input) });
export const adjustWallet = (studentId: string, input: { amount: number; notes: string }) =>
  request<{ walletId: string; balance: number }>(`/edu/students/${studentId}/wallet/adjust`, { method: "POST", body: JSON.stringify(input) });
