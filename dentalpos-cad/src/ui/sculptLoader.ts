// Gera os dentes esculpidos em segundo plano (um por vez) e avisa quando cada um fica pronto.
import { job } from "./jobs";
import { isPending, markPending, cancelPending, putSculpted, getSculpted, requestFor, sculptKey } from "../core/sculptCache";
import { toothRef } from "../core/anatomy";
import type { StyleModifiers } from "../core/profiles";

let running = false;
const queue: Array<{ fdi: number; mods: StyleModifiers }> = [];
export function ensureSculpted(fdis: number[], mods: StyleModifiers) {
  for (const f of fdis) {
    const ref = toothRef(f);
    if (getSculpted(ref, mods) || isPending(sculptKey(ref, mods))) continue;
    markPending(sculptKey(ref, mods)); queue.push({ fdi: f, mods });
  }
  void pump();
}
async function pump() {
  if (running) return; running = true;
  while (queue.length) {
    const { fdi, mods } = queue.shift()!;
    const ref = toothRef(fdi), key = sculptKey(ref, mods), req = requestFor(ref, mods);
    try {
      const r = await job({ kind: "sculpt", fdi, opts: req.opts });
      if (r.ok && r.meshes?.tooth) putSculpted(key, r.meshes.tooth); else cancelPending(key);
    } catch { cancelPending(key); }
  }
  running = false;
}
