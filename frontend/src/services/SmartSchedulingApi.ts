import type {
  SmartScheduleInput,
  SmartScheduleSuggestion,
  SmartScheduleWarning,
} from "./SmartSchedulingService";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

interface BackendSchedulingFactors {
  clinical?: {
    minReturnDays?: number;
    preferredReturnIntervalDays?: number;
    maxReturnDays?: number | null;
    priority?: string;
  } | null;
  laboratory?: {
    leadTimeDays?: number;
    safetyDays?: number;
  } | null;
  finance?: {
    enabled?: boolean;
    neverOverridesClinical?: boolean;
    referenceAt?: string | null;
    cadenceDays?: number | null;
    overdueWarningOnly?: boolean;
  } | null;
  patientPreference?: {
    preferredWeekday?: number | null;
  } | null;
}

interface BackendSmartScheduleResponse {
  decisionId: string;
  patient: {
    id: string;
    fullName: string;
  };
  procedure: string;
  durationMinutes: number;
  referenceAt: string;
  clinicalEarliestAt: string;
  clinicalLatestAt: string | null;
  laboratoryReadyAt: string | null;
  financeReferenceAt: string | null;
  suggestedReturnAt: string;
  preferredWeekday: number | null;
  warnings: string[];
  factors?: BackendSchedulingFactors;
  recommendation: string;
  clinicalPriority: true;
}

export interface RemoteSmartScheduleResult {
  decisionId: string;
  suggestion: SmartScheduleSuggestion;
}

function headers(includeJson = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
  };
}

function dateOnly(value?: string | null) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

const weekdayLabels = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

function cadenceLabel(days?: number | null) {
  if (!days) return undefined;
  if (days <= 7) return "semanal";
  if (days <= 14) return "quinzenal";
  if (days <= 21) return "a cada 21 dias";
  return "mensal";
}

function warningSeverity(message: string): SmartScheduleWarning["severity"] {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("revisão manual") ||
    normalized.includes("ultrapassa") ||
    normalized.includes("vencida")
  ) {
    return "warning";
  }
  return "info";
}

function warningCode(message: string, index: number) {
  const normalized = message.toLowerCase();
  if (normalized.includes("laboratorial")) return "LABORATORY_WINDOW";
  if (normalized.includes("vencida")) return "FINANCIAL_OVERDUE";
  if (normalized.includes("dia habitual")) return "PREFERRED_WEEKDAY";
  if (normalized.includes("horizonte")) return "LOOKAHEAD_LIMIT";
  return `BACKEND_WARNING_${index + 1}`;
}

async function responseError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || `Erro HTTP ${response.status}`;
  } catch {
    return `Erro HTTP ${response.status}`;
  }
}

export async function requestSmartScheduleSuggestion(
  input: SmartScheduleInput,
): Promise<RemoteSmartScheduleResult | null> {
  if (!input.patientId) return null;

  const response = await fetch(`${API}/smart-scheduling/suggest`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({
      patientId: input.patientId,
      procedure: input.procedure,
      referenceAt: `${input.currentAppointmentDateISO}T12:00:00`,
      laboratoryName: input.laboratoryName || undefined,
      laboratoryService: input.laboratoryName ? input.procedure : undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(await responseError(response));
  }

  const data = (await response.json()) as BackendSmartScheduleResponse;
  const cadenceDays = data.factors?.finance?.cadenceDays || undefined;
  const laboratoryDays =
    data.factors?.laboratory?.leadTimeDays != null
      ? Number(data.factors.laboratory.leadTimeDays || 0) +
        Number(data.factors.laboratory.safetyDays || 0)
      : undefined;

  const preferredWeekday =
    data.preferredWeekday ??
    data.factors?.patientPreference?.preferredWeekday ??
    new Date(`${input.currentAppointmentDateISO}T12:00:00`).getDay();

  const warnings: SmartScheduleWarning[] = (data.warnings || []).map(
    (message, index) => ({
      severity: warningSeverity(message),
      code: warningCode(message, index),
      message,
    }),
  );

  const reasons = [
    data.recommendation,
    "Cálculo registrado no backend multi-tenant da clínica.",
  ];

  if (data.factors?.clinical?.priority === "CLINICAL_FIRST") {
    reasons.push(
      "Prioridade clínica ativa: fatores financeiros nunca podem adiar uma necessidade clínica.",
    );
  }

  if (laboratoryDays != null) {
    reasons.push(
      `Prazo laboratorial considerado pelo servidor: ${laboratoryDays} dia(s), incluindo margem de segurança.`,
    );
  }

  return {
    decisionId: data.decisionId,
    suggestion: {
      recommendedDurationMinutes: data.durationMinutes,
      recommendedReturnDateISO: dateOnly(data.suggestedReturnAt),
      returnWindowStartISO: dateOnly(data.clinicalEarliestAt),
      returnWindowEndISO:
        dateOnly(data.clinicalLatestAt) || dateOnly(data.suggestedReturnAt),
      preferredWeekday,
      preferredWeekdayLabel: weekdayLabels[preferredWeekday] || "não definida",
      financialCadenceDays: cadenceDays,
      financialCadenceLabel: cadenceLabel(cadenceDays),
      installments: undefined,
      estimatedRemainingVisits: undefined,
      overdueInstallments: warnings.some(
        (warning) => warning.code === "FINANCIAL_OVERDUE",
      )
        ? 1
        : 0,
      procedureRuleLabel: undefined,
      laboratoryRuleLabel: input.laboratoryName || undefined,
      laboratoryMinimumDays: laboratoryDays,
      reasons,
      warnings,
    },
  };
}

export async function acceptSmartScheduleDecision(
  decisionId: string,
  chosenReturnDateISO?: string,
) {
  const response = await fetch(
    `${API}/smart-scheduling/decisions/${encodeURIComponent(decisionId)}/accept`,
    {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({
        chosenReturnAt: chosenReturnDateISO
          ? `${chosenReturnDateISO}T12:00:00`
          : undefined,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await responseError(response));
  }

  return response.json();
}

export async function overrideSmartScheduleDecision(
  decisionId: string,
  reason: string,
  chosenReturnDateISO?: string,
) {
  const response = await fetch(
    `${API}/smart-scheduling/decisions/${encodeURIComponent(decisionId)}/override`,
    {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({
        reason,
        chosenReturnAt: chosenReturnDateISO
          ? `${chosenReturnDateISO}T12:00:00`
          : undefined,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await responseError(response));
  }

  return response.json();
}
