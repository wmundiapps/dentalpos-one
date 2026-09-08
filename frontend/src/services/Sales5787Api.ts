const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export type SalesLead5787 = {
  id: string;
  clinicId: string;
  tenantId: string;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  stage: string;
  temperature: string;
  estimatedValue: number | string;
  nextAction?: string | null;
  nextActionAt?: string | null;
  ownerId?: string | null;
  notes?: string | null;
  convertedAt?: string | null;
  lostAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SalesLeadEvent5787 = {
  id: string;
  leadId: string;
  type: string;
  fromStage?: string | null;
  toStage?: string | null;
  channel?: string | null;
  summary: string;
  createdAt: string;
};

export type SalesProduct5787 = {
  id: string;
  clinicId: string;
  tenantId: string;
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  salePrice: number | string;
  costPrice: number | string;
  stockQuantity: number | string;
  minStock: number | string;
  batchTracked: boolean;
  expiresAt?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StoreConfig5787 = {
  storefrontEnabled: boolean;
  directDiscountPercent: number;
  affiliateCommissionPercent: number;
};

export type AffiliateSupplier5787 = {
  id: string;
  legalName: string;
  tradeName?: string | null;
  document?: string | null;
  contactName?: string;
  email?: string | null;
  phone?: string | null;
  storeUrl?: string | null;
  status?: string;
  commissionPercent?: number;
  acceptedTerms?: boolean;
  acceptedAt?: string;
  createdAt?: string;
};

function headers(json = false): Record<string, string> {
  const token =
    localStorage.getItem("dentalpos.token") ||
    localStorage.getItem("token") ||
    "";
  const clinicId =
    localStorage.getItem("dentalpos.clinicId") ||
    localStorage.getItem("clinicId") ||
    "";

  return {
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...headers(Boolean(init.body)),
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }
  return body as T;
}

export const Sales5787Api = {
  leads: () => request<SalesLead5787[]>("/sales/leads"),

  createLead: (input: Record<string, unknown>) =>
    request<SalesLead5787>("/sales/leads", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateLead: (id: string, input: Record<string, unknown>) =>
    request<SalesLead5787>(`/sales/leads/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  leadJourney: (id: string) =>
    request<SalesLeadEvent5787[]>(
      `/sales/leads/${encodeURIComponent(id)}/journey`,
    ),

  products: () => request<SalesProduct5787[]>("/sales/products"),

  criticalStock: () =>
    request<SalesProduct5787[]>("/sales/critical-stock"),

  upsertProduct: (input: Record<string, unknown>) =>
    request<SalesProduct5787>("/sales/products", {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  storeConfig: () =>
    request<StoreConfig5787>("/sales/store-config"),

  updateStoreConfig: (input: StoreConfig5787) =>
    request<StoreConfig5787>("/sales/store-config", {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  affiliateSuppliers: () =>
    request<AffiliateSupplier5787[]>("/sales/affiliate-suppliers"),

  createAffiliateSupplier: (input: Record<string, unknown>) =>
    request<AffiliateSupplier5787>("/sales/affiliate-suppliers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
