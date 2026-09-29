const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface Asset {
  id: string; code: string; name: string; category: string; location: string | null;
  acquisitionValue: number | null; status: "ATIVO" | "MANUTENCAO" | "BAIXADO";
}

export interface MaintenanceOrder {
  id: string; assetId: string | null; location: string | null; title: string; description: string | null;
  priority: string; status: string; assignedTo: string | null;
}

export interface ParkingSpot {
  id: string; code: string; type: string; isOccupied: boolean;
  assignedToStudent?: { fullName: string } | null;
}

export interface ExpiringItem {
  id: string; category: string; title: string; expiresAt: string; status: string; notes: string | null;
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

const get = <T,>(path: string) => request<T>(path);
const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
const put = <T,>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) });

export const listAssets = () => get<Asset[]>("/edu/assets");
export const createAsset = (input: { code: string; name: string; category: string; location?: string; acquisitionValue?: number }) =>
  post<Asset>("/edu/assets", input);
export const updateAssetStatus = (id: string, status: string) => put<Asset>(`/edu/assets/${id}/status`, { status });

export const listMaintenanceOrders = () => get<MaintenanceOrder[]>("/edu/maintenance-orders");
export const createMaintenanceOrder = (input: { assetId?: string; location?: string; title: string; description?: string; priority: string }) =>
  post<MaintenanceOrder>("/edu/maintenance-orders", input);
export const updateMaintenanceStatus = (id: string, status: string) => put<MaintenanceOrder>(`/edu/maintenance-orders/${id}/status`, { status });

export const listParkingSpots = () => get<ParkingSpot[]>("/edu/parking-spots");
export const createParkingSpot = (input: { code: string; type: string }) => post<ParkingSpot>("/edu/parking-spots", input);
export const assignParkingSpot = (id: string, input: { assignedToStudentId?: string; assignedToUserId?: string }) =>
  post<ParkingSpot>(`/edu/parking-spots/${id}/assign`, input);
export const releaseParkingSpot = (id: string) => post<ParkingSpot>(`/edu/parking-spots/${id}/release`, {});

export const listExpiringItems = () => get<ExpiringItem[]>("/edu/expiring-items");
export const createExpiringItem = (input: { category: string; title: string; expiresAt: string; preparationDays?: number; safetyMarginDays?: number; notes?: string }) =>
  post<ExpiringItem>("/edu/expiring-items", input);
export const resolveExpiringItem = (id: string) => post<ExpiringItem>(`/edu/expiring-items/${id}/resolve`, {});
