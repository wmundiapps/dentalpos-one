import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export type TrainingModule = "carreira" | "jobrotation";

export interface TrainingSettings {
  prize: string;
  minLevel: string;
  dailyLimitMinutes: number;
  jobRotationSectors: string[];
  teamEnabled?: boolean;
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

export interface GameMenuAccess { carreira: boolean; jobrotation: boolean; manage: boolean; teamEnabled: boolean }

export const TrainingApi = {
  menu: async () => parse<GameMenuAccess>(await fetch(`${API}/training/menu`, { headers: headers() })),
  setTeamAccess: async (enabled: boolean) =>
    parse<TrainingSettings>(await fetch(`${API}/training/team-access`, { method: "PUT", headers: headers(true), body: JSON.stringify({ enabled }) })),
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

/** Itens do menu "Game" e o acesso que libera cada um. */
export const GAME_PATH_ACCESS: Record<string, keyof Omit<GameMenuAccess, "teamEnabled">> = {
  "/game/carreira": "carreira",
  "/game/job-rotation": "jobrotation",
  "/game/gestao": "manage",
};

export function gameItemVisible(path: string, access: GameMenuAccess | null): boolean | null {
  const key = GAME_PATH_ACCESS[path.split("?")[0]];
  if (!key) return null; // não é item do Game
  return Boolean(access?.[key]);
}

let gameCache: GameMenuAccess | null = null;
const GAME_EVENT = "dentalpos:game-access";

/** Avisa o menu para recarregar depois que o gestor liga ou desliga o game para a equipe. */
export function refreshGameAccess() { gameCache = null; window.dispatchEvent(new Event(GAME_EVENT)); }

/** Sem resposta do servidor o Game fica escondido (nunca liberado por engano). */
export function useGameMenuAccess(): GameMenuAccess | null {
  const [access, setAccess] = useState<GameMenuAccess | null>(gameCache);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (!localStorage.getItem("dentalpos.token")) return;
      TrainingApi.menu().then((a) => { gameCache = a; if (alive) setAccess(a); }).catch(() => undefined);
    };
    if (!gameCache) load();
    const onRefresh = () => load();
    window.addEventListener(GAME_EVENT, onRefresh);
    return () => { alive = false; window.removeEventListener(GAME_EVENT, onRefresh); };
  }, []);
  return access;
}
