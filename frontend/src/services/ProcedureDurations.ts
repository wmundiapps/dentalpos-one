// Tempo sugerido de agendamento por procedimento.
// Regras padrão + personalização da clínica (guardada no navegador por clínica).

export const DURATION_STEP = 15;
export const DURATION_OPTIONS: number[] = Array.from({ length: 16 }, (_, index) => (index + 1) * DURATION_STEP); // 15 .. 240

export function formatDuration(minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  if (!m) return h === 1 ? "1 hora" : `${h} horas`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export function roundToStep(minutes: number) {
  const value = Number(minutes) || 30;
  return Math.max(DURATION_STEP, Math.round(value / DURATION_STEP) * DURATION_STEP);
}

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Ordem importa: a primeira regra que bater vale.
const DEFAULT_RULES: Array<{ pattern: RegExp; minutes: number; label: string }> = [
  { pattern: /(tirar pontos|retirada de pontos|remocao de (pontos|sutura)|pontos)/, minutes: 15, label: "Tirar pontos" },
  { pattern: /(revis|retorno|controle|manutencao)/, minutes: 15, label: "Revisões / retornos" },
  { pattern: /(endodont|canal|pulpect|pulpot)/, minutes: 60, label: "Endodontia" },
  { pattern: /(cirurg|exodont|extra[cç]|implante|enxerto|siso)/, minutes: 60, label: "Cirurgias" },
  { pattern: /(restaura|resina|amalgama)/, minutes: 45, label: "Restaurações" },
  { pattern: /(consulta|avalia|urgencia|emergencia|1a consulta|primeira)/, minutes: 30, label: "Consultas" },
];

export const DEFAULT_RULES_SUMMARY = DEFAULT_RULES.map((rule) => ({ label: rule.label, minutes: rule.minutes }));

function storageKey() {
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "default";
  return `dentalpos.procedureDurations.${clinicId}`;
}

export function loadCustomDurations(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey()) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCustomDuration(procedure: string, minutes: number) {
  const key = normalize(procedure);
  if (!key) return;
  const current = loadCustomDurations();
  current[key] = roundToStep(minutes);
  localStorage.setItem(storageKey(), JSON.stringify(current));
}

export function removeCustomDuration(procedure: string) {
  const key = normalize(procedure);
  const current = loadCustomDurations();
  delete current[key];
  localStorage.setItem(storageKey(), JSON.stringify(current));
}

export function hasCustomDuration(procedure: string) {
  return normalize(procedure) in loadCustomDurations();
}

export function suggestDuration(procedure: string, fallback = 30): number {
  const key = normalize(procedure);
  if (!key) return fallback;
  const custom = loadCustomDurations()[key];
  if (custom) return custom;
  const rule = DEFAULT_RULES.find((item) => item.pattern.test(key));
  return rule ? rule.minutes : fallback;
}
