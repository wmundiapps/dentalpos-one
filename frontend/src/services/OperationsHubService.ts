import { appointments as appointmentSeed } from "./AppointmentService";
import { employees, hrDocuments, vacationControls } from "./HumanResourcesService";
import { laboratoryWorks as laboratorySeed } from "./LaboratoryService";
import type { IntegratedAppointment, IntegratedLaboratoryWork, OperationalAlert } from "../types/operationsHub";
import type { LaboratoryWorkStatus } from "../types/laboratory";
import { repairObjectText } from "../utils/textEncoding";
import { listPatients, listTreatmentItems } from "./PatientClinicalService";
import { listFinanceEntries, type FinanceEntry } from "./FinanceHubService";
import { inventoryItems } from "./InventoryService";

export const OPERATIONS_EVENT = "dentalpos:operations-updated";
const LAB_KEY = "dentalpos.operations.labWorks.v1";
const LEGACY_LAB_KEY = "dentalpos.laboratory.queue.v3";
const AGENDA_KEY = "dentalpos.operations.appointments.v1";

const todayISO = () => new Date().toISOString().slice(0, 10);
const brToISO = (value?: string): string | undefined => {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [d, m, y] = value.split("/");
  return d && m && y ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : undefined;
};

const formatPatientCode = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "PAC";

const seedLabWorks: IntegratedLaboratoryWork[] = laboratorySeed.map((work) => ({
  id: work.id,
  trackingCode: work.trackingCode,
  patientName: work.patientCode,
  patientCode: work.patientCode,
  dentistName: work.dentistName,
  clinicName: work.clinicName,
  workType: work.workType,
  material: work.material,
  responsibleTechnician: work.responsibleTechnician,
  entryDateISO: brToISO(work.entryDate) || todayISO(),
  dueDateISO: brToISO(work.dueDate),
  status: work.status,
  priority: work.priority,
  hasCadCamFile: work.hasCadCamFile,
  observations: work.observations,
  source: "Laboratório",
  updatedAtISO: new Date().toISOString(),
}));

const seedAppointments: IntegratedAppointment[] = appointmentSeed.map((appointment) => ({
  id: appointment.id,
  patientName: appointment.patientName,
  professionalName: appointment.professionalName,
  procedure: appointment.procedure,
  nextProcedure: appointment.procedure,
  dateISO: brToISO(appointment.date) || todayISO(),
  time: appointment.time,
  room: appointment.room,
  status: appointment.status,
  source: "Interno",
  reminders: { onBooking: true, oneDayBefore: true, onDay: true },
  createdAtISO: new Date().toISOString(),
}));

function read<T>(key: string, seed: T): T {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null") as T | null;
    return repairObjectText(parsed ?? seed);
  } catch {
    return repairObjectText(seed);
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(OPERATIONS_EVENT, { detail: { key } }));
}

export function subscribeOperations(callback: () => void) {
  const handler = () => callback();
  window.addEventListener(OPERATIONS_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(OPERATIONS_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function getLaboratoryWorks(): IntegratedLaboratoryWork[] {
  const current = localStorage.getItem(LAB_KEY);
  if (current) return read(LAB_KEY, seedLabWorks);

  try {
    const legacyRaw = localStorage.getItem(LEGACY_LAB_KEY);
    if (legacyRaw) {
      const legacy = repairObjectText<any[]>(JSON.parse(legacyRaw));
      const migrated: IntegratedLaboratoryWork[] = legacy.map((work) => ({
        id: work.id ?? Date.now(),
        trackingCode: work.trackingCode ?? `LAB-${new Date().getFullYear()}-MIG`,
        patientName: work.patientName ?? work.patientCode ?? "Paciente",
        patientCode: work.patientCode ?? formatPatientCode(work.patientName ?? "Paciente"),
        dentistName: work.dentistName ?? "A definir",
        clinicName: work.clinicName ?? "DentalPos",
        workType: work.workType ?? "Trabalho laboratorial",
        material: work.material ?? "A definir",
        responsibleTechnician: work.responsibleTechnician ?? "A definir",
        entryDateISO: brToISO(work.entryDate) ?? todayISO(),
        dueDateISO: brToISO(work.dueDate),
        patientReturnDateISO: brToISO(work.patientReturnDate),
        nextAction: work.nextAction ?? "Definir próxima ação",
        status: work.status ?? "Recebido",
        priority: work.priority ?? "Normal",
        hasCadCamFile: Boolean(work.hasCadCamFile),
        observations: work.observations,
        source: "Laboratório" as const,
        updatedAtISO: new Date().toISOString(),
      }));
      write(LAB_KEY, migrated);
      return migrated;
    }
  } catch {
    // Se a versão antiga estiver inválida, seguimos com a base padrão.
  }

  return read(LAB_KEY, seedLabWorks);
}

export function saveLaboratoryWorks(works: IntegratedLaboratoryWork[]) {
  write(LAB_KEY, works);
}

export function createLaboratoryWork(input: Omit<IntegratedLaboratoryWork, "id" | "trackingCode" | "patientCode" | "updatedAtISO">) {
  const works = getLaboratoryWorks();
  const id = Date.now();
  const created: IntegratedLaboratoryWork = {
    ...input,
    id,
    patientCode: formatPatientCode(input.patientName),
    trackingCode: `LAB-${new Date().getFullYear()}-${String(works.length + 1).padStart(4, "0")}`,
    updatedAtISO: new Date().toISOString(),
    designStatus: input.designStatus || "Não enviado",
    history: input.history || [{ id, atISO: new Date().toISOString(), action: "Criado", description: "Trabalho criado na fila do laboratório." }],
  };
  saveLaboratoryWorks([created, ...works]);
  return created;
}

export function updateLaboratoryWork(id: number, patch: Partial<IntegratedLaboratoryWork>, historyDescription?: string) {
  const now = new Date().toISOString();
  saveLaboratoryWorks(getLaboratoryWorks().map((work) => {
    if (work.id !== id) return work;
    const statusChanged = patch.status && patch.status !== work.status;
    const description = historyDescription || (statusChanged ? `Status alterado de ${work.status} para ${patch.status}.` : "Dados do trabalho atualizados.");
    return {
      ...work,
      ...patch,
      updatedAtISO: now,
      history: [
        { id: Date.now(), atISO: now, action: statusChanged ? "Status alterado" : "Alterado", description },
        ...(work.history || []),
      ],
    };
  }));
}

export function sendLaboratoryWorkToDesign(id: number) {
  const work = getLaboratoryWorks().find((item) => item.id === id);
  if (!work) return undefined;
  const now = new Date().toISOString();
  updateLaboratoryWork(id, { hasCadCamFile: true, designStatus: "Preparando", status: work.status === "Recebido" ? "Planejamento" : work.status }, "Caso encaminhado ao DentalPos Design.");
  localStorage.setItem("dentalpos.design.activeLabWork.v1", JSON.stringify({
    id: work.id, patientName: work.patientName, dentistName: work.dentistName, workType: work.workType, teeth: work.teeth, toothShade: work.toothShade, shadeSystem: work.shadeSystem, patientAge: work.patientAge, patientSex: work.patientSex, faceBiotype: work.faceBiotype, faceShape: work.faceShape, faceDescription: work.faceDescription, dueDateISO: work.dueDateISO, patientReturnDateISO: work.patientReturnDateISO, observations: work.observations, openedAtISO: now
  }));
  return work;
}

export function deleteLaboratoryWork(id: number) {
  saveLaboratoryWorks(getLaboratoryWorks().filter((work) => work.id !== id));
}

export function createLaboratoryWorkFromDesign(input: {
  designJobId: number;
  patientName: string;
  workType: string;
  dueDateISO?: string;
  priority: "Normal" | "Alta" | "Urgente";
  observations?: string;
}) {
  const existing = getLaboratoryWorks().find((work) => work.designJobId === input.designJobId);
  if (existing) return existing;
  return createLaboratoryWork({
    patientName: input.patientName,
    dentistName: "A definir",
    clinicName: "DentalPos",
    workType: input.workType,
    material: "A definir",
    responsibleTechnician: "A definir",
    entryDateISO: todayISO(),
    dueDateISO: input.dueDateISO,
    status: "CAD",
    priority: input.priority,
    hasCadCamFile: true,
    observations: input.observations || "Caso enviado automaticamente pelo DentalPos Design.",
    source: "DentalPos Design",
    designJobId: input.designJobId,
    nextAction: "Conferir arquivos e iniciar produção",
  });
}

export function isLaboratoryProcedure(value: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return [
    "protese", "coroa", "faceta", "lente", "protocolo", "overdenture",
    "provisorio", "prova", "moldagem", "escaneamento", "cad/cam", "cadcam",
    "placa", "dentadura", "ponte", "inlay", "onlay"
  ].some((term) => normalized.includes(term));
}

function inferLaboratoryWorkType(procedure: string) {
  const text = procedure.trim();
  return text || "Trabalho protético";
}

export interface AgendaFillSuggestion {
  patientId: string;
  patientName: string;
  patientPhone?: string;
  procedure: string;
  tooth?: number;
  reason: string;
}

export function getAgendaFillSuggestions(limit = 8): AgendaFillSuggestion[] {
  const appointments = getAppointments();
  const activeFuture = appointments.filter((a) =>
    !["Cancelado", "Faltou", "Finalizado"].includes(a.status) &&
    a.dateISO >= todayISO()
  );

  const suggestions: AgendaFillSuggestion[] = [];
  for (const patient of listPatients().filter((p) => p.status !== "Inativo")) {
    const alreadyScheduled = activeFuture.some((a) => a.patientName.toLowerCase() === patient.fullName.toLowerCase());
    if (alreadyScheduled) continue;
    const pending = listTreatmentItems(patient.id).filter((item) => item.status !== "Concluído");
    for (const item of pending.slice(0, 2)) {
      suggestions.push({
        patientId: patient.id,
        patientName: patient.fullName,
        patientPhone: patient.phone,
        procedure: item.procedure,
        tooth: item.tooth,
        reason: item.origin === "Odontograma" ? "Procedimento pendente no odontograma" : "Tratamento pendente sem próximo agendamento",
      });
      if (suggestions.length >= limit) return suggestions;
    }
  }
  return suggestions;
}

export function getAppointments(): IntegratedAppointment[] {
  return read(AGENDA_KEY, seedAppointments);
}

export function saveAppointments(items: IntegratedAppointment[]) {
  write(AGENDA_KEY, items);
}

export function createAppointment(input: Omit<IntegratedAppointment, "id" | "createdAtISO">) {
  const appointmentId = Date.now();
  let laboratoryWorkId = input.laboratoryWorkId;

  if (!laboratoryWorkId && isLaboratoryProcedure(input.procedure)) {
    const lab = createLaboratoryWork({
      patientName: input.patientName,
      dentistName: input.professionalName,
      clinicName: "DentalPos",
      workType: inferLaboratoryWorkType(input.procedure),
      material: "A definir",
      responsibleTechnician: "A definir",
      entryDateISO: todayISO(),
      patientReturnDateISO: input.dateISO,
      nextAction: `Preparar trabalho antes do retorno em ${input.dateISO}`,
      status: "Recebido",
      priority: "Normal",
      hasCadCamFile: false,
      observations: `Criado automaticamente pela Agenda. Consulta: ${input.dateISO} ${input.time}.`,
      source: "Agenda",
    });
    laboratoryWorkId = lab.id;
  }

  const appointment: IntegratedAppointment = {
    ...input,
    laboratoryWorkId,
    id: appointmentId,
    createdAtISO: new Date().toISOString(),
  };
  saveAppointments([appointment, ...getAppointments()]);
  return appointment;
}

export function updateAppointment(id: number, patch: Partial<IntegratedAppointment>) {
  saveAppointments(getAppointments().map((appointment) => appointment.id === id ? { ...appointment, ...patch } : appointment));
}

export function changeAppointmentWithHistory(id: number, input: {
  dateISO?: string;
  time?: string;
  status?: IntegratedAppointment["status"];
  requestedBy?: "Paciente" | "Clínica" | "Dentista" | "Outro";
  reason?: string;
}) {
  const current = getAppointments();
  const original = current.find((appointment) => appointment.id === id);
  if (!original) return;

  const dateChanged = Boolean(input.dateISO && input.dateISO !== original.dateISO) || Boolean(input.time && input.time !== original.time);
  const action = input.status === "Cancelado" ? "Cancelado" : input.status === "Faltou" ? "Faltou" : dateChanged ? "Remarcado" : "Alterado";
  const event = {
    id: Date.now(),
    atISO: new Date().toISOString(),
    action: action as "Remarcado" | "Cancelado" | "Faltou" | "Alterado",
    requestedBy: input.requestedBy,
    reason: input.reason,
    previousDateISO: original.dateISO,
    previousTime: original.time,
    newDateISO: input.dateISO ?? original.dateISO,
    newTime: input.time ?? original.time,
  };

  const next = current.map((appointment) => appointment.id === id
    ? { ...appointment, ...input, history: [...(appointment.history ?? []), event] }
    : appointment
  );
  saveAppointments(next);

  if (original.laboratoryWorkId && dateChanged) {
    updateLaboratoryWork(original.laboratoryWorkId, {
      patientReturnDateISO: input.dateISO ?? original.dateISO,
      nextAction: `Retorno do paciente remarcado para ${input.dateISO ?? original.dateISO}. Conferir prazo de produção.`,
    });
  }
}

function getFinancialEntries(): FinanceEntry[] {
  return listFinanceEntries();
}

const daysBetween = (dateISO?: string) => {
  if (!dateISO) return Number.POSITIVE_INFINITY;
  const a = new Date(`${todayISO()}T12:00:00`).getTime();
  const b = new Date(`${dateISO}T12:00:00`).getTime();
  return Math.ceil((b - a) / 86400000);
};

export function getOperationalAlerts(): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  getLaboratoryWorks().forEach((work) => {
    if (work.status === "Entregue" || work.status === "Liberado") return;
    const dueDays = daysBetween(work.dueDateISO);
    const returnDays = daysBetween(work.patientReturnDateISO);
    if (dueDays < 0) {
      alerts.push({ id: `lab-overdue-${work.id}`, area: "Laboratório", severity: "error", title: "Trabalho laboratorial atrasado", description: `${work.patientName} • ${work.workType} • prazo vencido há ${Math.abs(dueDays)} dia(s).`, dueISO: work.dueDateISO, route: "/laboratorio" });
    } else if (dueDays <= 2 || returnDays <= 2) {
      alerts.push({ id: `lab-risk-${work.id}`, area: "Laboratório", severity: "warning", title: "Trabalho em risco de atraso", description: `${work.patientName} • ${work.workType} • retorno/prazo próximo.`, dueISO: work.patientReturnDateISO || work.dueDateISO, route: "/laboratorio" });
    }
  });

  const agendaRows = getAppointments();
  agendaRows.forEach((appointment) => {
    const days = daysBetween(appointment.dateISO);
    if (days === 0 && appointment.status !== "Cancelado" && appointment.status !== "Finalizado") {
      alerts.push({ id: `agenda-today-${appointment.id}`, area: "Agenda", severity: "info", title: "Consulta hoje", description: `${appointment.time} • ${appointment.patientName} • ${appointment.procedure}. Próximo: ${appointment.nextProcedure}`, dueISO: appointment.dateISO, route: "/agenda" });
    } else if (days === 1 && (appointment.reminders?.oneDayBefore ?? true)) {
      alerts.push({ id: `agenda-tomorrow-${appointment.id}`, area: "Agenda", severity: "info", title: "Lembrete de consulta para amanhã", description: `${appointment.patientName} às ${appointment.time}.`, dueISO: appointment.dateISO, route: "/agenda" });
    }
    const futureForPatient = agendaRows.some(a=>a.patientName.toLowerCase()===appointment.patientName.toLowerCase() && a.dateISO>todayISO() && !["Cancelado","Faltou"].includes(a.status));
    if (appointment.status === "Faltou" && days <= 0 && !futureForPatient) {
      alerts.push({ id:`agenda-noshow-${appointment.id}`, area:"Pacientes", severity:"warning", title:"Falta ainda não remarcada", description:`${appointment.patientName} faltou em ${appointment.dateISO.split("-").reverse().join("/")} e ainda não possui novo agendamento.`, dueISO:appointment.dateISO, route:"/agenda" });
    }
    if (appointment.status === "Finalizado" && days <= 0 && days >= -7 && !futureForPatient) {
      alerts.push({ id:`agenda-return-${appointment.id}`, area:"Pacientes", severity:"info", title:"Atendimento concluído sem próximo retorno", description:`${appointment.patientName} foi atendido e não possui retorno futuro registrado. Próximo procedimento informado: ${appointment.nextProcedure}.`, dueISO:appointment.dateISO, route:"/agenda" });
    }
    if (appointment.status === "Finalizado") {
      const charged = getFinancialEntries().some(e=>e.type==="Receita" && e.personName.toLowerCase()===appointment.patientName.toLowerCase() && (e.originId===String(appointment.id) || e.dueDate>=appointment.dateISO));
      if(!charged) alerts.push({ id:`agenda-unbilled-${appointment.id}`, area:"Financeiro", severity:"warning", title:"Conferir cobrança do atendimento", description:`${appointment.patientName} teve atendimento finalizado sem lançamento financeiro identificado para a data.`, dueISO:appointment.dateISO, route:"/financeiro" });
    }
  });

  getFinancialEntries().forEach((entry) => {
    if (entry.status === "Pago" || entry.status === "Cancelado") return;
    const dueISO = brToISO(entry.dueDate);
    const days = daysBetween(dueISO);
    if (entry.status === "Vencido" || days < 0) {
      alerts.push({ id: `financial-overdue-${entry.id}`, area: entry.type === "Receita" ? "Pacientes" : "Financeiro", severity: "error", title: entry.type === "Receita" ? "Recebimento vencido" : "Conta vencida", description: `${entry.personName} • ${entry.description} • R$ ${entry.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`, dueISO, route: "/financeiro" });
    } else if ([0, 1, 7].includes(days)) {
      alerts.push({ id: `financial-due-${entry.id}`, area: "Financeiro", severity: days === 0 ? "error" : "warning", title: days === 0 ? "Conta vence hoje" : `Conta vence em ${days} dia(s)`, description: `${entry.personName} • ${entry.description}.`, dueISO, route: "/financeiro" });
    }
  });


  inventoryItems.forEach((item) => {
    const lowStock = item.status === "Estoque baixo" || item.status === "Crítico" || item.currentQuantity <= item.minimumQuantity;
    if (lowStock) {
      alerts.push({
        id: `stock-level-${item.id}`,
        area: "Estoque",
        severity: item.status === "Crítico" || item.currentQuantity <= 0 ? "error" : "warning",
        title: item.status === "Crítico" ? "Material em nível crítico" : "Reposição de estoque necessária",
        description: `${item.name} • ${item.currentQuantity} ${item.unit} disponíveis • mínimo ${item.minimumQuantity}.`,
        route: "/estoque",
      });
    }

    const expirationISO = brToISO(item.expirationDate);
    const expirationDays = daysBetween(expirationISO);
    if (item.status === "Vencimento próximo" || (Number.isFinite(expirationDays) && expirationDays >= 0 && expirationDays <= 45)) {
      alerts.push({
        id: `stock-expiry-${item.id}`,
        area: "Estoque",
        severity: expirationDays <= 15 ? "error" : "warning",
        title: "Material com vencimento próximo",
        description: `${item.name} • lote ${item.batch} • vence em ${item.expirationDate || "data não informada"}.`,
        dueISO: expirationISO,
        route: "/estoque",
      });
    }
  });
  employees.forEach((employee) => {
    const days = daysBetween(brToISO(employee.experienceEndDate));
    if (Number.isFinite(days) && days >= 0 && days <= 15) {
      alerts.push({ id: `hr-exp-${employee.id}`, area: "RH", severity: "warning", title: "Experiência próxima do vencimento", description: `${employee.name} • término em ${days} dia(s).`, route: "/rh" });
    }
  });

  hrDocuments.forEach((document) => {
    const days = daysBetween(brToISO(document.expiresAt));
    if (document.status === "Vencido" || (Number.isFinite(days) && days >= 0 && days <= 15)) {
      alerts.push({ id: `hr-doc-${document.id}`, area: "RH", severity: document.status === "Vencido" ? "error" : "warning", title: "Documento de RH requer atenção", description: `${document.employeeName} • ${document.title}.`, route: "/rh" });
    }
  });

  vacationControls.filter((item) => item.status === "Vencida").forEach((vacation) => {
    alerts.push({ id: `hr-vac-${vacation.id}`, area: "RH", severity: "error", title: "Férias vencidas", description: `${vacation.employeeName} possui período vencido.`, route: "/rh" });
  });

  return alerts.sort((a, b) => ({ error: 0, warning: 1, info: 2, success: 3 }[a.severity] - { error: 0, warning: 1, info: 2, success: 3 }[b.severity]));
}

export function mapDesignStatusToLaboratory(status: string): LaboratoryWorkStatus {
  switch (status) {
    case "Recebido": return "Recebido";
    case "Aguardando arquivos": return "Triagem";
    case "Em análise": return "Planejamento";
    case "Design": return "CAD";
    case "Validação": return "Controle de qualidade";
    case "Pronto para fabricação": return "CAM";
    case "Concluído": return "Liberado";
    default: return "Recebido";
  }
}
