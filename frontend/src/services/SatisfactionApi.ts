const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

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

export type SatisfactionJourney = "PRIMEIRA_CONSULTA" | "TRATAMENTO" | "FIM_TRATAMENTO";

export interface SatisfactionReport {
  period: { from: string; to: string };
  sent: number;
  responses: number;
  responseRate: number | null;
  nps: number | null;
  distribution: { promoters: number; neutrals: number; detractors: number };
  byDoctor: Array<{ doctorId: string; name: string; responses: number; nps: number | null; average: number }>;
  notContractedReasons: Array<{ reason: string; count: number }>;
  firstConsultConversion: { answered: number; contracted: number; rate: number | null };
  alerts: {
    lowScoreCount: number;
    items: Array<{ answerId: string; nps: number; comment: string | null; wantsContact: boolean; createdAt: string; patientName: string; phone: string | null; handled: boolean }>;
  };
  testimonials: Array<{ comment: string | null; createdAt: string; doctor: string | null }>;
}

export interface SurveyRow {
  id: string;
  patientName: string;
  journey: SatisfactionJourney;
  status: string;
  sendAfter: string;
  sentAt: string | null;
  answeredAt: string | null;
  expiresAt: string;
  dispatchError: string | null;
}

export interface NotContractedRow {
  answerId: string;
  patientId: string;
  patientName: string;
  phone: string | null;
  email: string | null;
  reason: string | null;
  wantsContact: boolean;
  createdAt: string;
}

export const loadSatisfactionReport = (from?: string, to?: string) => {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  return fetch(`${API}/satisfaction/report?${q}`, { headers: headers() }).then(r => parse<SatisfactionReport>(r));
};
export const loadSurveys = () => fetch(`${API}/satisfaction/surveys`, { headers: headers() }).then(r => parse<SurveyRow[]>(r));
export const loadNotContracted = () => fetch(`${API}/satisfaction/not-contracted`, { headers: headers() }).then(r => parse<NotContractedRow[]>(r));
export const createSurvey = (body: { appointmentId: string; journey?: SatisfactionJourney; sendNow?: boolean }) =>
  fetch(`${API}/satisfaction/surveys`, { method: "POST", headers: headers(true), body: JSON.stringify(body) })
    .then(r => parse<{ id: string; link: string; delivery: { dispatched: boolean; reason?: string } }>(r));
export const regenerateSurveyLink = (id: string, send = false) =>
  fetch(`${API}/satisfaction/surveys/${id}/link`, { method: "POST", headers: headers(true), body: JSON.stringify({ send }) })
    .then(r => parse<{ id: string; link: string; delivery: { dispatched: boolean; reason?: string } }>(r));
export const dispatchDueSurveys = () =>
  fetch(`${API}/satisfaction/surveys/dispatch-due`, { method: "POST", headers: headers(true), body: "{}" }).then(r => parse<{ checked: number; sent: number }>(r));
export const markLowScoreHandled = (answerId: string) =>
  fetch(`${API}/satisfaction/answers/${answerId}/handled`, { method: "POST", headers: headers(true), body: "{}" }).then(r => parse<{ ok: true }>(r));

// Público (sem login)
export interface PublicSurvey { clinicName: string; patientFirstName: string; doctorName: string | null; journey: SatisfactionJourney }
export interface PublicAnswerInput {
  nps: number;
  comment?: string;
  details?: Record<string, number | boolean | string>;
  contracted?: boolean;
  notContractedReason?: string;
  wantsContact?: boolean;
  testimonialConsent?: boolean;
  lgpdConsent: true;
}
export const loadPublicSurvey = (token: string) => fetch(`${API}/public/satisfaction/${encodeURIComponent(token)}`).then(r => parse<PublicSurvey>(r));
export const sendPublicAnswer = (token: string, body: PublicAnswerInput) =>
  fetch(`${API}/public/satisfaction/${encodeURIComponent(token)}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => parse<{ ok: true }>(r));
export const sendPublicOptOut = (token: string) =>
  fetch(`${API}/public/satisfaction/${encodeURIComponent(token)}/optout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(r => parse<{ ok: true }>(r));
