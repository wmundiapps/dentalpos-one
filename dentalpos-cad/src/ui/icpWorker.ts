import { alignCrownToArch } from "../core/scan";
import type { Mesh } from "../core/mesh";

self.onmessage = (e: MessageEvent<{ crown: Mesh; arch: Mesh }>) => {
  const r = alignCrownToArch(e.data.crown, e.data.arch, { onProgress: (p) => (self as unknown as Worker).postMessage({ progress: p }) });
  (self as unknown as Worker).postMessage({ done: r });
};
