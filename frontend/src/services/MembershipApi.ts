const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export type MembershipPlan = { id: string; name: string; description: string | null; monthlyPrice: number | string; monthlyCredit: number | string; discountPct: number | string; active: boolean };
export type MembershipInvoice = { id: string; competence: string; amount: number; creditAmount: number; dueDate: string; status: string; invoiceUrl: string | null; pixCopyPaste: string | null };
export type MembershipRow = {
  id: string; status: string; balance: number; billingDay: number; startedAt: string; paidInvoices: number;
  patient: { id: string; fullName: string; phone: string; email: string | null } | null;
  plan: { id: string; name: string; monthlyPrice: number; discountPct: number } | null;
  openInvoice: MembershipInvoice | null;
};
export type MembershipSummary = { active: number; late: number; waiting: number; monthlyRevenue: number; creditBalance: number };
export type LedgerRow = { id: string; movement: string; amount: number; balanceAfter: number; procedureValue: number | null; discountAmount: number | null; description: string; createdAt: string };
export type UsePreview = { procedureValue: number; discountAmount: number; debit: number; discountPct: number; balance: number; enough: boolean };
export type SendPixResult = { email: { sent: boolean; to: string | null; reason?: string }; text: string; phone: string; hasPix: boolean };

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}
async function parse<T>(r: Response): Promise<T> {
  if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.error || `Erro HTTP ${r.status}`); }
  return r.json() as Promise<T>;
}
const post = (path: string, body: unknown = {}, method = "POST") => fetch(`${API}/membership${path}`, { method, headers: headers(true), body: JSON.stringify(body) });

export const MembershipApi = {
  plans: async () => parse<MembershipPlan[]>(await fetch(`${API}/membership/plans`, { headers: headers() })),
  savePlan: async (input: Partial<MembershipPlan>, id?: string) => parse<MembershipPlan>(await post(id ? `/plans/${encodeURIComponent(id)}` : "/plans", input, id ? "PUT" : "POST")),
  members: async () => parse<{ members: MembershipRow[]; summary: MembershipSummary }>(await fetch(`${API}/membership/members`, { headers: headers() })),
  subscribe: async (patientId: string, planId: string, billingDay?: number) => parse<{ member: { id: string }; first: { warning?: string; manual?: boolean; error?: string } }>(await post("/members", { patientId, planId, billingDay })),
  charge: async (id: string) => parse<{ warning?: string; manual?: boolean }>(await post(`/members/${encodeURIComponent(id)}/charge`)),
  sendPix: async (id: string) => parse<SendPixResult>(await post(`/members/${encodeURIComponent(id)}/send-pix`)),
  markPaid: async (invoiceId: string) => parse<{ credited: boolean }>(await post(`/invoices/${encodeURIComponent(invoiceId)}/paid`)),
  preview: async (id: string, value: number) => parse<UsePreview>(await fetch(`${API}/membership/members/${encodeURIComponent(id)}/preview?value=${value}`, { headers: headers() })),
  use: async (id: string, value: number, description: string) => parse<UsePreview & { balance: number }>(await post(`/members/${encodeURIComponent(id)}/use`, { value, description })),
  adjust: async (id: string, amount: number, reason: string) => parse<{ balance: number }>(await post(`/members/${encodeURIComponent(id)}/adjust`, { amount, reason })),
  setStatus: async (id: string, status: string) => parse<{ ok: boolean }>(await post(`/members/${encodeURIComponent(id)}/status`, { status }, "PUT")),
  ledger: async (id: string) => parse<LedgerRow[]>(await fetch(`${API}/membership/members/${encodeURIComponent(id)}/ledger`, { headers: headers() })),
};
