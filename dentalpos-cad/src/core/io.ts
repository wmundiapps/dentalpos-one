// Importação/exportação: STL (binário/ASCII), OBJ, PLY; projeto JSON; ZIP simples (sem compressão).
import { type Mesh, computeNormals, getV, triCount } from "./mesh";
import { cross, sub, norm } from "./math";
import type { CadProject } from "./project";

export function exportSTL(m: Mesh, name = "dentalpos-cad"): ArrayBuffer {
  const n = triCount(m);
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const hdr = `DentalPos CAD ${name}`.slice(0, 79);
  for (let i = 0; i < hdr.length; i++) dv.setUint8(i, hdr.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const a = getV(m, m.indices[t * 3]), b = getV(m, m.indices[t * 3 + 1]), c = getV(m, m.indices[t * 3 + 2]);
    const nn = norm(cross(sub(b, a), sub(c, a)));
    for (const v of [nn, a, b, c]) for (const x of v) { dv.setFloat32(o, x, true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return buf;
}

export function importSTL(data: ArrayBuffer): Mesh {
  const text = new TextDecoder().decode(data.slice(0, 200));
  const dv = new DataView(data);
  const nTri = data.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  const isBinary = data.byteLength === 84 + nTri * 50;
  const pos: number[] = [];
  if (isBinary || !/^\s*solid/.test(text)) {
    for (let t = 0; t < nTri; t++) { const o = 84 + t * 50 + 12; for (let k = 0; k < 9; k++) pos.push(dv.getFloat32(o + k * 4, true)); }
  } else {
    const s = new TextDecoder().decode(data);
    const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(s))) pos.push(+mm[1], +mm[2], +mm[3]);
  }
  return weld(pos);
}
/** solda vértices duplicados (sopa de triângulos → malha indexada) */
export function weld(pos: number[], tol = 1e-4): Mesh {
  const map = new Map<string, number>();
  const out: number[] = [], idx: number[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const k = `${Math.round(pos[i] / tol)},${Math.round(pos[i + 1] / tol)},${Math.round(pos[i + 2] / tol)}`;
    let v = map.get(k);
    if (v === undefined) { v = out.length / 3; map.set(k, v); out.push(pos[i], pos[i + 1], pos[i + 2]); }
    idx.push(v);
  }
  return computeNormals({ positions: new Float32Array(out), indices: new Uint32Array(idx) });
}

export function exportOBJ(m: Mesh, name = "dentalpos"): string {
  const L = [`# DentalPos CAD`, `o ${name}`];
  for (let i = 0; i < m.positions.length; i += 3) L.push(`v ${m.positions[i].toFixed(4)} ${m.positions[i + 1].toFixed(4)} ${m.positions[i + 2].toFixed(4)}`);
  for (let t = 0; t < m.indices.length; t += 3) L.push(`f ${m.indices[t] + 1} ${m.indices[t + 1] + 1} ${m.indices[t + 2] + 1}`);
  return L.join("\n");
}
export function importOBJ(text: string): Mesh {
  const v: number[] = [], idx: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    const p = line.trim().split(/\s+/);
    if (p[0] === "v") v.push(+p[1], +p[2], +p[3]);
    else if (p[0] === "f") { const ids = p.slice(1).map((s) => parseInt(s.split("/")[0], 10) - 1); for (let i = 1; i < ids.length - 1; i++) idx.push(ids[0], ids[i], ids[i + 1]); }
  }
  return computeNormals({ positions: new Float32Array(v), indices: new Uint32Array(idx) });
}
export function exportPLY(m: Mesh): string {
  const n = m.positions.length / 3, f = m.indices.length / 3;
  const L = ["ply", "format ascii 1.0", `element vertex ${n}`, "property float x", "property float y", "property float z", `element face ${f}`, "property list uchar int vertex_indices", "end_header"];
  for (let i = 0; i < m.positions.length; i += 3) L.push(`${m.positions[i].toFixed(4)} ${m.positions[i + 1].toFixed(4)} ${m.positions[i + 2].toFixed(4)}`);
  for (let t = 0; t < m.indices.length; t += 3) L.push(`3 ${m.indices[t]} ${m.indices[t + 1]} ${m.indices[t + 2]}`);
  return L.join("\n");
}
export function importPLY(text: string): Mesh {
  const lines = text.split(/\r?\n/);
  const he = lines.findIndex((l) => l.trim() === "end_header");
  const nv = +(lines.find((l) => l.startsWith("element vertex"))?.split(/\s+/)[2] ?? 0), nf = +(lines.find((l) => l.startsWith("element face"))?.split(/\s+/)[2] ?? 0);
  const v: number[] = [], idx: number[] = [];
  for (let i = 0; i < nv; i++) { const p = lines[he + 1 + i].trim().split(/\s+/); v.push(+p[0], +p[1], +p[2]); }
  for (let i = 0; i < nf; i++) { const p = lines[he + 1 + nv + i].trim().split(/\s+/).map(Number); for (let k = 2; k < p[0]; k++) idx.push(p[1], p[k], p[k + 1]); }
  return computeNormals({ positions: new Float32Array(v), indices: new Uint32Array(idx) });
}
export function importMesh(name: string, data: ArrayBuffer): Mesh {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "obj") return importOBJ(new TextDecoder().decode(data));
  if (ext === "ply") return importPLY(new TextDecoder().decode(data));
  return importSTL(data);
}

// ---- projeto ----
export const serializeProject = (p: CadProject) => JSON.stringify(p, null, 2);
export function parseProject(json: string): CadProject {
  const p = JSON.parse(json) as CadProject;
  if (p.version !== 1 || !p.fdis || !p.patient) throw new Error("Arquivo de projeto DentalPos CAD inválido");
  return p;
}

// ---- ZIP (store) ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = (d: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function makeZip(files: Array<{ name: string; data: Uint8Array | string | ArrayBuffer }>): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data instanceof ArrayBuffer ? new Uint8Array(f.data) : f.data;
    const name = enc.encode(f.name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let o = 0; for (const c of all) { out.set(c, o); o += c.length; }
  return out;
}
