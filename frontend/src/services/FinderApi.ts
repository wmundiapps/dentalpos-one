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

export interface FinderOptions { services: string[]; consentText: string; consentVersion: string }
export interface FinderCity { citySlug: string; city: string; state: string; count: number }
export interface FinderLeadResult { leadId: string; token: string; service: string; cities: FinderCity[] }
export interface FinderProfessional { listingId: string; displayName: string; specialty: string | null; city: string; state: string; about: string | null; services: string[]; contacted: boolean }

export const getFinderOptions = () => call<FinderOptions>("/finder/options");
export const startFinder = (body: { name: string; whatsapp: string; city: string; state: string; service: string; consent: boolean }) => call<FinderLeadResult>("/finder/lead", { method: "POST", body });
export const openCity = (token: string, citySlug: string) => call<{ professionals: FinderProfessional[] }>(`/finder/cities/${encodeURIComponent(citySlug)}/professionals`, { method: "POST", body: { token } });
export const contactProfessional = (token: string, listingId: string) => call<{ ok: boolean }>("/finder/contact", { method: "POST", body: { token, listingId } });

export interface ListingChannels { email?: string; whatsapp?: string; sms?: string; telegramChatId?: string }
export interface Listing { active: boolean; displayName: string; specialty: string | null; city: string; state: string; services: string[]; about: string | null; channels: ListingChannels }
export interface ListingState { listing: Listing | null; contacts: number; available: Record<string, boolean>; consentText: string }
export interface ReceivedRow { id: string; createdAt: string; status: string; name: string; whatsapp: string; city: string; service: string }

export const getMyListing = () => call<ListingState>("/finder/listing", { auth: true });
export const saveMyListing = (body: Omit<Listing, "specialty" | "about"> & { specialty: string; about: string; consent: boolean }) => call<{ listing: Listing }>("/finder/listing", { method: "PUT", body, auth: true });
export const getReceived = () => call<ReceivedRow[]>("/finder/received", { auth: true });
