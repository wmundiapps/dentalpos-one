export type ClinicalFileKind =
  | "PHOTO" | "RADIOGRAPH" | "PANORAMIC" | "PERIAPICAL" | "TOMOGRAPHY"
  | "DICOM" | "LAB_EXAM" | "PDF" | "STL" | "PLY" | "OBJ" | "DOCUMENT" | "OTHER";

export type ClinicalPreviewKind = "IMAGE" | "PDF" | "DENTAL_3D" | "DICOM" | "DOWNLOAD";

export interface ClinicalFileCategory {
  id: string;
  name: string;
  kind: string;
  description?: string | null;
  isSystem: boolean;
}

export interface ClinicalFile {
  id: string;
  patientId: string;
  categoryId?: string | null;
  category?: ClinicalFileCategory | null;
  kind: ClinicalFileKind;
  title: string;
  originalName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: string;
  storageStatus: string;
  externalUrl?: string | null;
  previewKind: ClinicalPreviewKind;
  examDate?: string | null;
  origin?: string | null;
  requesterProfessionalName?: string | null;
  description?: string | null;
  tags: string[];
  tooth?: string | null;
  region?: string | null;
  treatmentItemId?: string | null;
  clinicalEvolutionId?: string | null;
  createdAt: string;
}

export interface UploadIntentResponse {
  file: ClinicalFile;
  upload: null | {
    configured: boolean;
    provider: string;
    method?: "PUT";
    url?: string | null;
    headers?: Record<string, string>;
    expiresAt?: string | null;
    reason?: string;
  };
}
