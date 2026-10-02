// Biblioteca extensível: usa um STL/OBJ/PLY de dente (ex.: sua biblioteca comercial/escaneada) no lugar do dente paramétrico.
// Convenção do arquivo: x = mésio→distal (+distal), y = vestibular (+), z = cervical→oclusal (+). O dente é centralizado e
// escalado automaticamente para as dimensões (largura × espessura × altura) do projeto.
import { type Vec3 } from "./math";
import type { Landmarks, ToothDims, ToothRef } from "./anatomy";
import { type Mesh, bounds, computeNormals, getV } from "./mesh";
import type { ToothModel } from "./toothMesh";
import { isAnterior } from "./anatomy";

export interface CustomTooth { positions: number[]; indices: number[]; name: string }

export function modelFromMesh(ref: ToothRef, src: Mesh, dims: ToothDims): ToothModel {
  const b = bounds(src);
  const sx = dims.md / (b.size[0] || 1), sy = dims.bl / (b.size[1] || 1), sz = dims.h / (b.size[2] || 1);
  const pos = new Float32Array(src.positions.length);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = (src.positions[i] - b.center[0]) * sx;
    pos[i + 1] = (src.positions[i + 1] - b.center[1]) * sy;
    pos[i + 2] = (src.positions[i + 2] - b.min[2]) * sz;
  }
  const mesh = computeNormals({ positions: pos, indices: src.indices });
  const nb = bounds(mesh);
  const h = nb.size[2], a = nb.size[0] / 2;
  const ant = isAnterior(ref.type);
  // pontos de referência por varredura
  let top: Vec3 = [0, 0, -Infinity], facialTop: Vec3 = [0, -Infinity, 0], lingualTop: Vec3 = [0, Infinity, 0];
  const topBand = h * 0.9;
  const cusps: Vec3[] = [];
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    const p = getV(mesh, i);
    if (p[2] > top[2]) top = p;
    if (p[2] >= topBand) { if (p[1] > facialTop[1]) facialTop = p; if (p[1] < lingualTop[1]) lingualTop = p; }
  }
  if (ant) cusps.push(top);
  else {
    // cúspides: máximos locais grosseiros em grade 3×3
    for (const gx of [-1, 1]) for (const gy of [-1, 1]) {
      let best: Vec3 | null = null;
      for (let i = 0; i < mesh.positions.length / 3; i++) { const p = getV(mesh, i); if (Math.sign(p[0]) === gx && Math.sign(p[1] - nb.center[1]) === gy && (!best || p[2] > best[2])) best = p; }
      if (best) cusps.push(best);
    }
    cusps.sort((p, q) => p[0] - q[0] || q[1] - p[1]);
  }
  const contactZ = h * (ant ? 0.78 : 0.72);
  const atContact = (sign: number): Vec3 => {
    let best: Vec3 = [sign * a, 0, contactZ], bd = Infinity;
    for (let i = 0; i < mesh.positions.length / 3; i++) { const p = getV(mesh, i); const d = Math.abs(p[2] - contactZ) + (sign * (a - p[0] * sign) * 0 + Math.abs(a - sign * p[0])); if (d < bd) { bd = d; best = p; } }
    return best;
  };
  const lm: Landmarks = {
    incisalMid: ant ? [0, (facialTop[1] + lingualTop[1]) / 2, top[2]] : cusps.reduce((m, c) => (c[2] > m[2] ? c : m), cusps[0] ?? top),
    facialEdge: facialTop, lingualEdge: lingualTop,
    mesialContact: atContact(-1), distalContact: atContact(1),
    cervicalFacial: [0, nb.max[1] * 0.85, h * 0.04], cervicalCenter: [0, nb.center[1], 0],
    cusps: cusps.length ? cusps : [top], mesialAngle: [-a * 0.85, facialTop[1], h * 0.97], distalAngle: [a * 0.85, facialTop[1], h * 0.97], anchor: [0, 0, 0],
  };
  lm.anchor = ant ? [0, lm.incisalMid[1], lm.incisalMid[2]] : [0, (facialTop[1] + lingualTop[1]) / 2, h * 0.95];
  return { fdi: ref.fdi, dims: { md: nb.size[0], bl: nb.size[1], h }, mesh, landmarks: lm };
}
export const customToMesh = (c: CustomTooth): Mesh => ({ positions: new Float32Array(c.positions), indices: new Uint32Array(c.indices) });
export const meshToCustom = (m: Mesh, name: string): CustomTooth => ({ positions: Array.from(m.positions, (v) => Math.round(v * 1000) / 1000), indices: Array.from(m.indices), name });
