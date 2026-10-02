// Cliente único para o EduMaster Pro (/api/edu/...). Reaproveita o token do DentalPos One.
const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export class EduApiError extends Error {
  status: number;
  /** Corpo completo da resposta de erro (ex.: lista de conflitos em 409). */
  data?: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function headers(extra?: Record<string, string>) {
  const token = localStorage.getItem("dentalpos.token") || "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...extra };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/edu${path}`, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new EduApiError(data?.error || `Erro ${res.status}`, res.status, data);
  return data as T;
}

export const eduApi = {
  get: <T = any>(path: string) => request<T>("GET", path),
  post: <T = any>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T = any>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T = any>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  del: <T = any>(path: string) => request<T>("DELETE", path),
};

export function qsOf(params: Record<string, unknown>) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  });
  const s = u.toString();
  return s ? `?${s}` : "";
}

export interface Branding {
  nome: string;
  sigla?: string | null;
  cnpj?: string | null;
  codigoEmec?: string | null;
  endereco?: string | null;
  site?: string | null;
  email?: string | null;
  telefone?: string | null;
  reitorNome?: string | null;
  cores: { primaria: string; secundaria: string; destaque: string };
  logos: Record<string, string>;
  logoPrincipal: string | null;
}

let brandingCache: Promise<Branding> | null = null;
export function loadBranding(force = false) {
  if (!brandingCache || force) brandingCache = eduApi.get<Branding>("/core/branding").catch((e) => { brandingCache = null; throw e; });
  return brandingCache;
}
