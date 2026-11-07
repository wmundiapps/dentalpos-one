const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}

async function call<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const json = init.body !== undefined;
  const h = init.auth === false ? (json ? { "Content-Type": "application/json" } : {}) : headers(json);
  const r = await fetch(`${API}${path}`, { method: init.method || "GET", headers: h, body: json ? JSON.stringify(init.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
  return d as T;
}

export interface Option { label: string; commission?: boolean; family?: boolean }
export interface ClubOptions {
  origins: Record<string, Option>; channels: Record<string, string>; kinds: Record<string, string>;
  relations: Record<string, Option>; team: Array<{ id: string; name: string }>; isManager: boolean; me: string;
}
export interface ClubPanel {
  month: string; daysLeft: number; goalHit: boolean; delinquencyOk: boolean;
  contracts: { done: number; goal: number; pct: number; missing: number; over: number };
  treatments: { done: number; goal: number; pct: number; hit: boolean };
  ranking: Array<{ position: number; name: string; contracts: number; treatments: number }>;
}
export interface ClubConfig {
  planPrice: number; contractsGoal: number; treatmentsGoalCount: number; treatmentsGoalAmount: number; bandSize: number;
  bandValueHit: number; bandValueMiss: number; delinquencyLimitPct: number; delinquencyBonusPct: number; cashbackPct: number;
  cashbackMonths: number; bestSellerPrize: string; managerEmails: string[]; splitCount: number; peersPerWeek: number;
}
export interface ClubReport {
  month: string; config: ClubConfig; goalHit: boolean; contractsHit: boolean; treatmentsHit: boolean; delinquency: number; delinquencyOk: boolean;
  contracts: number; firstParcels: number; teamTreatments: number; treatAmount: number; bands: number; bandsValue: number; subtotal: number;
  bonus: number; total: number; split: number; perPerson: number; pendingConfirmation: number;
  ranking: Array<{ userId: string; name: string; contracts: number; treatments: number; treatmentAmount: number }>;
  revenue: { adesao: number; recorrencia: number; tratamentosCampanha: number; tratamentosOutrasOrigens: number };
  byOrigin: Record<string, number>; byChannel: Record<string, number>;
}
export interface ClubSale {
  id: string; patientId: string; patientName: string; kind: string; kindLabel: string; amount?: number; saleDate: string; captureChannel: string;
  sellers: string[]; mainSeller: string; origin: string; paymentConfirmed: boolean; cancelled: boolean; countsForTeam: boolean; notes: string | null;
}
export interface PatientOrigin { origin: string; label: string; commission: boolean; detail: string | null; updatedAt: string }
export interface CashbackMember { patientId: string; name: string; phone: string; active: boolean; freeUntil: string | null; balance: number; nextExpiry: string | null }
export interface CashbackStatement {
  balance: number; lots: Array<{ remaining: number; expiresAt: string; origin: string }>;
  moves: Array<{ kind: string; amount: number; note: string | null; relation: string | null; createdAt: string }>;
}
export interface MyWeek {
  week: string; questions: Array<{ id: string; text: string }>; scale: string[];
  tasks: Array<{ kind: "SELF" | "PEER"; evaluatedUserId: string; name: string; done: boolean }>;
}
export interface TeamResults {
  week: string; answered: number; teamSize: number;
  summary: Array<{ name: string; self: number | null; peersAvg: number | null; peersCount: number; positivesAvg: number | null }>;
  details: Array<{ kind: string; evaluator: string; evaluated: string; score: number; answers: Record<string, string>; comment: string | null }>;
}
export interface SurveyResults {
  count: number; averages: Record<string, number | null>;
  rows: Array<{ createdAt: string; anonymous: boolean; name: string | null; phone: string | null; answers: Record<string, number | string>; recommend: number; highlightStaff: string | null; comment: string | null }>;
}
export interface PublicSurveyForm { clinicName: string; ratings: Array<{ id: string; text: string }>; yesNo: Array<{ id: string; text: string }>; scale: string[] }

export const loadClubOptions = () => call<ClubOptions>("/club/options");
export const loadClubPanel = (month: string) => call<ClubPanel>(`/club/panel?month=${month}`);
export const loadClubReport = (month: string) => call<ClubReport>(`/club/report?month=${month}`);
export const loadClubSettings = () => call<{ config: ClubConfig; surveyToken: string }>("/club/settings");
export const saveClubSettings = (body: Partial<ClubConfig>) => call<{ config: ClubConfig }>("/club/settings", { method: "PUT", body });
export const loadPatientOrigin = (patientId: string) => call<{ origin: PatientOrigin | null }>(`/club/origin/${patientId}`);
export const savePatientOrigin = (patientId: string, body: { origin: string; detail?: string }) => call<{ origin: PatientOrigin }>(`/club/origin/${patientId}`, { method: "PUT", body });
export const loadClubSales = (month: string) => call<{ sales: ClubSale[] }>(`/club/sales?month=${month}`);
export const createClubSale = (body: Record<string, unknown>) => call<{ id: string }>("/club/sales", { method: "POST", body });
export const confirmClubSale = (id: string) => call<{ cashback: number }>(`/club/sales/${id}/confirm`, { method: "POST", body: {} });
export const cancelClubSale = (id: string) => call<{ ok: boolean }>(`/club/sales/${id}/cancel`, { method: "POST", body: {} });
export const loadCashbackMembers = () => call<{ members: CashbackMember[] }>("/club/cashback/members");
export const addCashbackMember = (body: { patientId: string; consent: boolean; freeMonths?: number }) => call<{ ok: boolean }>("/club/cashback/members", { method: "POST", body });
export const loadCashbackStatement = (patientId: string) => call<CashbackStatement>(`/club/cashback/${patientId}`);
export const spendCashback = (body: { patientId: string; amount: number; note?: string }) => call<{ ok: boolean }>("/club/cashback/use", { method: "POST", body });
export const transferCashback = (body: { fromPatientId: string; toPatientId: string; amount: number; relation: string }) => call<{ ok: boolean }>("/club/cashback/transfer", { method: "POST", body });
export const loadMyWeek = () => call<MyWeek>("/club/evaluation/week");
export const sendTeamEvaluation = (body: { kind: string; evaluatedUserId: string; answers: Record<string, string>; score: number; comment?: string }) => call<{ ok: boolean }>("/club/evaluation", { method: "POST", body });
export const loadTeamResults = (week?: string) => call<TeamResults>(`/club/evaluation/results${week ? `?week=${week}` : ""}`);
export const loadSurveys = (month: string) => call<SurveyResults>(`/club/surveys?month=${month}`);
export const loadPublicSurvey = (token: string) => call<PublicSurveyForm>(`/public/avaliacao/${token}`, { auth: false });
export const sendPublicSurvey = (token: string, body: Record<string, unknown>) => call<{ ok: boolean }>(`/public/avaliacao/${token}`, { method: "POST", body, auth: false });

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const currentMonth = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
