const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface EnrollmentContract {
  id: string;
  studentId: string;
  contractNumber: string;
  programName: string;
  termName: string;
  monthlyFee: number | null;
  status: "PENDENTE_ASSINATURA" | "ASSINADO" | "CANCELADO";
  signingToken: string;
  signedAt: string | null;
  signedByName: string | null;
  createdAt: string;
  student?: { fullName: string };
}

function headers(json: boolean) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(Boolean(init?.body)), ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const listContracts = (studentId?: string) =>
  request<EnrollmentContract[]>(`/edu/contracts${studentId ? `?studentId=${studentId}` : ""}`);
export const cancelContract = (id: string) =>
  request<EnrollmentContract>(`/edu/contracts/${id}/cancel`, { method: "PUT", body: JSON.stringify({}) });

export const contractSignUrl = (signingToken: string) => `${window.location.origin}/assinar-contrato/${signingToken}`;

export const getContractByToken = (token: string) =>
  fetch(`${API}/edu/contracts/sign/${token}`).then(async (r) => {
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new Error(body?.error || "Link de assinatura inválido.");
    return body as {
      contractNumber: string; institutionName: string; studentName: string; programName: string; termName: string;
      monthlyFee: number | null; tuitionDueDay: number; termsText: string; status: string; signedAt: string | null; signedByName: string | null;
    };
  });

export const signContractByToken = (token: string, signedByName: string) =>
  fetch(`${API}/edu/contracts/sign/${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signedByName }),
  }).then(async (r) => {
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new Error(body?.error || "Erro ao assinar contrato.");
    return body as { status: string; signedAt: string };
  });
