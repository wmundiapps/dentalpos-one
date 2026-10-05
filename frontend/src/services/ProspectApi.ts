const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export type ProspectStatus =
  | "NOVO"
  | "EM_SEQUENCIA"
  | "SEQUENCIA_CONCLUIDA"
  | "QUENTE"
  | "RESPONDEU"
  | "CONVERTIDO"
  | "DESCADASTRADO"
  | "BOUNCE"
  | "EXCLUIDO";

export interface ProspectLead {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  displayName: string;
  email?: string | null;
  emailType?: string | null;
  phone1?: string | null;
  phone2?: string | null;
  uf: string;
  city?: string | null;
  segment: string;
  status: ProspectStatus;
  lastStep: number;
  lastSentAt?: string | null;
  hotAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface ProspectEvent {
  id: string;
  type: string;
  step?: number | null;
  detail?: string | null;
  createdAt: string;
}

export interface ProspectConfig {
  sendingEnabled: boolean;
  dailyLimit: number;
  step2AfterDays: number;
  step3AfterDays: number;
  sendToWebmail: boolean;
  segments: string;
}

export interface ProspectStats {
  total: number;
  withEmail: number;
  byStatus: Record<string, number>;
  clicks: number;
  sentTotal: number;
  sentToday: number;
  config: ProspectConfig;
  landingUrl: string;
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

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: headers(Boolean(init.body)) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `Erro HTTP ${response.status}`);
  return body as T;
}

export const loadProspectStats = () => call<ProspectStats>("/prospects/stats");

export function loadProspects(params: { status?: string; q?: string; city?: string; page?: number }) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.city) query.set("city", params.city);
  query.set("page", String(params.page || 1));
  return call<{ rows: ProspectLead[]; total: number; page: number; pageSize: number }>(`/prospects?${query.toString()}`);
}

export const loadProspectEvents = (id: string) => call<ProspectEvent[]>(`/prospects/${encodeURIComponent(id)}/events`);

export const updateProspect = (id: string, input: { status?: ProspectStatus; notes?: string }) =>
  call<ProspectLead>(`/prospects/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });

export const saveProspectConfig = (input: Partial<ProspectConfig>) =>
  call<ProspectConfig>("/prospects-config", { method: "PUT", body: JSON.stringify(input) });

export const importProspects = (leads: unknown[], source: string) =>
  call<{ created: number; skipped: number; blocked: number }>("/prospects/import", {
    method: "POST",
    body: JSON.stringify({ leads, source }),
  });

export const runProspects = (input: { force?: boolean; dryRun?: boolean }) =>
  call<{ skipped?: boolean; reason?: string; sent?: number; errors?: number; converted?: number; queued?: number; sentToday?: number; preview?: Array<{ cnpj: string; email: string | null; step: number }> }>(
    "/prospects/run",
    { method: "POST", body: JSON.stringify(input) },
  );

export const sendProspectTest = (to: string, step: number) =>
  call<{ ok: boolean; modelLead: string }>("/prospects/test", { method: "POST", body: JSON.stringify({ to, step }) });
