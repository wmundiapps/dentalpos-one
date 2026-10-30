import type { ClinicalFile, ClinicalFileCategory, ClinicalFileKind, UploadIntentResponse } from "../types/clinicalFile";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:3000/api").replace(/\/$/, "");

function authHeaders(extra?: Record<string, string>) {
  const token =
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    localStorage.getItem("dentalpos.accessToken") ||
    localStorage.getItem("dentalpos.token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: authHeaders(init?.headers as Record<string, string> | undefined),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Falha ao comunicar com o servidor.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export interface ClinicalPatientOption { id: string; fullName: string; phone?: string }

export function listClinicalPatients() {
  return request<ClinicalPatientOption[]>("/patients");
}

export function listClinicalFileCategories() {
  return request<ClinicalFileCategory[]>("/clinical-files/categories");
}

export function createClinicalFileCategory(input: { name: string; kind: string; description?: string }) {
  return request<ClinicalFileCategory>("/clinical-files/categories", {
    method: "POST", body: JSON.stringify(input),
  });
}

export function listClinicalFiles(patientId: string, filters?: { kind?: string; search?: string }) {
  const query = new URLSearchParams();
  if (filters?.kind) query.set("kind", filters.kind);
  if (filters?.search) query.set("search", filters.search);
  const suffix = query.size ? `?${query.toString()}` : "";
  return request<ClinicalFile[]>(`/patients/${encodeURIComponent(patientId)}/clinical-files${suffix}`);
}

export async function uploadClinicalFile(input: {
  patientId: string;
  file: File;
  kind: ClinicalFileKind;
  categoryId?: string;
  title: string;
  examDate?: string;
  origin?: string;
  requesterProfessionalName?: string;
  description?: string;
  tags?: string[];
  tooth?: string;
  region?: string;
  treatmentItemId?: string;
  clinicalEvolutionId?: string;
}) {
  const intent = await request<UploadIntentResponse>(
    `/patients/${encodeURIComponent(input.patientId)}/clinical-files/upload-intent`,
    {
      method: "POST",
      body: JSON.stringify({
        categoryId: input.categoryId || null,
        kind: input.kind,
        title: input.title,
        originalName: input.file.name,
        extension: input.file.name.split(".").pop() || "",
        mimeType: input.file.type || "application/octet-stream",
        sizeBytes: input.file.size,
        examDate: input.examDate ? new Date(input.examDate).toISOString() : null,
        origin: input.origin || null,
        requesterProfessionalName: input.requesterProfessionalName || null,
        description: input.description || null,
        tags: input.tags || [],
        tooth: input.tooth || null,
        region: input.region || null,
        treatmentItemId: input.treatmentItemId || null,
        clinicalEvolutionId: input.clinicalEvolutionId || null,
      }),
    },
  );

  if (!intent.upload?.configured || !intent.upload.url) {
    return intent;
  }

  const uploadResponse = await fetch(intent.upload.url, {
    method: "PUT",
    headers: intent.upload.headers || { "Content-Type": input.file.type || "application/octet-stream" },
    body: input.file,
  });
  if (!uploadResponse.ok) throw new Error("O storage recusou o upload do arquivo.");

  await request<ClinicalFile>(`/clinical-files/${intent.file.id}/complete`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return { ...intent, file: { ...intent.file, storageStatus: "AVAILABLE" } };
}

export function clinicalFileAccess(id: string) {
  return request<{ configured: boolean; provider: string; url: string; expiresAt?: string | null }>(
    `/clinical-files/${encodeURIComponent(id)}/access`,
  );
}

export function clinicalFileDesignHandoff(id: string) {
  return request<{ designPath: string; source: { url: string } }>(
    `/clinical-files/${encodeURIComponent(id)}/design-handoff`,
  );
}

export function archiveClinicalFile(id: string, reason: string) {
  return request<void>(`/clinical-files/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ reason }) });
}

export interface ScanFolder { patientId: string; patientName: string; recordNumber?: number | null; fileCount: number; firstAt: string; lastAt: string; totalBytes: number }

// Pastas de escaneamentos (uma por paciente). sort: alpha (A a Z), name (busca por nome) ou date (por data).
export function listScanFolders(params: { sort: "alpha" | "name" | "date"; search?: string; from?: string; to?: string; order?: "asc" | "desc" }) {
  const q = new URLSearchParams({ sort: params.sort });
  if (params.search) q.set("search", params.search);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.order) q.set("order", params.order);
  return request<ScanFolder[]>(`/clinical-files/scan-folders?${q.toString()}`);
}

export const SCAN_TAG = "escaneamento";
export const isScanFile = (f: { kind: string; tags?: string[] }) => ["STL", "PLY", "OBJ"].includes(f.kind) || (f.tags || []).includes(SCAN_TAG);
