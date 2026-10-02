import type { Store } from "./store";
import type { ExtraMesh, LineSet, ColorMode } from "./Viewer3D";

export interface Ctx {
  s: Store;
  sel: number | null; setSel: (f: number | null) => void;
  extras: Record<string, ExtraMesh>; setExtra: (id: string, e: ExtraMesh | null) => void;
  setLines: (id: string, l: LineSet[] | null) => void;
  busy: string | null; setBusy: (b: string | null) => void;
  toast: (m: string) => void;
  photoUrl: string | null; setPhotoUrl: (u: string | null) => void;
  hideTeeth: boolean; setHideTeeth: (b: boolean) => void;
  colorMode: ColorMode; setColorMode: (m: ColorMode) => void;
  dragMode: boolean; setDragMode: (b: boolean) => void;
  setHighlight: (t: number[]) => void;
  pickHandler: React.MutableRefObject<((p: [number, number, number], id: string) => void) | null>;
  smileUi: { activeKey: string | null; setActiveKey: (k: string | null) => void; showDesign: boolean; setShowDesign: (b: boolean) => void; split: number | null; setSplit: (n: number | null) => void; showGrid: boolean; setShowGrid: (b: boolean) => void; zoom: number; setZoom: (n: number) => void };
}
