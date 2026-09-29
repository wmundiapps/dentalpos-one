const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface SupplyItem {
  id: string; code: string; name: string; category: string; unit: string;
  quantity: number; minQuantity: number; salePrice: number | null; isActive: boolean;
}

export interface OrderLine { id: string; description: string; quantity: number; unitPrice: number }

export interface PurchaseOrder {
  id: string; supplierName: string; status: string; totalAmount: number; notes: string | null;
  items: OrderLine[];
}

export interface Sale {
  id: string; buyerName: string; studentId: string | null; paymentMethod: string | null; totalAmount: number;
  items: OrderLine[]; student?: { fullName: string } | null;
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

export const listSupplyItems = () => get<SupplyItem[]>("/edu/supply-items");
export const createSupplyItem = (input: { code: string; name: string; category: string; unit: string; minQuantity: number; salePrice?: number }) =>
  post<SupplyItem>("/edu/supply-items", input);
export const adjustStock = (itemId: string, input: { type: string; quantity: number; reason?: string }) =>
  post<SupplyItem>(`/edu/supply-items/${itemId}/adjust`, input);

export const listPurchaseOrders = () => get<PurchaseOrder[]>("/edu/purchase-orders");
export const createPurchaseOrder = (input: { supplierName: string; notes?: string; items: { description: string; quantity: number; unitPrice: number }[] }) =>
  post<PurchaseOrder>("/edu/purchase-orders", input);
export const approvePurchaseOrder = (id: string) => post<PurchaseOrder>(`/edu/purchase-orders/${id}/approve`, {});
export const receivePurchaseOrder = (id: string) => post<PurchaseOrder>(`/edu/purchase-orders/${id}/receive`, {});

export const listSales = () => get<Sale[]>("/edu/sales");
export const createSale = (input: { buyerName: string; studentId?: string; paymentMethod?: string; items: { description: string; quantity: number; unitPrice: number }[] }) =>
  post<Sale>("/edu/sales", input);
