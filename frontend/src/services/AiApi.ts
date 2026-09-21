const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface AiBalance {
  plano: string;
  franquiaMensal: number;
  franquiaUsada: number;
  franquiaRestante: number;
  saldoComprado: number;
  disponivel: number;
  tetoPorTarefa: number | null;
  status: string;
}

export interface AiLedgerRow {
  id: string;
  movement: string;
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
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

export async function getAiBalance(): Promise<AiBalance> {
  return parse<AiBalance>(await fetch(`${API}/ai/balance`, { headers: headers() }));
}

export async function getAiStatement(): Promise<AiLedgerRow[]> {
  return parse<AiLedgerRow[]>(await fetch(`${API}/ai/statement`, { headers: headers() }));
}

export async function runAi(input: { task?: string; prompt: string; system?: string }): Promise<{ texto: string; modelo: string }> {
  return parse<{ texto: string; modelo: string }>(
    await fetch(`${API}/ai/run`, { method: "POST", headers: headers(true), body: JSON.stringify(input) }),
  );
}