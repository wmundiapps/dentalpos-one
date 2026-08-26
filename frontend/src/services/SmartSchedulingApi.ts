import type {
  LaboratoryTimingRule,
  ProcedureTimingRule,
  SmartSchedulingConfig,
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

interface BackendSmartSchedulingPolicy {
  id?: string;
  enabled: boolean;
  respectPreferredWeekday: boolean;
  financeOptimizationEnabled: boolean;
  financeNeverOverridesClinical: boolean;
  overdueWarningOnly: boolean;
  defaultDurationMinutes: number;
  defaultReturnIntervalDays: number;
  maxLookAheadDays: number;
}

interface BackendProcedureRule {
  id: string;
  procedureKey: string;
  procedureName: string;
  durationMinutes: number;
  clinicalMinReturnDays: number;
  clinicalMaxReturnDays: number | null;
  preferredReturnIntervalDays: number | null;
  isActive: boolean;
}

interface BackendLaboratoryRule {
  id: string;
  laboratoryName: string;
  serviceKey: string;
  serviceName: string;
  leadTimeDays: number;
  safetyDays: number;
  isActive: boolean;
}

interface BackendSmartSchedulingConfig {
  policy: BackendSmartSchedulingPolicy;
  procedureRules: BackendProcedureRule[];
  laboratoryRules: BackendLaboratoryRule[];
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

function normalizeKey(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "regra";
}

function normalizedText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function fetchBackendConfig(): Promise<BackendSmartSchedulingConfig> {
  const response = await fetch(`${API}/smart-scheduling/config`, {
    headers: headers(),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()) as BackendSmartSchedulingConfig;
}

async function putJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "PUT",
    headers: headers(true),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()) as T;
}

function procedureFallback(
  row: BackendProcedureRule,
  fallback: SmartSchedulingConfig,
): ProcedureTimingRule | undefined {
  const key = normalizedText(row.procedureName);
  return fallback.procedureRules.find((rule) => {
    if (normalizeKey(rule.label) === row.procedureKey) return true;
    if (normalizedText(rule.label) === key) return true;
    return rule.keywords.some((keyword) => normalizedText(keyword) === key);
  });
}

function mapBackendConfig(
  backend: BackendSmartSchedulingConfig,
  fallback: SmartSchedulingConfig,
): SmartSchedulingConfig {
  const procedureRules: ProcedureTimingRule[] = backend.procedureRules.map((row) => {
    const previous = procedureFallback(row, fallback);
    const returnDays = Math.max(
      1,
      Number(
        row.preferredReturnIntervalDays ??
          row.clinicalMinReturnDays ??
          fallback.defaultReturnDays,
      ),
    );
    const maxReturnDays = Math.max(
      returnDays,
      Number(row.clinicalMaxReturnDays ?? fallback.defaultMaxReturnDays),
    );

    return {
      id: row.procedureKey || row.id,
      label: row.procedureName,
      keywords:
        previous?.keywords?.length ? previous.keywords : [row.procedureName],
      durationMinutes: Math.max(10, Number(row.durationMinutes || 30)),
      returnDays,
      maxReturnDays,
      sameWeekday:
        previous?.sameWeekday ?? backend.policy.respectPreferredWeekday,
      active: row.isActive !== false,
    };
  });

  const groupedLabs = new Map<
    string,
    {
      laboratoryName: string;
      turnaroundDays: number;
      safetyDays: number;
      serviceKeywords: string[];
    }
  >();

  for (const row of backend.laboratoryRules) {
    const groupKey = [
      normalizedText(row.laboratoryName),
      Number(row.leadTimeDays || 0),
      Number(row.safetyDays || 0),
    ].join("|");
    const group = groupedLabs.get(groupKey) || {
      laboratoryName: row.laboratoryName,
      turnaroundDays: Math.max(0, Number(row.leadTimeDays || 0)),
      safetyDays: Math.max(0, Number(row.safetyDays || 0)),
      serviceKeywords: [],
    };
    if (
      row.serviceName &&
      !group.serviceKeywords.some(
        (item) => normalizedText(item) === normalizedText(row.serviceName),
      )
    ) {
      group.serviceKeywords.push(row.serviceName);
    }
    groupedLabs.set(groupKey, group);
  }

  const laboratoryRules: LaboratoryTimingRule[] = Array.from(
    groupedLabs.values(),
  ).map((group, index) => {
    const previous = fallback.laboratoryRules.find(
      (rule) =>
        normalizedText(rule.laboratoryName) ===
          normalizedText(group.laboratoryName) &&
        Number(rule.turnaroundDays) === group.turnaroundDays &&
        Number(rule.safetyDays) === group.safetyDays,
    );
    const mergedKeywords = [
      ...group.serviceKeywords,
      ...(previous?.serviceKeywords || []),
    ].filter(
      (keyword, idx, all) =>
        keyword.trim() &&
        all.findIndex(
          (candidate) =>
            normalizedText(candidate) === normalizedText(keyword),
        ) === idx,
    );

    return {
      id:
        previous?.id ||
        `lab-${normalizeKey(group.laboratoryName)}-${group.turnaroundDays}-${group.safetyDays}-${index}`,
      laboratoryName: group.laboratoryName,
      serviceKeywords: mergedKeywords.length
        ? mergedKeywords
        : ["trabalho protético"],
      turnaroundDays: group.turnaroundDays,
      safetyDays: group.safetyDays,
      active: true,
    };
  });

  return {
    ...fallback,
    enabled: backend.policy.enabled !== false,
    sameWeekdayDefault: backend.policy.respectPreferredWeekday !== false,
    defaultDurationMinutes: Math.max(
      10,
      Number(backend.policy.defaultDurationMinutes || fallback.defaultDurationMinutes),
    ),
    defaultReturnDays: Math.max(
      1,
      Number(
        backend.policy.defaultReturnIntervalDays || fallback.defaultReturnDays,
      ),
    ),
    financialAlignmentEnabled:
      backend.policy.financeOptimizationEnabled !== false,
    procedureRules:
      procedureRules.length > 0 ? procedureRules : fallback.procedureRules,
    laboratoryRules:
      laboratoryRules.length > 0 ? laboratoryRules : fallback.laboratoryRules,
  };
}

export async function loadSmartSchedulingBackendConfig(
  fallback: SmartSchedulingConfig,
): Promise<SmartSchedulingConfig> {
  const backend = await fetchBackendConfig();
  return mapBackendConfig(backend, fallback);
}

export async function saveSmartSchedulingBackendConfig(
  config: SmartSchedulingConfig,
): Promise<SmartSchedulingConfig> {
  const current = await fetchBackendConfig();

  await putJson<BackendSmartSchedulingPolicy>(
    `${API}/smart-scheduling/policy`,
    {
      enabled: config.enabled,
      respectPreferredWeekday: config.sameWeekdayDefault,
      financeOptimizationEnabled: config.financialAlignmentEnabled,
      defaultDurationMinutes: Math.max(
        10,
        Number(config.defaultDurationMinutes || 30),
      ),
      defaultReturnIntervalDays: Math.max(
        1,
        Number(config.defaultReturnDays || 14),
      ),
      maxLookAheadDays: Math.max(
        1,
        Number(current.policy.maxLookAheadDays || 180),
      ),
    },
  );

  const desiredProcedureKeys = new Set<string>();
  for (const rule of config.procedureRules) {
    const key = normalizeKey(rule.label);
    if (rule.active !== false) desiredProcedureKeys.add(key);
    await putJson<BackendProcedureRule>(
      `${API}/smart-scheduling/procedure-rules/${encodeURIComponent(key)}`,
      {
        procedureName: rule.label,
        durationMinutes: Math.max(10, Number(rule.durationMinutes || 30)),
        clinicalMinReturnDays: Math.max(0, Number(rule.returnDays || 0)),
        preferredReturnIntervalDays: Math.max(
          0,
          Number(rule.returnDays || 0),
        ),
        clinicalMaxReturnDays: Math.max(
          Number(rule.returnDays || 0),
          Number(rule.maxReturnDays || rule.returnDays || 0),
        ),
        isActive: rule.active !== false,
      },
    );
  }

  for (const row of current.procedureRules) {
    if (!desiredProcedureKeys.has(row.procedureKey)) {
      await putJson<BackendProcedureRule>(
        `${API}/smart-scheduling/procedure-rules/${encodeURIComponent(
          row.procedureKey,
        )}`,
        {
          procedureName: row.procedureName,
          durationMinutes: row.durationMinutes,
          clinicalMinReturnDays: row.clinicalMinReturnDays,
          preferredReturnIntervalDays: row.preferredReturnIntervalDays,
          clinicalMaxReturnDays: row.clinicalMaxReturnDays,
          isActive: false,
        },
      );
    }
  }

  const desiredLabKeys = new Set<string>();
  for (const rule of config.laboratoryRules) {
    const services = rule.serviceKeywords
      .map((item) => item.trim())
      .filter(Boolean);
    const effectiveServices = services.length ? services : ["Serviço geral"];

    for (const serviceName of effectiveServices) {
      const key = `${normalizedText(rule.laboratoryName)}::${normalizeKey(
        serviceName,
      )}`;
      if (rule.active !== false) desiredLabKeys.add(key);
      await putJson<BackendLaboratoryRule>(
        `${API}/smart-scheduling/laboratory-rules`,
        {
          laboratoryName: rule.laboratoryName,
          serviceName,
          leadTimeDays: Math.max(0, Number(rule.turnaroundDays || 0)),
          safetyDays: Math.max(0, Number(rule.safetyDays || 0)),
          isActive: rule.active !== false,
        },
      );
    }
  }

  for (const row of current.laboratoryRules) {
    const key = `${normalizedText(row.laboratoryName)}::${row.serviceKey}`;
    if (!desiredLabKeys.has(key)) {
      await putJson<BackendLaboratoryRule>(
        `${API}/smart-scheduling/laboratory-rules`,
        {
          laboratoryName: row.laboratoryName,
          serviceName: row.serviceName,
          leadTimeDays: row.leadTimeDays,
          safetyDays: row.safetyDays,
          isActive: false,
        },
      );
    }
  }

  const refreshed = await fetchBackendConfig();
  return mapBackendConfig(refreshed, config);
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
      preferredWeekdayLabel:
        weekdayLabels[preferredWeekday] || "não definida",
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
    `${API}/smart-scheduling/decisions/${encodeURIComponent(
      decisionId,
    )}/accept`,
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
    `${API}/smart-scheduling/decisions/${encodeURIComponent(
      decisionId,
    )}/override`,
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
