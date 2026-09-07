import type {
  SpecializedAttachmentCategory,
  SpecializedClinicalData,
  SpecializedClinicalRecord,
  SpecializedClinicalRecordStatus,
  SpecializedClinicalResponse,
  SpecializedClinicalSpecialty,
  SpecializedEvolutionClinicalData,
  SpecializedEvolutionType,
} from "../types/specializedClinical";

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
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `Erro HTTP ${response.status}`);
  return body as T;
}

export async function loadSpecializedClinical(patientId: string) {
  return parse<SpecializedClinicalResponse>(await fetch(
    `${API}/patients/${encodeURIComponent(patientId)}/specialized-clinical`,
    { headers: headers() },
  ));
}

export async function createSpecializedRecord(patientId: string, input: {
  specialty: SpecializedClinicalSpecialty;
  status: SpecializedClinicalRecordStatus;
  chiefComplaint?: string | null;
  diagnosis?: string | null;
  diagnosticHypothesis?: string | null;
  treatmentPlan?: string | null;
  responsibleId?: string | null;
  responsibleName?: string | null;
  clinicalData: SpecializedClinicalData;
}) {
  return parse<SpecializedClinicalRecord>(await fetch(
    `${API}/patients/${encodeURIComponent(patientId)}/specialized-clinical`,
    { method: "POST", headers: headers(true), body: JSON.stringify(input) },
  ));
}

export async function updateSpecializedRecord(patientId: string, recordId: string, input: {
  status?: SpecializedClinicalRecordStatus;
  chiefComplaint?: string | null;
  diagnosis?: string | null;
  diagnosticHypothesis?: string | null;
  treatmentPlan?: string | null;
  responsibleId?: string | null;
  responsibleName?: string | null;
  clinicalData?: SpecializedClinicalData;
}) {
  return parse<SpecializedClinicalRecord>(await fetch(
    `${API}/patients/${encodeURIComponent(patientId)}/specialized-clinical/${encodeURIComponent(recordId)}`,
    { method: "PUT", headers: headers(true), body: JSON.stringify(input) },
  ));
}

export async function createSpecializedEvolution(patientId: string, recordId: string, input: {
  evolutionType: SpecializedEvolutionType;
  professionalId?: string | null;
  professionalName: string;
  summary: string;
  occurredAt?: string;
  clinicalData: SpecializedEvolutionClinicalData;
}) {
  return parse(await fetch(
    `${API}/patients/${encodeURIComponent(patientId)}/specialized-clinical/${encodeURIComponent(recordId)}/evolutions`,
    { method: "POST", headers: headers(true), body: JSON.stringify(input) },
  ));
}

export async function linkSpecializedAttachment(patientId: string, recordId: string, input: {
  category: SpecializedAttachmentCategory;
  clinicalFileId?: string | null;
  fileName: string;
  mimeType?: string | null;
  storageKey?: string | null;
  capturedAt?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return parse(await fetch(
    `${API}/patients/${encodeURIComponent(patientId)}/specialized-clinical/${encodeURIComponent(recordId)}/attachments`,
    { method: "POST", headers: headers(true), body: JSON.stringify(input) },
  ));
}

export async function archiveSpecializedAttachment(patientId: string, recordId: string, attachmentId: string) {
  return parse(await fetch(
    `${API}/patients/${encodeURIComponent(patientId)}/specialized-clinical/${encodeURIComponent(recordId)}/attachments/${encodeURIComponent(attachmentId)}/archive`,
    { method: "PATCH", headers: headers(true) },
  ));
}
