export type InventoryStatus =
  | "Normal"
  | "Estoque baixo"
  | "Crítico"
  | "Vencimento próximo";

export interface InventoryItem {
  id: number;
  code: string;
  name: string;
  category: string;
  supplier: string;
  currentQuantity: number;
  minimumQuantity: number;
  unit: string;
  batch: string;
  expirationDate?: string;
  location: string;
  unitCost: number;
  status: InventoryStatus;
}