const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function headers() {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Falha na comunicação com o backoffice.");
  return data as T;
}

export interface BackofficeDashboard {
  receivable: number;
  payable: number;
  receivedThisMonth: number;
  paidThisMonth: number;
  cashResultThisMonth: number;
  overdueCount: number;
  overdueValue: number;
  accountingPending: number;
  taxPending: number;
  taxPendingValue: number;
  suppliers: number;
  activeAccountants: number;
  payroll: Array<{
    id: string;
    reference: string;
    netPayroll: number;
    employerCharges: number;
    status: string;
    paymentDate?: string | null;
  }>;
}

export interface SupplierRow {
  id: string;
  name: string;
  tradeName?: string | null;
  document?: string | null;
  category: string;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
}

export interface TaxObligationRow {
  id: string;
  name: string;
  entityName: string;
  competence: string;
  dueDate: string;
  estimatedValue: number;
  finalValue?: number | null;
  status: string;
  responsible?: string | null;
  requiresAccountantApproval: boolean;
  approvedAt?: string | null;
  financialEntry?: { id: string; status: string; amount: number } | null;
}

export interface AccountantAccessRow {
  id: string;
  name: string;
  email: string;
  status: string;
  canViewFinance: boolean;
  canViewTax: boolean;
  canViewPayroll: boolean;
  canExport: boolean;
  canApproveTax: boolean;
}

export const BackofficeApi = {
  dashboard: () => request<BackofficeDashboard>("/backoffice/dashboard"),
  suppliers: () => request<SupplierRow[]>("/suppliers"),
  createSupplier: (body: Record<string, unknown>) => request<SupplierRow>("/suppliers", { method: "POST", body: JSON.stringify(body) }),
  taxObligations: () => request<TaxObligationRow[]>("/accounting/tax-obligations"),
  createTaxObligation: (body: Record<string, unknown>) => request<TaxObligationRow>("/accounting/tax-obligations", { method: "POST", body: JSON.stringify(body) }),
  approveTaxObligation: (id: string, finalValue?: number) => request<TaxObligationRow>(`/accounting/tax-obligations/${id}/approve`, { method: "POST", body: JSON.stringify({ finalValue }) }),
  accountantAccesses: () => request<AccountantAccessRow[]>("/accounting/accountant-access"),
  createAccountantAccess: (body: Record<string, unknown>) => request<AccountantAccessRow>("/accounting/accountant-access", { method: "POST", body: JSON.stringify(body) }),
  bootstrapAccounts: () => request<{ ok: boolean; count: number }>("/accounting/accounts/bootstrap", { method: "POST", body: "{}" }),
  bootstrapCostCenters: () => request<{ ok: boolean; count: number }>("/accounting/cost-centers/bootstrap", { method: "POST", body: "{}" }),
};
