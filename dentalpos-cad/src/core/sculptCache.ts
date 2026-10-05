// Cache de dentes esculpidos (SDF). A geração leva ~0,3–1 s por dente: roda em segundo plano (Web Worker) e, enquanto não pronta,
// o projeto usa o dente paramétrico. Quando termina, os assinantes são avisados para reavaliar o projeto.
import type { Mesh } from "./mesh";
import type { ToothRef } from "./anatomy";
import type { StyleModifiers } from "./profiles";
import { MEAN_DIMS } from "./anatomy";

export interface SculptRequest { fdi: number; opts: { md: number; bl: number; h: number; res: number; squareness: number; cornerRounding: number; labialConvexity: number; mamelon: number; wear: number } }
const cache = new Map<string, Mesh>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
export const onSculptReady = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
let version = 0;
export const sculptVersion = () => version;

export function sculptKey(ref: ToothRef, mods: StyleModifiers): string {
  return [ref.fdi, mods.squareness, mods.cornerRounding, mods.labialConvexity, mods.mamelon, mods.wear].map((v) => (typeof v === "number" ? v.toFixed(2) : v)).join("|");
}
export const requestFor = (ref: ToothRef, mods: StyleModifiers, res = 0.14): SculptRequest => {
  const d = MEAN_DIMS[ref.jaw][ref.type];
  return { fdi: ref.fdi, opts: { md: d.md, bl: d.bl, h: d.h, res, squareness: mods.squareness, cornerRounding: mods.cornerRounding, labialConvexity: mods.labialConvexity, mamelon: mods.mamelon, wear: mods.wear } };
};
export const getSculpted = (ref: ToothRef, mods: StyleModifiers): Mesh | null => cache.get(sculptKey(ref, mods)) ?? null;
export function putSculpted(key: string, m: Mesh) { cache.set(key, m); inflight.delete(key); version++; listeners.forEach((f) => f()); }
export const isPending = (key: string) => inflight.has(key);
export const markPending = (key: string) => inflight.add(key);
export const cancelPending = (key: string) => inflight.delete(key);
