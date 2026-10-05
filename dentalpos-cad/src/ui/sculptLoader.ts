// Gera os dentes esculpidos em segundo plano (um por vez) e avisa quando cada um fica pronto.
import { job } from "./jobs";
import { isPending, markPending, cancelPending, putSculpted, requestFor, sculptKey } from "../core/sculptCache";
import { toothRef } from "../core/anatomy";
import type { StyleModifiers } from "../core/profiles";
import type { AnatomyParams } from "../core/toothSdf";

let running = false;
const queue: Array<{ fdi: number; mods: StyleModifiers; anat: AnatomyParams }> = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let pendingArgs: { fdis: number[]; mods: StyleModifiers; anatOf: (f: number) => AnatomyParams } | null = null;
/** agenda a geração dos dentes que faltam (com atraso curto: arrastar um slider não dispara um trabalho por passo) */
export function ensureSculpted(fdis: number[], mods: StyleModifiers, anatOf: (f: number) => AnatomyParams) {
  pendingArgs = { fdis, mods, anatOf };
  clearTimeout(timer);
  timer = setTimeout(() => {
    const a = pendingArgs!; 
    for (const f of a.fdis) {
      const ref = toothRef(f), anat = a.anatOf(f), key = sculptKey(ref, a.mods, anat);
      if (hasKey(key) || isPending(key)) continue;
      markPending(key); queue.push({ fdi: f, mods: a.mods, anat });
    }
    void pump();
  }, 350);
}
import { hasKey } from "../core/sculptCache";
async function pump() {
  if (running) return; running = true;
  while (queue.length) {
    const { fdi, mods, anat } = queue.shift()!;
    const ref = toothRef(fdi), key = sculptKey(ref, mods, anat), req = requestFor(ref, mods, 0.14, anat);
    try {
      const r = await job({ kind: "sculpt", fdi, opts: req.opts });
      if (r.ok && r.meshes?.tooth) putSculpted(key, r.meshes.tooth, fdi); else cancelPending(key);
    } catch { cancelPending(key); }
  }
  running = false;
}
