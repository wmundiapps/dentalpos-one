const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function headers() {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), "Content-Type": "application/json" };
}

export type LabOrderStatus = "SENT" | "RECEIVED" | "REFUSED" | "DELIVERED";
export type ErrorResponsible = "AUXILIAR" | "DENTISTA" | "RECEPCAO" | "LABORATORIO";
export const RESPONSIBLE_LABELS: Record<ErrorResponsible, string> = { AUXILIAR: "Auxiliar", DENTISTA: "Dentista", RECEPCAO: "Recepção", LABORATORIO: "Laboratório" };

export interface LabOrderError {
  id: string; at: string; byName: string | null; responsibleType: ErrorResponsible; responsibleName: string; description: string;
  resolved: boolean; resolvedAt?: string; resolution?: string;
}
export interface LabServiceOrder {
  id: string; protocol: string; patientId: string | null; appointmentId: string | null;
  patientName: string; patientContact: string; dentistName: string; dentistContact: string; assistantName: string; laboratoryName: string;
  service: string; shade: string; elements: string; sentAt: string; dueAt: string;
  scanUpper: boolean; scanLower: boolean; scanBite: boolean; impressionUpper: boolean; impressionLower: boolean; waxBite: boolean;
  status: LabOrderStatus; receivedAt: string | null; receivedByName: string | null; refusalReason: string | null; deliveredAt: string | null;
  errors: LabOrderError[]; createdByName: string | null; createdAt: string;
}
export type LabServiceOrderInput = Pick<LabServiceOrder, "patientName" | "patientContact" | "dentistName" | "dentistContact" | "assistantName" | "laboratoryName" | "service" | "shade" | "elements" | "scanUpper" | "scanLower" | "scanBite" | "impressionUpper" | "impressionLower" | "waxBite"> & { sentAt: string; dueAt: string; patientId?: string | null; appointmentId?: string | null };

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `Erro HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const loadLabServiceOrders = () => call<LabServiceOrder[]>("/lab-service-orders");
export const createLabServiceOrder = (input: LabServiceOrderInput) => call<LabServiceOrder>("/lab-service-orders", "POST", input);
export const registerLabReceipt = (id: string, outcome: "RECEIVED" | "REFUSED", receivedByName: string, reason?: string) => call<LabServiceOrder>(`/lab-service-orders/${id}/receipt`, "POST", { outcome, receivedByName, reason });
export const reportLabOrderError = (id: string, responsibleType: ErrorResponsible, responsibleName: string, description: string) => call<LabServiceOrder>(`/lab-service-orders/${id}/errors`, "POST", { responsibleType, responsibleName, description });
export const resolveLabOrderError = (id: string, errorId: string, resolution: string) => call<LabServiceOrder>(`/lab-service-orders/${id}/errors/${errorId}/resolve`, "POST", { resolution });
export const deliverLabOrder = (id: string) => call<LabServiceOrder>(`/lab-service-orders/${id}/deliver`, "POST", {});
