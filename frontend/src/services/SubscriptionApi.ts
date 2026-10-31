const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function authHeaders(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}

async function call<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const json = init.body !== undefined;
  const headers = init.auth ? authHeaders(json) : json ? { "Content-Type": "application/json" } : undefined;
  const r = await fetch(`${API}${path}`, { method: init.method || "GET", headers, body: json ? JSON.stringify(init.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
  return d as T;
}

export interface Offer {
  trialDays: number;
  promoActive: boolean;
  promoPercent: number;
  promoCycles: number;
  promoUntil: string;
  firstChargeDate: string;
  plans: { key: string; name: string; price: number; promoPrice: number }[];
}

export interface SignupPayload {
  plan: string; clinicName: string; firstName: string; lastName: string; phone: string; email: string; password: string;
  cro: string; specialty: string; cpfCnpj: string; postalCode: string; addressNumber: string; acceptTerms: boolean;
  card: { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string };
}

export interface SignupResult { clinicId: string; email: string; trialEndsAt: string; firstChargeAmount: number; fullPrice: number; promoCycles: number }

export interface SubscriptionView {
  exists: boolean; status?: string; planName?: string; trialEndsAt?: string; trialDaysLeft?: number; nextChargeAmount?: number;
  fullPrice?: number; promoCyclesLeft?: number; cardBrand?: string | null; cardLast4?: string | null; canceled?: boolean;
  accessUntil?: string | null; pastDue?: boolean;
}

export const getOffer = () => call<Offer>("/billing/offer");
export const signupTrial = (body: SignupPayload) => call<SignupResult>("/billing/signup", { method: "POST", body });
export const getMySubscription = () => call<SubscriptionView>("/billing/subscription", { auth: true });
export const cancelMySubscription = () => call<SubscriptionView>("/billing/subscription/cancel", { method: "POST", body: {}, auth: true });

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const brDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
