const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export type TrainingModule = "carreira" | "jobrotation";

export interface TrainingSettings {
  prize: string;
  minLevel: string;
  dailyLimitMinutes: number;
  jobRotationSectors: string[];
}

export interface TrainingUsage {
  day: string;
  usedSeconds: number;
  limitSeconds: number;
  remainingSeconds: number;
  locked: boolean;
}

export interface TrainingMe {
  userName: string;
  access: { carreira: boolean; jobrotation: boolean; manage: boolean };
  settings: TrainingSettings;
  usage: TrainingUsage;
  states: Partial<Record<TrainingModule, unknown>>;
  prizes: Array<{ module: TrainingModule; level: string; prize: string; code: string; deliveredAt: string | null; createdAt: string }>;
}

export interface TrainingPrizeRow {
  id: string;
  userName: string;
  module: TrainingModule;
  level: string;
  prize: string;
  code: string;
  deliveredAt: string | null;
  createdAt: string;
}

export interface TrainingOverviewRow {
  userId: string;
  userName: string;
  module: TrainingModule;
  level: string | null;
  reachedTop: boolean;
  todaySeconds: number;
  updatedAt: string;
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
  return response.json() as Promise<T>;
}

export const TrainingApi = {
  me: async () => parse<TrainingMe>(await fetch(`${API}/training/me`, { headers: headers() })),
  saveProgress: async (module: TrainingModule, state: unknown) =>
    parse<{ ok: boolean }>(await fetch(`${API}/training/progress/${module}`, { method: "PUT", headers: headers(true), body: JSON.stringify({ state }) })),
  heartbeat: async () => parse<TrainingUsage>(await fetch(`${API}/training/usage/heartbeat`, { method: "POST", headers: headers(true), body: "{}" })),
  claimPrize: async (module: TrainingModule) =>
    parse<{ prize: string; code: string; alreadyClaimed: boolean }>(await fetch(`${API}/training/prizes/claim`, { method: "POST", headers: headers(true), body: JSON.stringify({ module }) })),
  settings: async () => parse<TrainingSettings>(await fetch(`${API}/training/settings`, { headers: headers() })),
  saveSettings: async (data: TrainingSettings) =>
    parse<TrainingSettings>(await fetch(`${API}/training/settings`, { method: "PUT", headers: headers(true), body: JSON.stringify(data) })),
  prizes: async () => parse<TrainingPrizeRow[]>(await fetch(`${API}/training/prizes`, { headers: headers() })),
  setDelivered: async (id: string, delivered: boolean) =>
    parse<TrainingPrizeRow>(await fetch(`${API}/training/prizes/${id}/delivered`, { method: "PUT", headers: headers(true), body: JSON.stringify({ delivered }) })),
  overview: async () => parse<TrainingOverviewRow[]>(await fetch(`${API}/training/overview`, { headers: headers() })),
};

export const CAREER_LEVEL_LABELS: Record<string, string> = { simples: "Simples", mediano: "Mediano", super: "Super", hiper: "Hiper", ultra: "Ultra" };
export const SECTOR_LABELS: Record<string, string> = { rec: "Recepção", cme: "Esterilização", fin: "Financeiro", lab: "Laboratório e estoque", asb: "Apoio na cadeira" };
export const MODULE_LABELS: Record<TrainingModule, string> = { carreira: "Carreira do dentista", jobrotation: "Job Rotation" };

/** Permissões do usuário logado. "*" = administrador. Usado para mostrar no menu só os módulos do departamento. */
export async function fetchMyPermissionCodes(): Promise<string[]> {
  const body = await parse<{ role: string; permissions: string[] }>(await fetch(`${API}/me/permissions`, { headers: headers() }));
  return body.permissions || [];
}

export const TRAINING_PATH_PERMISSION: Record<string, string> = {
  "/treinamento/carreira": "training.clinical",
  "/treinamento/job-rotation": "training.jobrotation",
  "/treinamento/gestao": "training.manage",
};
