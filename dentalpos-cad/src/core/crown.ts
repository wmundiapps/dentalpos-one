// Coroa/faceta sobre preparo: gera o preparo (tronco de cone com conicidade), a casca com espaço de cimento e o mapa de espessura.
import { type Vec3, clamp, round } from "./math";
import type { ToothModel } from "./toothMesh";
import { type Mesh, getV } from "./mesh";
import { type Grid, gridFor, rasterizeSolid, sampleSdf, sdfAnalytic, sdfFromOccupancy, sdfIntersect, sdfOffset, sdfSubtract, surfaceNets } from "./voxel";
import { MATERIALS, type MaterialId } from "./materials";
import { isAnterior } from "./anatomy";
import { toothRef } from "./anatomy";

export interface PrepSpec { axial: number; occlusal: number; finish: "chamfer" | "shoulder" | "featheredge" | "knife"; taperDeg: number }
export const DEFAULT_PREP: PrepSpec = { axial: 1.0, occlusal: 1.5, finish: "chamfer", taperDeg: 10 };

export interface ThicknessStats { minAxial: number; meanAxial: number; minOcclusal: number; meanOcclusal: number; samples: number; thinPoints: Vec3[] }
export interface CrownResult { outer: Mesh; prep: Mesh; shell: Mesh; stats: ThicknessStats; spec: PrepSpec; marginZ: number }

/** Constrói o preparo + casca no referencial local do dente (z oclusal). */
export function designCrown(model: ToothModel, spec: PrepSpec, material: MaterialId = "zirconia-ml", res = 0.25): CrownResult {
  const mat = MATERIALS[material];
  const g: Grid = gridFor([model.mesh], res, 3);
  const sOuter = sdfFromOccupancy(g, rasterizeSolid(g, [model.mesh]));
  const h = model.dims.h;
  const zM = Math.min(1.2, h * 0.12); // nível da linha de término
  // extensão do contorno da coroa no nível do término
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  const kk = Math.round((zM + 0.4 - g.o[2]) / g.h);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) if (sOuter[i + g.nx * (j + g.ny * kk)] < 0) { const x = g.o[0] + i * g.h, y = g.o[1] + j * g.h; minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  const a0 = Math.max(1, (maxx - minx) / 2 - spec.axial * (spec.finish === "shoulder" ? 1.0 : 0.9)), b0 = Math.max(1, (maxy - miny) / 2 - spec.axial * (spec.finish === "shoulder" ? 1.0 : 0.9));
  const zTop = h - spec.occlusal, tanT = Math.tan((spec.taperDeg / 2) * Math.PI / 180);
  const n = 2.7;
  const frustum = (p: Vec3) => {
    const t = clamp(p[2] - zM, 0, Math.max(0.1, zTop - zM));
    const a = Math.max(0.5, a0 - tanT * t), b = Math.max(0.5, b0 - tanT * t);
    const q = (Math.abs((p[0] - cx) / a) ** n + Math.abs((p[1] - cy) / b) ** n) ** (1 / n);
    const radial = (q - 1) * Math.min(a, b);
    return Math.max(radial, p[2] - zTop);
  };
  const sPrep = sdfAnalytic(g, frustum);
  // casca = (externo ∩ acima do término) − (preparo + folga de cimento)
  const aboveMargin = sdfAnalytic(g, (p) => zM - p[2]);
  const crown = sdfSubtract(sdfIntersect(sOuter, aboveMargin), sdfOffset(sPrep, mat.cementGap));
  const shell = surfaceNets(g, crown, 1);
  const prepAbove = sdfIntersect(sPrep, aboveMargin);
  const prepMesh = surfaceNets(g, prepAbove, 1);
  // espessura: distância do ponto do preparo à superfície externa
  const ax: number[] = [], oc: number[] = [];
  const thin: Vec3[] = [];
  const nrm = prepMesh.normals!;
  const needAx = isAnterior(model.fdi ? toothRef(model.fdi).type : "central") ? mat.min.axialAnterior : mat.min.axialPosterior;
  for (let i = 0; i < prepMesh.positions.length / 3; i++) {
    const p = getV(prepMesh, i);
    if (p[2] < zM + 0.3) continue;
    const thick = -sampleSdf(g, sOuter, p) - mat.cementGap;
    if (nrm[i * 3 + 2] > 0.6) oc.push(thick); else if (Math.abs(nrm[i * 3 + 2]) < 0.5) { ax.push(thick); if (thick < needAx - 0.05 && thin.length < 60) thin.push(p); }
  }
  const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const min = (a: number[]) => (a.length ? Math.min(...a) : 0);
  return { outer: model.mesh, prep: prepMesh, shell, spec, marginZ: zM, stats: { minAxial: round(min(ax), 2), meanAxial: round(mean(ax), 2), minOcclusal: round(min(oc), 2), meanOcclusal: round(mean(oc), 2), samples: ax.length + oc.length, thinPoints: thin } };
}
