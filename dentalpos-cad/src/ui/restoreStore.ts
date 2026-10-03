import type { Mesh } from "../core/mesh";
import type { MaterialId } from "../core/materials";
import type { RestorationReport } from "../core/restoration";

export interface StoredRestoration { fdi: number; crown: Mesh; cavity?: Mesh; margin: Array<[number, number, number]>; material: MaterialId; report: RestorationReport; toCam: boolean }
/** restaurações geradas a partir do escaneamento (grandes demais para o estado do projeto) */
export const restorations = new Map<number, StoredRestoration>();
