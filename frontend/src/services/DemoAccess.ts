export type DemoPhase = "NONE" | "ACTIVE" | "READ_ONLY" | "ENDED";

export interface DemoAccessSnapshot {
  isDemo: boolean;
  phase: DemoPhase;
  active: boolean;
  readOnly: boolean;
  plan: string | null;
  startAt: string | null;
  endAt: string | null;
  graceUntil: string | null;
  daysRemaining: number | null;
  modules: string[];
  termsVersion: string | null;
  message: string;
}

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  clinicId: string;
  tenantId?: string;
  avatar?: string | null;
  clinic?: {
    name?: string;
    displayName?: string | null;
    plan?: string;
  };
}

const DEMO_KEY = "dentalpos.demoAccess";
const USER_KEY = "dentalpos.user";

function safeParse<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function readDemoAccess() {
  return safeParse<DemoAccessSnapshot>(DEMO_KEY);
}

export function writeDemoAccess(value: DemoAccessSnapshot | null | undefined) {
  if (!value) {
    localStorage.removeItem(DEMO_KEY);
    return;
  }
  localStorage.setItem(DEMO_KEY, JSON.stringify(value));
}

export function readSessionUser() {
  return safeParse<SessionUser>(USER_KEY);
}

export function writeSessionUser(value: SessionUser | null | undefined) {
  if (!value) {
    localStorage.removeItem(USER_KEY);
    return;
  }
  localStorage.setItem(USER_KEY, JSON.stringify(value));
}

export function clearClientSession() {
  localStorage.removeItem("dentalpos.token");
  localStorage.removeItem("dentalpos.clinicId");
  localStorage.removeItem(DEMO_KEY);
  localStorage.removeItem(USER_KEY);
}

export function appRootUrl() {
  return new URL(import.meta.env.BASE_URL || "/dentalposone/", window.location.origin).toString();
}

export function demoRegistrationUrl() {
  return new URL("demo", appRootUrl()).toString();
}

export function publicBookingUrl(clinicId?: string | null) {
  const url = new URL("agendamento-online", appRootUrl());
  if (clinicId) url.searchParams.set("clinicId", clinicId);
  return url.toString();
}

export function demoSalesUrl() {
  return (
    import.meta.env.VITE_SALES_URL ||
    "mailto:contato@dentalpos.com.br?subject=Quero%20contratar%20o%20DentalPos%20One"
  );
}

const ROUTE_MODULES: Array<[RegExp, string]> = [
  [/^\/agenda(?:\/|$)/, "agenda"],
  [/^\/pacientes(?:\/|$)/, "patients"],
  [/^\/(?:prontuario|documentos-clinicos|orcamentos-tratamentos|painel-atendimentos)(?:\/|$)/, "clinical"],
  [/^\/laboratorio(?:\/|$)/, "laboratory"],
  [/^\/design(?:\/|$)/, "design"],
  [/^\/(?:financeiro|pagamentos|inteligencia-financeira)(?:\/|$)/, "finance"],
  [/^\/(?:backoffice|contabil-fiscal|automacao-fiscal)(?:\/|$)/, "accounting"],
  [/^\/rh(?:\/|$)/, "hr"],
  [/^\/(?:marketing|revah|revah-chatbot|comunicacoes|recall|avaliacoes-atendimento)(?:\/|$)/, "marketing"],
  [/^\/(?:sales|comercial|crm|crm-inteligente|estoque|revah-leads)(?:\/|$)/, "sales"],
  [/^\/(?:backup|clinicas|configuracoes|integracoes|homologacao|plataforma-saas|sugestoes-problemas)(?:\/|$)/, "settings"],
  [/^\/(?:centro-de-comando|centro-de-inteligencia|painel-executivo|indice-saude-clinica|benchmark|relatorios|notificacoes)(?:\/|$)/, "dashboard"],
  [/^\/academico(?:\/|$)/, "academic"],
];

export function moduleForPath(pathname: string) {
  const normalized = pathname || "/";
  if (normalized === "/") return "dashboard";
  return ROUTE_MODULES.find(([pattern]) => pattern.test(normalized))?.[1] || null;
}

export function pathAllowedForDemo(
  pathname: string,
  demo: DemoAccessSnapshot | null | undefined,
) {
  if (!demo?.isDemo) return true;
  if (pathname === "/") return true;

  const moduleName = moduleForPath(pathname);
  return Boolean(moduleName && demo.modules.includes(moduleName));
}

export function formatDemoDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
