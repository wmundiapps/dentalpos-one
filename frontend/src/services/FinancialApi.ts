const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export type FinancialEntryType = "INCOME" | "EXPENSE";
export type FinancialEntryStatus = "PENDING" | "PAID" | "CANCELLED";
export type PaymentMethod =
  | "PIX"
  | "Cartão"
  | "Boleto"
  | "Transferência"
  | "Dinheiro"
  | "Promissória"
  | "Permuta"
  | "Cheque";
export type PaymentProvider = "Asaas" | "Stripe" | "Banco / Open Finance" | "Manual";
export type IssuerEntity = "INSTITUTO_RAVEL" | "TECNOIMPLANTE";

export const issuerEntityLabels: Record<IssuerEntity, string> = {
  INSTITUTO_RAVEL: "Instituto Ravel de Ensino Superior LTDA",
  TECNOIMPLANTE: "Tecnoimplante",
};

export interface FinancialEntry {
  id: string;
  patientId?: string | null;
  type: FinancialEntryType;
  description: string;
  category: string;
  personName: string;
  amount: number;
  dueDate: string;
  competenceDate?: string | null;
  status: FinancialEntryStatus;
  paymentMethod?: string | null;
  provider?: string | null;
  origin: string;
  originId?: string | null;
  installment?: number | null;
  installments?: number | null;
  paidAt?: string | null;
  notes?: string | null;
  issuerEntity?: IssuerEntity | null;
}

export interface FinancialEntryInput {
  patientId?: string;
  type: FinancialEntryType;
  description: string;
  category?: string;
  personName: string;
  amount: number;
  dueDate: string;
  competenceDate?: string;
  status?: FinancialEntryStatus;
  paymentMethod?: string;
  provider?: string;
  notes?: string;
  issuerEntity?: IssuerEntity;
}

export interface FinancialDashboard {
  receivable: number;
  overdue: number;
  received: number;
  payable: number;
  paidExpenses: number;
  cashResult: number;
  dueNext7Days: Array<{
    id: string;
    type: FinancialEntryType;
    description: string;
    personName: string;
    amount: number;
    dueDate: string;
    status: FinancialEntryStatus;
  }>;
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

export async function loadFinancialEntries(): Promise<FinancialEntry[]> {
  const response = await fetch(`${API}/financial-entries`, { headers: headers() });
  return parse<FinancialEntry[]>(response);
}

export async function createFinancialEntry(input: FinancialEntryInput): Promise<FinancialEntry> {
  const response = await fetch(`${API}/financial-entries`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  return parse<FinancialEntry>(response);
}

export async function updateFinancialEntry(
  id: string,
  input: Partial<FinancialEntryInput>,
): Promise<FinancialEntry> {
  const response = await fetch(`${API}/financial-entries/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  return parse<FinancialEntry>(response);
}

export async function settleFinancialEntry(id: string): Promise<FinancialEntry> {
  const response = await fetch(`${API}/financial-entries/${encodeURIComponent(id)}/settle`, {
    method: "POST",
    headers: headers(true),
  });
  return parse<FinancialEntry>(response);
}

export async function cancelFinancialEntry(id: string, reason?: string): Promise<FinancialEntry> {
  const response = await fetch(`${API}/financial-entries/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers(true),
    body: JSON.stringify({ reason }),
  });
  return parse<FinancialEntry>(response);
}

export async function loadFinancialDashboard(): Promise<FinancialDashboard> {
  const response = await fetch(`${API}/financial-dashboard`, { headers: headers() });
  return parse<FinancialDashboard>(response);
}
