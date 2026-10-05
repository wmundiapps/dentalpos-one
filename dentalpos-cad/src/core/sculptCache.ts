// Cache de dentes esculpidos (SDF). A geração leva ~0,3–1 s por dente: roda em segundo plano (Web Worker) e, enquanto não pronta,
// o projeto usa o dente paramétrico. Quando termina, os assinantes são avisados para reavaliar o projeto.
import type { Mesh } from "./mesh";
import type { ToothRef } from "./anatomy";
import type { StyleModifiers } from "./profiles";
import { MEAN_DIMS } from "./anatomy";
import { DEFAULT_ANATOMY, type AnatomyParams } from "./toothSdf";

export interface SculptRequest { fdi: number; opts: { md: number; bl: number; h: number; res: number; squareness: number; cornerRounding: number; labialConvexity: number; mamelon: number; wear: number; anat: AnatomyParams } }
const cache = new Map<string, Mesh>();
/** última malha pronta de cada dente: continua sendo usada enquanto a nova versão é gerada (evita "piscar" ao editar a anatomia) */
const lastByFdi = new Map<number, Mesh>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
export const onSculptReady = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
let version = 0;
export const sculptVersion = () => version;

export function sculptKey(ref: ToothRef, mods: StyleModifiers, anat?: Partial<AnatomyParams>): string {
  const A = { ...DEFAULT_ANATOMY, ...anat };
  return [ref.fdi, ...Object.values(A).map((v) => v.toFixed(2)), mods.squareness, mods.cornerRounding, mods.labialConvexity, mods.mamelon, mods.wear].map((v) => (typeof v === "number" ? v.toFixed(2) : v)).join("|");
}
export const requestFor = (ref: ToothRef, mods: StyleModifiers, res = 0.14, anat?: Partial<AnatomyParams>): SculptRequest => {
  const d = MEAN_DIMS[ref.jaw][ref.type];
  return { fdi: ref.fdi, opts: { md: d.md, bl: d.bl, h: d.h, res, squareness: mods.squareness, cornerRounding: mods.cornerRounding, labialConvexity: mods.labialConvexity, mamelon: mods.mamelon, wear: mods.wear, anat: { ...DEFAULT_ANATOMY, ...anat } } };
};
export const getSculpted = (ref: ToothRef, mods: StyleModifiers, anat?: Partial<AnatomyParams>): Mesh | null => cache.get(sculptKey(ref, mods, anat)) ?? lastByFdi.get(ref.fdi) ?? null;
export function putSculpted(key: string, m: Mesh, fdi?: number) { if (cache.size > 300) cache.clear(); cache.set(key, m); if (fdi !== undefined) lastByFdi.set(fdi, m); inflight.delete(key); version++; listeners.forEach((f) => f()); }
export const isPending = (key: string) => inflight.has(key);
export const markPending = (key: string) => inflight.add(key);
export const cancelPending = (key: string) => inflight.delete(key);
export const hasKey = (key: string) => cache.has(key);
