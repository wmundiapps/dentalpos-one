const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function headers() {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
    "Content-Type": "application/json",
  };
}

export type ImportSkipped = { row: number; reason: string };
export type ImportResult = { dryRun: boolean; createdCount: number; skipped: ImportSkipped[]; total?: number; overdue?: number };

export async function sendImport(kind: "appointments" | "financial", rows: Array<Record<string, string>>, options: Record<string, unknown>, dryRun: boolean): Promise<ImportResult> {
  const response = await fetch(`${API}/import/${kind}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ rows, dryRun, ...options }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }
  return response.json();
}
