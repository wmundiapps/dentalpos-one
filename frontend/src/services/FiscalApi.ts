const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface FiscalDoc { id: string; payerName: string; payerDocument?: string | null; payerEmail?: string | null; payerPhone?: string | null; description?: string | null; amount: number; paymentDate?: string | null; paymentMethod?: string | null; kind: string; status: string; issuerName?: string | null; scheduledAt?: string | null; documentNumber?: string | null; protocolNumber?: string | null; documentUrl?: string | null; failureReason?: string | null; }
export interface FiscalAlertRow { id: string; fiscalDocumentId?: string | null; title: string; description?: string | null; priority: string; resolved: boolean; createdAt: string; }
export interface FiscalSendRow { id: string; fiscalDocumentId: string; channel: string; destination: string; recipientName?: string | null; status: string; sentAt?: string | null; failureReason?: string | null; createdAt: string; }
export interface FiscalSummaryData { confirmedPayments: number; pendingDocuments: number; issuedDocuments: number; deliveryFailures: number; pendingTaxValue: number; }
export interface FiscalRuleData { autoProcess: boolean; issueDelayMinutes: number; defaultKindPJ: string; defaultKindPF: string; sendChannels: string; requireAccountantApproval: boolean; serviceCode?: string | null; issRate?: number | null; }

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { ...init, headers: { ...headers(Boolean(init?.body)), ...(init?.headers || {}) } });
  if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.error || `Erro HTTP ${r.status}`); }
  return r.json();
}

export const FiscalApi = {
  summary: () => req<FiscalSummaryData>("/fiscal/summary"),
  documents: (grupo?: string) => req<FiscalDoc[]>(`/fiscal/documents${grupo ? `?grupo=${grupo}` : ""}`),
  alerts: () => req<FiscalAlertRow[]>("/fiscal/alerts"),
  sends: (status?: string) => req<FiscalSendRow[]>(`/fiscal/sends${status ? `?status=${status}` : ""}`),
  rules: () => req<FiscalRuleData>("/fiscal/rules"),
  saveRules: (b: Partial<FiscalRuleData>) => req<FiscalRuleData>("/fiscal/rules", { method: "PUT", body: JSON.stringify(b) }),
  sync: () => req<{ encontrados: number; criados: number }>("/fiscal/sync", { method: "POST", body: "{}" }),
  process: () => req<{ importados: number; liberados: number; enviados: number; aguardandoEmissao: number }>("/fiscal/process", { method: "POST", body: "{}" }),
  update: (id: string, b: Record<string, unknown>) => req<FiscalDoc>(`/fiscal/documents/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  issue: (id: string, b: Record<string, unknown>) => req<{ ok: boolean }>(`/fiscal/documents/${id}/issue`, { method: "POST", body: JSON.stringify(b) }),
  send: (id: string) => req<FiscalSendRow[]>(`/fiscal/documents/${id}/send`, { method: "POST", body: "{}" }),
  conclude: (id: string) => req<{ ok: boolean }>(`/fiscal/documents/${id}/conclude`, { method: "POST", body: "{}" }),
};