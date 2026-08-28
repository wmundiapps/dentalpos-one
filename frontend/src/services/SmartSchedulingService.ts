import { listFinanceEntries } from "./FinanceHubService";
import { getAppointments, getLaboratoryWorks } from "./OperationsHubService";
import { listTreatmentItems } from "./PatientClinicalService";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const STORAGE_KEY = "dentalpos.smart-scheduling.config.v1";
const FEATURE_KEY = "SMART_SCHEDULING";

export interface ProcedureTimingRule {
  id: string;
  label: string;
  keywords: string[];
  durationMinutes: number;
  returnDays: number;
  maxReturnDays: number;
  sameWeekday: boolean;
  active: boolean;
}

export interface LaboratoryTimingRule {
  id: string;
  laboratoryName: string;
  serviceKeywords: string[];
  turnaroundDays: number;
  safetyDays: number;
  active: boolean;
}

export interface SmartSchedulingConfig {
  enabled: boolean;
  sameWeekdayDefault: boolean;
  maxWeekdayShiftDays: number;
  defaultDurationMinutes: number;
  defaultReturnDays: number;
  defaultMaxReturnDays: number;
  financialAlignmentEnabled: boolean;
  procedureRules: ProcedureTimingRule[];
  laboratoryRules: LaboratoryTimingRule[];
}

export interface SmartScheduleWarning {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
}

export interface SmartScheduleSuggestion {
  recommendedDurationMinutes: number;
  recommendedReturnDateISO: string;
  returnWindowStartISO: string;
  returnWindowEndISO: string;
  preferredWeekday: number;
  preferredWeekdayLabel: string;
  financialCadenceDays?: number;
  financialCadenceLabel?: string;
  financialAlternativeDateISO?: string;
  installments?: number;
  estimatedRemainingVisits?: number;
  overdueInstallments: number;
  procedureRuleLabel?: string;
  laboratoryRuleLabel?: string;
  laboratoryMinimumDays?: number;
  reasons: string[];
  warnings: SmartScheduleWarning[];
}

export interface SmartScheduleInput {
  patientId?: string;
  patientName: string;
  procedure: string;
  category?: string;
  currentAppointmentDateISO: string;
  selectedDurationMinutes?: number;
  laboratoryName?: string;
}

const defaultProcedureRules: ProcedureTimingRule[] = [
  {
    id: "consulta-avaliacao",
    label: "Consulta / avaliação",
    keywords: ["consulta", "avaliação", "avaliacao"],
    durationMinutes: 30,
    returnDays: 14,
    maxReturnDays: 30,
    sameWeekday: true,
    active: true,
  },
  {
    id: "implante-unitario",
    label: "Implante unitário",
    keywords: ["implante unitário", "implante unitario", "1 implante", "implante único", "implante unico"],
    durationMinutes: 60,
    returnDays: 7,
    maxReturnDays: 14,
    sameWeekday: true,
    active: true,
  },
  {
    id: "implantes-multiplos",
    label: "Múltiplos implantes / protocolo",
    keywords: ["múltiplos implantes", "multiplos implantes", "protocolo", "all-on-4", "all on 4", "all-on-6", "all on 6"],
    durationMinutes: 120,
    returnDays: 7,
    maxReturnDays: 14,
    sameWeekday: true,
    active: true,
  },
  {
    id: "extracao-simples",
    label: "Extração simples",
    keywords: ["extração simples", "extracao simples", "exodontia simples"],
    durationMinutes: 45,
    returnDays: 7,
    maxReturnDays: 14,
    sameWeekday: true,
    active: true,
  },
  {
    id: "raiz-residual",
    label: "Raiz residual / extração complexa",
    keywords: ["raiz residual", "resto radicular", "extração complexa", "extracao complexa"],
    durationMinutes: 60,
    returnDays: 7,
    maxReturnDays: 14,
    sameWeekday: true,
    active: true,
  },
  {
    id: "dente-incluso",
    label: "Dente incluso",
    keywords: ["dente incluso", "incluso", "terceiro molar", "siso incluso"],
    durationMinutes: 90,
    returnDays: 7,
    maxReturnDays: 14,
    sameWeekday: true,
    active: true,
  },
  {
    id: "ortodontia",
    label: "Manutenção ortodôntica",
    keywords: ["ortodontia", "manutenção ortodôntica", "manutencao ortodontica", "aparelho"],
    durationMinutes: 30,
    returnDays: 28,
    maxReturnDays: 35,
    sameWeekday: true,
    active: true,
  },
  {
    id: "protese-laboratorio",
    label: "Prótese / etapa laboratorial",
    keywords: ["prótese", "protese", "coroa", "faceta", "prova", "protocolo", "overdenture", "placa", "dentadura"],
    durationMinutes: 45,
    returnDays: 14,
    maxReturnDays: 35,
    sameWeekday: true,
    active: true,
  },
];

const defaultLaboratoryRules: LaboratoryTimingRule[] = [
  {
    id: "laboratorio-padrao",
    laboratoryName: "Laboratório padrão",
    serviceKeywords: ["prótese", "protese", "coroa", "faceta", "protocolo", "prova"],
    turnaroundDays: 15,
    safetyDays: 6,
    active: true,
  },
];

export const DEFAULT_SMART_SCHEDULING_CONFIG: SmartSchedulingConfig = {
  enabled: true,
  sameWeekdayDefault: true,
  maxWeekdayShiftDays: 6,
  defaultDurationMinutes: 30,
  defaultReturnDays: 14,
  defaultMaxReturnDays: 30,
  financialAlignmentEnabled: true,
  procedureRules: defaultProcedureRules,
  laboratoryRules: defaultLaboratoryRules,
};

const weekdayLabels = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function cloneDefaultConfig(): SmartSchedulingConfig {
  return JSON.parse(JSON.stringify(DEFAULT_SMART_SCHEDULING_CONFIG)) as SmartSchedulingConfig;
}

function sanitizeConfig(value: Partial<SmartSchedulingConfig> | undefined): SmartSchedulingConfig {
  const base = cloneDefaultConfig();
  if (!value) return base;
  return {
    ...base,
    ...value,
    procedureRules: Array.isArray(value.procedureRules) && value.procedureRules.length ? value.procedureRules : base.procedureRules,
    laboratoryRules: Array.isArray(value.laboratoryRules) && value.laboratoryRules.length ? value.laboratoryRules : base.laboratoryRules,
  };
}

function localConfig(): SmartSchedulingConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaultConfig();
    return sanitizeConfig(JSON.parse(raw) as Partial<SmartSchedulingConfig>);
  } catch {
    return cloneDefaultConfig();
  }
}

function saveLocalConfig(config: SmartSchedulingConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent("dentalpos:smart-scheduling-changed"));
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

export async function loadSmartSchedulingConfig(): Promise<SmartSchedulingConfig> {
  const fallback = localConfig();
  try {
    const response = await fetch(`${API}/platform/feature-flags`, { headers: headers() });
    if (!response.ok) return fallback;
    const rows = (await response.json()) as Array<{ key?: string; enabled?: boolean; metadata?: unknown }>;
    const flag = rows.find((row) => row.key === FEATURE_KEY);
    if (!flag) return fallback;
    const config = sanitizeConfig({ ...(flag.metadata as Partial<SmartSchedulingConfig>), enabled: flag.enabled !== false });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return config;
  } catch {
    return fallback;
  }
}

export async function saveSmartSchedulingConfig(config: SmartSchedulingConfig): Promise<SmartSchedulingConfig> {
  const clean = sanitizeConfig(config);
  saveLocalConfig(clean);
  try {
    const response = await fetch(`${API}/platform/feature-flags/${FEATURE_KEY}`, {
      method: "PUT",
      headers: headers(true),
      body: JSON.stringify({ enabled: clean.enabled, rolloutStage: "PILOT", metadata: clean }),
    });
    if (!response.ok) return clean;
  } catch {
    // O modo local continua funcionando mesmo quando a API não está disponível.
  }
  return clean;
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function dateISO(date: Date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return dateISO(date);
}

function daysBetween(fromISO: string, toISO: string) {
  return Math.round((parseDate(toISO).getTime() - parseDate(fromISO).getTime()) / 86400000);
}

function matchProcedureRule(procedure: string, config: SmartSchedulingConfig) {
  const haystack = normalize(procedure);
  const candidates = config.procedureRules.filter((rule) => rule.active !== false);
  return candidates.find((rule) => rule.keywords.some((keyword) => haystack.includes(normalize(keyword))));
}

function matchLaboratoryRule(laboratoryName: string | undefined, procedure: string, config: SmartSchedulingConfig) {
  const lab = normalize(laboratoryName || "");
  const service = normalize(procedure);
  const active = config.laboratoryRules.filter((rule) => rule.active !== false);
  if (lab) {
    const exact = active.find((rule) => {
      const configuredLab = normalize(rule.laboratoryName);
      const labMatch = configuredLab && (lab.includes(configuredLab) || configuredLab.includes(lab));
      const serviceMatch = rule.serviceKeywords.length === 0 || rule.serviceKeywords.some((keyword) => service.includes(normalize(keyword)));
      return labMatch && serviceMatch;
    });
    if (exact) return exact;
  }
  return active.find((rule) => rule.serviceKeywords.some((keyword) => service.includes(normalize(keyword))) && normalize(rule.laboratoryName).includes("padrao"));
}

function preferredWeekdayForPatient(patientName: string, currentDateISO: string) {
  const selected = parseDate(currentDateISO);
  const previous = getAppointments()
    .filter((appointment) => normalize(appointment.patientName) === normalize(patientName) && appointment.dateISO < currentDateISO && !["Cancelado", "Faltou"].includes(appointment.status))
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO))[0];
  if (previous) return parseDate(previous.dateISO).getDay();
  return selected.getDay();
}

function alignForwardToWeekday(dateValueISO: string, weekday: number, maxShiftDays: number) {
  const date = parseDate(dateValueISO);
  const delta = (weekday - date.getDay() + 7) % 7;
  if (!delta || delta > Math.max(0, maxShiftDays)) return dateValueISO;
  date.setDate(date.getDate() + delta);
  return dateISO(date);
}

function snapFinancialCadence(days: number) {
  const options = [7, 14, 21, 30];
  return options.reduce((best, option) => Math.abs(option - days) < Math.abs(best - days) ? option : best, options[0]);
}

function cadenceLabel(days: number) {
  if (days <= 7) return "semanal";
  if (days <= 14) return "quinzenal";
  if (days <= 21) return "a cada 21 dias";
  return "mensal";
}

function latestPreviousAppointment(patientName: string, currentDateISO: string) {
  return getAppointments()
    .filter((appointment) => normalize(appointment.patientName) === normalize(patientName) && appointment.dateISO < currentDateISO && !["Cancelado", "Faltou"].includes(appointment.status))
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO))[0];
}

function financialData(patientId: string | undefined, patientName: string) {
  const rows = listFinanceEntries().filter((entry) => {
    const samePatient = patientId ? entry.patientId === patientId || normalize(entry.personName) === normalize(patientName) : normalize(entry.personName) === normalize(patientName);
    return samePatient && entry.type === "Receita" && entry.status !== "Cancelado";
  });
  const installments = rows.reduce((max, entry) => Math.max(max, Number(entry.installments || 0)), 0) || undefined;
  const overdueInstallments = rows.filter((entry) => entry.status === "Vencido").length;
  return { installments, overdueInstallments };
}

function estimatedRemainingVisits(patientId: string | undefined) {
  if (!patientId) return undefined;
  const pending = listTreatmentItems(patientId).filter((item) => item.status !== "Concluído");
  if (!pending.length) return undefined;
  return Math.max(1, pending.length);
}

function financialCadence(installments: number | undefined, visits: number | undefined) {
  if (!installments || installments <= 0 || !visits || visits <= 0) return undefined;
  const estimatedPaymentHorizonDays = Math.max(30, installments * 30);
  return snapFinancialCadence(Math.max(7, Math.min(30, Math.round(estimatedPaymentHorizonDays / visits))));
}

function findFinancialAlternative(
  currentDateISO: string,
  minDateISO: string,
  maxDateISO: string,
  cadenceDays: number | undefined,
  preferredWeekday: number,
  config: SmartSchedulingConfig,
) {
  if (!cadenceDays) return undefined;
  let candidate = addDays(currentDateISO, cadenceDays);
  let guard = 0;
  while (candidate < minDateISO && guard < 12) {
    candidate = addDays(candidate, cadenceDays);
    guard += 1;
  }
  if (candidate > maxDateISO) return undefined;
  if (config.sameWeekdayDefault) {
    const aligned = alignForwardToWeekday(candidate, preferredWeekday, config.maxWeekdayShiftDays);
    if (aligned <= maxDateISO) candidate = aligned;
  }
  return candidate >= minDateISO && candidate <= maxDateISO ? candidate : undefined;
}

function priorReturnWarning(patientName: string, currentDateISO: string, preferredWeekday: number, config: SmartSchedulingConfig) {
  const previous = latestPreviousAppointment(patientName, currentDateISO);
  if (!previous) return [] as SmartScheduleWarning[];
  const warnings: SmartScheduleWarning[] = [];
  const previousSuggestion = previous.smartSchedule?.recommendedReturnDateISO;
  if (previousSuggestion) {
    const delta = Math.abs(daysBetween(previousSuggestion, currentDateISO));
    if (delta > 3) {
      warnings.push({
        severity: "warning",
        code: "RETURN_OUTSIDE_PREVIOUS_SUGGESTION",
        message: `O retorno atual está ${delta} dia(s) distante da data sugerida na consulta anterior (${previousSuggestion}).`,
      });
    }
  }
  if (config.sameWeekdayDefault && parseDate(currentDateISO).getDay() !== preferredWeekday) {
    warnings.push({
      severity: "info",
      code: "WEEKDAY_CHANGED",
      message: `Este paciente costuma retornar em ${weekdayLabels[preferredWeekday]}. O agendamento atual está em outro dia da semana.`,
    });
  }
  return warnings;
}

export function calculateSmartScheduleSuggestion(
  input: SmartScheduleInput,
  config: SmartSchedulingConfig = localConfig(),
): SmartScheduleSuggestion {
  const procedureRule = matchProcedureRule(input.procedure, config);
  const laboratoryRule = matchLaboratoryRule(input.laboratoryName, input.procedure, config);
  const recommendedDurationMinutes = Math.max(10, procedureRule?.durationMinutes || config.defaultDurationMinutes);
  const clinicalMinimumDays = Math.max(1, procedureRule?.returnDays || config.defaultReturnDays);
  const clinicalMaximumDays = Math.max(clinicalMinimumDays, procedureRule?.maxReturnDays || config.defaultMaxReturnDays);
  const laboratoryMinimumDays = laboratoryRule ? Math.max(0, laboratoryRule.turnaroundDays + laboratoryRule.safetyDays) : 0;
  const minimumDays = Math.max(clinicalMinimumDays, laboratoryMinimumDays);
  const maximumDays = Math.max(minimumDays, clinicalMaximumDays, laboratoryMinimumDays ? laboratoryMinimumDays + 7 : clinicalMaximumDays);

  const preferredWeekday = preferredWeekdayForPatient(input.patientName, input.currentAppointmentDateISO);
  const rawMinimumDateISO = addDays(input.currentAppointmentDateISO, minimumDays);
  const returnWindowEndISO = addDays(input.currentAppointmentDateISO, maximumDays);
  const shouldKeepWeekday = procedureRule?.sameWeekday ?? config.sameWeekdayDefault;
  const alignedRecommended = shouldKeepWeekday
    ? alignForwardToWeekday(rawMinimumDateISO, preferredWeekday, config.maxWeekdayShiftDays)
    : rawMinimumDateISO;
  const recommendedReturnDateISO = alignedRecommended <= returnWindowEndISO ? alignedRecommended : rawMinimumDateISO;

  const finance = financialData(input.patientId, input.patientName);
  const visits = estimatedRemainingVisits(input.patientId);
  const cadenceDays = config.financialAlignmentEnabled ? financialCadence(finance.installments, visits) : undefined;
  const financialAlternativeDateISO = config.financialAlignmentEnabled
    ? findFinancialAlternative(
        input.currentAppointmentDateISO,
        rawMinimumDateISO,
        returnWindowEndISO,
        cadenceDays,
        preferredWeekday,
        config,
      )
    : undefined;

  const reasons: string[] = [];
  if (procedureRule) {
    reasons.push(`${procedureRule.label}: ${recommendedDurationMinutes} min e retorno clínico a partir de ${clinicalMinimumDays} dia(s).`);
  } else {
    reasons.push(`Regra padrão da clínica: ${recommendedDurationMinutes} min e retorno a partir de ${clinicalMinimumDays} dia(s).`);
  }
  if (laboratoryRule) {
    reasons.push(`${laboratoryRule.laboratoryName}: ${laboratoryRule.turnaroundDays} dia(s) de produção + ${laboratoryRule.safetyDays} dia(s) de margem = ${laboratoryMinimumDays} dia(s).`);
  }
  if (shouldKeepWeekday) {
    reasons.push(`Preferência de recorrência: manter ${weekdayLabels[preferredWeekday]} sempre que a janela clínica permitir.`);
  }
  if (cadenceDays && finance.installments && visits) {
    reasons.push(`Plano financeiro: ${finance.installments} parcela(s) e ${visits} sessão(ões) estimada(s) restantes sugerem cadência administrativa ${cadenceLabel(cadenceDays)}. Ela só é usada dentro da janela clínica.`);
  }

  const warnings: SmartScheduleWarning[] = [...priorReturnWarning(input.patientName, input.currentAppointmentDateISO, preferredWeekday, config)];
  if (input.selectedDurationMinutes && input.selectedDurationMinutes < recommendedDurationMinutes) {
    warnings.push({
      severity: "warning",
      code: "SLOT_TOO_SHORT",
      message: `O horário reservado tem ${input.selectedDurationMinutes} min, mas a regra atual sugere ${recommendedDurationMinutes} min para este procedimento.`,
    });
  }
  if (finance.overdueInstallments > 0) {
    warnings.push({
      severity: "warning",
      code: "FINANCIAL_OVERDUE",
      message: `${finance.overdueInstallments} parcela(s) vencida(s). Sinalize a equipe financeira; isso não bloqueia nem altera a indicação clínica.`,
    });
  }

  const activeLabWork = getLaboratoryWorks()
    .filter((work) => normalize(work.patientName) === normalize(input.patientName) && !["Entregue", "Cancelado"].includes(String(work.status)))
    .sort((a, b) => String(b.updatedAtISO).localeCompare(String(a.updatedAtISO)))[0];
  if (activeLabWork?.dueDateISO) {
    const dueOffset = daysBetween(input.currentAppointmentDateISO, activeLabWork.dueDateISO);
    if (dueOffset > 0 && dueOffset > minimumDays) {
      warnings.push({
        severity: "info",
        code: "LAB_WORK_ACTIVE",
        message: `Há trabalho laboratorial em andamento com previsão para ${activeLabWork.dueDateISO}. Confira a entrega antes de confirmar o retorno.`,
      });
    }
  }

  return {
    recommendedDurationMinutes,
    recommendedReturnDateISO,
    returnWindowStartISO: rawMinimumDateISO,
    returnWindowEndISO,
    preferredWeekday,
    preferredWeekdayLabel: weekdayLabels[preferredWeekday],
    financialCadenceDays: cadenceDays,
    financialCadenceLabel: cadenceDays ? cadenceLabel(cadenceDays) : undefined,
    financialAlternativeDateISO,
    installments: finance.installments,
    estimatedRemainingVisits: visits,
    overdueInstallments: finance.overdueInstallments,
    procedureRuleLabel: procedureRule?.label,
    laboratoryRuleLabel: laboratoryRule?.laboratoryName,
    laboratoryMinimumDays: laboratoryRule ? laboratoryMinimumDays : undefined,
    reasons,
    warnings,
  };
}

export function getSmartSchedulingConfigLocal() {
  return localConfig();
}

export function resetSmartSchedulingConfig() {
  const config = cloneDefaultConfig();
  saveLocalConfig(config);
  return config;
}
