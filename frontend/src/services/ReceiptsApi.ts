const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

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
  return response.json() as Promise<T>;
}

export interface AsaasStatus {
  connected: boolean;
  active: boolean;
  environment: "SANDBOX" | "PRODUCTION";
  webhookConfigured: boolean;
  webhookUrl: string;
  webhookToken: string | null;
}

export interface PayoutAccount {
  doctorId: string;
  name: string;
  contractType: string;
  revenueModel: string;
  rule: { ok: true; percent: number; base: "BRUTO" | "LIQUIDO"; label: string } | { ok: false; reason: string };
  walletId: string;
  ready: boolean;
}

export interface ChargeSplit { id: string; doctorId: string; mode: string; percent: number | null; plannedAmount: number; finalAmount: number | null; status: string }
export interface ReceivableCharge {
  id: string;
  financialEntryId: string;
  billingType: string;
  installmentCount: number;
  value: number;
  dueDate: string;
  status: "PENDENTE" | "PAGO" | "VENCIDO" | "ESTORNADO" | "CANCELADO";
  invoiceUrl?: string | null;
  pixCopyPaste?: string | null;
  barcode?: string | null;
  digitableLine?: string | null;
  paidAt?: string | null;
  splits: ChargeSplit[];
  reused?: boolean;
}

export interface CreateChargeInput {
  billingType: "ESCOLHER" | "PIX" | "BOLETO" | "CARTAO";
  installments?: number;
  dueDate?: string;
  split?: { doctorId: string; mode: "RULE" | "PERCENT" | "FIXED"; value?: number };
}

export interface PayoutRow { id: string; doctorId: string; doctorName: string; description: string; customer: string; chargeValue: number; dueDate: string; paidAt?: string | null; mode: string; percent: number | null; amount: number; planned: number; status: string }
export interface PayoutTotal { doctorId: string; doctorName: string; pending: number; confirmed: number; refunded: number }

export const ReceiptsApi = {
  readiness: async () => parse<{ ready: boolean; environment: string | null }>(await fetch(`${API}/receivable-charges/readiness`, { headers: headers() })),
  asaasStatus: async () => parse<AsaasStatus>(await fetch(`${API}/asaas/status`, { headers: headers() })),
  connect: async (input: { apiKey?: string; environment: "SANDBOX" | "PRODUCTION"; isActive?: boolean }) =>
    parse<AsaasStatus>(await fetch(`${API}/asaas/connect`, { method: "POST", headers: headers(true), body: JSON.stringify(input) })),
  accounts: async () => parse<PayoutAccount[]>(await fetch(`${API}/payout-accounts`, { headers: headers() })),
  saveAccount: async (doctorId: string, walletId: string) =>
    parse<{ doctorId: string; walletId: string; ready: boolean }>(await fetch(`${API}/payout-accounts/${doctorId}`, { method: "PUT", headers: headers(true), body: JSON.stringify({ walletId }) })),
  charges: async (entryIds?: string[]) =>
    parse<ReceivableCharge[]>(await fetch(`${API}/receivable-charges${entryIds?.length ? `?entryIds=${entryIds.join(",")}` : ""}`, { headers: headers() })),
  createCharge: async (entryId: string, input: CreateChargeInput) =>
    parse<ReceivableCharge>(await fetch(`${API}/financial-entries/${entryId}/charge`, { method: "POST", headers: headers(true), body: JSON.stringify(input) })),
  cancelCharge: async (id: string) => parse<{ ok: boolean }>(await fetch(`${API}/receivable-charges/${id}/cancel`, { method: "POST", headers: headers(true), body: "{}" })),
  payouts: async (filter: { doctorId?: string; from?: string; to?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as Array<[string, string]>).toString();
    return parse<{ rows: PayoutRow[]; totals: PayoutTotal[] }>(await fetch(`${API}/payouts${q ? `?${q}` : ""}`, { headers: headers() }));
  },
};
