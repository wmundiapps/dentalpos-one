const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface LabOrderRow {
  localId: string;
  data: Record<string, unknown>;
  status: string;
  deliveredAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const hasSession = () => Boolean(localStorage.getItem("dentalpos.token"));

export async function fetchLabOrders(scope: "active" | "archive" | "all" = "active"): Promise<LabOrderRow[]> {
  return parse(await fetch(`${API}/lab-orders?scope=${scope}`, { headers: headers() }));
}

export async function pushLabOrders(orders: Array<{ localId: string; data: unknown }>): Promise<void> {
  for (let i = 0; i < orders.length; i += 200) {
    await parse(await fetch(`${API}/lab-orders/bulk`, { method: "POST", headers: headers(true), body: JSON.stringify({ orders: orders.slice(i, i + 200) }) }));
  }
}

// "Excluir" arquiva: a ordem sai da fila e fica guardada para sempre.
export async function archiveLabOrder(localId: string): Promise<void> {
  await parse(await fetch(`${API}/lab-orders/${encodeURIComponent(localId)}`, { method: "DELETE", headers: headers() }));
}

export async function restoreLabOrder(localId: string): Promise<void> {
  await parse(await fetch(`${API}/lab-orders/${encodeURIComponent(localId)}/restore`, { method: "POST", headers: headers(true), body: "{}" }));
}
